/**
 * 月嫂的交互故事（2026-10-11）：哄一个哭闹的新生儿入睡，再放回床里。第一人称，画面下方是你的两只手。
 *   抱起来（选抱姿）→ 左手托住头（它留在那儿）→ 调暗夜灯 → 右手按节奏轻拍（50–100 次/分）→ 按住「嘘」→ 等他睡着 → 放回床里不惊醒
 * 宝宝是会反应的对象：没有仪表，反馈全在脸上——哭声线、眼睛慢慢闭上。红线：没托头、摇太猛、手遮口鼻、没睡踏实就放下。
 * 台面组件：src/components/lab/surfaces/Soothe.tsx。（教学化简化模型，不构成育儿 / 医疗指导）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const HOLDS = [
  { v: 0, label: '还在床里' }, { v: 1, label: '横抱（头在臂弯）' }, { v: 2, label: '竖抱靠肩' }, { v: 3, label: '飞机抱（趴在小臂）' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(1, 'hold', 1); push(2, 'head', 1); push(3.5, 'light', 20); push(5, 'shush', 1);
  for (let t = 5; t < 40; t += 0.25) push(t, 'tempo', 72);   // 稳定的拍抚节奏
  push(26, 'shush', 0);
  for (let t = 40; t < 46; t += 0.25) push(t, 'tempo', 0);
  push(44, 'down', 1);
  return a;
}

export function sootheSpec(image: string): BenchSpec {
  return {
    name: '哄睡台 · 802 房的新生儿', surface: 'soothe',
    brief: '刚喂完奶的宝宝突然哭起来，妈妈在休息。抱起来、托住头、把灯调暗、按节奏轻拍、嘘——他会慢慢安静、犯困、睡着。睡踏实了再放回床里，放早了马上惊醒。摇晃太猛、手遮住口鼻、抱着不托头，都是红线。',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'posture_ok', initial: 0, set: 'hold >= 1 && head == 1 ? 1 : 0' },
      { id: 'rhythm_ok', label: '节奏对了', initial: 0, set: 'tempo >= 50 && tempo <= 100 ? 1 : 0' },
      { id: 'env_ok', initial: 0, set: 'light <= 40 ? 1 : 0' },
      { id: 'calm', label: '安静程度', initial: 12, min: 0, max: 100,
        rate: 'down == 1 ? (calm >= 85 ? 0.6 : -5) : hold == 0 ? -0.6 : head == 0 ? -3 : (1.4 + rhythm_ok * 1.7 + shush * 0.8 + env_ok * 0.7 - (tempo > 105 ? 2.5 : 0) - (rock > 60 ? 4 : 0) - (face == 1 ? 8 : 0))' },
      { id: 'cry', label: '哭声', initial: 88, min: 0, max: 100, set: '100 - calm' },
      { id: 'asleep_s', label: '睡着的秒数', initial: 0, max: 99, rate: 'calm >= 92 ? 1 : 0' },
      { id: 'unsupported_s', label: '没托头的秒数', initial: 0, max: 30, rate: 'hold >= 1 && head == 0 ? 1 : 0' },
      { id: 'shaken_s', label: '摇太猛的秒数', initial: 0, max: 30, rate: 'rock > 60 ? 1 : 0' },
      { id: 'face_s', label: '遮住口鼻的秒数', initial: 0, max: 30, rate: 'face == 1 ? 1 : 0' },
      { id: 'quality', label: '照护质量', initial: 100, min: 0, max: 100, set: 'clamp(100 - unsupported_s * 4 - shaken_s * 8 - face_s * 10 - (down == 1 && calm < 85 ? 25 : 0), 0, 100)' },
    ],
    controls: [
      { id: 'hold', label: '抱姿', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 床里 · 1 横抱 · 2 竖抱靠肩 · 3 飞机抱' },
      { id: 'head', label: '左手托头', kind: 'switch' },
      { id: 'shush', label: '嘘声', kind: 'switch' },
      { id: 'light', label: '夜灯', kind: 'knob', min: 0, max: 100, step: 10, initial: 100, unit: '%' },
      { id: 'down', label: '放回床里', kind: 'switch' },
      { id: 'tempo', label: '拍抚节奏', kind: 'knob', min: 0, max: 200, unit: '次/分', hidden: true, initial: 0 },
      { id: 'rock', label: '摇晃幅度', kind: 'knob', min: 0, max: 100, hidden: true, initial: 0 },
      { id: 'face', label: '手遮口鼻', kind: 'switch', hidden: true },
    ],
    gauges: [
      { id: 'g_calm', label: '安静程度', unit: '', expr: 'calm', min: 0, max: 100 },
      { id: 'g_tempo', label: '拍抚节奏', unit: '次/分', expr: 'tempo', min: 0, max: 160, warn: 'tempo > 105' },
      { id: 'g_sleep', label: '已睡着', unit: '秒', expr: 'asleep_s', min: 0, max: 30 },
      { id: 'g_q', label: '照护质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'quality < 60' },
    ],
    rules: [
      { id: 'head_unsupported', label: '抱起来左手没托住头（新生儿颈部没力气，头会后仰）', when: 'unsupported_s > 1.5 && down == 0', severity: 'violation', once: true },   // 抱起来那一秒半里把手托上去不算
      { id: 'shaken', label: '摇得太猛（摇晃婴儿综合征风险）', when: 'rock > 60', severity: 'violation' },
      { id: 'face', label: '手遮到口鼻了', when: 'face == 1', severity: 'violation' },
      { id: 'too_fast', label: '拍得太急（宝宝更烦躁）', when: 'tempo > 105', severity: 'warning', once: true },
      { id: 'bright', label: '灯还亮着（不利于入睡）', when: 'hold >= 1 && light > 60 && t > 25', severity: 'warning', once: true },
      { id: 'early_down', label: '还没睡踏实就放下（马上惊醒）', when: 'down == 1 && calm < 85', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'pickup', label: '抱起来，左手托住头', when: 'hold >= 1 && head == 1' },
      { id: 'dim', label: '把夜灯调暗', when: 'light <= 40', after: 'pickup' },
      { id: 'rhythm', label: '拍抚节奏 50–100 次/分，稳住 8 秒', when: 'rhythm_ok == 1 && hold >= 1', hold: 8, after: 'pickup' },
      { id: 'quiet', label: '哭声小下来了', when: 'calm >= 55', after: 'pickup' },
      { id: 'asleep', label: '睡着了（安静 5 秒以上）', when: 'asleep_s >= 5', after: 'quiet' },
      { id: 'down', label: '放回床里，没惊醒', when: 'down == 1 && calm >= 85', after: 'asleep' },
      { id: 'safe', label: '全程安全：托头、不摇晃、不遮口鼻（≥ 70 分）', when: 'down == 1 && quality >= 70', after: 'down' },
    ],
    expertScript: expertScript(),
  };
}
