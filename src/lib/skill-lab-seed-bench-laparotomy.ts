/**
 * Case G 的虚拟工位：普外科 · 开腹阑尾切除术（麦氏切口分层入腹）。
 * 开腹最见功底的不是「切得快」，而是「每一层用对的方式打开」：
 *   皮肤与皮下   锐性切开
 *   腹外斜肌腱膜 沿纤维方向切开
 *   腹内斜肌 / 腹横肌  必须钝性分离——刀切下去是一片出血，而且没必要
 *   腹膜        先提起来形成帐篷再切，否则刀尖下面就是肠管
 * 所以这台工位把「工具」和「深度」做成两个旋钮，和沿切口走的轨迹一起判：
 * 该用钝性的地方你用了刀，该提起来的时候你直接切下去，系统当场记。
 * ⚠ 全部参数为教学化的简化模型，用于演示操作过程的采集与评估，不构成任何医疗指导。
 */
import type { BenchSpec, BenchAction, BenchLayer } from '@/lib/bench';

// 麦氏切口：右下腹，与腹股沟韧带平行的斜切口
const AX = 640, AY = 500, BX = 1000, BY = 640;
interface Pt { x: number; y: number }
const P = (p: Pt) => ({ x: p.x / 16, y: p.y / 9 });

/** 切口轨迹：沿切口线来回若干趟——每一趟是一个层次，和真实「逐层切开」一致 */
const PASSES = 5;
const INCISION = (() => {
  const pts: Pt[] = [];
  for (let i = 0; i < PASSES; i++) {
    const fwd = i % 2 === 0;
    pts.push({ x: fwd ? AX : BX, y: fwd ? AY : BY });
    pts.push({ x: fwd ? BX : AX, y: fwd ? BY : AY });
  }
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  const at = [0]; let acc = 0;
  for (const d of seg) { acc += d; at.push(Math.round(acc / total * 1000) / 10); }
  // 每一趟走完时的进度：第 i 趟 = 第 2i+1 个节点
  const pass = Array.from({ length: PASSES }, (_, i) => at[i * 2 + 1]);
  return { points: pts.map(P), at, pass };
})();

const coach = (id: string, on: string, label: string, y = 9, color?: string): BenchLayer =>
  ({ id, kind: 'coach', x: 50, y, w: 0, h: 0, on, label, color });

