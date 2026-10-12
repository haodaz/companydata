/**
 * 母版 E 第一人称双手（2026-10-12）：中央主体 + 区域 + 可拖的物件 + 器械盘 + 手势原语 + 主体渲染插件。
 * 已搬：古籍修复 restore（lab-restore-hands.ts）、月嫂哄睡 soothe（lab-soothe-hands.ts）、咖啡拉花三台 latte（lab-latte-hands.ts，配置按工位现算）。
 * 渲染在 components/lab/masters/HandsStage.tsx。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、手势拨哪个控件、说什么。
 *
 * 一次按下 = 依次找 gestures 里第一个命中的（拿着对的工具 tool、条件 when 为真、按在区域 zone 里），然后它的原语一起生效：
 *   down     按下那一刻拨控件（点一下 / 连点累加：'min(100, wet + 12)'；来回切：'head == 1 ? 0 : 1'）
 *   hold     按住计时：按着且 when 为真时，控件按模拟秒累加（压实秒数；perSec 给大一点就是「按住下沉」的刀深，release 是松手回到的值）
 *   paint    沿线刷 / 刷覆盖：拖过 points 里的点算覆盖率写进控件；need 不满足刷不上（刷子干了），cost 每下扣量，spill 刷到带外算出界
 *   drag     拖物件：follow 物件跟手（对位、揭开）/ relative 按住拖偏移（摇）；speed 拖的速度、amplitude 摇的幅度、drops 松手落点 → 拨控件
 *   tempo    连拍节奏：这一下记个时刻，最近几下的平均间隔 → 次/分
 *   fx       按下的反馈：spray 水雾 / ripple 一圈波纹
 *   track    沿轨迹走（拉花的奶缸）：手投影到折线上 → 进度控件（只进不退），离线多远 → 偏离控件；走过的落点记成 trail 给主体插件（杯里的奶泡）
 *   slide    按住沿一条槽拖：位置 0–1 写进本地数 / 控件，再按它算一个控件（蒸汽位上下拖 = 进气量）
 *   up       松手那一刻拨控件（松开 = 断流、关汽）
 * 另外：watch（按着时手压到某区域 = 控件 1，比如手遮口鼻）、keys（按住某键 = 控件 1 / 按一下执行动作 / 松开执行 up）、buttons（按钮 / 透明热区 / 按住型按钮）、
 *   wheel（滚轮拨一个控件：奶缸高度）、camera（摄像头捏合 = 按住哪个手势，见 HandsCamera）。
 * 表达式里除了变量 / 控件 / t，还能用：locals 里的本地数（「大流量」开关、蒸汽位奶缸拖到哪——台面自己记，不进规格、不判分）、
 *   on_<手势 id>（这个手势正按着 = 1）、track.headAs 导出的轨迹头位置 <名>_x / <名>_y / <名>_a。存库校验时这些按初值 / 0 代入。
 * 物件（pieces）的位置是台面自己记的（不进规格），控件只记结果（偏移 mm、揭的速度）；演示（老手脚本只拨控件）时物件按 autoAt 摆。
 * 画不出来的主体用 subjects 插件（baby：脸 / 哭 / 眼睛 / 托头的手；latte-cup：杯子 + 按落点堆的奶泡），参数全是表达式。
 */
import type { MasterDef, MasterShape, Num } from '@/lib/lab-masters';

/** 同 lab-masters.ts 的 TEMPLATE_RE（母版文件只能 import type 那边，这里抄一份） */
const TPL_RE = /\{\{(.+?)(?::(\d))?\}\}/g;

