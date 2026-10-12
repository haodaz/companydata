/**
 * 转炉炼钢（302 炉吹炼终点控制）· 母版 C（console）纯配置版（2026-10-12）：左主控屏（旋钮、按钮、碳-温曲线），右炉口实景叠层
 * （氧枪随枪位升降、火焰随供氧变大、渣位、冷却水报警）。和 surfaces/Converter.tsx 一样，全是数据；物理沿用 converterSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { FieldConfig, MasterShape } from '@/lib/lab-masters';
import { C_BAND, T_BAND, converterSpec } from '@/lib/lab-converter-spec';

/** 火焰强度 0–1、氧枪头的 y（枪位 3.0 → 120 炉口上方，1.0 → 420 深入） */
const F = '(blowing >= 1 ? min(1, 0.25 + o2 / 100 * 0.75) : 0)';
const LY = '(120 + (3 - lance) * 150)';
const BLOW = 'blowing >= 1';

const flame: MasterShape[] = [
  { kind: 'ellipse', x: 1250, y: 470, rx: `120 + ${F} * 120`, ry: `60 + ${F} * 70`, fill: '#ff6a2f', opacity: `${F} * 0.45`, blur: 'lg', when: BLOW },
  { kind: 'ellipse', x: 1250, y: 440, rx: `70 + ${F} * 80`, ry: `40 + ${F} * 60 + abs(((t * 6) % 2) - 1) * 12`, fill: '#ffb86b', opacity: `${F} * 0.75`, blur: 'sm', when: BLOW },
  { kind: 'ellipse', x: 1250, y: 430, rx: `30 + ${F} * 40`, ry: `18 + ${F} * 30`, fill: '#fff6d6', opacity: `${F} * 0.9`, when: BLOW },
  { kind: 'sparks', x: 1250, y: 400, w: `2 * (60 + ${F} * 120)`, h: 160, count: `6 + ${F} * 10`, opacity: F, when: BLOW },
];

