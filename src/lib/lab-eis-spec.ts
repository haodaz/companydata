/**
 * 原位 EIS 分析台的交互故事（2026-10-21，科研版研究岗第二个台面）：三只 Li | Li6PS5Cl | Li 对称电池的阻抗谱，判断界面阻抗为什么涨。
 *
 * | 槽位 | 内容 |
 * |---|---|
 * | 场景与任务 | 组会前，PI 要一句话：界面阻抗涨，是化学分解界面相在长，还是锂 / 电解质接触在失效？ |
 * | 你控什么 | 激励幅值、测量、剔除高频点、等效电路、拟合、对高电流那只加压复测、结论 |
 * | 你盯什么 | Nyquist 图（五个时间点）、拟合残差 χ²、R_int 对 √t 的走势 |
 * | 该做的顺序 | 10 mV 测三只 → 剔除高频感抗点 → R_b + (R_int‖CPE) + W 拟合 → 看 R_int–√t → 高电流那只加压复测 → 下结论 |
 * | 中途突发 | 0.5 mA/cm² 那只 100 h 后 R_int 拐上去，偏离 √t 直线 |
 * | 烟雾弹 | 高频那截掉到实轴下面的点（线缆 / 夹具电感，不是界面）；多加一个 RQ 拟合 χ² 更小（但参数没有物理对应） |
 * | 红线 | 大幅值激励（非线性，谱是歪的）；把感抗点当真实特征拟合 |
 * | 时间缩放 | 数据是现成的五个时间点，台面上不推进实验时间 |
 * | 免责 | 教学化简化模型，数值不是任何电池的真实数据 |
 *
 * 台面组件：src/components/lab/surfaces/Eis.tsx（浅色整屏工作软件）。谱和拟合结果由下面的纯函数算，组件和规格共用。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const EIS_TIMES = [0, 25, 50, 100, 200];   // 静置 / 循环小时数
export const EIS_CELLS = [
  { id: 'rest', name: 'A · 静置不通电', note: '开路静置，只看化学反应' },
  { id: 'low', name: 'B · 0.1 mA/cm² 循环', note: '小电流循环' },
  { id: 'high', name: 'C · 0.5 mA/cm² 循环', note: '大电流循环' },
] as const;
export type EisCellId = typeof EIS_CELLS[number]['id'];
export const EIS_CIRCUITS = [
  { id: 1, label: 'R_b + (R‖C)', note: '纯电容' },
  { id: 2, label: 'R_b + (R_int‖CPE)', note: '没有扩散尾' },
  { id: 3, label: 'R_b + (R_int‖CPE) + W', note: '体相 + 界面 + 扩散' },
  { id: 4, label: 'R_b + (R₁‖CPE₁) + (R₂‖CPE₂) + W', note: '多一个弧' },
] as const;
export const EIS_VERDICTS = [
  { id: 1, label: '全是化学分解：界面相在长（小周的结论）' },
  { id: 2, label: '全是接触失效：锂和电解质之间出了空隙' },
  { id: 3, label: '两种都有：静置也在长的是化学分解（∝√t）；大电流下多出来、加压能回来的是接触失效' },
  { id: 4, label: '是拟合伪影，界面其实没变' },
] as const;

const RB = 20, Q0 = 2.2e-6, N = 0.86, SIGMA = 18, L = 2.2e-7;
/** 化学分解那部分：√t 增长；接触失效那部分：大电流 100 h 后才出现，加压能回来大半 */
export function rInt(cell: EisCellId, t: number, repressed = false): { chem: number; contact: number; total: number } {
  const chem = 30 + (cell === 'rest' ? 9 : cell === 'low' ? 9.6 : 9.3) * Math.sqrt(t);
  const contact0 = cell === 'high' && t >= 100 ? 38 + 0.95 * (t - 100) : cell === 'low' && t >= 200 ? 6 : 0;
  const contact = repressed && cell === 'high' && t === 200 ? contact0 * 0.32 : contact0;
  return { chem, contact, total: chem + contact };
}
/** 一条谱：1 MHz → 0.1 Hz，每十倍频 8 个点；raw 带高频电感（掉到实轴下面那截） */
export function spectrum(cell: EisCellId, t: number, opts: { amp?: number; repressed?: boolean } = {}) {
  const R = rInt(cell, t, opts.repressed).total;
  // 界面相变厚 → 电容按 1/厚度掉；接触面积变小 → 电容按面积掉（教学化：都让特征频率大致不变）
  const Q = Q0 * (30 / R);
  const distort = Math.max(0, (opts.amp || 10) - 20) / 30;   // 大幅值：非线性，弧被压扁拉斜
  const pts: { f: number; re: number; im: number }[] = [];
  for (let k = 0; k <= 56; k++) {
    const f = Math.pow(10, 6 - k / 8), w = 2 * Math.PI * f;
    // R‖CPE：Z = R / (1 + R Q (jω)^n)
    const a = R * Q * Math.pow(w, N), ph = N * Math.PI / 2;
    const dr = 1 + a * Math.cos(ph), di = a * Math.sin(ph), den = dr * dr + di * di;
    let re = RB + R * dr / den, im = -R * di / den;
    re += SIGMA / Math.sqrt(w) * 6; im -= SIGMA / Math.sqrt(w) * 6;   // Warburg 尾
    im += w * L;                                                       // 线缆 / 夹具电感
    if (distort) { re += distort * R * 0.18 * Math.sin(k / 9); im *= 1 - distort * 0.35; }
    pts.push({ f, re, im });
  }
  return pts;
}
/** 拟合（教学化）：给出参数和 χ²；用错电路 / 没剔感抗点，参数和 χ² 会按对应的方式偏 */
export function fitResult(cell: EisCellId, t: number, circuit: number, cut: boolean, repressed = false) {
  const r = rInt(cell, t, repressed).total;
  const jitter = 1 + 0.015 * Math.sin(t * 1.7 + cell.length);
  let rb = RB * (cut ? 1 : 0.62), ri = r * jitter, chi = 2.1e-4, extra: number | null = null;
  if (circuit === 1) { ri = r * 0.78; chi = 8.4e-3; }
  else if (circuit === 2) { ri = r * 1.12; chi = 1.6e-3; }
  else if (circuit === 4) { extra = r * (0.25 + 0.2 * Math.sin(t)); ri = r - extra; chi = 1.7e-4; }
  if (!cut) chi = Math.max(chi, 3.2e-3);
  return { rb, ri, extra, chi };
}

