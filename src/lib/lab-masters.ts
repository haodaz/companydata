/**
 * 台面母版（2026-10-12）：23 个手写台面收成 6 个母版，生成 agent 只填 JSON（BenchSpec.surfaceConfig），不再每个行业写一个组件。
 *   A desktop 桌面工作站（桌边 N 个程序）   B field 现场热点 + 工具盘   C console 分屏操作台 + 机器实景
 *   D dispatch 沙盘 / 调度                  E hands 第一人称双手           F dialog 对人应对
 * 分类依据和每个旧台面归哪类见 /lab/logic「台面母版」。field / console 的类型和渲染在这里和 FieldStage；
 * 其余母版各一个文件：src/lib/masters/<名>.ts（类型 + 定义）、<名>-samples.ts（样板）、components/lab/masters/<名>Stage.tsx（渲染），
 * 由下面的注册表 MASTER_DEFS 汇总。母版文件只能 `import type` 本文件（避免运行时循环引用）。
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
  /** 不满足就当没点（不说话、不拨控件，比如已经下过锅的料碗、还没到时候的出锅键）。最先检查 */
  onlyWhen?: string;
  /** 依次拨这些控件：value 是数字，或者表达式（'power == 1 ? 0 : 1' 就是来回切）；不写给 1。
   *  delay 毫秒后再拨（值按点下去那一刻算）：「点一下 = 拨到 n，0.6 秒后自己回 0」这种瞬时动作 */
  act?: { control: string; value?: number | string; delay?: number }[];
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
  /** 透明度（0–1，可以是表达式）；blur 柔光（火焰、辉光）；pulse 闪烁（写数字 = 一次闪烁的秒数，比如出风口的风；rect / circle / path 支持） */
  opacity?: Num; blur?: 'sm' | 'lg'; pulse?: boolean | number;
  /** text：wrap 给宽度就自动换行（阶段提示这类长句） */
  wrap?: number;
  /** sparks：在 (x, y) 附近 w 宽 h 高的范围里飘 count 个火星（表达式） */
  count?: Num;
  text?: string; textWhen?: { when: string; text: string }[];
  color?: string; colorWhen?: { when: string; color: string }[]; fill?: string; width?: number; dash?: string;
  size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; /** 字距（「养护日记」这种小标题） */ spacing?: number;
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
  /** 看得见的按钮（汇报、回令、过一天）。label / sub 里可以嵌 {{表达式}}；sub 是第二行小字；size 主字号；
   *  style 'seg' = 分段键（火力 关/小/中/大：没亮是浅底细边，亮了 litColor + 白粗边）；colorWhen 按状态换底色（优先于 lit），ink / inkWhen 字色（命中时两行都用它），subInk 第二行平时的颜色 */
  buttons?: { x: number; y: number; w: number; h: number; label: string; labelWhen?: { when: string; text: string }[]; litWhen?: string; litColor?: string; color?: string; when?: string; action: MasterAction;
    sub?: string; subWhen?: { when: string; text: string }[]; size?: number; rx?: number; style?: 'seg'; colorWhen?: { when: string; color: string }[]; ink?: string; inkWhen?: { when: string; color: string }[]; subInk?: string }[];
  /** 动作卡片（料台的料碗、养护动作）：一格一张，icon + 字。cooldown 毫秒内整组的第二下不算（模拟器一拍 0.25 秒，连点会漏记）；
   *  dimWhen 为真时变灰、点了没反应（已经下过锅）；glowWhen 为真时外圈发光（这会儿该点它） */
  cards?: { x: number; y: number; w: number; h: number; cols?: number; gx?: number; gy?: number; iconSize?: number; labelSize?: number; iconX?: number; labelX?: number; cooldown?: number;
    items: { label: string; labelWhen?: { when: string; text: string }[]; icon: string; fill?: string; dimWhen?: string; glowWhen?: string; action: MasterAction }[] };
  /** 拖动区（椭圆给 rx / ry、x / y 是圆心；矩形给 w / h、x / y 是左上）：按住来回拖，每累计拖过 every 像素执行一次 action（锅里翻炒）。cursor 是拖着时跟手的图标 */
  drags?: { id: string; x: number; y: number; rx?: number; ry?: number; w?: number; h?: number; every: number; action: MasterAction; cursor?: string; title?: string; when?: string }[];
  /** 主体插件：画不出来的中心物件（plant 盆栽、wok 炒锅，登记在 components/lab/masters/field-subjects.tsx），params 全是表达式 */
  subjects?: { plugin: string; x: number; y: number; params?: Record<string, Num>; when?: string }[];
  /** 日志（养护日记）：on 的值（取整）每涨一次记一句——lines 里第一个命中的（不写 when = 兜底；once 的只记一次），文字可嵌 {{表达式}}。
   *  显示最后 show 条（默认 8），每条超过 chars 字截断 */
  logs?: { x: number; y: number; w: number; h: number; title?: string; on: string; initial?: string[]; lines: { when?: string; text: string; once?: boolean }[]; show?: number; chars?: number; gap?: number }[];
  /** 步骤清单：第一个没完成的高亮；tool = 这一步该拿的工具（工具盘上那件会发光提示） */
  steps?: { label: string; done: string; tool?: number }[]; stepsAt?: { x: number; y: number; w: number; cols?: number; title?: string; titleSize?: number;
    /** 底框至少多高；footer 压在底框最下面一行小字；link 同一行相邻两步之间画连线（时间轴） */ h?: number; footer?: string; link?: boolean };
  /** 「这会儿该拿哪件工具」的表达式（比 steps[].tool 细）：算出来的值对上 tools[].v 的那件发光 */
  wantTool?: string;
  /** 提示条、读数牌位置 */
  sayAt?: { x: number; y: number; w: number }; readoutAt?: { x: number; y: number; w: number; /** 不到 80 就是一行小牌（标题 + 一行读数） */ h?: number;
    /** note = 观察框（「你看到的」）：小标题 + 长句按 chars 字一行折、最多 maxLines 行；还没读到东西时显示 placeholder */
    style?: 'note'; chars?: number; maxLines?: number; placeholder?: { title: string; text: string } };
}

