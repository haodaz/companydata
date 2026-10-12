/**
 * 客服工作台 · 母版 F（dialog）纯配置版（2026-10-12）：和 surfaces/Complaint.tsx 画的、点的、说的一样，
 * 原来写死在组件里的怒气 / 信任状态机（每句话拨多少）和李女士的回话表都搬进了数据（lines[].effects / replies）。
 * 物理（vars / rules / goals / 老手脚本）原样沿用 complaintSpec；代码版 Complaint.tsx 保留当保底。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DialogConfig, DialogLine } from '@/lib/masters/dialog';
import { ACTS, FACTS, OFFERS, complaintSpec } from '@/lib/lab-complaint-spec';

const act = (v: number) => ACTS.find(a => a.v === v)!;
/** 话术：v = kind 的值；效果按发出前的怒气 / 信任 / 核实算，nth = 这句第几次说（含这次） */
const LINES: DialogLine[] = [
  { v: 1, label: act(1).label, text: act(1).text,
    effects: [{ when: 'nth <= 2', set: [{ control: 'anger', value: 'anger - 14' }, { control: 'trust', value: 'trust + 12' }] }, { set: [{ control: 'anger', value: 'anger + 4' }] }],
    // 演示（auto）时代码版按怒气 50 回话
    replies: [{ when: 'nth <= 1 && auto == 0 && anger > 60', text: '…你这么说我火气是小一点。但光说没用，你们打算怎么办？' }, { when: 'nth <= 1', text: '嗯，至少你是听明白了。' }],
    reply: '你别一直说这些了，我要的是解决。' },
  { v: 2, label: act(2).label, text: act(2).text,
    effects: [{ when: 'nth <= 2', set: [{ control: 'anger', value: 'anger - 12' }, { control: 'trust', value: 'trust + 10' }] }, { set: [{ control: 'anger', value: 'anger + 3' }] }],
    replies: [{ when: 'nth <= 1', text: '道歉我收下。然后呢？' }], reply: '不用一直道歉，说方案。' },
  { v: 3, label: act(3).label, text: act(3).text,
    effects: [{ when: 'checked == 0', set: [{ control: 'checked', value: 1 }, { control: 'anger', value: 'anger - 6' }, { control: 'trust', value: 'trust + 15' }] }, { set: [{ control: 'anger', value: 'anger + 2' }] }],
    reply: '好，我等你三十秒。别又让我等半天。' },
  { v: 4, label: act(4).label, text: '', ready: 'offer > 0',
    textWhen: OFFERS.slice(1).map(o => ({ when: `offer == ${o.v}`, text: o.text })),
    effects: [
      { when: 'offer == 4', set: [{ control: 'over', value: 1 }, { control: 'agreed', value: 1 }, { control: 'anger', value: 'anger - 30' }, { control: 'trust', value: 'trust + 10' }] },
      { when: 'checked == 0', set: [{ control: 'anger', value: 'anger + 6' }, { control: 'trust', value: 'trust - 4' }] },
      { when: 'trust < 40', set: [{ control: 'anger', value: 'anger + 2' }, { control: 'trust', value: 'trust - 2' }] },
      { when: 'offer == 1 || offer == 3', set: [{ control: 'agreed', value: 1 }, { control: 'anger', value: 'anger - (offer == 3 ? 34 : 26)' }, { control: 'trust', value: 'trust + 25' }] },
      { set: [{ control: 'anger', value: 'anger + 4' }, { control: 'trust', value: 'trust - 3' }] },
    ],
    replies: [
      { when: 'offer == 0', text: '方案呢？你发了个空的。' },
      { when: 'offer == 4', text: '…行吧，你说的，退款机器我留着，你记得写进去。' },
      { when: 'checked == 0 && auto == 0', text: '你连我订单都没查就给方案？你知道我是哪天收到的吗？' },
      { when: 'trust < 40 && auto == 0', text: '换新？我凭什么信你们，前面两个也是这么说的。' },
      { when: 'offer == 3', text: '…好，那就这样。券我也收了。希望这次真的有人上门。' },
      { when: 'offer == 1', text: '可以，上门取件。什么时候？' },
    ],
    reply: '寄回去再退？运费谁出？我还要跑一趟快递？' },
  { v: 5, label: act(5).label, text: act(5).text,
    // 代码版先自增再判断「≥ 1」：第一次要照片就记 photo3
    effects: [{ set: [{ control: 'anger', value: 'anger + 18' }, { control: 'trust', value: 'trust - 10' }, { control: 'photo3', value: 1 }] }],
    replies: [{ when: 'nth >= 3', text: '？？？我 7 号就发了！你们系统里没有吗？！我现在就去投诉！' }], reply: '我发过了！你自己去翻记录！' },
  { v: 6, label: act(6).label, text: act(6).text,
    effects: [{ set: [{ control: 'anger', value: 'anger + 12' }, { control: 'trust', value: 'trust - 8' }, { control: 'scripted', value: 'scripted + 1' }] }],
    reply: '你这是机器人回复吧？"1–3 个工作日"，我 7 号就听过这句了。' },
  { v: 7, label: act(7).label, text: act(7).text,
    effects: [{ set: [{ control: 'anger', value: 'anger + 10' }, { control: 'trust', value: 'trust - 12' }] }],
    reply: '又转？你是第三个了！转来转去谁负责？' },
];