export const CONVERTER_CONSOLE: FieldConfig = {
  master: 'console', dim: 0.25,
  panels: [{ x: 40, y: 40, w: 680, h: 820, tone: 'dark', title: '302 炉 主控 · 吹炼' }],
  shapes: [
    // 阶段提示：按优先级第一个命中的
    { kind: 'text', x: 60, y: 88, wrap: 640, size: 12.5, color: '#c7cbe6', text: '碳低于 0.3，脱碳变慢：收氧、提枪，别过烧', textWhen: [
      { when: 'tapped >= 1', text: '已出钢 · 去溅渣护炉' }, { when: 'tip_burn >= 1', text: '枪头烧穿——停炉' },
      { when: 'water < 80 && lance >= 2.2 && o2 <= 30', text: '冷却水掉了：已提枪降氧，等流量恢复' }, { when: 'water < 80', text: '⚠ 氧枪冷却水流量掉了：立刻提枪、降氧！' },
      { when: 'meas_ok >= 1', text: '测温定碳在窗口：停吹提枪 → 挡渣 → 底吹氩 → 出钢' }, { when: 'in_band >= 1', text: '碳温都进窗口了：副枪测温定碳' },
      { when: 'carbon > 1 && slag < 45', text: '前期：高枪小氧化渣，石灰造渣' }, { when: 'carbon > 1', text: '降枪大氧脱碳，看温度冲高就加矿' },
      { when: 'carbon > 0.3', text: '主脱碳期：盯住碳和温度，临近终点准备收氧' },
    ] },
    { kind: 'text', x: 66, y: 810, text: '数采点：温度 · 碳 · 枪位 · 供氧 · 冷却水 · 渣位（每 0.25 s 一帧，进事件流）', color: '#9aa0b8', size: 11.5 },
    // 炉口：氧枪
    { kind: 'rect', x: 1238, y: 0, w: 24, h: LY, rx: 0, fill: '#3b4254', color: '#8a93a6' },
    { kind: 'rect', x: 1230, y: `${LY} - 10`, w: 40, h: 18, rx: 4, fill: '#6b7089', color: '#c7cbe6', when: 'tip_heat <= 40' },
    { kind: 'rect', x: 1230, y: `${LY} - 10`, w: 40, h: 18, rx: 4, fill: '#ff2f4f', color: '#c7cbe6', pulse: true, when: 'tip_heat > 40' },
    { kind: 'text', x: 1290, y: `${LY} + 4`, size: 12.5, weight: 700, text: '氧枪 {{lance:1}} m', textWhen: [{ when: 'lance >= 2.6', text: '氧枪 {{lance:1}} m（提出）' }, { when: 'lance >= 1.9', text: '氧枪 {{lance:1}} m（高枪）' }, { when: 'lance <= 1.5', text: '氧枪 {{lance:1}} m（低枪）' }] },
    { kind: 'ellipse', x: 1250, y: `${LY} + 36 + o2 * 0.2`, rx: '10 + o2 * 0.3', ry: '28 + o2 * 0.2', fill: '#bfe8ff', opacity: '0.35 + o2 / 300', when: BLOW },
    ...flame,
    { kind: 'text', x: 1250, y: 560, anchor: 'middle', text: '喷溢！渣从炉口涌出来', color: '#ff5fa2', size: 18, weight: 800, when: 'spit >= 1' },
    { kind: 'text', x: 1250, y: 590, anchor: 'middle', text: '枪头烧穿 · 停炉', color: '#ff2f4f', size: 20, weight: 800, when: 'tip_burn >= 1' },
    // 冷却水
    { kind: 'rect', x: 1180, y: 50, w: 380, h: 74, rx: 12, fill: 'rgba(12,16,32,.7)', color: 'rgba(255,255,255,.3)', when: 'water >= 80' },
    { kind: 'rect', x: 1180, y: 50, w: 380, h: 74, rx: 12, fill: 'rgba(255,47,79,.85)', color: 'rgba(255,255,255,.3)', pulse: true, when: 'water < 80' },
    { kind: 'text', x: 1200, y: 78, color: '#fff', size: 13, weight: 800, text: '氧枪冷却水 {{water}}% · 正常', textWhen: [{ when: 'water < 80', text: '氧枪冷却水 {{water}}% · 流量低报警' }] },
    { kind: 'text', x: 1200, y: 102, color: '#fff', size: 12, text: '枪头过热 {{tip_heat}} / 100', textWhen: [{ when: 'water < 80', text: '枪头过热 {{tip_heat}} / 100 · 提枪 ≥ 2.2 m、供氧 ≤ 30%' }] },
    // 读数牌
    { kind: 'rect', x: 1180, y: 600, w: 380, h: 120, rx: 12, fill: 'rgba(12,16,32,.7)', color: 'rgba(255,255,255,.22)' },
    { kind: 'text', x: 1200, y: 630, text: '熔池 · 模型估算', color: '#ffd166', size: 13, weight: 800 },
    { kind: 'text', x: 1200, y: 660, color: '#fff', size: 22, weight: 800, mono: true, text: 'C {{carbon:2}} %', textWhen: [{ when: 'carbon < 1', text: 'C {{carbon:3}} %' }] },
    { kind: 'text', x: 1200, y: 694, color: '#fff', size: 22, weight: 800, mono: true, text: 'T {{temp}} ℃' },
    { kind: 'text', x: 1400, y: 660, size: 12, weight: 800, color: '#9aa0b8', colorWhen: [{ when: 'in_band >= 1', color: '#3ddc97' }], text: '未到窗口', textWhen: [{ when: 'in_band >= 1', text: '碳温在窗口' }] },
    { kind: 'text', x: 1400, y: 694, text: `窗口 C ${C_BAND[0]}–${C_BAND[1]}`, color: '#9aa0b8', size: 11 },
  ],
  widgets: [
    { kind: 'knob', control: 'lance', label: '氧枪枪位', unit: 'm', min: 1, max: 3, step: 0.1, digits: 1, x: 170, y: 240, color: '#7cc8ff' },
    { kind: 'knob', control: 'o2', label: '供氧流量', unit: '%', min: 0, max: 100, step: 5, x: 460, y: 240, color: '#ff8a5f' },
    { kind: 'trend', x: 66, y: 580, w: 620, h: 200, series: [
      { expr: 'carbon', color: '#ffd166', min: 0, max: 4.5, band: C_BAND, label: '碳 %（黄框 = 终点窗口）' },
      { expr: 'temp', color: '#3ddc97', min: 1200, max: 1800, band: T_BAND, label: '温度 ℃（绿框 = 终点窗口）' },
    ] },
    { kind: 'bar', x: 1500, y: 330, w: 22, h: 200, expr: 'slag', min: 0, max: 100, label: '渣位', color: '#c9a24a', colorWhen: [{ when: 'slag > 75', color: '#ff5fa2' }, { when: 'slag < 10', color: '#ff8a5f' }] },
  ],
  buttons: [
    { x: 66, y: 370, w: 300, h: 52, label: '加活性石灰 −60 ℃ · 渣 +', color: '#6a5cff', action: { act: [{ control: 'lime' }] } },
    { x: 386, y: 370, w: 300, h: 52, label: '加冷却矿石 −110 ℃', color: '#12b5cb', action: { act: [{ control: 'ore' }] } },
    { x: 66, y: 436, w: 300, h: 52, label: '副枪测温定碳', labelWhen: [{ when: 'measured >= 1', text: '副枪已测 · 再测' }], litWhen: 'in_band >= 1 && measured == 0', litColor: '#12a150',
      action: { act: [{ control: 'sublance' }], sayWhen: [{ when: 'lance < 2.6', text: '副枪下去测了——氧枪还在炉里，注意别碰枪' }],
        readout: { title: '副枪测温定碳 · 实测', text: 'C {{carbon:3}} %  T {{temp}} ℃  ✗ 不在窗口', textWhen: [{ when: 'in_band >= 1', text: 'C {{carbon:3}} %  T {{temp}} ℃  ✓ 在窗口' }] } } },
    { x: 386, y: 436, w: 145, h: 52, label: '挡渣', labelWhen: [{ when: 'slag_held >= 1', text: '✓ 已挡渣' }], litWhen: 'slag_held >= 1', litColor: '#12a150', action: { act: [{ control: 'slag_stop' }] } },
    { x: 541, y: 436, w: 145, h: 52, label: '底吹氩', labelWhen: [{ when: 'argon == 1', text: '✓ 底吹氩 开' }], color: 'rgba(255,255,255,.1)', litWhen: 'argon == 1', litColor: '#3ddc97', action: { act: [{ control: 'argon', value: 'argon == 1 ? 0 : 1' }] } },
    { x: 66, y: 502, w: 620, h: 52, label: '出 钢', labelWhen: [{ when: 'tapped >= 1', text: '已出钢' }], color: '#8a2d3b', litWhen: 'meas_ok >= 1 && o2 <= 5 && tapped == 0', litColor: '#ff2f4f',
      action: { act: [{ control: 'tap' }], sayWhen: [{ when: 'measured == 0', text: '还没副枪测温定碳' }, { when: 'in_band == 0', text: '碳 / 温不在窗口，这炉钢出了也得回炉' }, { when: 'o2 > 5', text: '先停吹提枪' }] } },
  ],
  steps: [
    { label: '化渣', done: 'slag >= 45' }, { label: '碳<1%', done: 'carbon <= 1' }, { label: '水报警处置', done: 'water_ok >= 1' },
    { label: '进窗口', done: 'in_band >= 1 || meas_ok >= 1' }, { label: '副枪确认', done: 'meas_ok >= 1' }, { label: '出钢', done: 'tapped >= 1' },
  ],
  stepsAt: { x: 760, y: 790, w: 800, cols: 6, titleSize: 14, title: '化渣 → 降枪脱碳 → 冷却水报警提枪 → 碳温进窗 → 副枪 → 停吹 → 挡渣 → 底吹氩 → 出钢' },
  sayAt: { x: 40, y: 830, w: 680 }, readoutAt: { x: 1180, y: 726, w: 380, h: 56 },
};

export function converterConsoleSpec(image: string): BenchSpec {
  return { ...converterSpec(image), surface: 'console', surfaceConfig: CONVERTER_CONSOLE };
}