/** 画的东西：母版 B 的 MasterShape，再加 wave（哭声线这种抖动折线）、textParts（按条件拼一句话）、live（只在能操作时画） */
export type HandsShape = Omit<MasterShape, 'kind' | 'width'> & {
  kind: MasterShape['kind'] | 'wave';
  /** 线宽（可以是表达式：奶流随流量变粗） */
  width?: Num;
  /** text：数值后面跟一段小字（读数的单位） */
  suffix?: { text: string; size?: number; color?: string };
  /** SVG 动画（原样挂 <animate>）：气泡上浮、脉冲圈、奶流流动 */
  animate?: { attr: string; values: string; dur: string; begin?: string }[];
  /** wave：从 (x, y) 往右 n 个点、每点 step 宽，振幅 amp（表达式），按 t 抖（freq 默认 9） */
  n?: number; step?: number; amp?: Num; freq?: number;
  /** text：每段 when 为真才拼上，段里可以嵌 {{表达式}} */
  textParts?: { when?: string; text: string }[];
  /** text：字距、文字阴影（压在亮背景上的提示） */
  spacing?: number; shadow?: boolean;
  /** 只在能操作时画（演示 / 暂停时不出的操作提示） */
  live?: boolean;
};

/** 区域：圆（x, y, r）或矩形（x, y, w, h）；on = 挂在哪个物件上（坐标相对物件中心，跟着物件走；物件不显示时不命中） */
export interface HandsZone { id: string; kind?: 'circle' | 'rect'; x: Num; y: Num; r?: Num; w?: Num; h?: Num; on?: string }

/** 手势量出来的数 raw → 控件：value = round(raw × scale, digits)；mode set 直接写 / max 只涨不落 / add 累加；deadband 变化不到这么多就不写 */
export interface HandsOut { control: string; scale?: number; digits?: number; mode?: 'set' | 'max' | 'add'; deadband?: number;
  /** 取整到 step 的整数倍（进气量 5% 一档；给了就不看 digits） */ step?: number }

/** 拨控件 + 说一句：act 每项按顺序、按那一刻的状态求值（when 为假跳过；value 不写给 1） */
export interface HandsAction {
  act?: { control: string; value?: Num; when?: string }[];
  say?: string; sayWhen?: { when: string; text: string }[];
}

/** 可拖的物件（补纸、吸水纸、怀里的宝宝）：位置 = 原位（表达式）+ 台面记的偏移 */
export interface HandsPiece {
  id: string; x: Num; y: Num;
  /** 什么时候显示（不显示就不能抓、挂在它身上的区域也不命中） */
  when?: string;
  /** 出现那一刻摆到哪件物件的位置上（吸水纸垫在补纸上） */
  spawnOn?: string;
  /** 演示时按状态摆（老手脚本只拨控件，不拖物件） */
  autoAt?: { when?: string; x: Num; y: Num };
  /** 偏移只在这时候算进位置（宝宝放回床里就不跟摇晃的偏移） */
  offsetWhen?: string;
  /** 物件自己的样子，坐标相对物件中心 */
  shapes?: HandsShape[];
  /** 整件的透明度（表达式；不用的时候灰掉） */
  opacity?: Num;
}

export interface HandsDrag {
  piece: string;
  /** follow：物件中心跟着手；relative：按下时的偏移 + 手移动的量（摇），可以 axis 限一个方向、min / max 限幅 */
  mode?: 'follow' | 'relative'; axis?: 'x' | 'y'; min?: number; max?: number;
  /** 松手后偏移每拍（0.25 s）乘这个数回位（< 2 像素归零） */
  springBack?: number;
  /** 拖的速度（像素 / 100 ms，最近 windowMs 里首尾两点算，窗口不到 minMs 不算） */
  speed?: { out: HandsOut; windowMs?: number; minMs?: number };
  /** 摇的幅度（最近 windowMs 里偏移离现在最远的那次），松手后每拍减 decay */
  amplitude?: { out: HandsOut; windowMs?: number; decay?: number };
  /** 松手：依次检查落点离目标（定点或另一件物件）多远，第一个满足 within（小于）/ beyond（大于）的生效；out 拿距离当 raw */
  drops?: { x?: Num; y?: Num; piece?: string; within?: number; beyond?: number; out?: HandsOut; action?: HandsAction }[];
  /** 哪个都不满足：home 回原位 / stay 留在原地（默认） */
  miss?: 'home' | 'stay';
}

