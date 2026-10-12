/**
 * 台面母版（2026-10-12）：23 个手写台面收成 6 个母版，生成 agent 只填 JSON（BenchSpec.surfaceConfig），不再每个行业写一个组件。
 *   A desktop 桌面工作站（桌边 N 个程序）   B field 现场热点 + 工具盘   C console 分屏操作台 + 机器实景
 *   D dispatch 沙盘 / 调度                  E hands 第一人称双手           F dialog 对人应对
 * 分类依据和每个旧台面归哪类见 docs/lab-playbook.md「台面母版」。现在实现了 B（field），样板是变电站验电挂地线。
 *
 * 约定：所有条件 / 取值都是 bench 表达式（evalExpr），能读到变量、控件、t；判分仍然只看规格里的 vars / rules / goals，
 * 母版只负责「画什么、点了以后拨哪个控件、说什么」——这样老手脚本照样能在模拟器里干跑，评分不用改。
 * 坐标系和 BenchRunner 场景一致：1600 × 900。
 */

/** 点一下发生什么 */
export interface MasterAction {
  /** 拦截：依次检查，第一个命中的只说一句、不拨控件（「先断电再挂牌」「测试点在柜子里，先开门」） */
  guards?: { when: string; say: string }[];
  /** 要先拿着哪件工具（tools[].v）；没拿着就只说 toolMsg，不拨控件。在 guards 之后检查 */
  needTool?: number; toolMsg?: string;
  /** 依次拨这些控件：value 是数字，或者表达式（'power == 1 ? 0 : 1' 就是来回切）；不写给 1 */
  act?: { control: string; value?: number | string }[];
  /** 仪表读数：点完在读数牌上常驻显示（换工具时清掉），比如万用表 */
  readout?: { title: string; titleWhen?: { when: string; text: string }[]; text: string; textWhen?: { when: string; text: string }[] };
  /** 说一句（按点击那一刻的状态挑：sayWhen 第一个命中的，否则 say） */
  say?: string; sayWhen?: { when: string; text: string }[];
  /** 点完在某处闪一下（验电器亮了这种） */
  flash?: { x: number; y: number; r?: number; color?: string };
}

/** 数值：写死的数，或者表达式（'120 + (3 - lance) * 150' 让氧枪跟着枪位走） */
export type Num = number | string;

/** 画的东西：线 / 框 / 圆 / 椭圆 / 文字 / 路径 / 火星。when 为假就不画；颜色、文字可以按状态切；坐标尺寸都可以是表达式 */
export interface MasterShape {
  kind: 'line' | 'rect' | 'circle' | 'ellipse' | 'text' | 'path' | 'sparks';
  x?: Num; y?: Num; x2?: Num; y2?: Num; w?: Num; h?: Num; r?: Num; rx?: Num; ry?: Num; d?: string;
  /** 透明度（0–1，可以是表达式）；blur 柔光（火焰、辉光）；pulse 闪烁 */
  opacity?: Num; blur?: 'sm' | 'lg'; pulse?: boolean;
  /** text：wrap 给宽度就自动换行（阶段提示这类长句） */
  wrap?: number;
  /** sparks：在 (x, y) 附近 w 宽 h 高的范围里飘 count 个火星（表达式） */
  count?: Num;
  text?: string; textWhen?: { when: string; text: string }[];
  color?: string; colorWhen?: { when: string; color: string }[]; fill?: string; width?: number; dash?: string;
  size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; mono?: boolean;
  /** path：先平移到 (x, y)、转 rotate 度再画；spinWhen 为真时绕 (x, y) 一直转（风机、搅拌） */
  rotate?: number; spinWhen?: string;
  when?: string;
}
/** 文字里可以嵌表达式：「运转中 · {{run_s}} 秒」「{{temp:1}} ℃」（冒号后是小数位） */
export const TEMPLATE_RE = /\{\{(.+?)(?::(\d))?\}\}/g;

/** 操作台部件（母版 C 的主控屏，B 里也能用） */
export type MasterWidget =
  /** 旋钮：拖不动的话点两边的 −/+；值写进 control */
  | { kind: 'knob'; control: string; label: string; unit?: string; min: number; max: number; step: number; digits?: number; x: number; y: number; color?: string }
  /** 趋势曲线：每条线一个表达式，各自归一到 [min, max]；band 是窗口（终点、合格区间） */
  | { kind: 'trend'; x: number; y: number; w: number; h: number; points?: number; series: { expr: string; color: string; min: number; max: number; band?: [number, number]; label?: string }[] }
  /** 液位 / 进度条（竖的）：expr 归一到 [min, max]，颜色可以按状态切 */
  | { kind: 'bar'; x: number; y: number; w: number; h: number; expr: string; min: number; max: number; label?: string; color?: string; colorWhen?: { when: string; color: string }[]; digits?: number };

