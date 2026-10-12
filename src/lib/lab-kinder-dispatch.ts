/**
 * 幼儿园中班教室 · 母版 D 纯配置版（2026-10-12）：和代码版 surfaces/Kinder.tsx 拨同样的控件、显示同样的信息。
 *   八个孩子是一个 each 模板（座位、注意力偏移按项填）；谁在什么时候出状况写在孩子的 k_state 里，事件文字在 incidents；
 *   环节长度在 phases（原 SEG_LEN），清单、全班 / 个别按钮都是数据。物理和判分照旧用 lab-kinder-spec.ts。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DispatchConfig, DShape } from '@/lib/masters/dispatch';
import { INCIDENTS, KIDS, SEGMENTS, kinderSpec } from '@/lib/lab-kinder-spec';

const LENS = [240, 420, 480, 180];
/** 半圈座位（原 POS） */
const SEATS = KIDS.map((name, i) => { const a = Math.PI * (0.15 + 0.7 * i / 7); return { name, x: +(800 + Math.cos(a) * 420).toFixed(1), y: +(560 - Math.sin(a) * 260).toFixed(1), off: (i * 7) % 5 - 2 }; });
const PANEL = 'rgba(23,26,46,.9)', MUTED = '#9aa0b8';

const kidShapes: DShape[] = [
  { kind: 'circle', r: 54, color: '#6a5cff', width: 4, dash: '8 6', when: 'sel == 1' },
  { kind: 'circle', r: 36, fill: '#fff', fillWhen: [{ when: 'k_state == 1', fill: '#ffd1dc' }, { when: 'k_state == 2', fill: '#ffe0b3' }, { when: 'k_state == 3', fill: '#d6ecff' }], color: '#c9b58a', width: 3 },
  { kind: 'text', y: 10, anchor: 'middle', size: 30, text: '🥱', textWhen: [{ when: 'k_state == 1', text: '😭' }, { when: 'k_state == 2', text: '😤' }, { when: 'k_state == 3', text: '🏃' }, { when: 'k_attn > 60', text: '🙂' }, { when: 'k_attn > 35', text: '😐' }] },
  { kind: 'text', y: 60, anchor: 'middle', size: 14, weight: 700, color: '#171a2e', text: '$name' },
  { kind: 'rect', x: -30, y: 66, w: 60, h: 6, rx: 3, fill: 'rgba(0,0,0,.12)' },
  { kind: 'rect', x: -30, y: 66, w: '60 * k_attn / 100', h: 6, rx: 3, fill: '#d6336c', fillWhen: [{ when: 'k_attn > 60', fill: '#12a150' }, { when: 'k_attn > 35', fill: '#e0a800' }] },
  { kind: 'text', y: -46, anchor: 'middle', size: 13, weight: 800, color: '#d6336c', when: 'k_state > 0', text: '跑去窗边', textWhen: [{ when: 'k_state == 1', text: '想妈妈了' }, { when: 'k_state == 2', text: '抢蜡笔' }] },
];

const once = (control: string, value: number) => ({ cooldown: { ms: 400, group: 'teacher' }, act: [{ control, value, pulse: 600 }] });

