/**
 * Case F 的虚拟工位：急诊外科 · 伤口间断缝合。
 * 缝合是外科最早上手、也最见功底的一项手上功夫——它本身就是「沿着一条线一针一针走」，
 * 所以在这套系统里做成轨迹工位：持针器沿锯齿轨迹横跨切口，走到哪儿就合到哪儿。
 *   边距（距创缘多远进针）、深度（有没有穿透真皮全层）、张力（打结勒多紧）三个旋钮，
 *   加上手离轨迹的距离，共同决定创缘对合得好不好——走歪了、勒紧了、扎浅了，伤口就合不拢。
 * ⚠ 全部参数为教学化的简化模型，用于演示操作过程的采集与评估，不构成任何医疗指导。
 */
import type { BenchSpec, BenchAction, BenchLayer } from '@/lib/bench';

// ──────────────────────────────────────────────
// 几何：切口放在无菌单中央空出来的那片区域
// ──────────────────────────────────────────────
const AX = 620, AY = 558, BX = 1020, BY = 618;          // 切口两端（场景坐标 1600 × 900）
const LEN = Math.hypot(BX - AX, BY - AY);
const UX = (BX - AX) / LEN, UY = (BY - AY) / LEN;        // 沿切口
const NX = -UY, NY = UX;                                 // 垂直于切口
const BITE = 30;                                         // 进出针点离切口的视觉距离
interface Pt { x: number; y: number }
const P = (p: Pt) => ({ x: p.x / 16, y: p.y / 9 });

/** 八针的位置（沿切口的比例）。每一针：一侧进针 → 穿过切口 → 另一侧出针，所以轨迹是锯齿形。 */
const STITCH_AT = [0.07, 0.20, 0.33, 0.46, 0.59, 0.72, 0.85, 0.95];
const SUTURE = (() => {
  const pts: Pt[] = [];
  STITCH_AT.forEach((t, i) => {
    const mx = AX + (BX - AX) * t, my = AY + (BY - AY) * t;
    const side = i % 2 ? -1 : 1;                          // 左右手交替，和真实操作一样
    pts.push({ x: mx - NX * BITE * side, y: my - NY * BITE * side });
    pts.push({ x: mx + NX * BITE * side, y: my + NY * BITE * side });
  });
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  const at = [0]; let acc = 0;
  for (const d of seg) { acc += d; at.push(Math.round(acc / total * 1000) / 10); }
  // 每一针「穿过切口」那一下完成时的进度（用来数针数、判断阶段）
  const done = STITCH_AT.map((_, i) => at[i * 2 + 1]);
  return { points: pts.map(P), at, done };
})();

const woundLayer: BenchLayer = {
  id: 'wound', kind: 'wound',
  x: AX / 16, y: AY / 9, w: (BX - AX) / 16, h: (BY - AY) / 9,
  level: 'approx', text: 'bite',
};
const coach = (id: string, on: string, label: string, y = 9, color?: string): BenchLayer =>
  ({ id, kind: 'coach', x: 50, y, w: 0, h: 0, on, label, color });

/** 杯口……这里是切口：400 场景单位 ≈ 真实 60 mm，偏离距离按这个换算成毫米 */
const MM = 0.15;

