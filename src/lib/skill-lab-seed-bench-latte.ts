/**
 * Case E 的虚拟工位：咖啡拉花（意式奶咖出品）——三台工位，三种图案，同一套手上功夫。
 *   E1 蒸奶 + 心形   打发与融合是一切的前提：奶打坏了，后面怎么画都白搭
 *   E2 郁金香        分层推注：推一下 → 断流退回 → 再推，三次叠出花瓣
 *   E3 树叶（洛塔）  匀速摆动后退：节奏稳不稳，叶片有几片，一眼看得出来
 * 三台都是「跟着轨迹走」：鼠标拖、或者打开摄像头捏住奶缸用手走。
 * 偏离轨迹多少、奶缸压得多低、流量收没收细，都会实时变成杯子里的图案——走歪了就画歪了。
 * 工艺参数为教学化的简化模型，不代表任何门店的实际出品标准。
 */
import type { BenchSpec, BenchAction, BenchLayer } from '@/lib/bench';

// ──────────────────────────────────────────────
// 杯口几何：场景覆盖层坐标系 1600 × 900，杯子放在底图中央空出来的那片台面上
// ──────────────────────────────────────────────
const CX = 760, CY = 500, R = 240;
interface Pt { x: number; y: number }

/**
 * 场景坐标折线 → 百分比坐标 + 每个节点对应的进度（%）。
 * mark 把关键节点起了名字（「融合走完」「第二瓣推完」），规则和目标里直接用名字取进度，不用数索引。
 */
function trail(pts: Pt[], mark: Record<string, number> = {}): { points: Pt[]; at: number[]; p: Record<string, number> } {
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  const at = [0]; let acc = 0;
  for (const d of seg) { acc += d; at.push(Math.round(acc / total * 1000) / 10); }
  return { points: pts.map(p => ({ x: p.x / 16, y: p.y / 9 })), at, p: Object.fromEntries(Object.entries(mark).map(([k, i]) => [k, at[i]])) };
}

/** 融合段：奶缸悬在杯心细水慢绕的两圈（手要稳，圈要小） */
function fuseLoops(r = 46, turns = 2, steps = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + i / steps * Math.PI * 2 * turns; out.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }); }
  return out;
}

const cupLayer = (level: string): BenchLayer => ({ id: 'cup', kind: 'cup', x: (CX - R) / 16, y: (CY - R) / 9, w: R * 2 / 16, h: R * 2 / 9, level });
const coach = (id: string, on: string, label: string, y = 9, color?: string): BenchLayer => ({ id, kind: 'coach', x: 50, y, w: 0, h: 0, on, label, color });

/** 杯口直径 480 场景单位 ≈ 真实 70 mm，偏离轨迹的距离按这个换算成毫米 */
const MM = 0.146;

