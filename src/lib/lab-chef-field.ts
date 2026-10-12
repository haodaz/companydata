/**
 * 炒锅台 · 宫保鸡丁 · 母版 B（field）纯配置版（2026-10-12）：和 surfaces/Chef.tsx 画的、点的、说的一样，全是数据。
 *   中央锅 + 灶是主体插件 wok（火焰 / 油光 / 料 / 汁 / 烟都由表达式驱动）；料碗 = 动作卡片（下过的变灰、该下的发光，整组 0.4 秒防连点）；
 *   翻炒 = 锅上的拖动区（来回拖满 160 像素翻一下）；火力 = 四个分段键；出锅 = 按状态换色的按钮；上方阶段提示、下方时间轴步骤。
 * 物理（vars / rules / goals / 老手脚本）原样沿用 chefSpec；代码版 Chef.tsx 留着当保底。
 */
import type { BenchSpec } from '@/lib/bench';
import type { FieldConfig } from '@/lib/lab-masters';
import { INGREDIENTS, chefSpec } from '@/lib/lab-chef-spec';

const X = 820, Y = 520;
/** 时间轴六步都完成（代码版 cur < 0）：之后料碗不再发光 */
const ALL = 'marinate >= 60 && in2 >= 1 && in3 >= 1 && cook >= 60 && in5 >= 1 && plated >= 1';
/** 这会儿该下哪样（料碗外圈发光） */
const NEXT: Record<number, string> = {
  1: 'in1 < 1',
  2: 'marinate >= 60 && in2 < 1 && oil_t >= 150 && oil_t <= 220',
  3: 'in2 >= 1 && in3 < 1',
  4: 'in3 >= 1 && cook >= 60 && in4 < 1',
  5: 'in4 >= 1 && in5 < 1',
};
const LIVE = 'in5 >= 1 && plated < 1';

