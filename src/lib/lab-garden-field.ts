/**
 * 花房 · 救龟背竹 · 母版 B（field）纯配置版（2026-10-12）：和 surfaces/Garden.tsx 画的、点的、说的一样，全是数据。
 *   中央盆栽是主体插件 plant（叶色 / 水光 / 新盆 / 新叶都由表达式驱动）；8 张动作卡片（点一下 act = n，0.6 秒后回 0，整组 0.4 秒防连点）；
 *   「过一天」就是一个普通按钮（skip）；观察框 = note 样式的读数牌；养护日记 = logs（day 每涨一天记一句）。
 * 物理（vars / rules / goals / 老手脚本）原样沿用 gardenSpec；代码版 Garden.tsx 留着当保底。
 */
import type { BenchSpec } from '@/lib/bench';
import type { FieldConfig, MasterAction, MasterShape } from '@/lib/lab-masters';
import { GARDEN_ACTS, gardenSpec } from '@/lib/lab-garden-spec';

/** 每张卡片说的「你看到的」：按点下去那一刻的状态挑 */
const OBS: Record<number, { text: string; textWhen?: { when: string; text: string }[] }> = {
  1: { text: '摸土：表层到两指深都是湿的，盆底一摸——没有排水孔，盆托里积着水。' },
  2: { text: '脱盆：剪过的根切口干净，已经冒出几条白色新根。', textWhen: [{ when: 'root < 50', text: '脱盆：土团湿冷发黏，根有一半发黑发软、一捏就烂，有股酸味；白色健康根只剩几条。' }] },
  3: { text: '浇水：浇透，盆底孔有水流出。', textWhen: [{ when: 'wet > 50', text: '浇水：水从盆面漫出来，土根本吸不动。' }] },
  4: { text: '施肥：按说明兑了一次液肥浇下去。', textWhen: [{ when: 'rooted >= 1', text: '施肥：根都烂了，肥只会烧根——你明知道还是施了。' }] },
  5: { text: '修剪：剪掉发黑发软的根和两片黄叶，切口撒了点草木灰。' },
  6: { text: '换盆：换了一半椰糠一半树皮的透气土，盆底带排水孔。' },
  7: { text: '挪位：放到窗边散射光处，离空调出风口远远的。' },
  8: { text: '杀菌剂：喷了一遍叶面和土表。' },
};
const card = (v: number): MasterAction => ({
  act: [{ control: 'act', value: v }, { control: 'act', value: 0, delay: 600 }],
  readout: { title: '你看到的', ...OBS[v] },
});

/** 脱盆后看到的根：7 条，健康比例以内的是白根，其余发黑 */
const roots: MasterShape[] = Array.from({ length: 7 }, (_, i) => {
  const d = `M ${1090 + i * 30} 570 q ${i % 2 ? 8 : -8} 60 ${(i % 3 - 1) * 12} 130`;
  return [
    { kind: 'path', d, color: '#f3ead8', width: 5, when: `rooted >= 1 && root * 7 > ${i * 100}` },
    { kind: 'path', d, color: '#4a2f22', width: 7, opacity: 0.8, when: `rooted >= 1 && root * 7 <= ${i * 100}` },
  ] as MasterShape[];
}).flat();

