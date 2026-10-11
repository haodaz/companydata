/**
 * 古籍修复的交互故事（2026-10-11）：补一个虫洞。手艺台——材料有「量」，时间是动作，错误看得见。
 *   喷潮（喷壶，少量多次）→ 毛刷蘸浆 → 沿破口边缘涂浆（别超出破口太多、别刷太厚）→ 镊子把补纸拖过来对位 →
 *   隔着吸水纸按住压实 → 等半干（纸面光泽从湿变哑）→ 慢慢揭开吸水纸（太快会带起补纸）
 * 台面组件：src/components/lab/surfaces/Restore.tsx。（教学化简化模型，纸张 / 浆糊参数为示意）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const RESTORE_TOOLS = [
  { v: 0, label: '喷壶', icon: '💧' }, { v: 1, label: '毛刷', icon: '🖌️' }, { v: 2, label: '镊子', icon: '🥢' }, { v: 3, label: '手（隔吸水纸压）', icon: '✋' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(1, 'tool', 0); push(2, 'wet', 15); push(3, 'wet', 30); push(4, 'wet', 42);
  push(6, 'tool', 1); push(7, 'dip', 1); push(7.5, 'load', 100);
  for (let i = 1; i <= 24; i++) { push(8 + i * 0.25, 'cover', Math.min(92, i * 4)); push(8 + i * 0.25, 'load', Math.max(20, 100 - i * 3)); push(8 + i * 0.25, 'spill', Math.min(8, i * 0.4)); }
  push(15, 'tool', 2); push(17, 'align', 1.2); push(17.5, 'place', 1);
  push(19, 'tool', 3); push(20, 'press', 1); for (let i = 1; i <= 10; i++) push(20 + i * 0.25, 'press_s', i * 0.25);
  push(36, 'tool', 2); push(37, 'peel_speed', 18); push(38, 'peel', 1);
  return a;
}

export function restoreSpec(image: string): BenchSpec {
  return {
    name: '修复台 · 第 7 叶的虫洞', surface: 'restore',
    brief: '《南岭草木笺》第 7 叶右下有一个虫洞，边缘已经发脆。先喷潮让纸「服帖」（少量多次，喷多了墨会洇），毛刷蘸低浓度浆糊沿破口边缘涂一圈（不超出破口 2 mm、不刷厚），把染好色的补纸对准贴上，隔着吸水纸压实，等半干，再慢慢揭开吸水纸。修旧如旧，宁浅勿深，宁薄勿厚。',
    timeScale: 1, maxSeconds: 420,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'bleed', label: '洇墨', initial: 0, max: 20, rate: 'wet > 65 ? 1.5 : 0' },
      { id: 'dry', label: '干燥程度', initial: 0, min: 0, max: 100, rate: 'place == 1 ? (press == 1 ? 7 : 2.5) : 0' },
      { id: 'thick', label: '浆糊厚度', initial: 0, set: 'max(thick, cover > 98 ? cover - 98 : 0)' },
      { id: 'peeled_wet', initial: 0, set: 'max(peeled_wet, peel == 1 && dry < 70 ? 1 : 0)' },
      { id: 'torn', label: '揭坏', initial: 0, set: 'max(torn, peel == 1 && peel_speed > 60 ? 1 : 0)' },
      { id: 'quality', label: '修复质量', initial: 100, min: 0, max: 100, set: 'clamp(100 - bleed * 3 - max(0, spill - 10) * 1.2 - max(0, 30 - wet) * 0.6 - abs(align) * 6 - peeled_wet * 30 - torn * 40 - (place == 1 && cover < 70 ? 25 : 0), 0, 100)' },
    ],
    controls: [
      { id: 'tool', label: '工具', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 喷壶 · 1 毛刷 · 2 镊子 · 3 手' },
      { id: 'dip', label: '蘸浆糊', kind: 'button' },
      { id: 'place', label: '贴上补纸', kind: 'switch' },
      { id: 'press', label: '隔吸水纸压实', kind: 'switch' },
      { id: 'peel', label: '揭开吸水纸', kind: 'switch' },
      { id: 'wet', label: '破口周围湿度', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'load', label: '刷子上的浆糊', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'cover', label: '破口边缘涂浆覆盖率', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'spill', label: '涂出破口的面积', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'align', label: '补纸偏移 mm', kind: 'knob', min: 0, max: 30, hidden: true, initial: 0 },
      { id: 'press_s', label: '压实秒数', kind: 'knob', min: 0, max: 30, hidden: true, initial: 0 },
      { id: 'peel_speed', label: '揭的速度', kind: 'knob', min: 0, max: 200, hidden: true, initial: 0 },
    ],
    gauges: [
      { id: 'g_wet', label: '湿度', unit: '%', expr: 'wet', min: 0, max: 100, warn: 'wet > 65' },
      { id: 'g_cover', label: '涂浆覆盖', unit: '%', expr: 'cover', min: 0, max: 100 },
      { id: 'g_dry', label: '干燥', unit: '%', expr: 'dry', min: 0, max: 100 },
      { id: 'g_q', label: '修复质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'quality < 60' },
    ],
    rules: [
      { id: 'bleed', label: '喷太湿，墨开始洇了（竹纸刻本，水一多墨就走）', when: 'wet > 65', severity: 'violation', once: true },
      { id: 'spill', label: '浆糊涂出破口太多（干了发硬、原纸变形）', when: 'spill > 30', severity: 'warning', once: true },
      { id: 'dry_paste', label: '纸还没喷潮就上浆（干纸吸浆不匀、补纸贴不牢）', when: 'cover > 5 && wet < 20', severity: 'warning', once: true },
      { id: 'early_place', label: '浆糊还没涂匀就贴补纸', when: 'place == 1 && cover < 70', severity: 'violation', once: true },
      { id: 'peel_wet', label: '没等半干就揭（补纸被带起来）', when: 'peel == 1 && dry < 70', severity: 'violation', once: true },
      { id: 'torn', label: '揭太快，把补纸撕坏了', when: 'peel == 1 && peel_speed > 60', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'wet', label: '喷潮到位（湿度 30–60，少量多次）', when: 'wet >= 30 && wet <= 60' },
      { id: 'dip', label: '毛刷蘸低浓度浆糊', when: 'load > 0', after: 'wet' },
      { id: 'paste', label: '沿破口边缘涂匀（覆盖 ≥ 80%，出界 < 30%）', when: 'cover >= 80 && spill < 30', after: 'dip' },
      { id: 'place', label: '补纸对位贴上（偏差 ≤ 3 mm）', when: 'place == 1 && align <= 3', after: 'paste' },
      { id: 'press', label: '隔吸水纸压实 2 秒以上', when: 'press_s >= 2', after: 'place' },
      { id: 'dry', label: '等到半干（≥ 70%）', when: 'dry >= 70', after: 'press' },
      { id: 'peel', label: '慢慢揭开吸水纸，补纸完好', when: 'peel == 1 && torn == 0 && peeled_wet == 0', after: 'dry' },
      { id: 'q', label: '修复质量 ≥ 70（没洇墨、不出界、对得准）', when: 'peel == 1 && quality >= 70', after: 'peel' },
    ],
    expertScript: expertScript(),
  };
}