// ──────────────────────────────────────────────
// 共用：注入过程的变量、规则、仪表（三台工位一样的手上功夫）
// ──────────────────────────────────────────────
const POUR_VARS = [
  { id: 'pour_prev', initial: 0, set: 'pour' },
  { id: 'rate_pour', label: '注入点移动速度', initial: 0, set: '(pour - pour_prev) / dt', min: 0, max: 60 },
  { id: 'pouring', initial: 0, set: 'rate_pour > 0.4 && flow > 8 ? 1 : 0' },
  // 偏离轨迹：平均 / 最大 / 偏出去的时长（只在真的在倒的时候算）
  { id: 'dev_sum', initial: 0, rate: 'pouring == 1 ? dev : 0' },
  { id: 'dev_time', initial: 0, rate: 'pouring == 1 ? 1 : 0' },
  { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
  { id: 'dev_max', initial: 0, set: 'max(dev_max, pouring == 1 ? dev : 0)' },
  { id: 'off_time', label: '跑偏时长', initial: 0, rate: 'pouring == 1 && dev > 110 ? 1 : 0' },
  // 中途断流（不是该断的地方断的）
  { id: 'stall', label: '断流秒数', initial: 0, set: 'pour > 3 && pour < 99 && rate_pour < 0.4 ? stall + dt : 0' },
  { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
  // 成形段把奶缸抬太高 = 牛奶沉下去，杯面什么都留不下
  { id: 'flat', label: '没压低的秒数', initial: 0, max: 14, rate: 'pouring == 1 && pour > 40 && pour < 86 && h > 2.5 ? 1 : 0' },
  { id: 'tail_flow', initial: 0, set: 'pour >= 93 && tail_flow == 0 ? max(flow, 1) : tail_flow' },
  { id: 'done_t', initial: 0, set: 'pour >= 100 && done_t == 0 ? t : done_t' },
];

const POUR_CONTROLS = [
  { id: 'h', label: '奶缸高度', kind: 'knob' as const, min: 0.5, max: 8, step: 0.5, unit: 'cm', initial: 6, hint: '融合要高（4–6 cm），出图案要压到 1 cm 贴着液面' },
  { id: 'flow', label: '注入流量', kind: 'knob' as const, min: 0, max: 100, step: 5, initial: 0, unit: '%', hint: '融合细水、成形加大、收尾收细' },
  { id: 'pour', label: '注入轨迹', kind: 'path' as const, hint: '拖着奶缸沿白色轨迹走；也可以打开摄像头，捏住拇指和食指握奶缸' },
  { id: 'dev', label: '偏离', kind: 'knob' as const, min: 0, max: 400, initial: 0, hidden: true },
];

const POUR_RULES = [
  { id: 'off_track', label: '奶缸跑出轨迹（图案歪掉）', when: 'pouring == 1 && dev > 150', severity: 'violation' as const },
  { id: 'high_shape', label: '出图案时奶缸抬太高（牛奶沉底，杯面没有白）', when: 'pouring == 1 && pour > 45 && pour < 86 && h > 2.5', severity: 'violation' as const, once: true },
  { id: 'rush', label: '走得太快（奶来不及浮上来）', when: 'pouring == 1 && rate_pour > 9', severity: 'warning' as const },
  { id: 'stall_mid', label: '中途停住超过 3 秒（图案断层）', when: 'stall > 3 && pour > 8 && pour < 92', severity: 'violation' as const },
  { id: 'tail_thick', label: '收尾没收细（心尖拖泥带水）', when: 'pour >= 95 && tail_flow > 45', severity: 'warning' as const, once: true },
];

const POUR_GAUGES = [
  { id: 'g_dev', label: '偏离轨迹', unit: 'mm', expr: `dev * ${MM}`, min: 0, max: 40, digits: 1, warn: 'dev > 110' },
  { id: 'g_rate', label: '行走速度', unit: '%/s', expr: 'rate_pour', min: 0, max: 14, digits: 1, warn: 'pouring == 1 && rate_pour > 9' },
];

// ════════════════════════════════════════════════════════════════
// E1：蒸奶 + 心形
// ════════════════════════════════════════════════════════════════
const HEART = (() => {
  const pts: Pt[] = fuseLoops(46);
  const m: Record<string, number> = { fuse: pts.length - 1 };
  pts.push({ x: CX, y: CY + 120 });                                              // 压低、移到靠近自己的一侧
  m.drop = pts.length - 1;
  for (let i = 0; i < 6; i++) pts.push({ x: CX + (i % 2 ? 50 : -50), y: CY + 120 - i * 8 });  // 左右晃着往前挪，白圆铺开
  pts.push({ x: CX, y: CY + 72 });
  m.shake = pts.length - 1;
  pts.push({ x: CX, y: CY - 30 });                                               // 往前推一段：圆被推着走，前缘鼓出心的两瓣
  m.push = pts.length - 1;
  pts.push({ x: CX, y: CY + 170 });                                              // 收细，一刀穿到底，把心尖拉出来
  return trail(pts, m);
})();

export const BENCH_LATTE_HEART: BenchSpec = {
  name: '拉花工位 · 蒸奶与心形',
  brief: '一杯刚萃好的 espresso 在手边。先把一缸全脂奶蒸成微泡（60–65℃、0.8 cm 左右的奶泡），再高位融合、压低出图案、收细穿过，画一颗心。奶缸要沿着白色轨迹走——走歪了，杯子里就是歪的。',
  timeScale: 1,
  maxSeconds: 300,
  vars: [
    // ── 蒸奶 ──
    { id: 'milk_t', label: '奶温', initial: 5, rate: 'steam == 1 ? 2.2 : -0.05', min: 4, max: 95 },
    { id: 'foam', label: '奶泡厚度', initial: 0, rate: 'steam == 1 && air > 0 && milk_t < 42 ? air * 0.006 : 0', min: 0, max: 4 },
    { id: 'coarse', label: '粗泡', initial: 0, rate: 'steam == 1 && air > 0 ? (milk_t > 42 ? air * 0.14 : 0) + (air > 75 ? (air - 75) * 0.08 : 0) : 0', min: 0, max: 100 },
    { id: 'burnt', initial: 0, set: 'max(burnt, milk_t > 72 ? 1 : 0)' },
    { id: 'milk_done', label: '关汽时奶温', initial: 0, set: 'milk_done == 0 && steam == 0 && milk_t > 40 ? milk_t : milk_done' },
    // ── 融合 ──
    { id: 'fused', label: '融合秒数', initial: 0, rate: `pouring == 1 && pour < ${HEART.p.fuse} && h >= 4 && flow >= 25 ? 1 : 0` },
    { id: 'bad_fuse', label: '融合段压太低的秒数', initial: 0, max: 12, rate: `pouring == 1 && pour < ${HEART.p.fuse - 4} && h < 3 ? 1 : 0` },
    ...POUR_VARS,
    // ── 图案：偏离、粗泡、奶温、该压不压、该高不高，一样一样扣 ──
    { id: 'pattern', label: '图案清晰度', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 0.5 - coarse * 1.1 - max(0, abs(milk_done - 63) - 4) * 2.5 - flat * 3.2 - bad_fuse * 3.5 - max(0, foam - 1.5) * 30 - max(0, 0.55 - foam) * 70 - max(0, 6 - fused) * 5 - burnt * 25, 0, 100)' },
  ],
  controls: [
    { id: 'steam', label: '蒸汽阀', kind: 'switch', hint: '打开蒸汽棒开始蒸奶' },
    { id: 'air', label: '进气量', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0, hint: '蒸汽棒越浅进气越多；40℃ 以上还进气就是粗泡' },
    ...POUR_CONTROLS,
  ],
  gauges: [
    { id: 'g_t', label: '奶温', unit: '℃', expr: 'milk_t', min: 0, max: 95, warn: 'milk_t > 69' },
    { id: 'g_foam', label: '奶泡厚度', unit: 'cm', expr: 'foam', min: 0, max: 3, digits: 2, warn: 'foam > 1.5 || coarse > 20' },
    ...POUR_GAUGES,
  ],
  rules: [
    { id: 'burn', label: '奶温超过 72℃（蛋白质变性，奶腥、拉不出图案）', when: 'milk_t > 72', severity: 'violation' },
    { id: 'air_late', label: '40℃ 以上还在进气（全是粗泡）', when: 'steam == 1 && air > 0 && milk_t > 42', severity: 'violation', once: true },
    { id: 'air_blast', label: '进气太猛，奶面在“撕”（大泡）', when: 'steam == 1 && air > 78', severity: 'warning', once: true },
    { id: 'pour_raw', label: '奶还没打好就开始倒', when: 'pour > 5 && milk_done == 0', severity: 'violation', once: true },
    { id: 'steam_on', label: '一边倒奶一边开着蒸汽', when: 'pour > 5 && steam == 1', severity: 'violation', once: true },
    { id: 'low_fuse', label: '融合阶段就把奶缸压低（咖啡被冲破，杯面浑浊）', when: `pouring == 1 && pour < ${HEART.p.fuse - 4} && h < 3`, severity: 'violation', once: true },
    ...POUR_RULES,
  ],
  goals: [
    { id: 'steam_ok', label: '奶打成微泡：关汽温度 58–68℃、奶泡 0.6–1.4 cm、无粗泡', when: 'milk_done >= 58 && milk_done <= 68 && foam >= 0.6 && foam <= 1.4 && coarse < 20' },
    { id: 'fuse', label: '高位细流融合至少 6 秒', when: `fused >= 6 && pour >= ${HEART.p.fuse - 2}` },
    { id: 'drop', label: '进入成形段前把奶缸压到 1.5 cm 以内', when: `pour >= ${HEART.p.drop} && h <= 1.5`, hold: 1 },
    { id: 'shape', label: '晃开并推出心形轮廓', when: `pour >= ${HEART.p.push} && flat < 3`, after: 'drop' },
    { id: 'tail', label: '收细流一刀穿到底', when: 'pour >= 100 && tail_flow <= 45', after: 'shape' },
    { id: 'quality', label: '成品图案清晰、对称（≥ 70 分）', when: 'pour >= 100 && pattern >= 70', after: 'tail' },
  ],
  scene: {
    image: '/lab/latte_bar.jpg', credit: '底图由通义万相生成',
    layers: [
      cupLayer('clamp((2.6 - h) / 2.1, 0, 1) * clamp(flow / 45, 0, 1) * pouring'),
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'pour', deviation: 'dev', points: HEART.points, pace: 1.6, on: 'flow > 8', label: '注入轨迹' },
      { id: 'steam_pulse', kind: 'pulse', x: 20.5, y: 35, w: 5, h: 9, on: 'steam == 1', color: '#e8f0ff' },
      { id: 'ro_t', kind: 'readout', x: 2, y: 3, w: 9, h: 5, text: 'milk_t', unit: '℃', label: 'MILK' },
      { id: 'ro_foam', kind: 'readout', x: 2, y: 9, w: 9, h: 5, text: 'foam', unit: 'cm', digits: 2, label: 'FOAM', color: '#ffd166' },
      coach('c1', `pour < ${HEART.p.fuse - 2} && milk_done > 0`, '① 融合：奶缸抬到 4–6 cm，细水注进杯心，让牛奶沉到咖啡下面'),
      coach('c2', `pour >= ${HEART.p.fuse - 2} && pour < ${HEART.p.shake}`, '② 压低：奶缸贴到液面 1 cm 以内，加大流量——白色才会浮上来'),
      coach('c3', `pour >= ${HEART.p.shake} && pour < ${HEART.p.push}`, '③ 晃开再推：跟着轨迹左右晃，白圆铺开，然后往前推'),
      coach('c4', `pour >= ${HEART.p.push}`, '④ 收细穿过：流量收到 30% 以下，提起奶缸，从圆心一刀穿到底', 9, '#ffd166'),
      coach('c0', 'milk_done == 0', '先把奶打好：开蒸汽 → 进气到 0.8 cm 奶泡 → 40℃ 停止进气 → 63℃ 关汽', 9, '#7cc8ff'),
    ],
  },
};

// ════════════════════════════════════════════════════════════════
// E2：郁金香（分层推注——推一下、断流退回、再推）
// ════════════════════════════════════════════════════════════════
const TULIP = (() => {
  const pts: Pt[] = fuseLoops(44);
  const m: Record<string, number> = { fuse: pts.length - 1 };
  pts.push({ x: CX, y: CY - 40 });          // 压低，第一瓣落点
  pts.push({ x: CX, y: CY - 115 }); m.p1 = pts.length - 1;   // 第一瓣推出去
  pts.push({ x: CX - 60, y: CY - 55 });     // 断流：抬起奶缸从旁边绕回来
  pts.push({ x: CX, y: CY + 25 }); m.r1 = pts.length - 1;
  pts.push({ x: CX, y: CY - 45 }); m.p2 = pts.length - 1;    // 第二瓣
  pts.push({ x: CX + 60, y: CY + 25 });     // 断流绕回
  pts.push({ x: CX, y: CY + 105 }); m.r2 = pts.length - 1;
  pts.push({ x: CX, y: CY + 30 }); m.p3 = pts.length - 1;    // 第三瓣
  pts.push({ x: CX - 60, y: CY + 105 });    // 断流绕回到杯底
  pts.push({ x: CX, y: CY + 170 }); m.r3 = pts.length - 1;
  pts.push({ x: CX, y: CY - 170 });         // 细流穿过三瓣
  return trail(pts, m);
})();
/** 三个「该断流」的区间（退回奶缸的时候流量必须收掉，否则三瓣糊成一坨） */
const T_BREAK = [[TULIP.p.p1, TULIP.p.r1], [TULIP.p.p2, TULIP.p.r2], [TULIP.p.p3, TULIP.p.r3]];
const inBreak = T_BREAK.map(([a, b]) => `(pour > ${a + 1} && pour < ${b - 1})`).join(' || ');

export const BENCH_LATTE_TULIP: BenchSpec = {
  name: '拉花工位 · 郁金香',
  brief: '奶已经打好（63℃、0.9 cm 微泡）。郁金香靠的是节奏：压低推一瓣 → 收掉流量把奶缸退回来 → 再推一瓣，三次之后收细流一刀穿过三瓣。退回的时候没断流，三瓣就会糊成一坨。',
  timeScale: 1,
  maxSeconds: 200,
  vars: [
    { id: 'petals', label: '推出的花瓣数', initial: 0, set: `(pour > ${TULIP.p.p1} ? 1 : 0) + (pour > ${TULIP.p.p2} ? 1 : 0) + (pour > ${TULIP.p.p3} ? 1 : 0)` },
    { id: 'merge', label: '没断流的秒数', initial: 0, max: 9, rate: `(${inBreak}) && flow > 20 ? 1 : 0` },
    { id: 'breaks', label: '成功断流次数', initial: 0, set: `(pour > ${TULIP.p.r1} && merge < 1 ? 1 : 0) + (pour > ${TULIP.p.r2} && merge < 2 ? 1 : 0) + (pour > ${TULIP.p.r3} && merge < 3 ? 1 : 0)` },
    ...POUR_VARS,
    { id: 'pattern', label: '图案清晰度', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 0.55 - merge * 7 - flat * 3.2 - max(0, stall_max - 3) * 6 - max(0, 3 - petals) * 15, 0, 100)' },
  ],
  controls: POUR_CONTROLS,
  gauges: [
    { id: 'g_petal', label: '花瓣', unit: '瓣', expr: 'petals', min: 0, max: 3 },
    { id: 'g_flow', label: '注入流量', unit: '%', expr: 'flow', min: 0, max: 100, warn: `(${inBreak}) && flow > 20` },
    ...POUR_GAUGES,
  ],
  rules: [
    { id: 'no_break', label: '退回奶缸时没有断流（花瓣糊在一起）', when: `(${inBreak}) && flow > 20`, severity: 'violation' },
    { id: 'low_fuse', label: '融合阶段就把奶缸压低（咖啡被冲破）', when: `pouring == 1 && pour < ${TULIP.p.fuse - 4} && h < 3`, severity: 'violation', once: true },
    ...POUR_RULES,
  ],
  goals: [
    { id: 'fuse', label: '高位细流融合（奶缸 4 cm 以上走完融合圈）', when: `pour >= ${TULIP.p.fuse - 2} && flat == 0` },
    { id: 'p1', label: '压低推出第一瓣', when: `pour >= ${TULIP.p.p1} && h <= 1.5` },
    { id: 'p2', label: '断流退回后推出第二瓣', when: `pour >= ${TULIP.p.p2} && merge < 1.5`, after: 'p1' },
    { id: 'p3', label: '再断流一次，推出第三瓣', when: `pour >= ${TULIP.p.p3} && merge < 2.5`, after: 'p2' },
    { id: 'tail', label: '收细流一刀穿过三瓣', when: 'pour >= 100 && tail_flow <= 45', after: 'p3' },
    { id: 'quality', label: '三瓣分明、轴线不歪（≥ 70 分）', when: 'pour >= 100 && pattern >= 70', after: 'tail' },
  ],
  scene: {
    image: '/lab/latte_bar.jpg', credit: '底图由通义万相生成',
    layers: [
      cupLayer('clamp((2.6 - h) / 2.1, 0, 1) * clamp(flow / 45, 0, 1) * pouring'),
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'pour', deviation: 'dev', points: TULIP.points, pace: 1.7, on: 'flow > 8', label: '注入轨迹' },
      { id: 'ro_petal', kind: 'readout', x: 2, y: 3, w: 9, h: 5, text: 'petals', unit: '瓣', label: 'PETAL' },
      { id: 'ro_flow', kind: 'readout', x: 2, y: 9, w: 9, h: 5, text: 'flow', unit: '%', label: 'FLOW', color: '#ffd166' },
      coach('cb', inBreak, '断流！流量收到 20% 以下，把奶缸退回来再推下一瓣', 19, '#ff5fa2'),
      coach('c1', `pour < ${TULIP.p.fuse - 2}`, '① 融合：高位细水绕杯心两圈'),
      coach('c2', `pour >= ${TULIP.p.fuse - 2} && pour < ${TULIP.p.r3}`, '② 分层：压低推一瓣 → 断流退回 → 再推，一共三瓣'),
      coach('c3', `pour >= ${TULIP.p.r3}`, '③ 收细穿过三瓣，把花托拉出来', 9, '#ffd166'),
    ],
  },
};