export const GARDEN_FIELD: FieldConfig = {
  master: 'field', bg: '#2d3a2f',
  shapes: [
    { kind: 'rect', x: 0, y: 620, w: 1600, h: 280, rx: 0, fill: '#5b4a3a' },
    // 空调出风口（挪走就不画）
    { kind: 'rect', x: 1180, y: 60, w: 300, h: 60, rx: 10, fill: '#dfe4ec', color: '#9aa3b1', width: 3, when: 'moved < 1' },
    ...[0, 1, 2, 3, 4].map(i => ({ kind: 'line', x: 1200 + i * 60, y: 75, x2: 1240 + i * 60, y2: 105, color: '#9aa3b1', width: 4, when: 'moved < 1' }) as MasterShape),
    ...[0, 1, 2].map(i => ({ kind: 'path', d: `M ${1220 + i * 90} 130 q 20 40 0 80 q -20 40 0 80`, color: '#bfe0ff', width: 3, opacity: 0.7, pulse: 1 + i * 0.3, when: 'moved < 1' }) as MasterShape),
    { kind: 'text', x: 1330, y: 48, anchor: 'middle', text: '空调出风口 · 一直吹着', color: '#c7cbe6', size: 14, weight: 400, when: 'moved < 1' },
    // 盆底提示（换盆前）
    { kind: 'text', x: 800, y: 735, anchor: 'middle', text: '？', textWhen: [{ when: 'looked >= 1', text: '盆底没排水孔 · 盆托积水' }], color: '#ff8a5f', size: 13, weight: 400, when: 'repot < 1' },
    // 根（脱盆后看得到）
    { kind: 'rect', x: 1060, y: 530, w: 240, h: 200, rx: 12, fill: 'rgba(12,16,32,.62)', color: 'rgba(255,255,255,.22)', width: 2, when: 'rooted >= 1' },
    { kind: 'text', x: 1180, y: 554, anchor: 'middle', text: '根系 · {{root}}', color: '#9aa0b8', size: 12, weight: 400, spacing: 2, when: 'rooted >= 1' },
    ...roots,
    { kind: 'text', x: 1180, y: 722, anchor: 'middle', size: 13, weight: 700, color: '#3ddc97', colorWhen: [{ when: 'root < 40', color: '#ff5fa2' }], text: '白根密实', textWhen: [{ when: 'root < 40', text: '一半以上发黑发软' }, { when: 'root < 65', text: '切口干净，新根冒头' }], when: 'rooted >= 1' },
    // 动作面板底
    { kind: 'rect', x: 60, y: 200, w: 520, h: 390, rx: 16, fill: 'rgba(12,16,32,.62)', color: 'rgba(255,255,255,.22)', width: 2 },
    { kind: 'text', x: 80, y: 228, text: '动作 · 先看，再做', color: '#9aa0b8', size: 12, weight: 400, spacing: 2 },
    // 日记底下的状态行
    { kind: 'text', x: 1180, y: 480, text: '湿度 {{wet}}% · 根 {{root}} · 叶 {{leaf}} · 空调风口', textWhen: [{ when: 'moved >= 1', text: '湿度 {{wet}}% · 根 {{root}} · 叶 {{leaf}} · 散射光' }], color: '#9aa0b8', size: 12, weight: 400 },
  ],
  subjects: [{ plugin: 'plant', x: 800, y: 520, params: { leaf: 'leaf', sheen: 'max(0, (wet - 50) / 100)', pot: 'repot >= 1', cut: 'cut >= 1', sprout: 'new_leaf >= 1' } }],
  cards: {
    x: 80, y: 244, w: 236, h: 66, cols: 2, gx: 14, gy: 16, iconSize: 26, labelSize: 16, iconX: 18, labelX: 60, cooldown: 400,
    items: GARDEN_ACTS.map(a => ({ label: a.label, icon: a.icon, fill: a.kind === 'look' ? 'rgba(18,181,203,.22)' : 'rgba(255,255,255,.12)', action: card(a.v) })),
  },
  buttons: [{
    x: 60, y: 610, w: 520, h: 80, rx: 16, size: 24, color: '#6a5cff', label: '⏩ 过一天（第 {{day}} 天）', sub: '做完决定按这里，看第二天有什么变化',
    action: { act: [{ control: 'skip' }] },
  }],
  logs: [{
    x: 1160, y: 60, w: 380, h: 440, title: '养护日记', on: 'day', show: 8, chars: 26, gap: 44,
    initial: ['第 0 天：客户送来。下面两片叶子黄了、发软，土看着是湿的。'],
    lines: [
      { when: 'new_leaf >= 1', once: true, text: '第 {{day}} 天：茎顶冒出一片卷着的新叶。' },
      { when: 'root < 20', text: '第 {{day}} 天：又一片叶子软了，茎基部发黑。' },
      { when: 'leaf < 35 && wet > 60', text: '第 {{day}} 天：黄叶没好转，土还是湿的。' },
      { when: 'leaf < 35', text: '第 {{day}} 天：黄叶没好转，土开始干了。' },
      { when: 'root > 55', text: '第 {{day}} 天：没再掉叶子，老叶挺起来了一点。' },
      { when: 'wet > 60', text: '第 {{day}} 天：看着差不多，土还湿。' },
      { text: '第 {{day}} 天：看着差不多，土干了些。' },
    ],
  }],
  readoutAt: { x: 60, y: 60, w: 520, h: 120, style: 'note', chars: 30, maxLines: 3, placeholder: { title: '你看到的', text: '客户说：「天天浇水，上周还施了肥，怎么越来越差？」先别急着动手，看一看。' } },
  steps: [
    { label: '摸土、看盆底', done: 'looked >= 1' }, { label: '脱盆看根', done: 'rooted >= 1' }, { label: '剪烂根 + 黄叶', done: 'cut >= 1' },
    { label: '换透气土 + 有孔盆', done: 'repot >= 1' }, { label: '挪到散射光', done: 'moved >= 1' },
    { label: '等 3 天再浇第一次水', done: 'water_n >= 1 && early_water == 0 && day_since_repot >= 3' }, { label: '长出新叶', done: 'new_leaf >= 1' },
  ],
  stepsAt: { x: 620, y: 744, w: 920, cols: 4, title: '救龟背竹：看 → 剪 → 换 → 挪 → 等 → 新叶', titleSize: 20, h: 128 },
};

export function gardenFieldSpec(image: string): BenchSpec {
  return { ...gardenSpec(image), surface: 'field', surfaceConfig: GARDEN_FIELD };
}