export const CHEF_FIELD: FieldConfig = {
  master: 'field', bg: '#1c1a1a',
  shapes: [
    { kind: 'rect', x: 0, y: 640, w: 1600, h: 260, rx: 0, fill: '#2a2522' },
    // 阶段提示（时间轴上方那条）
    { kind: 'rect', x: 80, y: 40, w: 1440, h: 80, rx: 16, fill: 'rgba(12,16,32,.72)', color: 'rgba(255,255,255,.2)', width: 1.5 },
    { kind: 'text', x: 104, y: 90, color: '#ffd166', size: 24, weight: 800, text: '✓ 出锅了', textWhen: [
      { when: 'in1 < 1', text: '① 先腌：把腌料倒进鸡丁' },
      { when: 'marinate < 60 && in3 < 1', text: '① 腌着（{{marinate}} / 60 秒）· 这会儿可以开火热锅' },
      { when: 'in2 < 1 && oil_t < 150', text: '② 热锅：油温 {{oil_t}}℃，到 150–220℃ 下花椒辣椒' },
      { when: 'in2 < 1 && oil_t > 220', text: '② 油温高了，降火再下料' },
      { when: 'in2 < 1', text: '② 油温到了：下花椒辣椒' },
      { when: 'in3 < 1', text: '③ 爆香了：下鸡丁' },
      { when: 'in4 < 1', text: '④ 一直翻：鸡丁变色（熟度 60%+）再下花生葱' },
      { when: 'in5 < 1', text: '⑤ 下调味汁' },
      { when: 'plated < 1', text: '⑥ 收汁 {{sauce}}%：到 55–90% 出锅' },
    ] },
    { kind: 'text', x: 80, y: 150, text: '料台 · 点一下下锅', color: '#fff', size: 17, weight: 700 },
    // 锅上 / 锅下的字
    { kind: 'text', x: X, y: Y - 170, anchor: 'middle', text: '糊味！', color: '#ff5fa2', size: 22, weight: 800, when: 'burn > 15' },
    { kind: 'text', x: X, y: Y + 200, anchor: 'middle', color: '#c7cbe6', size: 15, weight: 400, text: '在锅里来回拖 = 翻炒', textWhen: [{ when: 'in3 >= 1 && plated < 1', text: '在锅里来回拖 = 翻炒 · 离上次 {{since_toss}} 秒' }] },
    // 火力面板
    { kind: 'rect', x: 1180, y: 560, w: 340, h: 120, rx: 16, fill: 'rgba(12,16,32,.7)', color: 'rgba(255,255,255,.22)', width: 2 },
    { kind: 'text', x: 1200, y: 590, text: '火力 · FIRE', color: '#9aa0b8', size: 13, weight: 400, spacing: 2 },
    { kind: 'text', x: 1200, y: 700, text: '油温 {{oil_t}}℃', color: '#ffd166', colorWhen: [{ when: 'oil_t > 240', color: '#ff5fa2' }, { when: 'oil_t >= 150', color: '#3ddc97' }], size: 26, weight: 800, mono: true },
    { kind: 'text', x: 1200, y: 726, color: '#9aa0b8', size: 13, weight: 400, text: '熟度 {{cook}}% · 收汁 {{sauce}}%', textWhen: [{ when: 'burn > 0', text: '熟度 {{cook}}% · 收汁 {{sauce}}% · 糊 {{burn}}' }] },
  ],
  subjects: [{ plugin: 'wok', x: X, y: Y, params: {
    fire: 'fire', heat: 'clamp((oil_t - 25) / 300, 0, 1)', smoke: 'oil_t > 240', shake: 'in3 >= 1 && plated < 1 && since_toss < 1',
    l1: 'in2 >= 1', l2: 'in3 >= 1', l3: 'in4 >= 1', l4: 'in5 >= 1', sauce: 'sauce',
    done: 'burn > 40 ? 4 : cook >= 100 ? 3 : cook > 60 ? 2 : cook > 25 ? 1 : 0',
  } }],
  drags: [{ id: 'toss', x: X, y: Y, rx: 260, ry: 150, every: 160, cursor: '🥄', title: '在锅里来回拖 = 翻炒', action: { onlyWhen: 'plated < 1', act: [{ control: 'toss' }] } }],
  cards: {
    x: 76, y: 180, w: 368, h: 72, cols: 1, gy: 24, iconSize: 30, labelSize: 17, iconX: 24, labelX: 74, cooldown: 400,
    items: INGREDIENTS.map(it => ({
      label: it.label, icon: it.icon, labelWhen: [{ when: `in${it.v} >= 1`, text: `${it.label} · 已下` }],
      dimWhen: `in${it.v} >= 1`, glowWhen: `(${NEXT[it.v]}) && !(${ALL})`,
      action: { act: [{ control: 'add', value: it.v }] },
    })),
  },
  buttons: [
    ...['关', '小', '中', '大'].map((l, i) => ({ x: 1200 + i * 78, y: 606, w: 68, h: 54, label: l, size: 18, style: 'seg' as const, litWhen: `fire == ${i}`, litColor: i === 3 ? '#ff8a5f' : i ? '#6a5cff' : '#3b4254', action: { act: [{ control: 'fire', value: i }] } })),
    {
      x: 1180, y: 440, w: 340, h: 90, rx: 16, size: 22, style: 'seg', label: '出锅装盘', labelWhen: [{ when: 'plated >= 1', text: '已出锅' }],
      colorWhen: [{ when: `${LIVE} && sauce >= 55 && sauce <= 90`, color: '#3ddc97' }, { when: LIVE, color: '#ffd166' }, { when: 'plated >= 1', color: 'rgba(255,255,255,.08)' }],
      inkWhen: [{ when: LIVE, color: '#0f1224' }],
      sub: '调味汁下了、收到位再点', subInk: '#9aa0b8', subWhen: [{ when: `${LIVE} && sauce < 55`, text: '汁还稀，再收一会儿' }, { when: `${LIVE} && sauce > 90`, text: '收过头了，快出' }, { when: LIVE, text: '现在正好' }],
      action: { onlyWhen: LIVE, act: [{ control: 'plate' }] },
    },
  ],
  steps: [
    { label: '腌 1 分钟', done: 'marinate >= 60' }, { label: '热锅 150–220℃', done: 'in2 >= 1' }, { label: '花椒辣椒 → 鸡丁', done: 'in3 >= 1' },
    { label: '一直翻（≥ 60% 熟）', done: 'cook >= 60' }, { label: '花生葱 → 调味汁', done: 'in5 >= 1' }, { label: '收汁 55–90% 出锅', done: 'plated >= 1' },
  ],
  stepsAt: { x: 80, y: 760, w: 1440, cols: 6, h: 110, link: true, footer: '1 秒真实 = 4 秒模拟 · 腌的时候可以先开火热锅，但别空烧到冒烟' },
};

export function chefFieldSpec(image: string): BenchSpec {
  return { ...chefSpec(image), surface: 'field', surfaceConfig: CHEF_FIELD };
}