export interface HandsPaint {
  /** 要刷到的点（破口一圈的边缘带） */
  points: [number, number][]; radius: number;
  /** 刷到的比例 0–100 → 控件（有新刷到的点才写） */
  out: HandsOut;
  /** 不满足就刷不上（'load >= 12' 刷子干了） */
  need?: string;
  /** 每刷一下扣多少（刷子上的浆） */
  cost?: { control: string; step: number };
  /** 离所有点都超过 beyond、在 inside 区域里、不在 outside 区域里：算刷出界，控件 + step（封顶 max） */
  spill?: { control: string; step: number; beyond: number; inside?: string; outside?: string; max?: number };
  /** 刷到的点画成什么（演示时按覆盖率补画） */
  mark?: { r?: number; color?: string; opacity?: number };
}

/** 沿轨迹走（拉花）：和代码版 BenchRunner 的轨迹层同一套投影（projectOnPath：只在当前进度前后 window 里找、按手移动方向挡掉折返段） */
export interface HandsTrack {
  /** 折线（场景坐标） */
  points: [number, number][];
  /** 进度写进哪个控件（path 控件，只进不退）；dev = 手离折线的距离写进哪个（隐藏）控件 */
  control: string; dev?: string;
  /** 投影窗口（百分点，默认 14）；dir = false 不看移动方向 */
  window?: number; dir?: boolean;
  /** 按下算「抓住」：离轨迹头 head 以内或离折线 path 以内（默认 34 / 6.5，和代码版奶缸手柄、轨迹描边一样） */
  grab?: { head?: number; path?: number };
  /** 记落点：进度往前走时把手的位置（间隔 ≥ spacing，默认 9）连同这个表达式的值记进 trail（演示时记轨迹头）；主体插件用 subjects[].trail 读 */
  mark?: string; spacing?: number;
  /** 把轨迹头位置导出成 <headAs>_x / _y / _a（角度），其他形状可以跟着它（高度尺、奶流） */
  headAs?: string;
  /** 画轨迹：虚线 + 走过的金线 + 引导点（pace % / 模拟秒，从第一次动进度算起）+ 手里的家伙（ToolShape 名）；on 为真时壶嘴出奶 */
  draw?: { tool?: string; pace?: number; on?: string };
}

/** 按住沿槽拖：位置折成 0–1（from 起、长 len）写进 set（本地数或控件），再按 out.raw 表达式算一个控件（值变了才写） */
export interface HandsSlide { axis?: 'x' | 'y'; from: number; len: number; set: string; out?: HandsOut & { raw: string } }

/** 摄像头（HandCam，本地识别）：捏合 = 按住 gesture 这个手势（在哪儿捏都行），之后工具从原位按手移动量 × gain 走，松开 = 松手。
 *  轨迹手势每帧的进度只走 smooth 那么多（防手抖）。at = 开关按钮位置；hold = 手里拿的叫什么（提示语）；devScale 把偏离换成毫米显示 */
export interface HandsCamera { gesture: string; hold?: string; gain?: number; smooth?: number; devScale?: number; at?: { x: number; y: number; w?: number } }

export interface HandsGesture {
  id: string;
  /** 要拿着这件工具（tools[].v）；不写 = 什么工具都行 */
  tool?: number; when?: string; zone?: string;
  down?: HandsAction; fx?: 'spray' | 'ripple';
  hold?: { control: string; perSec: number; when?: string; max?: number; release?: number };
  paint?: HandsPaint; drag?: HandsDrag;
  tempo?: { out: HandsOut; keepMs?: number; idleMs?: number; last?: number };
  track?: HandsTrack; slide?: HandsSlide;
  /** 松手那一刻 */
  up?: HandsAction;
  /** 手悬在这个手势能抓的地方时的鼠标样子（grab / ns-resize） */
  hoverCursor?: string;
}

export interface HandsButton {
  x: number; y: number; w: number; h: number;
  label?: string; labelWhen?: { when: string; text: string }[]; size?: number; weight?: number; rx?: number; color?: string;
  /** 透明热区（样子由 shapes 画，比如夜灯） */
  ghost?: boolean;
  /** 选中（紫）/ 点亮（litColor 底、litInk 字） */
  selWhen?: string; litWhen?: string; litColor?: string; litInk?: string;
  when?: string; action?: HandsAction;
  /** 按住期间这个控件 = 1，松开 / 移出 = 0（「嘘」） */
  hold?: string;
}

