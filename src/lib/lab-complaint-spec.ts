/**
 * 客服的交互故事（2026-10-11）：处理一次升级投诉。对方是个有情绪的人，对话就是操作。
 *   李女士买的空气净化器到手内件破损，前面两轮客服都只会「请提供照片」，她已经气到要投 12315。
 *   怒气 / 信任两条线：先核实订单（知道她说的是真的）、共情、道歉，信任够了再给方案（换新 + 上门取件 + 补偿券，在主管权限内）；
 *   第三次要照片、套话术、越权承诺（全额退款还让她留着机器）、让她等太久，都会炸。
 * 台面组件：src/components/lab/surfaces/Complaint.tsx（HTML，浅色整屏，像客服工作台）。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const ACTS = [
  { v: 1, label: '共情', text: '李女士，换作是我等了一周收到个坏的，又被要了两次照片，我也会气。', },
  { v: 2, label: '道歉', text: '前面两位同事处理得不对，这是我们的问题，我代表团队向您道歉。' },
  { v: 3, label: '核实订单', text: '您先别挂，我这边正在调您的订单和物流记录，三十秒。' },
  { v: 4, label: '给方案', text: '' },
  { v: 5, label: '再要照片', text: '麻烦您拍一下破损部位的照片发过来，我们需要凭证。' },
  { v: 6, label: '标准话术', text: '非常抱歉给您带来不便，您的反馈我们已经记录，会在 1–3 个工作日内处理。' },
  { v: 7, label: '转上级', text: '这个我这边没有权限，我帮您转给上级处理。' },
];
export const OFFERS = [
  { v: 0, label: '（选一个方案）', text: '' },
  { v: 1, label: '换新 + 上门取件', text: '我给您安排换新，顺丰上门把坏的取走，您不用跑。', good: true, over: false },
  { v: 2, label: '退款（寄回后）', text: '您把机器寄回，我们收到后全额退款。', good: false, over: false },
  { v: 3, label: '换新 + 上门取件 + 50 元券', text: '换新、上门取件，另外给您 50 元券，算我们前面两次没处理好的补偿。', good: true, over: false },
  { v: 4, label: '全额退款，机器您留着', text: '机器您留着不用寄回，我们直接全额退款。', good: false, over: true },
];
/** 订单事实（核实后才看得到） */
export const FACTS = ['订单 20261003-8871 · 空气净化器 KJ450 · 实付 1299 元', '10/06 签收，外箱完好（快递员照片）；10/07 首次反馈内件面板碎裂', '10/07、10/09 两次客服记录：均回复「请提供照片」，未跟进', '破损政策：签收 48 小时内反馈，可换新或退款；主管权限：补偿券 ≤ 100 元', '她 10/07 当天已经传过照片（附件 2 张），系统里有'];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'kind', 3); push(2, 'say', 1); push(3, 'checked', 1); push(3, 'anger', 78); push(3, 'trust', 35);
  push(8, 'kind', 1); push(8, 'say', 1); push(9, 'anger', 62); push(9, 'trust', 50);
  push(14, 'kind', 2); push(14, 'say', 1); push(15, 'anger', 48); push(15, 'trust', 62);
  push(20, 'kind', 4); push(20, 'offer', 3); push(20, 'say', 1); push(21, 'anger', 18); push(21, 'trust', 85); push(21, 'agreed', 1);
  push(28, 'words', 80);
  return a;
}

