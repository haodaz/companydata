/**
 * 母版 D 沙盘 / 调度：地图或俯视 / 侧视场景 + 地点 + 单位 / 个体 + 调度动作 + 按时间推送的事件。
 * 已搬：幼儿园 kinder（lab-kinder-dispatch.ts）、潜导 dive（lab-dive-dispatch.ts）；应急沙盘 sandtable 是重点 demo 留代码，但这套字段也写得出来
 * （地点 locations + 力量 assign 去向控件 + 事件流 feed + 指令按钮）。由 lab-masters.ts 的注册表汇总。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、点了拨哪个控件、说什么。
 *
 * 几个约定（渲染在 components/lab/masters/DispatchStage.tsx）：
 *   · 坐标 / 尺寸 / 透明度都可以是表达式；文字里 {{表达式}}、{{表达式:1}}（小数位）、{{表达式:clock}}（分:秒），
 *     还有三个特殊词：{{@sel}} 选中个体的名字、{{@incidents}} 正在发生的事件（拼起来）、{{@incident}} 最近一件。
 *   · 本地量：locals（全场，按顺序求值，可以查地形高度）、entities[].lets（每个个体自己的）、<个体 id>_x / _y（位置）、
 *     sel（这个个体被选中 = 1）、has_image（有底图 = 1）、phase_len（当前环节的标准时长）。这些不进规格，存库校验时按 0 代入。
 *   · entities[].each：一个模板展开成一排个体，字符串里的 $字段 换成每项的值（$n 从 1 数、$i 从 0 数，可以被覆盖）。
 *   · 动作里的控件名写 @sel = 选中的那个个体的 id（力量卡片「派去哪」这种），校验时展开成所有可选个体。
 *   · follow（跟随者插件）：个体按模拟时间一拍一拍追目标（每拍走剩余距离的 rate），可以把它离某点的距离写进隐藏控件——潜导的客人。
 */
import type { MasterDef, Num } from '@/lib/lab-masters';

/** 按状态挑：第一个 when 为真的 */
export type When<K extends string> = ({ when: string } & Record<K, string>)[];

/** 画的东西。填色规则直白：fill 是填充（默认不填）、color 是描边（文字就是字色），width 线宽（可以是表达式） */
export interface DShape {
  kind: 'line' | 'rect' | 'circle' | 'ellipse' | 'text' | 'path' | 'image' | 'terrain';
  x?: Num; y?: Num; x2?: Num; y2?: Num; w?: Num; h?: Num; r?: Num; rx?: Num; ry?: Num;
  /** path：d 里也能嵌 {{表达式}}（河道随水位变宽这类） */
  d?: string;
  /** terrain：画哪条地形（terrains[].id），从地形线一直填到 bottom */
  terrain?: string;
  opacity?: Num; blur?: 'sm' | 'lg';
  text?: string; textWhen?: When<'text'>;
  fill?: string; fillWhen?: When<'fill'>; color?: string; colorWhen?: When<'color'>; width?: Num; dash?: string;
  size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; spacing?: number; shadow?: boolean;
  /** SVG 原生动画（光线明暗、气泡上浮） */
  animate?: { attr: string; values: string; dur: string };
  when?: string;
}

/** 点一下发生什么（按钮 / 地点） */
export interface DAction {
  /** 拦截：第一个命中的只说一句，不拨控件（「先点一个孩子」）；不管有没有开始都会提示 */
  guards?: { when: string; say: string }[];
  /** 防连点：同一组里上次触发不到 ms 毫秒就忽略 */
  cooldown?: { ms: number; group?: string };
  /** 依次拨：value 数字或表达式（点下那一刻求值），不写给 1；when 为假就跳过这一条；pulse 毫秒后归零（瞬时动作）；hidden 用 setHidden 写（隐藏控件） */
  act?: { control: string; value?: Num; when?: string; pulse?: number; hidden?: boolean }[];
  say?: string; sayWhen?: When<'text'>;
}

/** 拖动：指针坐标线性换成控件值。px 是场景坐标区间，v 是对应的控件值区间；再夹到 [min, max]、按 digits 取整 */
export interface DAxis { control: string; px: [number, number]; v: [number, number]; min: number; max: number; digits?: number }

export interface DEntity {
  id: string; label?: string;
  /** 模板展开：每一项一个个体，$字段 换成值 */
  each?: Record<string, string | number>[];
  /** 位置（表达式；follow 的个体这里是起点） */
  x?: Num; y?: Num;
  /** 有选中的个体时，站到它旁边（老师走到孩子身边） */
  near?: { dx: number; dy: number };
  /** 去向写在这个控件里（值 = locations[].value），画在那个地点旁边排队（沙盘上的力量） */
  assign?: { control: string };
  /** 点它 = 选中 / 再点取消。写 control 就把 value 拨进去（取消拨 0），不写只在台面里记着选中谁（再点地点派过去） */
  select?: { control?: string; value?: Num };
  /** 跟随者插件：每个模拟拍走 (目标 − 现在) × rate；distance 把离 (x, y) 的距离 × scale 写进隐藏控件 */
  follow?: { x: Num; y: Num; rate: Num; rateY?: Num; distance?: { control: string; x: Num; y: Num; scale: number; digits?: number } };
  /** 拖着走：按下点离它不超过 grab 才算抓住；floor：纵轴不能低过地形线 + offset */
  drag?: { grab: number; when?: string; x?: DAxis; y?: DAxis; floor?: { terrain: string; offset: number } };
  /** 透明热区半径（点 / 拖都认它） */
  hit?: number;
  /** 个体自己的本地量（按顺序求值；能读 sel） */
  lets?: { id: string; expr: string }[];
  /** 相对个体位置画 */
  shapes: DShape[];
  when?: string;
}