// ════════════════════════════════════════════════════════════════
// E3：树叶 / 洛塔（匀速摆动后退——节奏稳不稳，叶片数一眼看得出来）
// ════════════════════════════════════════════════════════════════
const ROSETTA = (() => {
  const pts: Pt[] = fuseLoops(44);
  const m: Record<string, number> = { fuse: pts.length - 1 };
  pts.push({ x: CX, y: CY - 105 }); m.drop = pts.length - 1;                  // 压低，到杯子远端起摆
  for (let i = 0; i < 10; i++) pts.push({ x: CX + (i % 2 ? 58 : -58), y: CY - 105 + 26 * (i + 1) });  // 一边摆一边往自己这边退
  pts.push({ x: CX, y: CY + 160 }); m.wobble = pts.length - 1;                // 回到中线
  pts.push({ x: CX, y: CY - 175 });                                           // 细流穿过叶心
  return trail(pts, m);
})();

export const BENCH_LATTE_ROSETTA: BenchSpec = {
  name: '拉花工位 · 树叶（洛塔）',
  brief: '奶已经打好。树叶考的是节奏：压低之后左右匀速摆动，一边摆一边把奶缸往自己这边退，十来个摆出十来片叶，最后收细流从叶尖一刀穿到叶柄。摆快了叶片糊，摆慢了叶片胖，摆歪了整片叶子就斜。',
  timeScale: 1,
  maxSeconds: 200,
  vars: [
    { id: 'leaves', label: '摆出的叶片', initial: 0, set: `clamp((pour - ${ROSETTA.p.drop}) / ${(ROSETTA.p.wobble - ROSETTA.p.drop) / 10}, 0, 10)` },
    ...POUR_VARS,
    // 摆动段的速度稳定度：超过推荐速度两倍就算「赶」，累计秒数
    { id: 'hurry', label: '摆动累计超速', initial: 0, max: 30, rate: `pouring == 1 && pour > ${ROSETTA.p.drop} && pour < ${ROSETTA.p.wobble} && rate_pour > 4.2 ? rate_pour - 4.2 : 0` },
    { id: 'pattern', label: '图案清晰度', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 1.1 - flat * 3.2 - hurry * 2 - max(0, stall_max - 3) * 6 - max(0, 8 - leaves) * 9, 0, 100)' },
  ],
  controls: POUR_CONTROLS,
  gauges: [
    { id: 'g_leaf', label: '叶片', unit: '片', expr: 'leaves', min: 0, max: 10 },
    { id: 'g_hurry', label: '摆动超速', unit: '', expr: 'hurry', min: 0, max: 30, digits: 1, warn: 'hurry > 8' },
    ...POUR_GAUGES,
  ],
  rules: [
    { id: 'wobble_fast', label: '摆动过快（叶片糊成一条）', when: `pouring == 1 && pour > ${ROSETTA.p.drop} && pour < ${ROSETTA.p.wobble} && rate_pour > 6`, severity: 'violation' },
    { id: 'low_fuse', label: '融合阶段就把奶缸压低（咖啡被冲破）', when: `pouring == 1 && pour < ${ROSETTA.p.fuse - 4} && h < 3`, severity: 'violation', once: true },
    ...POUR_RULES,
  ],
  goals: [
    { id: 'fuse', label: '高位细流融合（奶缸 4 cm 以上走完融合圈）', when: `pour >= ${ROSETTA.p.fuse - 2} && flat == 0` },
    { id: 'drop', label: '压低到 1.5 cm 以内开始摆动', when: `pour >= ${ROSETTA.p.drop} && h <= 1.5`, hold: 1 },
    { id: 'wobble', label: '匀速摆出 8 片以上叶片，叶心不歪', when: 'leaves >= 8 && hurry < 8 && dev_avg < 24', after: 'drop' },
    { id: 'tail', label: '收细流从叶尖穿到叶柄', when: 'pour >= 100 && tail_flow <= 45', after: 'wobble' },
    { id: 'quality', label: '叶片对称、叶心居中（≥ 70 分）', when: 'pour >= 100 && pattern >= 70', after: 'tail' },
  ],
  scene: {
    image: '/lab/latte_bar.jpg', credit: '底图由通义万相生成',
    layers: [
      cupLayer('clamp((2.6 - h) / 2.1, 0, 1) * clamp(flow / 45, 0, 1) * pouring'),
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'pour', deviation: 'dev', points: ROSETTA.points, pace: 1.5, on: 'flow > 8', label: '注入轨迹' },
      { id: 'ro_leaf', kind: 'readout', x: 2, y: 3, w: 9, h: 5, text: 'leaves', unit: '片', label: 'LEAF' },
      { id: 'ro_dev', kind: 'readout', x: 2, y: 9, w: 9, h: 5, text: `dev * ${MM}`, unit: 'mm', digits: 1, label: 'OFF', color: '#ffd166' },
      coach('c1', `pour < ${ROSETTA.p.fuse - 2}`, '① 融合：高位细水绕杯心两圈'),
      coach('c2', `pour >= ${ROSETTA.p.fuse - 2} && pour < ${ROSETTA.p.drop}`, '② 压低到液面 1 cm，移到杯子远端准备起摆'),
      coach('c3', `pour >= ${ROSETTA.p.drop} && pour < ${ROSETTA.p.wobble}`, '③ 左右匀速摆，一边摆一边往自己这边退——节奏比速度重要'),
      coach('c4', `pour >= ${ROSETTA.p.wobble}`, '④ 收细流，从叶尖一刀穿到叶柄', 9, '#ffd166'),
    ],
  },
};