export function complaintSpec(image: string): BenchSpec {
  return {
    name: '客服工作台 · 升级投诉：李女士', surface: 'complaint',
    brief: '一条升级到你这儿的投诉：李女士的空气净化器到手就碎了，前两轮客服只会要照片，她现在要投 12315、发小红书。你有 10 分钟：先把事实查清，让她感到被听见，再给一个你权限内能兑现的方案，最后把工单写清楚。她等太久会催，第三次要照片会炸，越权承诺会被记下来。',
    timeScale: 1, maxSeconds: 600,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'turns', label: '回合', initial: 0, set: 'turns + say' },
      { id: 'idle_max', label: '最长让她等', initial: 0, set: 'max(idle_max, idle)' },
      { id: 'quality', label: '处理质量', initial: 0, min: 0, max: 100, set: 'clamp((agreed == 1 ? 45 : 0) + (checked == 1 ? 15 : 0) + max(0, 100 - anger) * 0.25 + (words >= 40 ? 15 : 0) - over * 40 - photo3 * 15 - scripted * 8 - max(0, idle_max - 25) * 0.6, 0, 100)' },
    ],
    controls: [
      { id: 'kind', label: '这一句做什么', kind: 'knob', min: 0, max: 7, step: 1, initial: 0, hint: '1 共情 · 2 道歉 · 3 核实 · 4 方案 · 5 要照片 · 6 话术 · 7 转上级' },
      { id: 'offer', label: '方案', kind: 'knob', min: 0, max: 4, step: 1, initial: 0 },
      { id: 'say', label: '发送', kind: 'button' },
      { id: 'anger', label: '她的怒气', kind: 'knob', min: 0, max: 100, hidden: true, initial: 85 },
      { id: 'trust', label: '她的信任', kind: 'knob', min: 0, max: 100, hidden: true, initial: 20 },
      { id: 'checked', label: '核实过订单', kind: 'switch', hidden: true },
      { id: 'agreed', label: '方案谈妥', kind: 'switch', hidden: true },
      { id: 'over', label: '越权承诺', kind: 'switch', hidden: true },
      { id: 'photo3', label: '第三次要照片', kind: 'switch', hidden: true },
      { id: 'scripted', label: '套话术次数', kind: 'knob', min: 0, max: 10, hidden: true, initial: 0 },
      { id: 'idle', label: '这一轮让她等了几秒', kind: 'knob', min: 0, max: 600, hidden: true, initial: 0 },
      { id: 'words', label: '工单字数', kind: 'knob', min: 0, max: 2000, hidden: true, initial: 0 },
    ],
    gauges: [
      { id: 'g_anger', label: '怒气', unit: '', expr: 'anger', min: 0, max: 100, warn: 'anger > 70' },
      { id: 'g_trust', label: '信任', unit: '', expr: 'trust', min: 0, max: 100 },
      { id: 'g_idle', label: '最长等待', unit: '秒', expr: 'idle_max', min: 0, max: 60, warn: 'idle_max > 25' },
      { id: 'g_q', label: '处理质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'photo3', label: '第三次要照片（她 10/07 已经传过，系统里就有）', when: 'photo3 == 1', severity: 'violation', once: true },
      { id: 'over', label: '越权承诺（退款还让她留着机器，主管权限只到 100 元券）', when: 'over == 1', severity: 'violation', once: true },
      { id: 'scripted', label: '套标准话术（她听得出来，怒气只会涨）', when: 'scripted >= 1', severity: 'warning', once: true },
      { id: 'idle', label: '一轮让她等了超过 25 秒（她在打字「在吗？」）', when: 'idle > 25', severity: 'warning', once: true },
      { id: 'blind_offer', label: '没核实订单就给方案（不知道她的机器是哪天签收、政策能不能走）', when: 'offer > 0 && checked == 0 && say == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'check', label: '先核实订单和历史记录', when: 'checked == 1' },
      { id: 'calm', label: '把怒气降到 50 以下（共情 + 道歉，不是话术）', when: 'anger < 50', after: 'check' },
      { id: 'deal', label: '谈妥一个权限内能兑现的方案', when: 'agreed == 1 && over == 0', after: 'calm' },
      { id: 'ticket', label: '工单写清楚（≥ 40 字：问题、原因、方案、时限）', when: 'words >= 40', after: 'deal' },
      { id: 'q', label: '处理质量 ≥ 70', when: 'quality >= 70 && agreed == 1', after: 'ticket' },
    ],
    expertScript: expertScript(),
  };
}