function expertScript(): BenchAction[] {
  return [
    { t: 3, control: 'amp', value: 10 },
    { t: 5, control: 'measure', value: 1 },
    { t: 12, control: 'cut', value: 1 },
    { t: 15, control: 'circuit', value: 3 },
    { t: 17, control: 'fit', value: 1 },
    { t: 25, control: 'repress', value: 1 },
    { t: 32, control: 'verdict', value: 3 },
    { t: 34, control: 'submit', value: 1 },
  ];
}

export function eisSpec(image: string): BenchSpec {
  return {
    name: '原位 EIS · 界面阻抗为什么涨', surface: 'eis',
    brief: '三只对称电池的原位阻抗谱：一只静置不通电，两只分别以 0.1 和 0.5 mA/cm² 循环，各测了 0 / 25 / 50 / 100 / 200 小时。用小幅值测、剔掉高频伪影、选一个有物理意义的等效电路拟合，看界面阻抗 R_int 怎么随时间涨——再决定要不要对哪只做一次加压复测，最后给 PI 一句话判断。（教学化简化模型，数值不是任何电池的真实数据）',
    timeScale: 1, maxSeconds: 600,
    scene: { image, credit: '浅色工作软件', layers: [] },
    vars: [
      { id: 'measured', label: '已测量', initial: 0, set: 'max(measured, measure)' },
      { id: 'amp_at', label: '测量时的幅值', initial: 0, set: 'measure == 1 ? amp : amp_at' },
      { id: 'amp_bad', label: '大幅值激励', initial: 0, set: 'max(amp_bad, measure == 1 && amp > 30 ? 1 : 0)' },
      { id: 'fitted', label: '已拟合', initial: 0, set: 'max(fitted, fit == 1 && measured == 1 && circuit > 0 ? 1 : 0)' },
      { id: 'fit_circuit', label: '拟合用的电路', initial: 0, set: 'fit == 1 && measured == 1 ? circuit : fit_circuit' },
      { id: 'fit_cut', label: '拟合时剔除了感抗点', initial: 0, set: 'fit == 1 && measured == 1 ? cut : fit_cut' },
      { id: 'inductive_fit', label: '把感抗点当特征拟合', initial: 0, set: 'max(inductive_fit, fit == 1 && measured == 1 && cut == 0 ? 1 : 0)' },
      { id: 'overfit', initial: 0, set: 'max(overfit, fit == 1 && circuit == 4 ? 1 : 0)' },
      { id: 'capfit', initial: 0, set: 'max(capfit, fit == 1 && circuit == 1 ? 1 : 0)' },
      { id: 'repressed', label: '已加压复测', initial: 0, set: 'max(repressed, repress == 1 && measured == 1 ? 1 : 0)' },
      { id: 'submitted', label: '已交结论', initial: 0, set: 'max(submitted, submit == 1 && verdict > 0 ? 1 : 0)' },
      { id: 'verdict_v', label: '结论', initial: 0, set: 'submit == 1 && verdict > 0 ? verdict : verdict_v' },
      { id: 'no_check', initial: 0, set: 'max(no_check, submit == 1 && repressed == 0 ? 1 : 0)' },
      { id: 'quality', label: '分析质量', initial: 0, min: 0, max: 100,
        set: 'clamp((measured == 1 && amp_at >= 5 && amp_at <= 15 ? 15 : measured == 1 ? 6 : 0) + (fitted == 1 && fit_cut == 1 ? 15 : 0) + (fitted == 1 && fit_circuit == 3 ? 20 : fitted == 1 && fit_circuit == 2 ? 8 : 0) + (repressed == 1 ? 20 : 0) + (verdict_v == 3 ? 30 : verdict_v == 1 ? 5 : 0) - amp_bad * 20 - inductive_fit * 15 - overfit * 5, 0, 100)' },
    ],
    controls: [
      { id: 'amp', label: '激励幅值', kind: 'knob', min: 1, max: 50, step: 1, unit: 'mV', initial: 25 },
      { id: 'measure', label: '测量三只电池', kind: 'button' },
      { id: 'cut', label: '剔除高频感抗点', kind: 'switch' },
      { id: 'circuit', label: '等效电路', kind: 'knob', min: 0, max: 4, step: 1 },
      { id: 'fit', label: '拟合', kind: 'button' },
      { id: 'repress', label: 'C 电池加压到 10 MPa 复测', kind: 'button' },
      { id: 'verdict', label: '结论', kind: 'knob', min: 0, max: 4, step: 1 },
      { id: 'submit', label: '交给 PI', kind: 'button' },
    ],
    gauges: [
      { id: 'g_amp', label: '激励幅值', unit: 'mV', expr: 'amp', min: 0, max: 50, warn: 'amp > 30' },
      { id: 'g_q', label: '分析质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'amp', label: '激励幅值超过 30 mV：界面响应不再线性，谱是歪的', when: 'amp_bad == 1', severity: 'violation', once: true },
      { id: 'ind', label: '高频那截掉到实轴下面的点是线缆 / 夹具电感，被当成界面特征拟合了（R_b 会被拟歪）', when: 'inductive_fit == 1', severity: 'violation', once: true },
      { id: 'over', label: '多加一个弧 χ² 更小，但两个弧的参数随时间乱跳、没有物理对应', when: 'overfit == 1', severity: 'warning', once: true },
      { id: 'cap', label: '纯电容拟不住压扁的半圆，R_int 被拟小了', when: 'capfit == 1', severity: 'warning', once: true },
      { id: 'nocheck', label: '没做加压复测就下结论：接触失效那部分没证据排除', when: 'no_check == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：激励幅值调到 5–15 mV，测三只电池', when: 'measured == 1 && amp_at >= 5 && amp_at <= 15' },
      { id: 'g2', label: '第二步：剔除高频掉到实轴下面的感抗点', when: 'fitted == 1 && fit_cut == 1' },
      { id: 'g3', label: '第三步：用 R_b + (R_int‖CPE) + W 拟合', when: 'fitted == 1 && fit_circuit == 3' },
      { id: 'g4', label: '第四步：C 电池偏离 √t 直线了——加压复测，看能不能回来', when: 'repressed == 1' },
      { id: 'g5', label: '收尾：给 PI 一句话判断', when: 'submitted == 1 && verdict_v == 3' },
    ],
    expertScript: expertScript(),
  };
}
