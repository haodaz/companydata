/**
 * 幼儿园老师的交互故事（2026-10-11）：带一节 20 分钟的课——一群会走神的孩子，考的是调度。
 *   环节：集合 → 绘本故事 → 手工 → 收尾。八个孩子各有注意力；环节拖太长集体走神；中途有人哭、两个人抢蜡笔、一个人跑去窗边。
 *   动作：全体（拍手儿歌、换下一环节）、个别（走过去安抚 / 分开 / 表扬 / 请回座位）。吼是红线；一个孩子没人管超过 30 秒也记。
 *   1 秒真实 = 6 秒模拟：20 分钟的课 3 分多钟走完。
 * 台面组件：src/components/lab/surfaces/Kinder.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const KIDS = ['安安', '贝贝', '小满', '朵朵', '乐乐', '果果', '糖糖', '壮壮'];
export const SEGMENTS = ['集合问好', '绘本故事', '手工：撕纸拼画', '收尾整理'];
/** 时间轴上的事（模拟秒）：谁出状况 */
export const INCIDENTS = [
  { t: 150, kid: 3, kind: 'cry', text: '朵朵想妈妈了，开始哭' },
  { t: 420, kid: 4, kind: 'fight', text: '乐乐和果果抢同一盒蜡笔', kid2: 5 },
  { t: 640, kid: 7, kind: 'wander', text: '壮壮跑到窗边看外面的洒水车' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  const one = (t: number, c: string, v: number) => { push(t, c, v); push(t + 0.5, c, 0); };
  one(5, 'all', 1); push(60, 'seg', 1); push(155, 'kid', 4); one(157, 'care', 1); push(160, 'kid', 0); push(290, 'seg', 2); one(320, 'all', 1);
  push(425, 'kid', 5); one(427, 'care', 2); push(430, 'kid', 0); one(560, 'all', 1); push(645, 'kid', 8); one(647, 'care', 4); push(700, 'kid', 2); one(702, 'care', 3); push(705, 'kid', 0); push(700, 'seg', 3); one(760, 'all', 1); push(1120, 'seg', 4);
  return a;
}

export function kinderSpec(image: string): BenchSpec {
  return {
    name: '中班教室 · 一节 20 分钟的课', surface: 'kinder',
    brief: '中班，八个孩子，一节 20 分钟的课：集合问好 → 绘本故事 → 手工 → 收尾。每个环节有合适的长度，拖长了大家一起走神；中途有人哭、有人抢蜡笔、有人跑到窗边——你得一边带着全班往下走，一边把个别的孩子接住。拍手儿歌能把注意力收回来，但一直拍就没用了；吼是红线。（1 秒真实 = 6 秒模拟）',
    timeScale: 6, maxSeconds: 1500,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'all_now', initial: 0, set: 'all != last_all ? all : 0' }, { id: 'last_all', initial: 0, set: 'all' },
      { id: 'care_now', initial: 0, set: 'care != last_care ? care : 0' }, { id: 'last_care', initial: 0, set: 'care' },
      { id: 'seg_t', label: '本环节用时', initial: 0, set: 'seg != last_seg ? 0 : seg_t + dt' }, { id: 'last_seg', initial: 0, set: 'seg' },
      { id: 'seg_long', label: '环节拖太长', initial: 0, set: 'seg_t > (seg == 1 ? 240 : seg == 2 ? 420 : seg == 3 ? 480 : 180) ? 1 : 0' },
      { id: 'claps', label: '拍手次数', initial: 0, set: 'claps + (all_now == 1 ? 1 : 0)' },
      { id: 'clap_recent', initial: 0, set: 'all_now == 1 ? 60 : max(0, clap_recent - dt)' },
      { id: 'shout', label: '吼了', initial: 0, set: 'shout + (all_now == 2 ? 1 : 0)' },
      // 注意力：有环节在走就慢慢掉，拖长掉得快；拍手儿歌拉回来（头两次有效）
      { id: 'attn', label: '全班注意力', initial: 70, min: 0, max: 100, set: 'clamp(attn + (all_now == 1 && claps < 4 ? 25 : all_now == 1 ? 5 : 0) + (all_now == 2 ? 15 : 0) - dt * (seg == 0 ? 0.2 : seg_long == 1 ? 0.35 : 0.08) - (unattended > 0 ? dt * 0.05 * unattended : 0) + (seg != last_seg ? 10 : 0), 0, 100)' },
      // 出状况的孩子：没处理的秒数
      // 处理过就锁住（done），没处理就一直开着（open）。care_now 用的是上一拍的值，所以动作要持续一拍以上（台面组件 0.6 秒后才归零）
      { id: 'cry_done', initial: 0, set: 'max(cry_done, t >= 150 && kid == 4 && care_now == 1 ? 1 : 0)' },
      { id: 'fight_done', initial: 0, set: 'max(fight_done, t >= 420 && (kid == 5 || kid == 6) && care_now == 2 ? 1 : 0)' },
      { id: 'wander_done', initial: 0, set: 'max(wander_done, t >= 640 && kid == 8 && care_now == 4 ? 1 : 0)' },
      { id: 'cry_open', initial: 0, set: 't >= 150 && cry_done == 0 ? 1 : 0' },
      { id: 'fight_open', initial: 0, set: 't >= 420 && fight_done == 0 ? 1 : 0' },
      { id: 'wander_open', initial: 0, set: 't >= 640 && wander_done == 0 ? 1 : 0' },
      { id: 'unattended', label: '没人管的孩子', initial: 0, set: 'cry_open + fight_open + wander_open' },
      { id: 'cry_wait', initial: 0, rate: 'cry_open' }, { id: 'fight_wait', initial: 0, rate: 'fight_open' }, { id: 'wander_wait', initial: 0, rate: 'wander_open' },
      { id: 'wrong_care', label: '用错办法', initial: 0, set: 'wrong_care + (care_now == 2 && kid == 4 ? 1 : 0) + (care_now == 1 && (kid == 5 || kid == 6) && fight_open == 1 ? 1 : 0)' },
      { id: 'praise', label: '表扬次数', initial: 0, set: 'praise + (care_now == 3 ? 1 : 0)' },
      { id: 'attn_sum', initial: 0, rate: 'seg > 0 ? attn : 0' }, { id: 'attn_time', initial: 0, rate: 'seg > 0 ? 1 : 0' },
      { id: 'attn_avg', label: '平均注意力', initial: 0, set: 'attn_time > 1 ? attn_sum / attn_time : 0' },
      { id: 'quality', label: '带班质量', initial: 0, min: 0, max: 100, set: 'clamp(attn_avg * 0.5 + (seg >= 4 ? 20 : seg * 5) + cry_done * 8 + fight_done * 8 + wander_done * 8 - max(0, cry_wait - 30) * 0.3 - max(0, fight_wait - 20) * 0.4 - max(0, wander_wait - 30) * 0.3 - shout * 25 - wrong_care * 8 + min(6, praise * 2), 0, 100)' },
    ],
    controls: [
      { id: 'seg', label: '环节', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '1 集合 · 2 故事 · 3 手工 · 4 收尾' },
      { id: 'all', label: '对全班', kind: 'knob', min: 0, max: 2, step: 1, initial: 0, hint: '1 拍手儿歌 · 2 大声吼' },
      { id: 'kid', label: '走到哪个孩子身边', kind: 'knob', min: 0, max: 8, step: 1, initial: 0 },
      { id: 'care', label: '对这个孩子', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '1 安抚 · 2 分开 · 3 表扬 · 4 请回座位' },
    ],
    gauges: [
      { id: 'g_attn', label: '全班注意力', unit: '', expr: 'attn', min: 0, max: 100, warn: 'attn < 40' },
      { id: 'g_seg', label: '环节', unit: '/4', expr: 'seg', min: 0, max: 4 },
      { id: 'g_un', label: '没人管', unit: '人', expr: 'unattended', min: 0, max: 3, warn: 'unattended > 0' },
      { id: 'g_q', label: '带班质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'shout', label: '对孩子吼了（能镇住 10 秒，之后更散，而且会被投诉）', when: 'shout > 0', severity: 'violation', once: true },
      { id: 'cry_wait', label: '朵朵哭了 30 秒没人去', when: 'cry_wait > 30', severity: 'violation', once: true },
      { id: 'fight_wait', label: '抢蜡笔 20 秒没分开（要动手了）', when: 'fight_wait > 20', severity: 'violation', once: true },
      { id: 'wander_wait', label: '壮壮在窗边 30 秒没人管', when: 'wander_wait > 30', severity: 'warning', once: true },
      { id: 'seg_long', label: '这个环节拖太长了，全班在走神（换环节）', when: 'seg_long == 1', severity: 'warning', once: true },
      { id: 'clap_spam', label: '拍手儿歌用太多次，不灵了', when: 'claps > 4', severity: 'warning', once: true },
      { id: 'wrong', label: '用错办法（哭的孩子要安抚不是分开；抢东西的要分开不是安抚）', when: 'wrong_care > 0', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'start', label: '拍手儿歌集合，开始第一环节', when: 'seg >= 1 && claps >= 1' },
      { id: 'cry', label: '朵朵哭了：走过去安抚', when: 'cry_done == 1 && cry_wait <= 30' },
      { id: 'fight', label: '抢蜡笔：走过去分开', when: 'fight_done == 1 && fight_wait <= 20' },
      { id: 'wander', label: '壮壮跑了：请回座位', when: 'wander_done == 1' },
      { id: 'segs', label: '四个环节按节奏走完（没有拖太长）', when: 'seg >= 4' },
      { id: 'attn', label: '全程平均注意力 ≥ 55', when: 'seg >= 4 && attn_avg >= 55', after: 'segs' },
      { id: 'q', label: '带班质量 ≥ 70', when: 'seg >= 4 && quality >= 70', after: 'segs' },
    ],
    expertScript: expertScript(),
  };
}