// ──────────────────────────────────────────────
// 专家 / 新兵 / AI 的操作脚本（灌入时在模拟器里无头跑出各自的轨迹）
// ──────────────────────────────────────────────
/** 沿轨迹走：从 t0 起以 pct 每模拟秒推进，顺便写入这一路的偏离（专家贴着线，新人飘） */
function walk(t0: number, pctPerS: number, from: number, to: number, dev = 8): BenchAction[] {
  const out: BenchAction[] = [];
  for (let i = 0; ; i++) {
    const t = t0 + i * 0.5, v = Math.min(to, from + i * 0.5 * pctPerS);
    out.push({ t, control: 'dev', value: Math.round(dev * (0.5 + Math.abs(Math.sin(i * 1.7)))) });
    out.push({ t, control: 'pour', value: v });
    if (v >= to) return out;
    if (i > 400) return out;
  }
}

/** 蒸奶那一段：开汽 → 进气到 0.8 cm → 40℃ 前停止进气 → 63℃ 关汽 */
const STEAM_GOOD: BenchAction[] = [
  { t: 2, control: 'steam', value: 1 }, { t: 2, control: 'air', value: 45 },
  { t: 7, control: 'air', value: 0 }, { t: 27, control: 'steam', value: 0 },
];

export const HEART_EXPERT_SCRIPT: BenchAction[] = [
  ...STEAM_GOOD,
  { t: 32, control: 'h', value: 5.5 }, { t: 33, control: 'flow', value: 35 },
  ...walk(34, 2.0, 0, HEART.p.fuse, 5),                        // 融合：高位细水绕两圈
  { t: 52, control: 'h', value: 1 }, { t: 52.5, control: 'flow', value: 70 },
  ...walk(53, 1.7, HEART.p.fuse, HEART.p.push, 6),             // 压低、晃开、往前推
  { t: 82, control: 'flow', value: 25 }, { t: 82, control: 'h', value: 2.5 },
  ...walk(82.5, 3.2, HEART.p.push, 100, 5),                    // 收细，一刀穿到底
  { t: 90, control: 'flow', value: 0 },
];
BENCH_LATTE_HEART.expertScript = HEART_EXPERT_SCRIPT;