export interface HandsConfig {
  master: 'hands';
  /** 径向渐变（shapes 里用 fill: 'url(#id)'；id 建议带 hs- 前缀） */
  gradients?: { id: string; cx?: string; cy?: string; r?: string; stops: [number, string, number?][] }[];
  /** 图层：shapes 垫底 → 刷痕 → subjects → pieces → 反馈 → over（压在主体上：提示、调暗）→ hud（面板）→ 按钮 / 工具盘 / 步骤 → 光标 */
  shapes?: HandsShape[]; over?: HandsShape[]; hud?: HandsShape[];
  zones?: HandsZone[];
  pieces?: HandsPiece[];
  gestures?: HandsGesture[];
  /** 按着的时候手压到区域里 = 控件 1，移开 / 松手 = 0 */
  watch?: { zone: string; when?: string; control: string }[];
  /** 键盘：key（不分大小写）或 code；hold = 按住期间控件 1；action = 按一下执行；prevent 拦掉默认行为（空格滚屏） */
  keys?: { key?: string; code?: string; when?: string; hold?: string; action?: HandsAction; prevent?: boolean;
    /** 松开那一刻（有 hold 时只在它确实是 1 的时候） */ up?: HandsAction }[];
  /** 滚轮：往上滚 + step、往下滚 − step，取整到 step、限在 [min, max]（整页滚轮都接住，preventDefault） */
  wheel?: { control: string; step: number; min?: number; max?: number; when?: string }[];
  /** 台面自己记的数（初值）：动作 / 按键 hold / slide 都能写，表达式里直接用名字 */
  locals?: Record<string, number>;
  camera?: HandsCamera;
  buttons?: HandsButton[];
  /** 器械盘：拿着哪件写进 toolControl（默认 tool）；wantTool 算出来对上的那件发光；label 里括号部分不显示 */
  tools?: { v: number; label: string; icon: string }[]; toolControl?: string; toolsAt?: { x: number; y: number; title?: string }; wantTool?: string;
  /** 步骤清单：done 表达式，或 ever = 这个控件动过（事件流里有它） */
  steps?: { label: string; done?: string; ever?: string }[];
  stepsAt?: { x: number; y: number; w: number; h: number; title?: string; cols?: number; colW?: number; size?: number };
  /** 主体渲染插件（HandsStage 里注册的名字），挂在物件上或定点；params 是表达式，texts 是原样的字 */
  subjects?: { plugin: string; piece?: string; x?: Num; y?: Num; params?: Record<string, Num>; texts?: Record<string, string>;
    /** 读哪个轨迹手势记下的落点（latte-cup 拿它堆奶泡） */ trail?: string }[];
  /** 跟手的光标：tool = 手里工具的图标，hand = 画一只右手；cursorUnder = 画在 over 层下面（会被调暗） */
  cursor?: 'tool' | 'hand'; cursorUnder?: boolean;
  /** 说话条位置（动作带 say 时） */
  sayAt?: { x: number; y: number; w: number };
}