const MOOD = '· 怒气 {{anger}} · 信任 {{trust}}';

export const COMPLAINT_DIALOG: DialogConfig = {
  master: 'dialog',
  title: '客服工作台 · 升级队列', subtitle: '#48821 李女士 · 空气净化器破损',
  badges: [{ look: 'text', text: `🙂 缓下来了 ${MOOD}`, textWhen: [{ when: 'anger > 70', text: `😡 要炸了 ${MOOD}` }, { when: 'anger > 50', text: `😠 还在气 ${MOOD}` }, { when: 'anger > 30', text: `😐 听得进话 ${MOOD}` }],
    color: '#12a150', colorWhen: [{ when: 'anger > 50', color: '#d6336c' }] }],
  npc: { name: '李女士', avatar: '李', color: '#ff8a5f', typing: '李女士正在输入…' },
  me: { name: '我', avatar: '我', color: '#6a5cff' },
  opening: [
    { who: 'sys', text: '工单 #48821 已升级给你 · 李女士 · 等待 2 分 10 秒' },
    { who: 'npc', text: '你们到底有没有人管？净化器收到就是碎的，我 7 号就说了，照片也发了，两次都让我"提供照片"，提供了又没人理！' },
    { who: 'npc', text: '今天不给个说法我就投诉 12315，再发小红书。' },
  ],
  trigger: { control: 'say', line: 'kind' }, mode: 'composer', lines: LINES,
  composer: { send: [{ control: 'say', value: 1 }], after: [{ control: 'kind', value: 0 }], placeholder: '右边选这一句要做什么，这里会生成你要说的话', emptyText: '右边选一个方案', button: '发送' },
  typingDelay: 1.4,
  idle: { control: 'idle', when: 'agreed == 0', nudge: { after: 25, text: '在吗？？' } },
  columns: [
    { width: '300px', tone: 'plain', blocks: [
      { kind: 'facts', title: '订单与记录', when: 'checked == 1', items: FACTS.map((f, i) => ({ text: f, hot: i === 4 })),
        placeholder: '还没核实。右边选「核实订单」发出去，系统会把订单、物流、历史记录调出来——先知道她说的是不是真的。' },
      { kind: 'note', title: '你的权限', tone: 'yellow', text: '换新 / 退款（寄回后）可直接承诺；补偿券 ≤ 100 元；「退款还让客户留货」不在权限内。' },
    ] },
    { width: 'minmax(0, 1fr)', flush: true, blocks: [{ kind: 'thread', look: 'chat' }, { kind: 'composer' }] },
    { width: '340px', tone: 'panel', gap: 8, blocks: [
      { kind: 'choices', title: '这一句做什么', control: 'kind', cols: 2, look: 'chip', disabledWhen: 'agreed == 1', options: ACTS.map(a => ({ v: a.v, label: a.label })) },
      { kind: 'choices', title: '方案', when: 'kind == 4', control: 'offer', cols: 1, look: 'option', options: OFFERS.slice(1).map(o => ({ v: o.v, label: o.label })) },
      { kind: 'ticket', title: '工单记录（谈妥后写）· {{words}} 字', control: 'words', placeholder: '问题：\n原因：\n方案：\n时限：' },
    ] },
  ],
};

export function complaintDialogSpec(image: string): BenchSpec {
  return { ...complaintSpec(image), surface: 'dialog', surfaceConfig: COMPLAINT_DIALOG };
}