export const HEART_SCRIPTS: Record<string, BenchAction[]> = {
  // 酒店管理专业大三：奶打得不错，但舍不得花时间融合，没压低就开始画，杯面几乎没有白
  shy_rookie: [
    ...STEAM_GOOD,
    { t: 30, control: 'h', value: 5 }, { t: 31, control: 'flow', value: 30 },
    ...walk(32, 4.5, 0, HEART.p.fuse, 14),
    { t: 42, control: 'h', value: 3.5 }, { t: 42, control: 'flow', value: 55 },
    ...walk(42.5, 2.2, HEART.p.fuse, HEART.p.push, 26),
    { t: 68, control: 'flow', value: 30 }, ...walk(68.5, 3, HEART.p.push, 100, 20),
  ],
  // 奶茶店兼职转行：手快，奶蒸过头（74℃）还一路进气，粗泡一堆，轨迹也飘
  burnt_milk: [
    { t: 1, control: 'steam', value: 1 }, { t: 1, control: 'air', value: 70 },
    { t: 20, control: 'air', value: 30 }, { t: 33, control: 'steam', value: 0 },
    { t: 35, control: 'h', value: 2 }, { t: 36, control: 'flow', value: 60 },
    ...walk(37, 5, 0, HEART.p.fuse, 30),
    ...walk(48, 3.5, HEART.p.fuse, 100, 34),
  ],
  // AI 裸答：知道流程、顺序也对，但「压低」这一下没做到位，而且全程大流量
  ai_bare: [
    ...STEAM_GOOD,
    { t: 30, control: 'h', value: 5 }, { t: 31, control: 'flow', value: 45 },
    ...walk(32, 2.6, 0, HEART.p.fuse, 11),
    { t: 46, control: 'h', value: 3 },
    ...walk(46.5, 2.2, HEART.p.fuse, HEART.p.push, 18),
    ...walk(68, 3, HEART.p.push, 100, 15),
  ],
  // AI + 专家技能：和专家同样的节奏与高度，手稳一点点差距
  ai_skill: [
    ...STEAM_GOOD,
    { t: 31, control: 'h', value: 5.5 }, { t: 32, control: 'flow', value: 35 },
    ...walk(33, 2.1, 0, HEART.p.fuse, 6),
    { t: 50, control: 'h', value: 1 }, { t: 50.5, control: 'flow', value: 70 },
    ...walk(51, 1.8, HEART.p.fuse, HEART.p.push, 8),
    { t: 79, control: 'flow', value: 25 }, { t: 79, control: 'h', value: 2.5 },
    ...walk(79.5, 3.2, HEART.p.push, 100, 7),
    { t: 87, control: 'flow', value: 0 },
  ],
};

