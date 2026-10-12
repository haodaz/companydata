/**
 * 月嫂哄睡（802 房的新生儿）· 母版 E（hands）纯配置版（2026-10-12）：和 surfaces/Soothe.tsx 画的、手势拨的、显示的一样，但全是数据。
 *   床里点宝宝 = 横抱抱起（tap）；怀里点头 = 左手托头（切换，空格也行）；在身上一下一下点 = 轻拍，节奏由点击间隔算（tempo）；
 *   按住宝宝左右拖 = 摇，最近 0.6 秒的摆幅写进 rock（drag amplitude）；按着时手压到脸上 = 遮口鼻（watch）；点床 = 放回去；
 *   夜灯点一下调暗一档；「嘘」按住出声（S 键也行）；抱姿三选一。宝宝本身用 baby 插件画（脸、哭、眼睛、托头的手）。
 * 物理（vars / rules / goals / 老手脚本）原样沿用 sootheSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { HandsConfig, HandsShape } from '@/lib/masters/hands';
import { HOLDS, sootheSpec } from '@/lib/lab-yuesao-spec';

/** 抱在怀里（床里 / 放回去之后都不算） */
const IN = '(hold >= 1 && down == 0)';
/** 头相对身体中心：横抱 / 飞机抱在左边，竖抱在上面，床里躺着 */
const HEAD_DX = `${IN} ? (hold == 2 ? 0 : -150) : -110`;
const HEAD_DY = `${IN} ? (hold == 2 ? -130 : -20) : -10`;
const CRIB = { x: 120, y: 300, w: 400, h: 300 };
const LAMP = { x: 1420, y: 150 };
const PANEL = { fill: 'rgba(12,16,32,.62)', width: 1.5 };

const crib: HandsShape[] = [
  { kind: 'rect', x: CRIB.x, y: CRIB.y, w: CRIB.w, h: CRIB.h, rx: 26, fill: '#f8f3ea', color: '#d9cdb8', width: 5 },
  ...Array.from({ length: 9 }, (_, i) => ({ kind: 'line' as const, x: CRIB.x + 30 + i * 42, y: CRIB.y - 60, x2: CRIB.x + 30 + i * 42, y2: CRIB.y + 10, color: '#e5dccb', width: 8 })),
  { kind: 'rect', x: CRIB.x + 20, y: CRIB.y + 40, w: CRIB.w - 40, h: CRIB.h - 60, rx: 20, fill: '#fffaf2' },
];

