/**
 * 中餐厨师的交互故事（2026-10-11）：一道宫保鸡丁从备料到出锅——几个原语串成一条有时间轴的流程。
 *   腌（等）→ 热锅（火候，油温）→ 下料顺序（花椒辣椒 → 鸡丁 → 花生葱 → 调味汁）→ 翻炒（节奏，停了就糊）→ 收汁（看着汁）→ 出锅装盘。
 *   1 秒真实 = 4 秒模拟：腌 1 分钟只用等 15 秒。
 * 台面组件：src/components/lab/surfaces/Chef.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const INGREDIENTS = [
  { v: 1, label: '腌料（料酒 / 生抽 / 淀粉）', short: '腌料', icon: '🥣' },
  { v: 2, label: '花椒 + 干辣椒', short: '花椒辣椒', icon: '🌶️' },
  { v: 3, label: '鸡丁', short: '鸡丁', icon: '🍗' },
  { v: 4, label: '花生 + 葱段', short: '花生葱', icon: '🥜' },
  { v: 5, label: '调味汁（糖醋酱油淀粉）', short: '调味汁', icon: '🫙' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'add', 1); push(80, 'fire', 3); push(96, 'fire', 2); push(100, 'add', 2); push(106, 'add', 3);
  for (let t = 108; t < 158; t += 2.5) push(t, 'toss', 1);
  push(136, 'add', 4); push(140, 'add', 5); push(142, 'fire', 3);
  push(158, 'fire', 0); push(158, 'plate', 1);
  return a;
}

export function chefSpec(image: string): BenchSpec {
  return {
    name: '炒锅台 · 宫保鸡丁', surface: 'chef',
    brief: '午市前的一道宫保鸡丁。鸡丁先腌够一分钟；锅烧到油温 150–220℃ 再下料；顺序是花椒辣椒爆香 → 鸡丁 → 花生葱 → 调味汁；下了鸡丁就要翻，停三秒以上就糊；汁收到挂得住再出锅。火太大冒烟、油没热就下、顺序乱、翻炒停、汁收过头，都会记下来。（1 秒真实 = 4 秒模拟）',
    timeScale: 4, maxSeconds: 600,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'in1', initial: 0, set: 'max(in1, add == 1 ? 1 : 0)' }, { id: 'in2', initial: 0, set: 'max(in2, add == 2 ? 1 : 0)' }, { id: 'in3', initial: 0, set: 'max(in3, add == 3 ? 1 : 0)' }, { id: 'in4', initial: 0, set: 'max(in4, add == 4 ? 1 : 0)' }, { id: 'in5', initial: 0, set: 'max(in5, add == 5 ? 1 : 0)' },
      { id: 'marinate', label: '腌制秒数', initial: 0, rate: 'in1 == 1 && in3 == 0 ? 1 : 0' },
      { id: 'oil_t', label: '油温', initial: 25, min: 25, max: 400, set: 'oil_t + (25 + fire * 75 - oil_t) * 0.06 * dt' },   // 小 100 · 中 175 · 大 250℃
      { id: 'smoke_s', label: '冒烟秒数', initial: 0, max: 60, rate: 'oil_t > 235 ? 1 : 0' },
      { id: 'cold_in', label: '油没热就下鸡丁', initial: 0, set: 'max(cold_in, add == 3 && oil_t < 120 ? 1 : 0)' },
      { id: 'order_bad', label: '顺序乱', initial: 0, set: 'max(order_bad, (add == 3 && in2 == 0) || (add == 5 && in3 == 0) || (add == 4 && in3 == 0) ? 1 : 0)' },
      { id: 'raw_in', label: '没腌够就下', initial: 0, set: 'max(raw_in, add == 3 && marinate < 60 ? 1 : 0)' },
      { id: 'since_toss', label: '离上次翻炒', initial: 0, set: 'toss == 1 ? 0 : (in3 == 1 && plated == 0 ? since_toss + dt : 0)' },
      { id: 'cook', label: '熟度', initial: 0, min: 0, max: 120, rate: 'in3 == 1 && plated == 0 && oil_t > 110 ? oil_t / 180 * 2 : 0' },
      { id: 'burn', label: '糊', initial: 0, min: 0, max: 100, rate: 'in3 == 1 && plated == 0 ? (since_toss > 4 ? 6 : 0) + (oil_t > 240 ? 3 : 0) + (cook > 112 ? 4 : 0) : 0' },
      { id: 'sauce', label: '收汁', initial: 0, min: 0, max: 100, rate: 'in5 == 1 && plated == 0 ? 1.2 + fire * 0.9 : 0' },
      { id: 'plated', initial: 0, set: 'max(plated, plate)' },
      { id: 'final_sauce', initial: 0, set: 'plate == 1 && final_sauce == 0 ? sauce : final_sauce' },
      { id: 'final_cook', initial: 0, set: 'plate == 1 && final_cook == 0 ? cook : final_cook' },
      { id: 'quality', label: '出品', initial: 0, min: 0, max: 100, set: 'clamp((plated == 1 ? 40 : 0) + (final_cook >= 85 && final_cook <= 110 ? 20 : 0) + (final_sauce >= 55 && final_sauce <= 90 ? 20 : 0) + (marinate >= 60 ? 10 : 0) + (order_bad == 0 ? 10 : 0) - burn * 0.8 - cold_in * 15 - smoke_s * 1 - raw_in * 10, 0, 100)' },
    ],
    controls: [
      { id: 'fire', label: '火力', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 关 · 1 小 · 2 中 · 3 大' },
      { id: 'add', label: '下料', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '1 腌料 · 2 花椒辣椒 · 3 鸡丁 · 4 花生葱 · 5 调味汁' },
      { id: 'toss', label: '翻炒一下', kind: 'button' },
      { id: 'plate', label: '出锅装盘', kind: 'button' },
    ],
    gauges: [
      { id: 'g_oil', label: '油温', unit: '℃', expr: 'oil_t', min: 25, max: 400, warn: 'oil_t > 260' },
      { id: 'g_cook', label: '熟度', unit: '%', expr: 'cook', min: 0, max: 120, warn: 'cook > 110' },
      { id: 'g_sauce', label: '收汁', unit: '%', expr: 'sauce', min: 0, max: 100, warn: 'sauce > 90' },
      { id: 'g_q', label: '出品', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'smoke', label: '油温过高冒烟了（大火空烧），降火', when: 'oil_t > 235', severity: 'warning', once: true },
      { id: 'cold', label: '油没热就下鸡丁（粘锅、出水、不脆）', when: 'cold_in == 1', severity: 'violation', once: true },
      { id: 'raw', label: '没腌够一分钟就下锅（不入味、口感柴）', when: 'raw_in == 1', severity: 'warning', once: true },
      { id: 'order', label: '下料顺序乱了（先花椒辣椒爆香，再鸡丁，花生葱和调味汁最后）', when: 'order_bad == 1', severity: 'violation', once: true },
      { id: 'burn', label: '糊锅了（翻炒停了三秒以上 / 火太大 / 炒过头）', when: 'burn > 15', severity: 'violation', once: true },
      { id: 'over', label: '炒过头了（熟度超过 110%）', when: 'cook > 110', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'marinate', label: '鸡丁腌够 1 分钟', when: 'marinate >= 60' },
      { id: 'heat', label: '锅烧热：油温 150–220℃ 时下花椒辣椒', when: 'in2 == 1 && oil_t >= 150 && oil_t <= 220', after: 'marinate' },
      { id: 'order', label: '下料顺序对：花椒辣椒 → 鸡丁 → 花生葱 → 调味汁', when: 'in5 == 1 && order_bad == 0', after: 'heat' },
      { id: 'toss', label: '下鸡丁后一直在翻，没糊', when: 'in3 == 1 && cook >= 60 && burn < 15', after: 'heat' },
      { id: 'plate', label: '汁收到 55–90% 出锅', when: 'plated == 1 && final_sauce >= 55 && final_sauce <= 90', after: 'order' },
      { id: 'q', label: '出品 ≥ 70', when: 'plated == 1 && quality >= 70', after: 'plate' },
    ],
    expertScript: expertScript(),
  };
}