/** 郁金香：退回段把流量收掉，是这台工位的全部 */
const tulipRun = (dev: number, breakFlow: number[], pace = 1.8): BenchAction[] => {
  const out: BenchAction[] = [{ t: 1, control: 'h', value: 5.5 }, { t: 2, control: 'flow', value: 35 }, ...walk(3, 2.2, 0, TULIP.p.fuse, Math.round(dev * 0.6))];
  let t = 3 + (TULIP.p.fuse / 2.2) * 1;
  out.push({ t, control: 'h', value: 1 }, { t, control: 'flow', value: 70 });
  const legs: [number, number, number][] = [[TULIP.p.fuse, TULIP.p.p1, 70], [TULIP.p.p1, TULIP.p.r1, breakFlow[0]], [TULIP.p.r1, TULIP.p.p2, 70], [TULIP.p.p2, TULIP.p.r2, breakFlow[1]], [TULIP.p.r2, TULIP.p.p3, 70], [TULIP.p.p3, TULIP.p.r3, breakFlow[2]], [TULIP.p.r3, 100, 25]];
  for (const [from, to, flow] of legs) {
    t += 0.5; out.push({ t, control: 'flow', value: flow }, { t, control: 'h', value: flow <= 20 ? 3 : 1 });
    const seq = walk(t + 0.5, pace * (flow <= 20 ? 1.8 : 1), from, to, dev);
    out.push(...seq); t = seq[seq.length - 1].t;
  }
  return out;
};