export interface FieldConfig {
  /** field = 母版 B 现场热点 + 工具盘；console = 母版 C 分屏操作台 + 机器实景（同一个渲染器，版面不同） */
  master: 'field' | 'console';
  widgets?: MasterWidget[];
  /** 底图上压多深的暗色（0–1），让叠层看得清；没有底图、整个台面画出来的，给 bg 实色 */
  dim?: number; bg?: string;
  /** 工具盘：拿着哪件写进 toolControl（默认 tool） */
  tools?: { v: number; label: string; icon: string }[]; toolControl?: string; toolsAt?: { x: number; y: number };
  /** 纸 / 屏面板：操作票、作业单、读数牌。lines 每行可以按条件打勾 */
  panels?: { x: number; y: number; w: number; h: number; title?: string; tone?: 'paper' | 'dark'; lines?: { text: string; done?: string }[]; footer?: string }[];
  /** 场景里画的东西（一次接线、接地桩、标示牌……） */
  shapes?: MasterShape[];
  /** 透明热区：点了执行 action */
  hotspots?: { id: string; x: number; y: number; w: number; h: number; title: string; action: MasterAction; /** 为假时这块不能点（柜门关着时柜里的测试点） */ when?: string }[];
  /** 看得见的按钮（汇报、回令、过一天） */
  buttons?: { x: number; y: number; w: number; h: number; label: string; labelWhen?: { when: string; text: string }[]; litWhen?: string; litColor?: string; color?: string; when?: string; action: MasterAction }[];
  /** 步骤清单：第一个没完成的高亮；tool = 这一步该拿的工具（工具盘上那件会发光提示） */
  steps?: { label: string; done: string; tool?: number }[]; stepsAt?: { x: number; y: number; w: number; cols?: number; title?: string; titleSize?: number };
  /** 「这会儿该拿哪件工具」的表达式（比 steps[].tool 细）：算出来的值对上 tools[].v 的那件发光 */
  wantTool?: string;
  /** 提示条、读数牌位置 */
  sayAt?: { x: number; y: number; w: number }; readoutAt?: { x: number; y: number; w: number; /** 不到 80 就是一行小牌（标题 + 一行读数） */ h?: number };
}

export type SurfaceConfig = FieldConfig;
export const MASTERS = ['field', 'console'] as const;

/** 存库前清洗：只认识的母版放行，大小封顶（防止把整本书塞进来） */
export function sanitizeSurfaceConfig(raw: any): SurfaceConfig | undefined {
  if (!raw || typeof raw !== 'object' || !(MASTERS as readonly string[]).includes(raw.master)) return undefined;
  const s = JSON.stringify(raw);
  if (s.length > 80_000) return undefined;
  return JSON.parse(s);
}

/** 母版里出现的所有表达式（静态校验用：每个都要能求值） */
export function masterExprs(cfg: SurfaceConfig): string[] {
  const out: string[] = [];
  const act = (a?: MasterAction) => { a?.sayWhen?.forEach(x => out.push(x.when)); a?.guards?.forEach(x => out.push(x.when)); a?.act?.forEach(x => typeof x.value === 'string' && out.push(x.value)); a?.readout?.textWhen?.forEach(x => out.push(x.when)); a?.readout?.titleWhen?.forEach(x => out.push(x.when)); };
  const tpl = (t?: string) => { for (const m of (t || '').matchAll(TEMPLATE_RE)) out.push(m[1]); };
  cfg.panels?.forEach(p => p.lines?.forEach(l => l.done && out.push(l.done)));
  const numx = (v?: Num) => { if (typeof v === 'string') out.push(v); };
  cfg.shapes?.forEach(sh => { (['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'rx', 'ry', 'opacity', 'count'] as const).forEach(k => numx(sh[k])); });
  cfg.widgets?.forEach(w => { if (w.kind === 'trend') w.series.forEach(x => out.push(x.expr)); if (w.kind === 'bar') { out.push(w.expr); w.colorWhen?.forEach(x => out.push(x.when)); } });
  cfg.shapes?.forEach(sh => { if (sh.when) out.push(sh.when); if (sh.spinWhen) out.push(sh.spinWhen); tpl(sh.text); sh.textWhen?.forEach(x => { out.push(x.when); tpl(x.text); }); sh.colorWhen?.forEach(x => out.push(x.when)); });
  cfg.hotspots?.forEach(h => { act(h.action); if (h.when) out.push(h.when); });
  cfg.buttons?.forEach(b => { act(b.action); if (b.litWhen) out.push(b.litWhen); if (b.when) out.push(b.when); b.labelWhen?.forEach(x => out.push(x.when)); });
  if (cfg.wantTool) out.push(cfg.wantTool);
  cfg.steps?.forEach(s => out.push(s.done));
  return out;
}

/** 母版里拨到的控件都得在规格里声明过 */
export function masterControls(cfg: SurfaceConfig): string[] {
  const ids = new Set<string>();
  const act = (a?: MasterAction) => a?.act?.forEach(x => ids.add(x.control));
  cfg.hotspots?.forEach(h => act(h.action)); cfg.buttons?.forEach(b => act(b.action));
  if (cfg.tools?.length) ids.add(cfg.toolControl || 'tool');
  cfg.widgets?.forEach(w => { if (w.kind === 'knob') ids.add(w.control); });
  return [...ids];
}
