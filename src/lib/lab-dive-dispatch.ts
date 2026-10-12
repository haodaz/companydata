/**
 * 礁区导潜 · 母版 D 纯配置版（2026-10-12）：和代码版 surfaces/Dive.tsx 拨同样的控件、显示同样的信息。
 *   侧视：水面 y=140、18 m 到 y=820；礁面是 terrains.reef（两条正弦叠加，原 reefTop）。
 *   「你」拖着走 → 隐藏控件 x / depth（drag 轴映射 + 礁面挡着）；客人是跟随者插件（follow），每拍追你、碰珊瑚时贴礁，
 *   离你多远写进隐藏控件 gap。手势 / 挡在中间 / 出水是按钮，事件文字（原 DIVE_EVENTS）在 incidents。物理和判分照旧用 lab-dive-spec.ts。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DispatchConfig, DShape, DTerrain } from '@/lib/masters/dispatch';
import { terrainY } from '@/lib/masters/dispatch';
import { DIVE_EVENTS, SIGNALS, diveSpec } from '@/lib/lab-dive-spec';

const SURF = 140, FLOOR = 820, M = (FLOOR - SURF) / 18, X0 = 160, X1 = 1440;
const toY = (d: number) => SURF + d * M;
const REEF: DTerrain = { id: 'reef', base: 700, waves: [{ amp: 40, period: 90 }, { amp: 18, period: 37 }], from: 0, to: 1600, step: 50, bottom: 900 };
const reef = (x: number) => terrainY(REEF, x);
const r1 = (v: number) => +v.toFixed(1);
const PANEL = 'rgba(12,16,32,.66)', LINE = 'rgba(255,255,255,.22)';
const EVENT_OPEN: Record<string, string> = { mask: 'mask_open >= 1', coral: 'coral_open >= 1', air: 'turned < 1' };

/** 侧视潜水员：身子 + 头 + 面镜。big = 你（略大一号） */
const diver = (body: string, edge: string, big: boolean): DShape[] => { const hx = big ? 38 : 34; return [
  { kind: 'ellipse', rx: big ? 42 : 38, ry: big ? 17 : 16, fill: body, color: edge, width: big ? 2.5 : 2 },
  { kind: 'circle', x: hx, y: -6, r: big ? 13 : 12, fill: '#f7d7c0', color: edge, width: 2 },
  { kind: 'rect', x: hx - 6, y: -14, w: 16, h: 10, rx: 3, fill: '#5fc8ff', color: '#333', width: 1.5 },
]; };
export const DIVE_DISPATCH: DispatchConfig = {
  master: 'dispatch',
  gradients: [{ id: 'dsp-dive-water', stops: [[0, '#5fc8ff'], [45, '#1e7fc4'], [100, '#0b3a66']] }],
  terrains: [REEF],
  locals: [
    { id: 'me_x', expr: `${X0} + ${X1 - X0} * x / 100` },
    { id: 'me_y', expr: `${SURF} + depth * ${M}` },
    { id: 'reef_me', terrain: 'reef', x: 'me_x' },
    { id: 'reef_tgt', terrain: 'reef', x: 'me_x - 60' },
    { id: 'reef_g', terrain: 'reef', x: 'guest_x' },
    { id: 'near_coral', expr: 'coral_open >= 1 && abs(guest_y - (reef_g - 30)) < 40' },
    { id: 'between', expr: 'me_x > guest_x - 30 && me_x < guest_x + 90 && me_y > guest_y + 10 && me_y < reef_me' },
  ],
  shapes: [
    { kind: 'rect', x: 0, y: 0, w: 1600, h: SURF, fill: '#dff3ff' },
    { kind: 'image', x: 0, y: 0, w: 1600, h: 900, opacity: 0.95, when: 'has_image' },
    { kind: 'rect', x: 0, y: SURF, w: 1600, h: 900 - SURF, fill: 'url(#dsp-dive-water)', opacity: 'has_image ? 0.35 : 1' },
    // 光线
    ...[0, 1, 2, 3].map((i): DShape => ({ kind: 'path', d: `M ${300 + i * 340} ${SURF} L ${340 + i * 340} ${SURF} L ${520 + i * 340} ${FLOOR} L ${380 + i * 340} ${FLOOR} Z`, fill: '#fff', opacity: 0.08, animate: { attr: 'opacity', values: '0.05;0.12;0.05', dur: `${3 + i}s` } })),
    // 水面
    { kind: 'path', d: `M 0 ${SURF} ${Array.from({ length: 17 }, (_, i) => `Q ${i * 100 + 50} ${SURF - 10} ${i * 100 + 100} ${SURF}`).join(' ')}`, color: '#fff', width: 4, opacity: 0.8 },
    // 礁（没有底图时画）
    { kind: 'terrain', terrain: 'reef', fill: '#8a4a6a', when: '!has_image' },
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((i): DShape[] => { const x = 120 + i * 190, top = r1(reef(x)); return [
      { kind: 'ellipse', x, y: r1(top + 10), rx: 70, ry: 34, fill: ['#ff8a5f', '#ffd166', '#ff5fa2', '#3ddc97'][i % 4], opacity: 0.85, when: '!has_image' },
      { kind: 'path', d: `M ${x - 30} ${top} q 10 -60 30 -70 q 10 50 30 70`, fill: '#ffb3c6', when: '!has_image' },
    ]; }),
    // 深度尺
    ...[0, 5, 10, 12, 15].flatMap((d): DShape[] => { const c = d === 12 ? '#ff5fa2' : '#fff'; return [
      { kind: 'line', x: 60, y: r1(toY(d)), x2: 100, y2: r1(toY(d)), color: c, width: d === 12 ? 3 : 2 },
      { kind: 'text', x: 52, y: r1(toY(d) + 5), anchor: 'end', color: c, size: 14, weight: 700, text: `${d} m` },
    ]; }),
    { kind: 'line', x: 100, y: r1(toY(12)), x2: 1540, y2: r1(toY(12)), color: '#ff5fa2', width: 2, dash: '10 10', opacity: 0.6 },
  ],
  entities: [
    // 客人：跟随者插件。每拍走剩余距离的 12%（慌了 4%）；要碰珊瑚时往礁面上贴（纵向 20%）
    { id: 'guest', label: '客人', x: X0 - 50, y: SURF,
      follow: { x: 'me_x - 60', y: 'coral_open >= 1 ? reef_tgt - 30 : me_y + 10', rate: 'stress > 60 ? 0.04 : 0.12', rateY: 'coral_open >= 1 ? 0.2 : 0.1',
        distance: { control: 'gap', x: 'me_x', y: 'me_y', scale: 1 / M, digits: 1 } },
      shapes: [
        ...diver('#ffd166', '#8a6a24', false),
        { kind: 'text', y: -30, anchor: 'middle', color: '#fff', size: 16, weight: 800, shadow: true, when: 'mask_open >= 1', text: '面镜进水！' },
        { kind: 'text', y: -30, anchor: 'middle', color: '#ff5fa2', size: 16, weight: 800, shadow: true, when: 'near_coral', text: '快碰到珊瑚了' },
        { kind: 'text', y: 34, anchor: 'middle', color: '#fff', size: 12, weight: 400, text: '客人 · {{air_g}} bar · 放松', textWhen: [{ when: 'stress > 60', text: '客人 · {{air_g}} bar · 慌了' }, { when: 'stress > 30', text: '客人 · {{air_g}} bar · 有点紧张' }] },
        ...[0, 1, 2].map((i): DShape => ({ kind: 'circle', x: 30, y: -20 - i * 14, r: 3 + i, fill: '#fff', opacity: 0.5, animate: { attr: 'cy', values: `${-20 - i * 14};${-90 - i * 14}`, dur: '2s' } })),
      ] },
    // 你：拖着走。横向 = 沿礁位置 x（0–100），纵向 = 深度（0–18 m），不能钻进礁里（礁面上方 40 px）
    { id: 'me', label: '你', x: 'me_x', y: 'me_y', hit: 70,
      drag: { grab: 90, when: 'surface != 1', x: { control: 'x', px: [X0, X1], v: [0, 100], min: 0, max: 100, digits: 1 }, y: { control: 'depth', px: [SURF, FLOOR], v: [0, 18], min: 0, max: 18, digits: 1 }, floor: { terrain: 'reef', offset: -40 } },
      shapes: [
        ...diver('#6a5cff', '#fff', true),
        { kind: 'circle', r: r1(2 * M), color: '#ff5fa2', width: 2, dash: '6 6', opacity: 0.7, when: 'gap > 2' },
        { kind: 'text', y: 36, anchor: 'middle', color: '#fff', size: 12, weight: 400, text: '你 · {{depth:1}} m', textWhen: [{ when: 'gap > 2', text: '你 · {{depth:1}} m · 离他 {{gap:1}} m' }] },
      ] },
  ],
  overlay: [
    // 手势 + 动作面板
    { kind: 'rect', x: 1080, y: 30, w: 480, h: 190, rx: 16, fill: PANEL, color: LINE, width: 2 },
    { kind: 'text', x: 1100, y: 58, color: '#9aa0b8', size: 12, weight: 400, spacing: 2, text: '手势 · 给客人看' },
    // 读数
    { kind: 'rect', x: 120, y: 30, w: 520, h: 90, rx: 16, fill: PANEL, color: LINE, width: 2 },
    { kind: 'text', x: 140, y: 58, color: '#9aa0b8', size: 12, weight: 400, spacing: 2, text: '潜水 {{t:clock}} · 1 秒 = 8 秒' },
    { kind: 'text', x: 140, y: 96, color: '#fff', colorWhen: [{ when: 'rate > 9', color: '#ff5fa2' }], size: 20, weight: 800, mono: true, text: '↑ {{rate:1}} m/分', textWhen: [{ when: 'turned >= 1', text: '↑ {{rate:1}} m/分  · 5 m 停 {{min(180, stop_s)}} / 180 s' }] },
    { kind: 'text', x: 660, y: 70, color: '#ffd166', size: 18, weight: 800, shadow: true, text: '{{@incident}}' },
  ],
  incidents: { items: DIVE_EVENTS.map(e => ({ t: e.t, open: EVENT_OPEN[e.kind], text: e.text })) },
  buttons: [
    ...SIGNALS.map((s, i) => ({
      x: 1100 + i * 90, y: 68, w: 82, h: 60, icon: s.icon, label: s.label, size: 11, stroke: 'rgba(255,255,255,.3)',
      // 手势是瞬时的（0.6 秒后放下）；70 bar 以后打「上升」顺带回转
      action: { cooldown: { ms: 600, group: 'signal' }, act: [{ control: 'signal', value: s.v, pulse: 600 }, ...(s.v === 2 ? [{ control: 'turn', value: 1, when: 'air_g <= 70' }] : [])] },
    })),
    { x: 1100, y: 142, w: 210, h: 56, label: '挡在中间（先游到他和礁之间）', labelWhen: [{ when: 'block == 1', text: '✋ 正挡在中间' }, { when: 'between', text: '挡在中间（现在位置对）' }], size: 14, stroke: 'rgba(255,255,255,.3)',
      fill: 'rgba(255,255,255,.14)', fillWhen: [{ when: 'block == 1', fill: '#ffd166' }, { when: 'between', fill: 'rgba(61,220,151,.3)' }], colorWhen: [{ when: 'block == 1', color: '#171a2e' }],
      action: { act: [{ control: 'block', value: 'block == 1 ? 0 : 1' }] } },
    { x: 1330, y: 142, w: 210, h: 56, label: '出水（到 0 m 再点）', labelWhen: [{ when: 'surface == 1', text: '已出水' }], size: 14, stroke: 'rgba(255,255,255,.3)',
      fill: 'rgba(255,255,255,.1)', fillWhen: [{ when: 'depth < 1 && turned >= 1', fill: '#3ddc97' }], color: '#9aa0b8', colorWhen: [{ when: 'depth < 1 && turned >= 1', color: '#171a2e' }],
      action: { act: [{ control: 'surface', value: 1, when: 'depth < 1 && turned >= 1' }] } },
  ],
  steps: [
    { label: '下到 8–12 m，客人在一臂内', done: 'done_down' },
    { label: '面镜进水：手势 + 停住', done: 'mask_done >= 1' },
    { label: '要碰珊瑚：手势「别碰」+ 挡中间', done: 'coral_done >= 1' },
    { label: '70 bar：回转上升', done: 'turned >= 1' },
    { label: '≤ 9 m/分，5 m 停 3 分钟', done: 'stop_s >= 170' },
    { label: '出水', done: 'surface == 1' },
  ],
  stepsAt: { x: 120, y: 840, w: 1440, h: 52, cx: 146, cy: 866, dx: 240, r: 7, size: 12.5 },
};

export function diveDispatchSpec(image: string): BenchSpec {
  return { ...diveSpec(image), surface: 'dispatch', surfaceConfig: DIVE_DISPATCH };
}
