/**
 * 古籍修复（补第 7 叶的虫洞）· 母版 E（hands）纯配置版（2026-10-12）：和 surfaces/Restore.tsx 画的、手势拨的、显示的一样，但全是数据。
 *   喷壶点破口附近 = 湿度 +12（tap）；毛刷点浆糊碗 = 蘸浆，拖着刷破口边缘带 = 覆盖率（paint，刷子上的浆每下扣、刷远了算出界）；
 *   镊子把补纸拖到破口上松手 = 偏移 mm + 贴上（drag → drops）；手按住补纸 = 压实 + 压实秒数（hold）；镊子把吸水纸拖开 = 揭的速度 + 揭开（drag speed）。
 * 虫洞 / 字 / 补纸轮廓是这里用 TS 算好的路径字符串（存库就是字符串）。物理（vars / rules / goals / 老手脚本）原样沿用 restoreSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { HandsConfig, HandsShape } from '@/lib/masters/hands';
import { RESTORE_TOOLS, restoreSpec } from '@/lib/lab-restore-spec';

const LEAF = { x: 430, y: 120, w: 760, h: 700 };
const C = { x: 905, y: 560 };   // 虫洞中心
const holeR = (a: number) => 64 + 12 * Math.sin(a * 2 + 0.6) + 7 * Math.cos(a * 3 + 1.1);
const ring = (n: number, add: number, k = 1) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, r = holeR(a) + add; return [Math.cos(a) * r * 1.15 * k, Math.sin(a) * r * k] as [number, number]; });
const poly = (pts: [number, number][], ox = 0, oy = 0) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${(x + ox).toFixed(1)} ${(y + oy).toFixed(1)}`).join(' ') + ' Z';
const HOLE = poly(ring(36, 0), C.x, C.y);
/** 补纸：虫洞轮廓放大 1.22，坐标相对补纸中心 */
const PATCH = poly(ring(36, 0, 1.22));
/** 破口边缘带：涂浆要刷到的 28 个点 */
const RIM = ring(28, 24).map(([x, y]) => [Math.round((x + C.x) * 10) / 10, Math.round((y + C.y) * 10) / 10] as [number, number]);

/** 刻本的字：8 列 × 16 行的圆角小块，绕开虫洞；按 5 档深浅各拼成一条路径 */
const glyphs = (): HandsShape[] => {
  const d: string[] = ['', '', '', '', ''];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 16; r++) {
    const x = LEAF.x + 70 + c * 80, y = LEAF.y + 60 + r * 40;
    if (Math.hypot(x + 20 - C.x, y + 16 - C.y) < 85) continue;
    d[(c * 7 + r * 3) % 5] += `M ${x + 11} ${y} h 20 a 3 3 0 0 1 3 3 v 24 a 3 3 0 0 1 -3 3 h -20 a 3 3 0 0 1 -3 -3 v -24 a 3 3 0 0 1 3 -3 Z `;
  }
  return d.map((p, k) => ({ kind: 'path' as const, d: p.trim(), fill: '#2b2420', opacity: 0.75 + k * 0.04 }));
};
const columns = Array.from({ length: 9 }, (_, i) => `M ${LEAF.x + 60 + i * 80} ${LEAF.y + 40} V ${LEAF.y + LEAF.h - 40}`).join(' ');
const PANEL = { fill: 'rgba(12,16,32,.62)', color: 'rgba(255,255,255,.22)', width: 2 };

/** 读数牌：两列两行，值的颜色按状态 */
const stat = (i: number, label: string, expr: string, colorWhen: { when: string; color: string }[], base = '#e6e8f5'): HandsShape[] => {
  const x = 60 + (i % 2) * 165, y = 228 + Math.floor(i / 2) * 60;
  return [
    { kind: 'text', x, y, text: label, color: '#9aa0b8', size: 13, weight: 400 },
    { kind: 'text', x, y: y + 28, text: `{{${expr}}}%`, color: base, colorWhen, size: 24, weight: 800, mono: true },
  ];
};