/** 配置里所有表达式（存库前逐个求值，求不了就拒收） */
function handsExprs(cfg: HandsConfig): string[] {
  const out: string[] = [];
  // 台面自己的名字（本地数、on_<手势>、轨迹头）规格里没有：校验时按初值 / 0 代入
  const own: Record<string, number> = { ...(cfg.locals || {}) };
  cfg.gestures?.forEach(g => { own[`on_${g.id}`] = 0; const h = g.track?.headAs; if (h) { own[`${h}_x`] = 0; own[`${h}_y`] = 0; own[`${h}_a`] = 0; } });
  const e = (s?: string) => { if (s) out.push(s); };
  const n = (v?: Num) => { if (typeof v === 'string') out.push(v); };
  const tpl = (t?: string) => { for (const m of (t || '').matchAll(TPL_RE)) out.push(m[1]); };
  const shape = (sh: HandsShape) => {
    (['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'rx', 'ry', 'opacity', 'count', 'amp', 'width'] as const).forEach(k => n(sh[k]));
    e(sh.when); e(sh.spinWhen); tpl(sh.text);
    sh.textWhen?.forEach(x => { e(x.when); tpl(x.text); }); sh.colorWhen?.forEach(x => e(x.when));
    sh.textParts?.forEach(x => { e(x.when); tpl(x.text); });
  };
  const action = (a?: HandsAction) => { a?.act?.forEach(x => { n(x.value); e(x.when); }); a?.sayWhen?.forEach(x => { e(x.when); tpl(x.text); }); tpl(a?.say); };
  [...(cfg.shapes || []), ...(cfg.over || []), ...(cfg.hud || [])].forEach(shape);
  cfg.zones?.forEach(z => [z.x, z.y, z.r, z.w, z.h].forEach(n));
  cfg.pieces?.forEach(p => { n(p.x); n(p.y); n(p.opacity); e(p.when); e(p.offsetWhen); if (p.autoAt) { e(p.autoAt.when); n(p.autoAt.x); n(p.autoAt.y); } p.shapes?.forEach(shape); });
  cfg.gestures?.forEach(g => {
    e(g.when); action(g.down); action(g.up); e(g.hold?.when); e(g.paint?.need);
    e(g.track?.mark); e(g.track?.draw?.on); e(g.slide?.out?.raw);
    g.drag?.drops?.forEach(d => { n(d.x); n(d.y); action(d.action); });
  });
  cfg.watch?.forEach(w => e(w.when));
  cfg.keys?.forEach(k => { e(k.when); action(k.action); action(k.up); });
  cfg.wheel?.forEach(w => e(w.when));
  cfg.buttons?.forEach(b => { b.labelWhen?.forEach(x => e(x.when)); e(b.selWhen); e(b.litWhen); e(b.when); action(b.action); });
  e(cfg.wantTool);
  cfg.steps?.forEach(s => e(s.done));
  cfg.subjects?.forEach(s => { n(s.x); n(s.y); Object.values(s.params || {}).forEach(n); });
  const names = Object.keys(own);
  if (!names.length) return out;
  const re = new RegExp(`\\b(${names.join('|')})\\b`, 'g');
  return out.map(x => x.replace(re, m => `(${own[m]})`));
}

/** 配置里会拨到的控件 id（都得在规格的 controls 里声明过） */
function handsControls(cfg: HandsConfig): string[] {
  const ids = new Set<string>();
  const action = (a?: HandsAction) => a?.act?.forEach(x => ids.add(x.control));
  const o = (x?: HandsOut) => { if (x) ids.add(x.control); };
  if (cfg.tools?.length) ids.add(cfg.toolControl || 'tool');
  cfg.gestures?.forEach(g => {
    action(g.down); action(g.up); if (g.hold) ids.add(g.hold.control); o(g.tempo?.out);
    if (g.track) { ids.add(g.track.control); if (g.track.dev) ids.add(g.track.dev); }
    if (g.slide) { ids.add(g.slide.set); o(g.slide.out); }
    if (g.paint) { o(g.paint.out); if (g.paint.cost) ids.add(g.paint.cost.control); if (g.paint.spill) ids.add(g.paint.spill.control); }
    if (g.drag) { o(g.drag.speed?.out); o(g.drag.amplitude?.out); g.drag.drops?.forEach(d => { o(d.out); action(d.action); }); }
  });
  cfg.watch?.forEach(w => ids.add(w.control));
  cfg.keys?.forEach(k => { if (k.hold) ids.add(k.hold); action(k.action); action(k.up); });
  cfg.wheel?.forEach(w => ids.add(w.control));
  cfg.buttons?.forEach(b => { if (b.hold) ids.add(b.hold); action(b.action); });
  // 本地数不是控件
  return [...ids].filter(id => !(cfg.locals && id in cfg.locals));
}

export const HANDS_DEF: MasterDef<HandsConfig> = { name: 'hands', host: 'svg', exprs: handsExprs, controls: handsControls };
