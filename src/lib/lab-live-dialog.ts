/**
 * 直播中控台 · 母版 F（dialog）纯配置版（2026-10-12）：和 surfaces/Live.tsx 一样，全是数据。
 * 原来写死在组件里的弹幕 / 后台告警时间轴（EVENTS）、商品库存怎么掉（stockOf）、在线人数的起伏都搬进了配置（feed / options / waves）。
 * 物理（vars / rules / goals / 老手脚本）原样沿用 liveSpec；代码版 Live.tsx 保留当保底。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DialogConfig } from '@/lib/masters/dialog';
import { EVENTS, PRODUCTS, SAYS, liveSpec } from '@/lib/lab-live-spec';

/** 成交单数取整（代码版 Math.round）后每 3 单掉 1 件库存：表达式里没有 floor，用 x - x % 1 */
const SOLD = '((sold + 0.5) - (sold + 0.5) % 1)';
/** 每件商品此刻的库存（爆款开衫按时间轴掉：40 秒剩 3 件、90 秒清零） */
const stockOf = (p: typeof PRODUCTS[number]) => p.v === 1 ? `(t >= 90 ? 0 : t >= 40 ? 3 : ${p.stock + 5})` : `(${p.stock} - (link == 1 && card == ${p.v} ? (${SOLD} / 3 - (${SOLD} / 3) % 1) : 0))`;
const VIEWERS = '{{1800 + mood * 12 + wobble|n}}';

export const LIVE_DIALOG: DialogConfig = {
  master: 'dialog',
  title: '直播中控台 · 女装晚八点场', subtitle: `开播 {{t|clock}} · 在线 ${VIEWERS} · 成交 {{sold}} 单`,
  badges: [{ look: 'pill', when: 't >= 40 && stock == 0', text: '⚠ 开衫库存 3 件 · 链接还在售', textWhen: [{ when: 't >= 90', text: '⚠ 开衫库存 0 件 · 链接还在售' }], color: '#d6336c' }],
  npc: { name: '弹幕', avatar: '弹' },
  me: { name: '主播', avatar: '播', color: '#6a5cff' },
  feed: EVENTS.map(e => ({ t: e.t, who: e.who, text: e.text, tone: e.kind === 'alert' ? 'alert' as const : undefined })),
  trigger: { control: 'say', line: 'say' }, mode: 'instant', cooldown: 0.5,
  lines: SAYS.map(s => ({ v: s.v, label: s.label, text: s.text, hot: s.v === 6, act: [{ control: 'say', value: s.v, resetAfter: 0.6 }] })),
  waves: [{ name: 'wobble', amp: 60, period: 3 }],
  columns: [
    { width: '360px', tone: 'dark', flush: true, blocks: [
      { kind: 'caption', dot: '#ff3b5c', text: 'LIVE · 主播小禾 · 讲解中：—', textWhen: PRODUCTS.map(p => ({ when: `card == ${p.v}`, text: `LIVE · 主播小禾 · 讲解中：${p.name}` })) },
      { kind: 'hero', icon: '🧶', height: 150 },
      { kind: 'thread', look: 'feed' },
    ] },
    { width: 'minmax(0, 1fr)', gap: 14, blocks: [
      { kind: 'choices', title: '商品 · 点一个切到讲解位', control: 'card', cols: 3, look: 'card',
        options: PRODUCTS.map(p => ({ v: p.v, label: p.name, badge: p.hot ? '🔥' : undefined, sub: `¥${p.price} · 库存 `, value: { text: `{{${stockOf(p)}}}`, color: '#171a2e', colorWhen: [{ when: `${stockOf(p)} <= 3`, color: '#d6336c' }] } })) },
      { kind: 'buttons', row: true, buttons: [
        { label: '上链接', labelWhen: [{ when: 'link == 1', text: '链接在售 · 点击下链接' }], disabledWhen: 'card == 0', bg: '#6a5cff', bgWhen: [{ when: 'link == 1', color: '#12a150' }],
          action: { act: [{ control: 'link', value: 'link == 1 ? 0 : 1' }] } },
        { label: '处理库存预警：下链接 + 切款', labelWhen: [{ when: 'stock == 1', text: '✓ 库存预警已处理' }], disabledWhen: 'stock == 1', look: 'outline',
          bg: '#fff', bgWhen: [{ when: 't >= 40 && stock == 0', color: '#ffe3ec' }], fg: '#171a2e', fgWhen: [{ when: 't >= 40 && stock == 0', color: '#d6336c' }],
          action: { act: [{ control: 'stock', value: 1 }, { control: 'link', value: 0 }] } },
      ] },
      { kind: 'lines', title: '话术卡 · 点一下 = 递给主播说', cols: 2 },
    ] },
    { width: '300px', tone: 'panel', gap: 10, blocks: [
      { kind: 'stats', title: '后台', rows: [{ label: '在线', text: VIEWERS }, { label: '成交', text: '{{sold}} 单' }, { label: '气氛', text: '{{mood}}' }, { label: '违规', text: '{{banned}} 次' }] },
      { kind: 'buttons', title: '弹幕管理', buttons: [{ label: '拉黑最近发言的人', look: 'outline', action: { act: [{ control: 'mute', value: 1 }] } }] },
      { kind: 'note', tone: 'plain', bottom: true, text: '提醒：问尺码 20 秒内要回；库存见底先下链接再切款；有人喊假货要回应不是删人；「全网最低」是违规词。' },
    ] },
  ],
};

export function liveDialogSpec(image: string): BenchSpec {
  return { ...liveSpec(image), surface: 'dialog', surfaceConfig: LIVE_DIALOG };
}