export const TULIP_EXPERT_SCRIPT: BenchAction[] = tulipRun(6, [0, 0, 0], 1.7);
BENCH_LATTE_TULIP.expertScript = TULIP_EXPERT_SCRIPT;
export const TULIP_SCRIPTS: Record<string, BenchAction[]> = {
  no_break: tulipRun(16, [60, 55, 50], 2.4),     // 不肯断流：三瓣糊成一坨
  shaky: tulipRun(30, [10, 45, 0], 2.0),         // 断流断得时灵时不灵，手也飘
  ai_bare: tulipRun(13, [35, 0, 0], 2.1),
  ai_skill: tulipRun(8, [0, 0, 5], 1.8),
};

/** 树叶：摆动段的速度稳不稳 */
const rosettaRun = (dev: number, wobbleSpeed: number): BenchAction[] => {
  const out: BenchAction[] = [{ t: 1, control: 'h', value: 5.5 }, { t: 2, control: 'flow', value: 35 }, ...walk(3, 2.2, 0, ROSETTA.p.fuse, Math.round(dev * 0.6))];
  let t = 3 + ROSETTA.p.fuse / 2.2;
  out.push({ t, control: 'h', value: 1 }, { t, control: 'flow', value: 70 });
  const a = walk(t + 0.5, 2.2, ROSETTA.p.fuse, ROSETTA.p.drop, dev); out.push(...a); t = a[a.length - 1].t;
  const b = walk(t + 0.5, wobbleSpeed, ROSETTA.p.drop, ROSETTA.p.wobble, dev); out.push(...b); t = b[b.length - 1].t;
  out.push({ t: t + 0.5, control: 'flow', value: 25 }, { t: t + 0.5, control: 'h', value: 2.5 });
  out.push(...walk(t + 1, 3.2, ROSETTA.p.wobble, 100, Math.round(dev * 0.8)));
  return out;
};

export const ROSETTA_EXPERT_SCRIPT: BenchAction[] = rosettaRun(6, 2.6);
BENCH_LATTE_ROSETTA.expertScript = ROSETTA_EXPERT_SCRIPT;
export const ROSETTA_SCRIPTS: Record<string, BenchAction[]> = {
  too_fast: rosettaRun(22, 7.5),    // 一摆就赶，叶片糊成一条
  wobbly: rosettaRun(38, 3.2),      // 节奏还行，但摆得忽大忽小、整片叶子是斜的
  ai_bare: rosettaRun(15, 4.4),
  ai_skill: rosettaRun(8, 2.8),
};