export interface DLocation {
  id: string; x: number; y: number;
  /** 派遣：选中了带 assign 的个体再点这里，就把 value 写进它的去向控件 */
  value?: number; enabled?: string;
  /** 个体在这里排队：第 k 个画在 (x + ox + (k % cols) * dx, y + oy + floor(k / cols) * dy) */
  stack?: { ox: number; oy: number; dx: number; dy: number; cols: number };
  /** 没选个体时点它 */
  action?: DAction;
  hit?: { w: number; h: number };
  shapes?: DShape[]; when?: string;
}

export interface DButton {
  x: number; y: number; w: number; h: number;
  label: string; labelWhen?: When<'text'>; icon?: string;
  fill?: string; fillWhen?: When<'fill'>; color?: string; colorWhen?: When<'color'>; stroke?: string; strokeWidth?: number; size?: number; weight?: number;
  when?: string; action: DAction;
}

export interface DTerrain {
  id: string;
  /** y = base + Σ amp · sin(x / period)；或者 points 折线（按 x 线性插值） */
  base?: number; waves?: { amp: number; period: number }[]; points?: [number, number][];
  /** 画的时候：从 from 到 to 每 step 取一点，一直填到 bottom */
  from?: number; to?: number; step?: number; bottom?: number;
}

export interface DispatchConfig {
  master: 'dispatch';
  /** 整屏底色（画出来的场景）；有底图时可以不写，用 image 形状铺 */
  bg?: string;
  gradients?: { id: string; stops: [number, string][]; horizontal?: boolean }[];
  terrains?: DTerrain[];
  locals?: { id: string; expr?: string; terrain?: string; x?: Num }[];
  /** 场景（在个体下面） */
  shapes?: DShape[];
  locations?: DLocation[];
  /** 按列表顺序画（先画的在下面） */
  entities?: DEntity[];
  /** 个体上面的东西：面板、读数、状态行 */
  overlay?: DShape[];
  /** 环节：control 是第几环节（从 1 起），elapsed 本环节用了多久，long 拖太长了 */
  phases?: { control: string; elapsed: string; long?: string; items: { label: string; len: number }[]; at: { x: number; y: number; w: number }; idle?: string; longText?: string; color?: string; longColor?: string; textColor?: string; mutedColor?: string };
  /** 按模拟时间 t 冒出来的事（open 为真时算还在发生） */
  incidents?: { items: { t: number; open?: string; text: string }[]; join?: string; prefix?: string };
  /** 事件流（沙盘右下那种）：条件第一次成立时记一条，带当时的时间；clockBase 把 t 换成墙上时间（分钟） */
  feed?: { items: { when: string; text: string; kind?: 'alarm' | 'info' | 'ok' }[]; at: { x: number; y: number; w: number; h: number }; clockBase?: number; title?: string };
  buttons?: DButton[];
  /** 步骤清单（横排）：on 写了就按 on 高亮，否则高亮第一个没完成的 */
  steps?: { label: string; done: string; on?: string }[];
  stepsAt?: { x: number; y: number; w: number; h: number; cx: number; cy: number; dx: number; r?: number; size?: number; numbered?: boolean; fill?: string };
  /** 说一句（拦截提示）显示在哪 */
  sayAt?: { x: number; y: number; anchor?: 'start' | 'middle' | 'end'; color?: string; size?: number; ms?: number };
}

/** 本地量的保留名 */
export const DISPATCH_RESERVED = ['sel', 'has_image', 'phase_len'];

/** 把 each 模板展开成具体个体（$字段 → 值；$n 从 1、$i 从 0） */
export function expandEntities(cfg: DispatchConfig): DEntity[] {
  const out: DEntity[] = [];
  for (const e of cfg.entities || []) {
    if (!e.each?.length) { out.push(e); continue; }
    const { each, ...tpl } = e;
    const src = JSON.stringify(tpl);
    each.forEach((item, i) => {
      const vals: Record<string, string | number> = { i, n: i + 1, ...item };
      const s = src.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, k: string) => k in vals ? JSON.stringify(String(vals[k])).slice(1, -1) : m);
      out.push(JSON.parse(s));
    });
  }
  return out;
}