export const RESTORE_HANDS: HandsConfig = {
  master: 'hands',
  gradients: [{ id: 'hs-rs-wet', stops: [[0, '#7fb6ff', 0.45], [1, '#7fb6ff', 0]] }],
  shapes: [
    // 工作台面 + 书叶
    { kind: 'rect', x: 0, y: 0, w: 1600, h: 900, rx: 0, fill: '#3b2f26' },
    { kind: 'rect', x: LEAF.x + 10, y: LEAF.y + 12, w: LEAF.w, h: LEAF.h, rx: 0, fill: 'rgba(0,0,0,.35)' },
    { kind: 'rect', x: LEAF.x, y: LEAF.y, w: LEAF.w, h: LEAF.h, rx: 0, fill: '#e8d9b5', color: '#c9b58a', width: 2 },
    { kind: 'path', d: columns, color: '#b89a66', width: 1.5 },
    ...glyphs(),
    // 洇墨：湿度 > 65 时一团团墨晕开
    ...[0, 1, 2, 3].map(i => ({ kind: 'circle' as const, x: Math.round(C.x + Math.cos(i * 1.7) * 110), y: Math.round(C.y + Math.sin(i * 1.7) * 90), r: '8 + bleed * 2', fill: '#1b1512', opacity: 'min(0.6, bleed / 20)', blur: 'sm' as const, when: 'bleed > 0' })),
    // 喷潮：水光
    { kind: 'circle', x: C.x, y: C.y, r: '120 + wet * 0.9', fill: 'url(#hs-rs-wet)', opacity: 'min(1, wet / 100)' },
    // 浆糊出界的晕
    { kind: 'circle', x: C.x, y: C.y, r: '120 + spill * 1.5', fill: '#e6c46a', opacity: 'min(0.35, spill / 100)', blur: 'sm', when: 'spill > 0' },
    // 虫洞
    { kind: 'path', d: HOLE, fill: '#2a1f17' },
    { kind: 'path', d: HOLE, color: '#8c7046', width: 2, dash: '4 3' },
    { kind: 'text', x: 200, y: 700, anchor: 'middle', text: '染色补纸（镊子拖）', color: '#fff', size: 15, weight: 700, when: 'place == 0' },
    // 材料：浆糊碗、吸水纸
    { kind: 'ellipse', x: 200, y: 400, rx: 88, ry: 48, fill: '#d9d2c4', color: '#9a8a6a', width: 3 },
    { kind: 'ellipse', x: 200, y: 394, rx: 70, ry: 34, fill: '#f1e3b8' },
    { kind: 'text', x: 200, y: 476, anchor: 'middle', text: '低浓度浆糊 · 毛刷点这里蘸', color: '#fff', size: 15, weight: 700 },
    { kind: 'rect', x: 130, y: 720, w: 140, h: 80, rx: 6, fill: '#fbf8f0', color: '#d8d0bd', width: 2 },
    { kind: 'text', x: 200, y: 826, anchor: 'middle', text: '吸水纸（压实时自动垫上）', color: '#fff', size: 14, weight: 400 },
  ],
  hud: [
    { kind: 'rect', x: 40, y: 196, w: 340, h: 150, rx: 16, ...PANEL },
    ...stat(0, '湿度', 'wet', [{ when: 'wet > 65', color: '#ff5fa2' }, { when: 'wet >= 30', color: '#3ddc97' }], '#ffd166'),
    ...stat(1, '刷子上的浆', 'load', [{ when: 'load < 12', color: '#ffd166' }]),
    ...stat(2, '边缘覆盖', 'cover', [{ when: 'cover >= 85', color: '#3ddc97' }]),
    ...stat(3, '干燥', 'dry', [{ when: 'dry >= 70', color: '#3ddc97' }]),
  ],
  zones: [
    { id: 'hole', x: C.x, y: C.y, r: 170 },
    { id: 'bowl', x: 200, y: 400, r: 90 },
    { id: 'leaf', kind: 'rect', x: LEAF.x, y: LEAF.y, w: LEAF.w, h: LEAF.h },
    { id: 'core', x: C.x, y: C.y, r: 60 },
    { id: 'patch_grab', on: 'patch', x: 0, y: 0, r: 90 },
    { id: 'patch_press', on: 'patch', x: 0, y: 0, r: 110 },
    { id: 'blot_grab', on: 'blot', x: 0, y: 0, r: 110 },
  ],
  pieces: [
    { id: 'patch', x: 200, y: 590, autoAt: { when: 'place == 1', x: `${C.x} + align * 10`, y: C.y }, shapes: [
      { kind: 'path', d: PATCH, fill: '#e2cfa4', color: '#b89a66', width: 1.5, opacity: 'place == 1 ? 0.98 : 0.95' },
      { kind: 'path', d: 'M -40 -30 L 10 5 L -20 40', color: '#2a1f17', width: 3, when: 'torn >= 1' },
      // 半干前的水光
      { kind: 'path', d: PATCH, fill: '#fff', opacity: '0.35 * (1 - dry / 100)', when: 'place == 1 && peel == 0' },
    ] },
    { id: 'blot', x: C.x, y: C.y, when: 'press == 1 && peel == 0', spawnOn: 'patch', autoAt: { when: 'press == 1 && peel == 0', x: C.x, y: C.y }, shapes: [
      { kind: 'rect', x: -120, y: -95, w: 240, h: 190, rx: 8, fill: '#fbf8f0', color: '#d8d0bd', width: 2, opacity: 0.96 },
      { kind: 'text', x: 0, y: 6, anchor: 'middle', text: '吸水纸', color: '#9a8a6a', size: 14, weight: 400 },
    ] },
  ],
  gestures: [
    // 喷壶：一下一下喷
    { id: 'spray', tool: 0, zone: 'hole', fx: 'spray', down: { act: [{ control: 'wet', value: 'min(100, wet + 12)' }] } },
    // 毛刷：点碗蘸浆；别处按下就开始刷
    { id: 'dip', tool: 1, zone: 'bowl', down: { act: [{ control: 'dip', value: 1 }, { control: 'load', value: 100 }] } },
    { id: 'brush', tool: 1, paint: {
      points: RIM, radius: 34, out: { control: 'cover' }, need: 'load >= 12',
      cost: { control: 'load', step: 1.4 }, spill: { control: 'spill', step: 1.2, beyond: 40, inside: 'leaf', outside: 'core', max: 100 },
      mark: { r: 18, color: '#efd27a', opacity: 0.85 },
    } },
    // 镊子：补纸拖到破口上（150 像素内算贴上，偏移 = 距离 / 10 mm），不然弹回去
    { id: 'patch', tool: 2, when: 'place == 0', zone: 'patch_grab', drag: { piece: 'patch', mode: 'follow', miss: 'home',
      drops: [{ x: C.x, y: C.y, within: 150, out: { control: 'align', scale: 0.1, digits: 1 }, action: { act: [{ control: 'place', value: 1 }] } }] } },
    // 镊子：压实后把吸水纸拖离补纸 170 像素以外算揭开；拖的最快速度记进 peel_speed
    { id: 'blot', tool: 2, when: 'place == 1 && press == 1 && peel == 0', zone: 'blot_grab', drag: { piece: 'blot', mode: 'follow',
      speed: { out: { control: 'peel_speed', mode: 'max' } }, drops: [{ piece: 'patch', beyond: 170, action: { act: [{ control: 'peel', value: 1 }] } }] } },
    // 手：按住补纸 = 隔吸水纸压实，按着的模拟秒数累加
    { id: 'press', tool: 3, when: 'place == 1 && peel == 0', zone: 'patch_press', down: { act: [{ control: 'press', value: 1, when: 'press == 0' }] },
      hold: { control: 'press_s', perSec: 1, when: 'press == 1' } },
  ],
  tools: RESTORE_TOOLS, toolControl: 'tool', toolsAt: { x: 56, y: 72, title: '工具 · 点一下换手里的' },
  wantTool: 'wet < 30 ? 0 : cover < 80 ? 1 : place == 0 ? 2 : press == 0 ? 3 : peel == 0 && dry >= 70 ? 2 : -1',
  steps: [
    { label: '喷壶：点破口附近喷潮（30–60）', done: 'wet >= 30' }, { label: '毛刷：点浆糊碗蘸浆', done: 'load > 0 || cover > 0' },
    { label: '沿破口边缘刷一圈（≥ 80%）', done: 'cover >= 80' }, { label: '镊子：把补纸拖到破口上', done: 'place == 1' },
    { label: '手：按住补纸压实 2 秒', done: 'press_s >= 2' }, { label: '等半干（≥ 70%）', done: 'dry >= 70' }, { label: '镊子：慢慢揭开吸水纸', done: 'peel == 1' },
  ],
  stepsAt: { x: 300, y: 744, w: 1000, h: 118, title: '补虫洞：喷潮 → 蘸浆 → 刷边 → 对位 → 压实 → 等 → 揭', cols: 4, colW: 240, size: 14 },
  cursor: 'tool',
};

export function restoreHandsSpec(image: string): BenchSpec {
  return { ...restoreSpec(image), surface: 'hands', surfaceConfig: RESTORE_HANDS };
}