import type { BenchSpec, BenchState } from '@/lib/bench';
import { DESKTOP_DEF, type DesktopConfig } from '@/lib/masters/desktop';
import { DIALOG_DEF, type DialogConfig } from '@/lib/masters/dialog';
import { DISPATCH_DEF, type DispatchConfig } from '@/lib/masters/dispatch';
import { HANDS_DEF, type HandsConfig } from '@/lib/masters/hands';

/** 一个母版的定义：渲染在 svg 里还是 HTML 整屏；配置里的表达式和会拨到的控件（存库前校验用） */
export interface MasterDef<C> { name: string; host: 'svg' | 'html'; exprs: (cfg: C) => string[]; controls: (cfg: C) => string[] }
/** 母版渲染组件统一的 props（BenchRunner 传进来） */
export interface MasterStageProps<C> {
  spec: BenchSpec; cfg: C; st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene?: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

export type SurfaceConfig = FieldConfig | DesktopConfig | DialogConfig | DispatchConfig | HandsConfig;
const FIELD_DEF: MasterDef<FieldConfig> = { name: 'field', host: 'svg', exprs: c => fieldExprs(c), controls: c => fieldControls(c) };
export const MASTER_DEFS: Record<string, MasterDef<any>> = {
  field: FIELD_DEF, console: { ...FIELD_DEF, name: 'console' },
  desktop: DESKTOP_DEF, dialog: DIALOG_DEF, dispatch: DISPATCH_DEF, hands: HANDS_DEF,
};
export const MASTERS = Object.keys(MASTER_DEFS);

/** 存库前清洗：只认识的母版放行，大小封顶（防止把整本书塞进来） */
export function sanitizeSurfaceConfig(raw: any): SurfaceConfig | undefined {
  if (!raw || typeof raw !== 'object' || !MASTER_DEFS[raw.master]) return undefined;
  const s = JSON.stringify(raw);
  if (s.length > 80_000) return undefined;
  return JSON.parse(s);
}

/** 母版里出现的所有表达式（静态校验用：每个都要能求值） */
export const masterExprs = (cfg: SurfaceConfig): string[] => MASTER_DEFS[cfg.master]?.exprs(cfg) || [];
/** 母版里拨到的控件都得在规格里声明过 */
export const masterControls = (cfg: SurfaceConfig): string[] => MASTER_DEFS[cfg.master]?.controls(cfg) || [];

function fieldExprs(cfg: FieldConfig): string[] {
  const out: string[] = [];
  const act = (a?: MasterAction) => { if (a?.onlyWhen) out.push(a.onlyWhen); a?.sayWhen?.forEach(x => out.push(x.when)); a?.guards?.forEach(x => out.push(x.when)); a?.act?.forEach(x => typeof x.value === 'string' && out.push(x.value)); a?.readout?.textWhen?.forEach(x => out.push(x.when)); a?.readout?.titleWhen?.forEach(x => out.push(x.when)); };
  const tpl = (t?: string) => { for (const m of (t || '').matchAll(TEMPLATE_RE)) out.push(m[1]); };
  cfg.panels?.forEach(p => p.lines?.forEach(l => l.done && out.push(l.done)));
  const numx = (v?: Num) => { if (typeof v === 'string') out.push(v); };
  cfg.shapes?.forEach(sh => { (['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'rx', 'ry', 'opacity', 'count'] as const).forEach(k => numx(sh[k])); });
  cfg.widgets?.forEach(w => { if (w.kind === 'trend') w.series.forEach(x => out.push(x.expr)); if (w.kind === 'bar') { out.push(w.expr); w.colorWhen?.forEach(x => out.push(x.when)); } });
  cfg.shapes?.forEach(sh => { if (sh.when) out.push(sh.when); if (sh.spinWhen) out.push(sh.spinWhen); tpl(sh.text); sh.textWhen?.forEach(x => { out.push(x.when); tpl(x.text); }); sh.colorWhen?.forEach(x => out.push(x.when)); });
  cfg.hotspots?.forEach(h => { act(h.action); if (h.when) out.push(h.when); });
  cfg.buttons?.forEach(b => { act(b.action); if (b.litWhen) out.push(b.litWhen); if (b.when) out.push(b.when); tpl(b.label); tpl(b.sub); b.labelWhen?.forEach(x => { out.push(x.when); tpl(x.text); }); b.subWhen?.forEach(x => { out.push(x.when); tpl(x.text); }); b.colorWhen?.forEach(x => out.push(x.when)); b.inkWhen?.forEach(x => out.push(x.when)); });
  cfg.cards?.items.forEach(c => { act(c.action); if (c.dimWhen) out.push(c.dimWhen); if (c.glowWhen) out.push(c.glowWhen); c.labelWhen?.forEach(x => out.push(x.when)); });
  cfg.drags?.forEach(d => { act(d.action); if (d.when) out.push(d.when); });
  cfg.subjects?.forEach(s => { if (s.when) out.push(s.when); Object.values(s.params || {}).forEach(numx); });
  cfg.logs?.forEach(l => { out.push(l.on); l.lines.forEach(x => { if (x.when) out.push(x.when); tpl(x.text); }); });
  tpl(cfg.stepsAt?.footer);
  if (cfg.wantTool) out.push(cfg.wantTool);
  cfg.steps?.forEach(s => out.push(s.done));
  return out;
}

function fieldControls(cfg: FieldConfig): string[] {
  const ids = new Set<string>();
  const act = (a?: MasterAction) => a?.act?.forEach(x => ids.add(x.control));
  cfg.hotspots?.forEach(h => act(h.action)); cfg.buttons?.forEach(b => act(b.action));
  cfg.cards?.items.forEach(c => act(c.action)); cfg.drags?.forEach(d => act(d.action));
  if (cfg.tools?.length) ids.add(cfg.toolControl || 'tool');
  cfg.widgets?.forEach(w => { if (w.kind === 'knob') ids.add(w.control); });
  return [...ids];
}