/** 地形高度 */
export function terrainY(t: DTerrain | undefined, x: number): number {
  if (!t) return 0;
  if (t.points?.length) {
    const p = t.points;
    if (x <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    return p[p.length - 1][1];
  }
  return (t.base || 0) + (t.waves || []).reduce((s, w) => s + w.amp * Math.sin(x / w.period), 0);
}

/** 文字模板：{{表达式}} / {{表达式:1}} / {{表达式:clock}} / {{@sel}} 这些 */
export const DTPL_RE = /\{\{(.+?)(?::(\d|clock))?\}\}/g;

/** 所有本地量的名字（校验时按 0 代入） */
function localNames(cfg: DispatchConfig, ents: DEntity[]): string[] {
  const s = new Set<string>(DISPATCH_RESERVED);
  cfg.locals?.forEach(l => s.add(l.id));
  for (const e of ents) { s.add(`${e.id}_x`); s.add(`${e.id}_y`); e.lets?.forEach(l => s.add(l.id)); }
  return [...s];
}

function collectExprs(cfg: DispatchConfig): string[] {
  const ents = expandEntities(cfg);
  const out: string[] = [];
  const num = (v?: Num) => { if (typeof v === 'string') out.push(v); };
  const tpl = (t?: string) => { for (const m of (t || '').matchAll(DTPL_RE)) if (!m[1].startsWith('@')) out.push(m[1]); };
  const picks = (l?: { when: string; text?: string }[], key?: string) => l?.forEach(x => { out.push(x.when); if (key === 'text') tpl(x.text); });
  const shape = (sh: DShape) => {
    (['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'rx', 'ry', 'opacity', 'width'] as const).forEach(k => num(sh[k]));
    if (sh.when) out.push(sh.when);
    tpl(sh.text); tpl(sh.d); picks(sh.textWhen, 'text'); picks(sh.fillWhen); picks(sh.colorWhen);
  };
  const action = (a?: DAction) => { a?.guards?.forEach(g => out.push(g.when)); a?.act?.forEach(x => { num(x.value); if (x.when) out.push(x.when); }); picks(a?.sayWhen, 'text'); tpl(a?.say); };
  cfg.locals?.forEach(l => { if (l.expr) out.push(l.expr); num(l.x); });
  cfg.shapes?.forEach(shape); cfg.overlay?.forEach(shape);
  cfg.locations?.forEach(l => { l.shapes?.forEach(shape); if (l.when) out.push(l.when); if (l.enabled) out.push(l.enabled); action(l.action); });
  for (const e of ents) {
    num(e.x); num(e.y); num(e.select?.value); if (e.when) out.push(e.when); if (e.drag?.when) out.push(e.drag.when);
    e.lets?.forEach(l => out.push(l.expr));
    if (e.follow) { const f = e.follow; [f.x, f.y, f.rate, f.rateY, f.distance?.x, f.distance?.y].forEach(num); }
    e.shapes.forEach(shape);
  }
  cfg.buttons?.forEach(b => { if (b.when) out.push(b.when); picks(b.labelWhen, 'text'); tpl(b.label); picks(b.fillWhen); picks(b.colorWhen); action(b.action); });
  if (cfg.phases) { out.push(cfg.phases.control, cfg.phases.elapsed); if (cfg.phases.long) out.push(cfg.phases.long); }
  cfg.incidents?.items.forEach(x => { if (x.open) out.push(x.open); });
  cfg.feed?.items.forEach(x => { out.push(x.when); tpl(x.text); });
  cfg.steps?.forEach(s => { out.push(s.done); if (s.on) out.push(s.on); });
  // 本地量不在规格里：校验时按 0 代入（只查语法和规格里的名字）
  const names = localNames(cfg, ents);
  const re = names.length ? new RegExp(`(?<![A-Za-z0-9_])(${names.map(n => n.replace(/[^A-Za-z0-9_]/g, '')).join('|')})(?![A-Za-z0-9_])`, 'g') : null;
  return out.map(e => re ? e.replace(re, '0') : e);
}

function collectControls(cfg: DispatchConfig): string[] {
  const ents = expandEntities(cfg);
  const ids = new Set<string>();
  const selectable = ents.filter(e => e.select).map(e => e.id);
  const add = (c: string) => { if (c === '@sel') selectable.forEach(x => ids.add(x)); else ids.add(c); };
  const action = (a?: DAction) => a?.act?.forEach(x => add(x.control));
  cfg.buttons?.forEach(b => action(b.action)); cfg.locations?.forEach(l => action(l.action));
  for (const e of ents) {
    if (e.select?.control) add(e.select.control);
    if (e.assign) add(e.assign.control);
    if (e.follow?.distance) add(e.follow.distance.control);
    if (e.drag?.x) add(e.drag.x.control);
    if (e.drag?.y) add(e.drag.y.control);
  }
  return [...ids];
}

export const DISPATCH_DEF: MasterDef<DispatchConfig> = {
  name: 'dispatch', host: 'svg',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收）；本地量按 0 代入 */
  exprs: collectExprs,
  /** 配置里会拨到的控件 id（模板展开、@sel 展开成所有可选个体） */
  controls: collectControls,
};