export const KINDER_DISPATCH: DispatchConfig = {
  master: 'dispatch',
  bg: '#f7efe0',
  shapes: [
    { kind: 'rect', x: 0, y: 0, w: 1600, h: 120, fill: '#e9dcc3' },
    // 窗
    { kind: 'rect', x: 1300, y: 140, w: 240, h: 200, rx: 10, fill: '#bfe3ff', color: '#8aa8c8', width: 5 },
    { kind: 'text', x: 1420, y: 360, anchor: 'middle', color: '#6b7089', size: 13, weight: 400, text: '窗边 · 洒水车' },
    // 地毯
    { kind: 'ellipse', x: 800, y: 520, rx: 520, ry: 320, fill: '#f5c7a6', opacity: 0.6 },
    { kind: 'ellipse', x: 800, y: 520, rx: 420, ry: 250, fill: '#f9d9bf', opacity: 0.8 },
  ],
  entities: [
    // 老师（你）：站到被点的孩子旁边
    { id: 'me', label: '你', x: 800, y: 760, near: { dx: 46, dy: 10 }, shapes: [
      { kind: 'circle', r: 30, fill: '#6a5cff', color: '#fff', width: 4 },
      { kind: 'text', y: 7, anchor: 'middle', color: '#fff', size: 16, weight: 800, text: '你' },
    ] },
    // 孩子：k_state 0 好好的 · 1 哭（朵朵，150 s 起）· 2 抢蜡笔（乐乐 / 果果，420 s 起）· 3 跑到窗边（壮壮，640 s 起）
    { id: 'kid$n', label: '$name', each: SEATS, hit: 40,
      x: '$n == 8 && wander_open >= 1 ? 1380 : $x', y: '$n == 8 && wander_open >= 1 ? 250 : $y',
      select: { control: 'kid', value: '$n' },
      lets: [
        { id: 'k_state', expr: '$n == 4 && cry_open >= 1 ? 1 : ($n == 5 || $n == 6) && fight_open >= 1 ? 2 : $n == 8 && wander_open >= 1 ? 3 : 0' },
        { id: 'k_attn', expr: 'clamp(attn + $off * 8 - (k_state > 0 ? 40 : 0), 0, 100)' },
      ],
      shapes: kidShapes },
  ],
  overlay: [
    { kind: 'text', x: 60, y: 104, color: '#6b7089', size: 13, weight: 400, text: '课堂时间 {{t:clock}} · 全班注意力 {{attn}}{{@incidents}}' },
    // 右侧：全班 / 个别
    { kind: 'rect', x: 1180, y: 400, w: 360, h: 320, rx: 16, fill: PANEL },
    { kind: 'text', x: 1200, y: 430, color: MUTED, size: 12, weight: 400, spacing: 2, text: '对全班' },
    { kind: 'text', x: 1200, y: 530, color: MUTED, size: 12, weight: 400, spacing: 2, text: '对这个孩子（{{@sel}}）', textWhen: [{ when: 'kid == 0', text: '对这个孩子（先点一个）' }] },
    { kind: 'text', x: 1200, y: 690, color: MUTED, size: 11.5, weight: 400, text: '哭 → 安抚 · 抢 → 分开 · 跑 → 请回座位 · 拍手别超过四次' },
  ],
  phases: { control: 'seg', elapsed: 'seg_t', long: 'seg_long >= 1', items: SEGMENTS.map((label, i) => ({ label, len: LENS[i] })), at: { x: 60, y: 44, w: 700 }, idle: '还没开始 · 先拍手儿歌集合', longText: ' · 拖太长了' },
  incidents: { items: INCIDENTS.map(x => ({ t: x.t, open: `${x.kind}_open >= 1`, text: x.text })), prefix: ' · ', join: '；' },
  buttons: [
    { x: 1200, y: 442, w: 100, h: 48, label: '👏 拍手儿歌', fill: '#6a5cff', action: once('all', 1) },
    { x: 1308, y: 442, w: 100, h: 48, label: '⏭ 下一环节', fill: '#12b5cb', action: { act: [{ control: 'seg', value: 'seg + 1', when: 'seg < 4' }] } },
    { x: 1416, y: 442, w: 100, h: 48, label: '📢 大声吼', fill: '#6b2d3b', action: once('all', 2) },
    ...['🤗 安抚', '✋ 分开', '⭐ 表扬', '🪑 请回座位'].map((label, i) => ({
      x: 1200 + (i % 2) * 164, y: 544 + Math.floor(i / 2) * 60, w: 156, h: 50, label, size: 14, weight: 700,
      fill: 'rgba(255,255,255,.06)', fillWhen: [{ when: 'kid > 0', fill: 'rgba(255,255,255,.14)' }], stroke: 'rgba(255,255,255,.3)',
      action: { guards: [{ when: 'kid == 0', say: '先点一个孩子，走到他身边' }], ...once('care', i + 1) },
    })),
  ],
  sayAt: { x: 1360, y: 714, anchor: 'middle', color: '#ffd166', size: 13, ms: 2000 },
  steps: SEGMENTS.map((s, i) => ({ label: `${s} · ${LENS[i] / 60} 分钟`, done: i < 3 ? `seg > ${i + 1}` : 'seg >= 4', on: `seg == ${i + 1}` })),
  stepsAt: { x: 60, y: 790, w: 1480, h: 80, cx: 98, cy: 830, dx: 360, r: 9, size: 16, numbered: true, fill: 'rgba(23,26,46,.85)' },
};

export function kinderDispatchSpec(image: string): BenchSpec {
  return { ...kinderSpec(image), surface: 'dispatch', surfaceConfig: KINDER_DISPATCH };
}
