/**
 * 潜导的交互故事（2026-10-11）：带一位体验客人在珊瑚礁区巡游——现场型，你在哪、客人在哪、什么时候回头。
 *   侧视图：水面在上、礁在下。拖着自己沿礁走，客人跟在后面；离开一臂（2 m）他会慌；下到 12 m 以下不行；
 *   中途：他面镜进水（手势「面镜排水」+ 停住等他）、他飘到珊瑚上方要碰（手势「别碰」+ 挡到他和礁之间）、他气压到 70 bar（回转上升）；
 *   上升不能快于 9 m/分，5 m 停 3 分钟再出水。1 秒真实 = 8 秒模拟。
 * 台面组件：src/components/lab/surfaces/Dive.tsx。（教学化简化模型，不构成潜水指导）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const SIGNALS = [
  { v: 1, label: 'OK？', icon: '👌' }, { v: 2, label: '上升 / 回转', icon: '👍' }, { v: 3, label: '面镜排水', icon: '🤿' }, { v: 4, label: '别碰珊瑚', icon: '✋' }, { v: 5, label: '看那边', icon: '👉' },
];
export const DIVE_EVENTS = [
  { t: 90, kind: 'mask', text: '客人面镜进水了，手在乱抓' }, { t: 200, kind: 'coral', text: '客人飘到鹿角珊瑚上方，脚蹼快碰到了' }, { t: 320, kind: 'air', text: '客人气压表到 70 bar' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  const sig = (t: number, v: number) => { push(t, 'signal', v); push(t + 1, 'signal', 0); };
  // 下潜到 10 m（0–60 s），沿礁走（x 0→60），面镜事件停住，珊瑚事件挡位，70 bar 回转，缓慢上升，5 m 停 3 分钟
  // 位置每 0.5 秒写一次（连续动作，像真的在拖）
  for (let t = 0; t <= 60; t += 0.5) { push(t, 'depth', Math.min(10, t / 6)); push(t, 'x', t / 6); }
  sig(62, 1);
  for (let t = 64; t <= 200; t += 0.5) { push(t, 'x', t < 92 || t > 110 ? 10 + (t - 64) / 136 * 40 : 18.2); push(t, 'depth', 10); }
  sig(92, 3);
  sig(202, 4); push(203, 'block', 1); push(215, 'block', 0);
  for (let t = 204; t <= 320; t += 0.5) { push(t, 'x', 50 + (t - 204) / 116 * 20); push(t, 'depth', 10); }
  sig(322, 2); push(323, 'turn', 1);
  for (let t = 324; t <= 368; t += 0.5) push(t, 'depth', 10 - (t - 324) / 44 * 5);   // 5 m 用 44 s（6.8 m/分）
  for (let t = 368; t <= 552; t += 2) push(t, 'depth', 5);   // 停 3 分钟
  for (let t = 552; t <= 592; t += 0.5) push(t, 'depth', 5 - (t - 552) / 40 * 5);
  push(596, 'surface', 1);
  return a;
}

export function diveSpec(image: string): BenchSpec {
  return {
    name: '礁区导潜 · 带一位体验客人', surface: 'dive',
    brief: '晨光号到了礁区，你带一位第一次潜水的客人下去。拖着自己走，客人跟在你后面——别超过一臂；最深 12 m；他面镜进水你要打手势停住等他；他飘到珊瑚上方你要挡在中间；他气压到 70 bar 就回转；上升不快于 9 m/分，5 m 停 3 分钟再出水。（教学化简化模型，不构成潜水指导）',
    timeScale: 8, maxSeconds: 900,
    scene: { image, credit: '底图由 Veo 生成', layers: [] },
    vars: [
      { id: 'sig_now', initial: 0, set: 'signal != last_sig ? signal : 0' }, { id: 'last_sig', initial: 0, set: 'signal' },
      // 上升速度按最近 1 秒（4 拍）算，拖动时的小抖动不会误判
      { id: 'd1', initial: 0, set: 'depth' }, { id: 'd2', initial: 0, set: 'd1' }, { id: 'd3', initial: 0, set: 'd2' }, { id: 'd4', initial: 0, set: 'd3' },
      { id: 'rate', label: '上升速度 m/分', initial: 0, set: 'max(0, (d4 - depth) * 60)' },
      { id: 'fast_s', label: '上升过快秒数', initial: 0, max: 60, rate: 'rate > 9 ? 1 : 0' },
      { id: 'deep_s', label: '超过 12 m 秒数', initial: 0, max: 120, rate: 'depth > 12 ? 1 : 0' },
      { id: 'far_s', label: '离客人超过一臂的秒数', initial: 0, rate: 'gap > 2 && surface == 0 ? 1 : 0' },
      { id: 'near_s', initial: 0, rate: 'gap <= 2 && depth > 0.5 && surface == 0 ? 1 : 0' },
      { id: 'under_s', initial: 0, rate: 'depth > 0.5 && surface == 0 ? 1 : 0' },
      { id: 'mask_done', initial: 0, set: 'max(mask_done, t >= 90 && sig_now == 3 ? 1 : 0)' },
      { id: 'mask_open', initial: 0, set: 't >= 90 && mask_done == 0 ? 1 : 0' }, { id: 'mask_wait', initial: 0, rate: 'mask_open' },
      { id: 'coral_done', initial: 0, set: 'max(coral_done, t >= 200 && block == 1 && (sig_now == 4 || coral_sig == 1) ? 1 : 0)' },
      { id: 'coral_sig', initial: 0, set: 'max(coral_sig, t >= 200 && sig_now == 4 ? 1 : 0)' },
      { id: 'coral_open', initial: 0, set: 't >= 200 && coral_done == 0 ? 1 : 0' }, { id: 'coral_wait', initial: 0, rate: 'coral_open' },
      { id: 'coral_hit', label: '碰到珊瑚', initial: 0, set: 'max(coral_hit, coral_wait > 20 ? 1 : 0)' },
      { id: 'turned', initial: 0, set: 'max(turned, turn)' },
      { id: 'late_turn', label: '70 bar 后没回转的秒数', initial: 0, rate: 't >= 320 && turned == 0 ? 1 : 0' },
      { id: 'stop_s', label: '5 m 停留秒数', initial: 0, rate: 'turned == 1 && depth >= 4 && depth <= 6 ? 1 : 0' },
      { id: 'air_g', label: '客人气压 bar', initial: 200, min: 0, max: 200, rate: 'surface == 1 ? 0 : -(0.08 + depth * 0.008 + stress * 0.004)' },   // 10 m 放松着用约 0.2 bar/s，一趟 10 分钟剩 80 bar 左右
      { id: 'stress', label: '客人紧张度', initial: 10, min: 0, max: 100, rate: '(gap > 2 ? 3 : -1) + mask_open * 4 + coral_open * 2 + (rate > 9 ? 3 : 0)' },
      { id: 'quality', label: '导潜质量', initial: 0, min: 0, max: 100, set: 'clamp((under_s > 10 ? near_s / under_s * 30 : 0) + mask_done * 12 + coral_done * 12 + (turned == 1 && late_turn <= 20 ? 12 : 0) + (stop_s >= 170 ? 14 : stop_s * 0.08) + (surface == 1 ? 10 : 0) + (fast_s == 0 ? 10 : 0) - deep_s * 0.5 - fast_s * 1 - coral_hit * 25 - max(0, mask_wait - 15) * 0.5, 0, 100)' },
    ],
    controls: [
      { id: 'signal', label: '手势', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '1 OK · 2 上升 · 3 面镜排水 · 4 别碰 · 5 看那边' },
      { id: 'turn', label: '回转上升', kind: 'switch' },
      { id: 'block', label: '挡在客人和珊瑚之间', kind: 'switch' },
      { id: 'surface', label: '出水', kind: 'switch' },
      { id: 'depth', label: '你的深度 m', kind: 'knob', min: 0, max: 20, hidden: true, initial: 0 },
      { id: 'x', label: '沿礁位置', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'gap', label: '离客人 m', kind: 'knob', min: 0, max: 30, hidden: true, initial: 1 },
    ],
    gauges: [
      { id: 'g_depth', label: '深度', unit: 'm', expr: 'depth', min: 0, max: 20, digits: 1, warn: 'depth > 12' },
      { id: 'g_air', label: '客人气压', unit: 'bar', expr: 'air_g', min: 0, max: 200, warn: 'air_g < 70' },
      { id: 'g_rate', label: '上升', unit: 'm/分', expr: 'rate', min: 0, max: 20, digits: 1, warn: 'rate > 9' },
      { id: 'g_q', label: '导潜质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'deep', label: '超过 12 m（体验潜水的上限）', when: 'depth > 12', severity: 'violation', once: true },
      { id: 'far', label: '离客人超过一臂（他一回头看不见你就慌）', when: 'gap > 2 && depth > 1 && surface == 0', severity: 'warning', once: true },
      { id: 'mask', label: '面镜进水 15 秒没处理（他要上浮了）', when: 'mask_wait > 15', severity: 'violation', once: true },
      { id: 'coral', label: '脚蹼碰到珊瑚（一脚几十年）', when: 'coral_hit == 1', severity: 'violation', once: true },
      { id: 'fast', label: '上升快于 9 m/分（减压病风险）', when: 'rate > 9 && depth > 0.5', severity: 'violation', once: true },
      { id: 'late', label: '70 bar 了还没回转', when: 'late_turn > 20', severity: 'violation', once: true },
      { id: 'nostop', label: '没在 5 m 停满 3 分钟就出水', when: 'surface == 1 && stop_s < 170', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'down', label: '下到 8–12 m，客人一直在一臂之内', when: 'depth >= 8 && depth <= 12 && gap <= 2' },
      { id: 'mask', label: '面镜进水：打手势「面镜排水」，停住等他', when: 'mask_done == 1 && mask_wait <= 15', after: 'down' },
      { id: 'coral', label: '要碰珊瑚：手势「别碰」+ 挡在中间', when: 'coral_done == 1 && coral_hit == 0', after: 'down' },
      { id: 'turn', label: '70 bar：20 秒内回转上升', when: 'turned == 1 && late_turn <= 20', after: 'down' },
      { id: 'stop', label: '上升不快于 9 m/分，5 m 停 3 分钟', when: 'stop_s >= 170 && fast_s == 0', after: 'turn' },
      { id: 'up', label: '出水，客人气压 > 30 bar', when: 'surface == 1 && air_g > 30', after: 'stop' },
      { id: 'q', label: '导潜质量 ≥ 70', when: 'surface == 1 && quality >= 70', after: 'up' },
    ],
    expertScript: expertScript(),
  };
}