export const BENCH_SUTURE: BenchSpec = {
  name: '清创缝合工位 · 前臂裂伤间断缝合',
  brief: '一道 6 cm 的前臂皮肤裂伤，已经消毒、麻醉、清创完毕，现在缝合。八针间断缝合：每一针距创缘约 5 mm 进针、穿透真皮全层、打结只求对合不求勒紧。持针器沿白色轨迹横跨切口走——走到哪儿，伤口就合到哪儿。（教学化简化模型，不构成医疗指导）',
  timeScale: 1,
  maxSeconds: 300,
  vars: [
    { id: 'prev', initial: 0, set: 'suture' },
    { id: 'rate_s', label: '走针速度', initial: 0, set: '(suture - prev) / dt', min: 0, max: 60 },
    { id: 'sewing', initial: 0, set: 'rate_s > 0.4 ? 1 : 0' },
    { id: 'stitches', label: '已缝针数', initial: 0, min: 0, max: 8,
      set: SUTURE.done.map(d => `(suture >= ${d} ? 1 : 0)`).join(' + ') },
    // 偏离轨迹：进出针点不在该在的位置，创缘就对不齐
    { id: 'dev_sum', initial: 0, rate: 'sewing == 1 ? dev : 0' },
    { id: 'dev_time', initial: 0, rate: 'sewing == 1 ? 1 : 0' },
    { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
    // 三个硬指标：边距、深度、张力，各自累计做错的时长
    { id: 'bite_bad', label: '边距不当的秒数', initial: 0, max: 15, rate: 'sewing == 1 && (bite < 3.5 || bite > 8.5) ? 1 : 0' },
    { id: 'shallow', label: '进针过浅的秒数', initial: 0, max: 15, rate: 'sewing == 1 && depth < 4 ? 1 : 0' },
    { id: 'deep', label: '进针过深的秒数', initial: 0, max: 20, rate: 'sewing == 1 && depth > 8 ? 1 : 0' },
    { id: 'isch', label: '张力过大的秒数', initial: 0, max: 15, rate: 'sewing == 1 && tension > 70 ? 1 : 0' },
    { id: 'loose', label: '张力不足的秒数', initial: 0, max: 20, rate: 'sewing == 1 && tension < 20 ? 1 : 0' },
    { id: 'stall', label: '停顿秒数', initial: 0, set: 'suture > 3 && suture < 99 && rate_s < 0.4 ? stall + dt : 0' },
    { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
    { id: 'done_t', initial: 0, set: 'suture >= 100 && done_t == 0 ? t : done_t' },
    // 创缘对合质量 0–1：wound 图层按它决定伤口合得拢不拢
    { id: 'approx', label: '创缘对合', initial: 0, min: 0, max: 1,
      set: 'clamp(stitches / 8 - dev_avg * 0.004 - bite_bad * 0.025 - shallow * 0.03 - isch * 0.012 - loose * 0.03 - deep * 0.015, 0, 1)' },
    { id: 'quality', label: '缝合质量', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 0.45 - bite_bad * 3 - shallow * 3.2 - deep * 2 - isch * 3.2 - loose * 2.5 - max(0, 8 - stitches) * 9 - max(0, stall_max - 4) * 4, 0, 100)' },
  ],
  controls: [
    { id: 'bite', label: '边距', kind: 'knob', min: 2, max: 12, step: 0.5, unit: 'mm', initial: 9, hint: '距创缘多远进针。5 mm 上下；太近会撕脱，太远创缘内翻、瘢痕变宽' },
    { id: 'depth', label: '进针深度', kind: 'knob', min: 1, max: 12, step: 0.5, unit: 'mm', initial: 2, hint: '要穿透真皮全层（≥ 4 mm），否则皮下留死腔；过深则伤及深部组织' },
    { id: 'tension', label: '打结张力', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 50, hint: '对合即可，不要勒紧——勒紧了组织缺血坏死，拆线后是一道宽疤' },
    { id: 'suture', label: '持针器走位', kind: 'path', hint: '沿白色锯齿轨迹走：一侧进针 → 穿过切口 → 另一侧出针。也可以打开摄像头用手走' },
    { id: 'dev', label: '偏离', kind: 'knob', min: 0, max: 400, initial: 0, hidden: true },
  ],
  gauges: [
    { id: 'g_st', label: '已缝针数', unit: '针', expr: 'stitches', min: 0, max: 8 },
    { id: 'g_ap', label: '创缘对合', unit: '%', expr: 'approx * 100', min: 0, max: 100, warn: 'stitches > 2 && approx < 0.55' },
    { id: 'g_dev', label: '偏离轨迹', unit: 'mm', expr: `dev * ${MM}`, min: 0, max: 40, digits: 1, warn: 'dev > 110' },
    { id: 'g_q', label: '缝合质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'stitches > 2 && quality < 60' },
  ],
  rules: [
    { id: 'bite_near', label: '边距小于 3.5 mm（缝线会从创缘撕脱）', when: 'sewing == 1 && bite < 3.5', severity: 'violation', once: true },
    { id: 'bite_far', label: '边距大于 8.5 mm（创缘内翻，瘢痕变宽）', when: 'sewing == 1 && bite > 8.5', severity: 'violation', once: true },
    { id: 'shallow', label: '进针没穿透真皮全层（皮下留死腔，容易积血感染）', when: 'sewing == 1 && depth < 4', severity: 'violation', once: true },
    { id: 'deep', label: '进针过深（可能伤及深部血管神经）', when: 'sewing == 1 && depth > 8', severity: 'warning', once: true },
    { id: 'strangle', label: '打结勒得过紧（组织缺血坏死——对合，不是勒紧）', when: 'sewing == 1 && tension > 70', severity: 'violation', once: true },
    { id: 'loose', label: '打结过松（创缘对不拢，愈合延迟）', when: 'sewing == 1 && tension < 20', severity: 'warning', once: true },
    { id: 'off', label: '持针器偏离进针点（创缘错位对合）', when: 'sewing == 1 && dev > 150', severity: 'violation' },
    { id: 'rush', label: '走针过快（针距不匀，渗漏）', when: 'sewing == 1 && rate_s > 9', severity: 'warning' },
    { id: 'stall', label: '术中停顿超过 6 秒', when: 'stall > 6 && suture > 5 && suture < 95', severity: 'warning', once: true },
  ],
  goals: [
    { id: 'setup', label: '下第一针前把边距调到 4–7 mm、深度 ≥ 4 mm', when: `bite >= 4 && bite <= 7 && depth >= 4 && depth <= 8 && suture < ${SUTURE.done[0]}`, hold: 1 },
    { id: 'first', label: '完成第一针', when: `suture >= ${SUTURE.done[0]}`, after: 'setup' },
    { id: 'half', label: '缝到第四针，创缘开始对拢', when: `stitches >= 4 && approx >= 0.4`, after: 'first' },
    { id: 'all', label: '八针缝完', when: 'stitches >= 8' },
    { id: 'tension', label: '全程张力适中（对合而非勒紧）', when: 'stitches >= 8 && isch < 2 && loose < 3', after: 'all' },
    { id: 'quality', label: '创缘对合良好、缝合质量 ≥ 70 分', when: 'stitches >= 8 && approx >= 0.75 && quality >= 70', after: 'all' },
  ],
  scene: {
    image: '/lab/surgery_field.jpg', credit: '底图由通义万相生成',
    layers: [
      woundLayer,
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'suture', deviation: 'dev', points: SUTURE.points, pace: 1.5, on: 'sewing == 1', label: '进出针轨迹', icon: 'needle' },
      { id: 'ro_st', kind: 'readout', x: 2, y: 3, w: 9, h: 5, text: 'stitches', unit: '针', label: 'ST' },
      { id: 'ro_ap', kind: 'readout', x: 2, y: 9, w: 9, h: 5, text: 'approx * 100', unit: '%', label: 'APPR', color: '#7cf5c9' },
      coach('c0', `suture < ${SUTURE.done[0]} && (bite < 4 || bite > 7 || depth < 4)`, '先把边距调到 5 mm 上下、深度过真皮全层（≥ 4 mm），再下第一针', 9, '#ffd166'),
      coach('c1', `suture < ${SUTURE.done[0]} && bite >= 4 && bite <= 7 && depth >= 4`, '① 第一针：一侧进针 → 穿过切口 → 另一侧出针'),
      coach('c2', `suture >= ${SUTURE.done[0]} && suture < ${SUTURE.done[6]}`, '② 一针一针往前走，针距匀、张力只求对合——勒紧了组织会坏死'),
      coach('c3', `suture >= ${SUTURE.done[6]}`, '③ 最后两针收尾，检查创缘是否平整对合', 9, '#ffd166'),
    ],
  },
};

// ──────────────────────────────────────────────
// 专家 / 新手 / AI 的操作脚本
// ──────────────────────────────────────────────
function walk(t0: number, pctPerS: number, from: number, to: number, dev = 8): BenchAction[] {
  const out: BenchAction[] = [];
  for (let i = 0; ; i++) {
    const t = t0 + i * 0.5, v = Math.min(to, from + i * 0.5 * pctPerS);
    out.push({ t, control: 'dev', value: Math.round(dev * (0.5 + Math.abs(Math.sin(i * 1.7)))) });
    out.push({ t, control: 'suture', value: v });
    if (v >= to || i > 400) return out;
  }
}

/** 一遍缝完：先把三个参数调好，再匀速走完八针 */
const run = (bite: number, depth: number, tension: number, speed: number, dev: number, fixAt?: { t: number; ctl: string; v: number }[]): BenchAction[] => [
  { t: 1, control: 'bite', value: bite },
  { t: 2, control: 'depth', value: depth },
  { t: 3, control: 'tension', value: tension },
  ...walk(5, speed, 0, 100, dev),
  ...(fixAt || []).map(f => ({ t: f.t, control: f.ctl, value: f.v })),
];

export const SUTURE_EXPERT_SCRIPT: BenchAction[] = run(5, 5.5, 40, 1.6, 5);
BENCH_SUTURE.expertScript = SUTURE_EXPERT_SCRIPT;

export const SUTURE_SCRIPTS: Record<string, BenchAction[]> = {
  // 临床医学五年级：参数大体知道，但怕扎深了，全程只进到 2.5 mm——皮下留死腔
  too_shallow: run(5.5, 2.5, 45, 1.8, 14),
  // 规培第一周：边距贪大、生怕崩开于是打结勒到底，走针也快
  strangled: run(10, 6, 85, 3.4, 26),
  // AI 裸答：说得出「5 mm、全层、对合不勒紧」，手上却把张力给到 75
  ai_bare: run(5, 5, 75, 2.2, 12),
  // AI + 专家技能：和专家同一套参数与节奏
  ai_skill: run(5, 5.5, 42, 1.7, 7),
};