export const BENCH_LAPAROTOMY: BenchSpec = {
  name: '开腹工位 · 麦氏切口分层入腹',
  brief: '急性阑尾炎，右下腹麦氏点斜切口开腹。五趟走完五个层次：皮肤皮下锐性切开 → 腱膜沿纤维切开 → 肌层钝性分离 → 提起腹膜再切开 → 牵开显露。每一层该用刀还是该用钳，用错了系统当场记。（教学化简化模型，不构成医疗指导）',
  timeScale: 1,
  maxSeconds: 420,
  vars: [
    { id: 'prev', initial: 0, set: 'cut' },
    { id: 'rate_c', label: '推进速度', initial: 0, set: '(cut - prev) / dt', min: 0, max: 60 },
    { id: 'cutting', initial: 0, set: 'rate_c > 0.4 ? 1 : 0' },
    { id: 'pass', label: '已完成层次', initial: 0, min: 0, max: 5, set: INCISION.pass.map(p => `(cut >= ${p} ? 1 : 0)`).join(' + ') },
    { id: 'dev_sum', initial: 0, rate: 'cutting == 1 ? dev : 0' },
    { id: 'dev_time', initial: 0, rate: 'cutting == 1 ? 1 : 0' },
    { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
    // ── 每一层该用什么：tool 0 手术刀 / 1 电刀 / 2 血管钳（钝性）/ 3 镊子提起 ──
    { id: 'sharp_muscle', label: '肌层用锐性的秒数', initial: 0, max: 14, rate: 'cutting == 1 && depth > 16 && depth <= 24 && tool < 2 ? 1 : 0' },
    { id: 'blind_perit', label: '腹膜未提起就切的秒数', initial: 0, max: 14, rate: 'cutting == 1 && depth > 24 && depth <= 29 && tool != 3 && pass < 4 ? 1 : 0' },
    { id: 'too_deep', label: '进腹过深的秒数', initial: 0, max: 14, rate: 'depth > 32 ? 1 : 0' },
    { id: 'blunt_skin', label: '皮肤用钝性的秒数', initial: 0, max: 14, rate: 'cutting == 1 && depth <= 12 && tool >= 2 ? 1 : 0' },
    { id: 'no_retract', label: '没牵开就深入的秒数', initial: 0, max: 14, rate: 'cutting == 1 && depth > 24 && retract == 0 ? 1 : 0' },
    { id: 'stall', label: '停顿秒数', initial: 0, set: 'cut > 3 && cut < 99 && rate_c < 0.4 ? stall + dt : 0' },
    { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
    // 入腹是否安全：过深、盲切腹膜都会扣
    { id: 'bowel_risk', label: '肠管损伤风险', initial: 0, min: 0, max: 100,
      set: 'clamp(blind_perit * 6 + too_deep * 9, 0, 100)' },
    { id: 'quality', label: '入腹质量', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 0.4 - sharp_muscle * 4 - blind_perit * 4.5 - too_deep * 5 - blunt_skin * 2.5 - no_retract * 2.5 - max(0, 5 - pass) * 12 - max(0, stall_max - 6) * 3, 0, 100)' },
  ],
  controls: [
    { id: 'tool', label: '器械', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 手术刀 · 1 电刀 · 2 血管钳（钝性分离）· 3 镊子提起' },
    { id: 'depth', label: '下刀深度', kind: 'knob', min: 0, max: 36, step: 1, unit: 'mm', initial: 0, hint: '皮肤 0–3 · 皮下 3–12 · 腱膜 12–16 · 肌层 16–24 · 腹膜 24–28 · 入腹 28–32 · 超过 32 就是肠管' },
    { id: 'retract', label: '牵开器', kind: 'switch', hint: '切开腱膜后上牵开器，显露清楚再往深走' },
    { id: 'cut', label: '沿切口推进', kind: 'path', hint: '沿麦氏切口来回五趟，一趟一个层次；也可以打开摄像头用手走' },
    { id: 'dev', label: '偏离', kind: 'knob', min: 0, max: 400, initial: 0, hidden: true },
  ],
  gauges: [
    { id: 'g_pass', label: '已完成层次', unit: '层', expr: 'pass', min: 0, max: 5 },
    { id: 'g_depth', label: '当前深度', unit: 'mm', expr: 'depth', min: 0, max: 36, warn: 'depth > 32' },
    { id: 'g_risk', label: '肠管损伤风险', unit: '', expr: 'bowel_risk', min: 0, max: 100, warn: 'bowel_risk > 20' },
    { id: 'g_q', label: '入腹质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'pass > 1 && quality < 60' },
  ],
  rules: [
    { id: 'sharp_muscle', label: '肌层用刀锐性切开（腹内斜肌与腹横肌应钝性分离，锐切出血多且无必要）', when: 'cutting == 1 && depth > 16 && depth <= 24 && tool < 2', severity: 'violation', once: true },
    { id: 'blind_perit', label: '没提起腹膜就切（刀尖下面可能就是肠管）', when: 'cutting == 1 && depth > 24 && depth <= 29 && tool != 3 && pass < 4', severity: 'violation', once: true },
    { id: 'too_deep', label: '进腹过深，已超过腹膜层（肠管损伤）', when: 'depth > 32', severity: 'violation' },
    { id: 'blunt_skin', label: '用血管钳去分离皮肤皮下（该锐性的层次别钝性撕）', when: 'cutting == 1 && depth <= 12 && tool >= 2', severity: 'warning', once: true },
    { id: 'no_retract', label: '没上牵开器就往深层走（显露不清）', when: 'cutting == 1 && depth > 24 && retract == 0', severity: 'warning', once: true },
    { id: 'skip', label: '层次跳跃：上一层还没走完就加深', when: 'cutting == 1 && depth > 16 && pass < 2', severity: 'violation', once: true },
    { id: 'off', label: '偏离切口轴线（切口歪斜、显露困难）', when: 'cutting == 1 && dev > 150', severity: 'violation' },
    { id: 'rush', label: '推进过快（层次辨认不清）', when: 'cutting == 1 && rate_c > 8', severity: 'warning' },
  ],
  goals: [
    { id: 'skin', label: '第一趟：手术刀锐性切开皮肤与皮下', when: `cut >= ${INCISION.pass[0]} && tool < 2 && depth >= 3 && depth <= 12` },
    { id: 'fascia', label: '第二趟：沿纤维方向切开腹外斜肌腱膜', when: `cut >= ${INCISION.pass[1]} && depth > 12 && depth <= 16`, after: 'skin' },
    { id: 'muscle', label: '第三趟：肌层钝性分离（血管钳，不用刀）', when: `cut >= ${INCISION.pass[2]} && depth > 16 && depth <= 24 && tool == 2 && sharp_muscle < 1`, after: 'fascia' },
    { id: 'perit', label: '第四趟：提起腹膜形成帐篷后切开', when: `cut >= ${INCISION.pass[3]} && depth > 24 && depth <= 29 && tool == 3 && blind_perit < 1`, after: 'muscle' },
    { id: 'expose', label: '上牵开器，显露回盲部', when: `cut >= ${INCISION.pass[4]} && retract == 1`, after: 'perit' },
    { id: 'safe', label: '安全入腹：未伤及肠管、入腹质量 ≥ 70 分', when: 'pass >= 5 && bowel_risk < 10 && quality >= 70', after: 'expose' },
  ],
  scene: {
    image: '/lab/surgery_field.jpg', credit: '底图由通义万相生成',
    layers: [
      { id: 'abd', kind: 'incis', x: AX / 16, y: AY / 9, w: (BX - AX) / 16, h: (BY - AY) / 9, text: 'depth', level: 'retract' },
      { id: 'trail', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'cut', deviation: 'dev', points: INCISION.points, pace: 1.3, on: 'cutting == 1', label: '切口轨迹' },
      { id: 'ro_p', kind: 'readout', x: 2, y: 3, w: 9, h: 5, text: 'pass', unit: '层', label: 'LAYER' },
      { id: 'ro_d', kind: 'readout', x: 2, y: 9, w: 9, h: 5, text: 'depth', unit: 'mm', label: 'DEPTH', color: '#ffd166' },
      coach('c1', `cut < ${INCISION.pass[0]}`, '① 手术刀锐性切开皮肤与皮下：器械 0，深度到 8–12 mm'),
      coach('c2', `cut >= ${INCISION.pass[0]} && cut < ${INCISION.pass[1]}`, '② 腹外斜肌腱膜：沿纤维方向切开，深度 13–16 mm'),
      coach('c3', `cut >= ${INCISION.pass[1]} && cut < ${INCISION.pass[2]}`, '③ 肌层必须钝性分离：换血管钳（器械 2），刀切下去是一片出血', 9, '#ffd166'),
      coach('c4', `cut >= ${INCISION.pass[2]} && cut < ${INCISION.pass[3]}`, '④ 腹膜先提起来形成帐篷再切（器械 3）——刀尖下面就是肠管', 9, '#ff5fa2'),
      coach('c5', `cut >= ${INCISION.pass[3]}`, '⑤ 上牵开器，显露回盲部'),
    ],
  },
};

// ──────────────────────────────────────────────
// 操作脚本
// ──────────────────────────────────────────────
function walk(t0: number, pctPerS: number, from: number, to: number, dev = 8): BenchAction[] {
  const out: BenchAction[] = [];
  for (let i = 0; ; i++) {
    const t = t0 + i * 0.5, v = Math.min(to, from + i * 0.5 * pctPerS);
    out.push({ t, control: 'dev', value: Math.round(dev * (0.5 + Math.abs(Math.sin(i * 1.7)))) });
    out.push({ t, control: 'cut', value: v });
    if (v >= to || i > 500) return out;
  }
}

/** 五趟，每趟之前先把器械和深度换好 */
const run = (setup: [number, number, number][], speed: number, dev: number, retractAt = 2): BenchAction[] => {
  const out: BenchAction[] = [];
  let t = 1;
  const from = [0, ...INCISION.pass];
  setup.forEach(([tool, depth, hold], i) => {
    out.push({ t, control: 'tool', value: tool }, { t: t + 0.5, control: 'depth', value: depth });
    if (i === retractAt) out.push({ t: t + 0.8, control: 'retract', value: 1 });
    const seq = walk(t + 1 + hold, speed, from[i], INCISION.pass[i], dev);
    out.push(...seq);
    t = seq[seq.length - 1].t + 1;
  });
  return out;
};

export const LAP_EXPERT_SCRIPT: BenchAction[] = run([
  [0, 10, 0],   // 皮肤皮下：手术刀
  [0, 15, 0],   // 腱膜：沿纤维切开
  [2, 21, 0],   // 肌层：血管钳钝性分离
  [3, 27, 0],   // 腹膜：提起再切
  [2, 30, 0],   // 入腹后牵开显露
], 1.5, 6);
BENCH_LAPAROTOMY.expertScript = LAP_EXPERT_SCRIPT;

export const LAP_SCRIPTS: Record<string, BenchAction[]> = {
  // 大五实习：前两层很规范，到肌层舍不得换器械，一路用刀切下去
  sharp_through: run([[0, 10, 0], [0, 15, 0], [0, 21, 0], [3, 27, 0], [2, 30, 0]], 1.8, 16),
  // 规培第一周：求快，腹膜没提起就直接切，还一度扎到 33 mm
  blind_deep: run([[0, 11, 0], [1, 15, 0], [1, 22, 0], [1, 33, 0], [2, 30, 0]], 3.6, 28, 4),
  // AI 裸答：顺序说得出，肌层也知道换钳，但腹膜那一下没提起来
  ai_bare: run([[0, 10, 0], [0, 15, 0], [2, 21, 0], [1, 27, 0], [2, 30, 0]], 2.1, 13),
  // AI + 专家技能：和专家同一套器械与深度
  ai_skill: run([[0, 10, 0], [0, 15, 0], [2, 21, 0], [3, 27, 0], [2, 30, 0]], 1.6, 8),
};