export const SOOTHE_HANDS: HandsConfig = {
  master: 'hands',
  gradients: [
    { id: 'hs-room', cx: '55%', cy: '30%', r: '80%', stops: [[0, '#5a4a52'], [0.6, '#3a2f3a'], [1, '#1e1822']] },
    { id: 'hs-lamp', stops: [[0, '#ffd9a0', 0.9], [1, '#ffd9a0', 0]] },
  ],
  shapes: [
    // 房间 + 地板
    { kind: 'rect', x: 0, y: 0, w: 1600, h: 900, rx: 0, fill: 'url(#hs-room)' },
    { kind: 'rect', x: 0, y: 640, w: 1600, h: 260, rx: 0, fill: '#2b2230' },
    // 夜灯：光晕随亮度缩放
    { kind: 'circle', x: LAMP.x, y: LAMP.y, r: 'light * 2.6', fill: 'url(#hs-lamp)', opacity: '0.5 + light / 200' },
    { kind: 'rect', x: LAMP.x - 48, y: LAMP.y - 30, w: 96, h: 60, rx: 14, fill: '#3a2f33', color: '#9a8a7a', width: 3 },
    { kind: 'circle', x: LAMP.x, y: LAMP.y, r: 18, color: '#8a6c45', colorWhen: [{ when: 'light > 50', color: '#ffe9b0' }, { when: 'light > 20', color: '#e3b870' }] },
    { kind: 'text', x: LAMP.x, y: LAMP.y + 58, anchor: 'middle', text: '夜灯 {{light}}% · 点一下调暗', color: '#fff', size: 16, weight: 700 },
    ...crib,
  ],
  subjects: [{ plugin: 'baby', piece: 'baby', params: {
    headDx: HEAD_DX, headDy: HEAD_DY, rot: 'hold == 2 ? 0 : hold == 3 ? -12 : -8',
    cry: '100 - calm', eye: 'calm >= 92 ? 0 : calm >= 75 ? 0.35 : 1', mouth: 'calm >= 75 ? 4 : 8',
    wiggleFreq: `${IN} ? 7 : 9`, wiggleAmp: `${IN} ? 6 : 9`, hand: `${IN} && head == 1`, hint: `${IN} && head == 0`,
  }, texts: { hint: '点这里 = 左手托住头（或按空格）' } }],
  over: [
    // 床边的提示（会被调暗）
    { kind: 'text', x: CRIB.x + CRIB.w / 2, y: CRIB.y + CRIB.h / 2, anchor: 'middle', color: '#ffd166', size: 22, weight: 800, live: true, when: `${IN} && asleep_s >= 1`,
      text: '再等等…睡着 {{asleep_s}} 秒', textWhen: [{ when: 'asleep_s >= 5', text: '睡踏实了 · 点床放回去' }] },
    { kind: 'text', x: CRIB.x + CRIB.w / 2, y: CRIB.y - 80, anchor: 'middle', color: '#ffd166', size: 22, weight: 800, shadow: true, live: true, when: 'hold == 0 && down == 0', text: '宝宝在哭 · 点他抱起来' },
    { kind: 'text', x: CRIB.x + CRIB.w / 2, y: CRIB.y - 80, anchor: 'middle', size: 22, weight: 800, when: 'down == 1',
      color: '#ff5fa2', colorWhen: [{ when: 'calm >= 85', color: '#3ddc97' }], text: '放早了，又哭了', textWhen: [{ when: 'calm >= 85', text: '放下了，没醒' }] },
    // 灯暗下来：整屋压暗
    { kind: 'rect', x: 0, y: 0, w: 1600, h: 900, rx: 0, fill: '#0b0712', opacity: 'min(0.72, (100 - light) / 100 * 0.75)' },
  ],
  hud: [
    // 哭声线 + 状态
    { kind: 'rect', x: 520, y: 40, w: 560, h: 110, rx: 16, ...PANEL, color: 'rgba(255,255,255,.2)' },
    { kind: 'text', x: 544, y: 70, text: '哭声 · CRY', color: '#9aa0b8', size: 13, weight: 400, mono: true, spacing: 2 },
    { kind: 'wave', x: 560, y: 90, n: 48, step: 10, amp: '(100 - calm) / 100 * 26', width: 3, color: '#3ddc97', colorWhen: [{ when: '100 - calm > 45', color: '#ff5fa2' }, { when: '100 - calm > 25', color: '#ffd166' }] },
    { kind: 'text', x: 1056, y: 72, anchor: 'end', color: '#fff', size: 24, weight: 800, text: '哭闹', textWhen: [
      { when: 'calm >= 92', text: '睡着了' }, { when: 'calm >= 75', text: '犯困了' }, { when: 'calm >= 55', text: '安静下来' }, { when: 'calm >= 30', text: '不安' }] },
    { kind: 'text', x: 1056, y: 132, anchor: 'end', color: '#9aa0b8', size: 14, weight: 400, textParts: [
      ...HOLDS.slice(1).map(h => ({ when: `${IN} && hold == ${h.v}`, text: h.label })),
      { when: `${IN} && head == 1`, text: ' · 左手托着头' }, { when: `${IN} && head == 0`, text: ' · 左手没托头！' },
      { when: IN, text: ' · 节奏 {{tempo}} 次/分' }, { when: `${IN} && shush == 1`, text: ' · 嘘——' },
      { when: 'down == 1', text: '放回床里了' }, { when: 'hold == 0 && down == 0', text: '还在床里' },
    ] },
    // 抱姿 + 嘘 的底板
    { kind: 'rect', x: 54, y: 60, w: 420, h: 150, rx: 18, ...PANEL, color: 'rgba(255,255,255,.22)', width: 2 },
    { kind: 'text', x: 70, y: 88, text: '抱姿 · HOLD', color: '#9aa0b8', size: 13, weight: 400, mono: true, spacing: 2 },
  ],
  pieces: [
    // 宝宝：床里躺着 / 怀里（竖抱高一截）；按住左右拖是摇，偏移只在怀里算
    { id: 'baby', x: `${IN} ? 880 : ${CRIB.x + CRIB.w / 2}`, y: `${IN} ? (hold == 2 ? 440 : 560) : ${CRIB.y + CRIB.h / 2 + 10}`, offsetWhen: IN },
  ],
  zones: [
    { id: 'crib', kind: 'rect', x: CRIB.x, y: CRIB.y, w: CRIB.w, h: CRIB.h },
    { id: 'baby_in_crib', on: 'baby', x: 0, y: 0, r: 170 },
    { id: 'head', on: 'baby', x: HEAD_DX, y: HEAD_DY, r: 70 },
    { id: 'face', on: 'baby', x: `(${HEAD_DX}) + 10`, y: `(${HEAD_DY}) + 10`, r: 48 },
    { id: 'body', on: 'baby', x: 0, y: 0, r: 230 },
  ],
  gestures: [
    { id: 'pickup', when: 'hold == 0 && down == 0', zone: 'baby_in_crib', down: { act: [{ control: 'hold', value: 1 }] } },
    { id: 'putdown', when: IN, zone: 'crib', down: { act: [{ control: 'down', value: 1 }, { control: 'hold', value: 0 }] } },
    { id: 'head', when: IN, zone: 'head', down: { act: [{ control: 'head', value: 'head == 1 ? 0 : 1' }] } },
    // 代码版也有这一条：脸的圈整个在头的圈里，按下时其实轮不到它（遮口鼻靠下面的 watch：按着划到脸上）
    { id: 'face', when: IN, zone: 'face', down: { act: [{ control: 'face', value: 1 }] } },
    // 身上：一下 = 轻拍（节奏）；按住左右拖 = 摇（幅度 = 0.6 秒里摆幅 / 1.6，变化 > 3 才写；松手每拍 −15、宝宝回位）
    { id: 'body', when: IN, zone: 'body', fx: 'ripple', tempo: { out: { control: 'tempo' } },
      drag: { piece: 'baby', mode: 'relative', axis: 'x', min: -160, max: 160, springBack: 0.8,
        amplitude: { out: { control: 'rock', scale: 0.625, deadband: 3 }, windowMs: 600, decay: 15 } } },
  ],
  watch: [{ zone: 'face', when: IN, control: 'face' }],
  keys: [
    { code: 'Space', when: IN, prevent: true, action: { act: [{ control: 'head', value: 'head == 1 ? 0 : 1' }] } },
    { key: 's', hold: 'shush' },
  ],
  buttons: [
    { ghost: true, x: LAMP.x - 48, y: LAMP.y - 30, w: 96, h: 60, action: { act: [{ control: 'light', value: 'light > 60 ? 60 : light > 30 ? 30 : light > 10 ? 10 : 100' }] } },
    ...HOLDS.slice(1).map((h, i) => ({ x: 70 + i * 132, y: 100, w: 122, h: 44, label: h.label.replace(/（.*）/, ''), selWhen: `hold == ${h.v}`,
      action: { act: [{ control: 'hold', value: h.v, when: 'down == 0' }] } })),
    { x: 70, y: 156, w: 390, h: 40, hold: 'shush', weight: 800, label: '按住 = 嘘——（或按住 S 键）', labelWhen: [{ when: 'shush == 1', text: '嘘—————' }],
      litWhen: 'shush == 1', litColor: '#3ddc97', litInk: '#0f1224' },
  ],
  steps: [
    { label: '抱起来（点宝宝）', done: 'hold >= 1 || down == 1' }, { label: '左手托住头', done: 'head == 1 || down == 1' },
    { label: '夜灯调暗', done: 'light <= 40' }, { label: '在背上按节奏轻拍 50–100 次/分', done: 'done_rhythm == 1' },
    { label: '按住「嘘」', ever: 'shush' }, { label: '等他睡着', done: 'asleep_s >= 5 || down == 1' }, { label: '放回床里', done: 'down == 1' },
  ],
  stepsAt: { x: 300, y: 744, w: 1000, h: 118, title: '哄睡：抱 → 托头 → 调暗 → 轻拍 → 嘘 → 等 → 放回', cols: 4, colW: 240, size: 14.5 },
  cursor: 'hand', cursorUnder: true,
};

export function sootheHandsSpec(image: string): BenchSpec {
  return { ...sootheSpec(image), surface: 'hands', surfaceConfig: SOOTHE_HANDS };
}
