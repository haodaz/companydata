/**
 * 变电站验电挂地线 · 母版 B（field）纯配置版（2026-10-12）：和 surfaces/Switching.tsx 画的、点的、说的一样，但全是数据，
 * 可以整份存进库（BenchSpec.surfaceConfig），以后生成 agent 照这个样子填。物理（vars / rules / goals / 老手脚本）原样沿用 switchingSpec。
 * 代码版 Switching.tsx 保留当保底 / 精细调整用。
 */
import type { BenchSpec } from '@/lib/bench';
import type { FieldConfig, MasterShape } from '@/lib/lab-masters';
import { SW_TOOLS, switchingSpec } from '@/lib/lab-switching-spec';

/** 刀闸：上下两段引线 + 两个触点 + 刀片（open 时斜开，half = 没分到位） */
const knife = (x: number, y: number, name: string, half = false): MasterShape[] => [
  { kind: 'line', x, y: y - 50, x2: x, y2: y - 22, width: 6 },
  { kind: 'line', x, y: y + 22, x2: x, y2: y + 50, width: 6 },
  { kind: 'circle', x, y: y - 22, r: 6 }, { kind: 'circle', x, y: y + 22, r: 6 },
  { kind: 'line', x, y: y + 22, x2: x + (half ? 18 : 34), y2: y - 22 + (half ? 8 : 16), width: 7, color: half ? '#ff5fa2' : '#ffd166' },
  { kind: 'text', x: x + 48, y: y - 4, text: name, color: '#fff', size: 16, weight: 800 },
];

export const SWITCHING_FIELD: FieldConfig = {
  master: 'field',
  tools: SW_TOOLS, toolControl: 'tool', toolsAt: { x: 40, y: 40 },
  panels: [{
    x: 40, y: 130, w: 360, h: 300, tone: 'paper', title: '倒闸操作票 · 清枫线 112 转检修',
    lines: [
      { text: '1 核对 112 断路器在分位', done: 'p112 == 1' }, { text: '2 核对 1121 母线侧刀闸在分位', done: 'found == 1' },
      { text: '3 核对 1123 线路侧刀闸在分位', done: 'p1123 == 1' }, { text: '4 线路侧验电确认无电', done: 'v_line == 1' },
      { text: '5 线路侧装设 1 组接地线', done: 'grounded == 1' }, { text: '6 悬挂「在此工作」标示牌', done: 'tagged == 1' },
      { text: '7 向调度回令', done: 'done == 1' },
    ],
    footer: '监护：陈工 · 操作：你 · 每一项先唱票、复诵，核对后再执行',
  }],
  shapes: [
    // 一次接线
    { kind: 'rect', x: 470, y: 40, w: 620, h: 820, rx: 18, fill: 'rgba(10,12,30,.55)', color: 'rgba(255,255,255,.14)' },
    { kind: 'text', x: 780, y: 78, anchor: 'middle', text: '110 kV 清枫线 112 间隔', color: '#ffd166', size: 18, weight: 800 },
    { kind: 'line', x: 500, y: 130, x2: 1060, y2: 130, width: 10, color: '#ff5fa2' },
    { kind: 'text', x: 1060, y: 118, anchor: 'end', text: '110 kV Ⅰ 母 · 带电', color: '#ff5fa2', size: 14, weight: 800 },
    { kind: 'line', x: 780, y: 130, x2: 780, y2: 230, width: 6, color: '#ff5fa2' },
    ...knife(780, 280, '1121 母线侧刀闸', true),
    { kind: 'text', x: 828, y: 300, size: 12.5, color: '#9aa0b8', colorWhen: [{ when: 'found == 1', color: '#ff5fa2' }], text: '后台「分」· 现场位置：待核对', textWhen: [{ when: 'found == 1', text: '后台「分」· 现场：刀口只开一半，未分到位' }] },
    { kind: 'line', x: 780, y: 330, x2: 780, y2: 380, width: 6 },
    { kind: 'rect', x: 752, y: 380, w: 56, h: 80, fill: '#2b3040', color: '#c7cbe6', width: 3 },
    { kind: 'text', x: 780, y: 428, anchor: 'middle', text: '分', color: '#3ddc97', size: 16, weight: 800 },
    { kind: 'text', x: 828, y: 420, text: '112 断路器', color: '#fff', size: 16, weight: 800 },
    { kind: 'text', x: 828, y: 440, size: 12.5, color: '#9aa0b8', colorWhen: [{ when: 'p112 == 1', color: '#3ddc97' }], text: '后台「分」· 现场位置：待核对', textWhen: [{ when: 'p112 == 1', text: '后台「分」· 机械指示「分」' }] },
    { kind: 'line', x: 780, y: 460, x2: 780, y2: 510, width: 6 },
    ...knife(780, 560, '1123 线路侧刀闸'),
    { kind: 'text', x: 828, y: 580, size: 12.5, color: '#9aa0b8', colorWhen: [{ when: 'p1123 == 1', color: '#3ddc97' }], text: '后台「分」· 现场位置：待核对', textWhen: [{ when: 'p1123 == 1', text: '后台「分」· 刀口拉开到位' }] },
    { kind: 'line', x: 780, y: 610, x2: 780, y2: 760, width: 6, colorWhen: [{ when: 'v_line == 1', color: '#3ddc97' }] },
    { kind: 'text', x: 828, y: 690, text: '线路侧 · 验电点 / 接地线挂点', size: 14, weight: 700 },
    { kind: 'text', x: 828, y: 710, size: 12.5, color: '#9aa0b8', colorWhen: [{ when: 'v_line == 1', color: '#3ddc97' }], text: '未验电', textWhen: [{ when: 'v_line == 1', text: '已验电：无电' }] },
    // 接地线
    { kind: 'circle', x: 620, y: 800, r: 14, fill: '#3b4254', color: '#c7cbe6', width: 3 },
    { kind: 'text', x: 620, y: 835, anchor: 'middle', text: '接地桩', color: '#9aa0b8', size: 12 },
    { kind: 'path', d: 'M 620 800 Q 700 820 700 820', color: '#3ddc97', width: 5, dash: '8 6', when: 'g_earth_done == 1 && g_cond_done == 0' },
    { kind: 'path', d: 'M 620 800 Q 700 740 780 740', color: '#3ddc97', width: 5, dash: '8 6', when: 'g_earth_done == 1 && g_cond_done == 1' },
    { kind: 'circle', x: 780, y: 740, r: 9, fill: '#3ddc97', when: 'grounded == 1' },
    { kind: 'text', x: 700, y: 860, anchor: 'middle', size: 12.5, color: '#9aa0b8', colorWhen: [{ when: 'grounded == 1', color: '#3ddc97' }], text: '接地线未装', textWhen: [{ when: 'grounded == 1', text: '接地线：接地端 ✓ 导体端 ✓' }, { when: 'g_earth_done == 1', text: '接地端已接 · 再接导体端' }] },
    { kind: 'rect', x: 850, y: 780, w: 120, h: 40, rx: 6, fill: '#ffd166', when: 'tagged == 1' },
    { kind: 'text', x: 910, y: 806, anchor: 'middle', text: '在此工作', color: '#5a1a1a', size: 14, weight: 800, when: 'tagged == 1' },
    { kind: 'line', x: 780, y: 760, x2: 780, y2: 860, width: 6 },
    { kind: 'text', x: 780, y: 880, anchor: 'middle', text: '→ 清枫线', size: 13 },
    // 安全遮栏 + 相邻带电间隔
    { kind: 'line', x: 1120, y: 60, x2: 1120, y2: 860, width: 6, color: '#ffd166', dash: '22 14' },
    { kind: 'text', x: 1132, y: 90, text: '安全遮栏 · 止步 高压危险', color: '#ffd166', size: 13, weight: 800 },
    { kind: 'rect', x: 1150, y: 120, w: 400, h: 300, rx: 14, fill: 'rgba(255,95,162,.08)', color: 'rgba(255,95,162,.4)' },
    { kind: 'text', x: 1350, y: 160, anchor: 'middle', text: '113 间隔 · 运行中 · 带电', color: '#ff5fa2', size: 16, weight: 800 },
    { kind: 'line', x: 1350, y: 190, x2: 1350, y2: 390, width: 6, color: '#ff5fa2' },
    { kind: 'text', x: 1350, y: 300, anchor: 'middle', text: '（别过去）', color: '#ff5fa2', size: 13 },
    { kind: 'text', x: 1350, y: 445, anchor: 'middle', text: '已记录：跨越安全遮栏', color: '#ff2f4f', size: 14, weight: 800, when: 'crossed == 1' },
    // 调度电话
    { kind: 'rect', x: 1150, y: 460, w: 400, h: 120, rx: 14, fill: 'rgba(12,16,32,.7)', color: 'rgba(255,255,255,.22)' },
    { kind: 'text', x: 1170, y: 490, text: '☎ 调度 · 林岚', color: '#ffd166', size: 14, weight: 800 },
    { kind: 'rect', x: 1150, y: 600, w: 400, h: 50, rx: 10, fill: '#ff2f4f', when: 'g_live == 1' },
    { kind: 'text', x: 1350, y: 631, anchor: 'middle', text: '带电挂地线：弧光短路，人员受伤', color: '#fff', size: 15, weight: 800, when: 'g_live == 1' },
  ],
  hotspots: [
    { id: 'name', x: 40, y: 130, w: 360, h: 60, title: '核对双重名称', action: { act: [{ control: 'check_name' }], say: '名牌：110 kV 清枫线 112 间隔 · 112 断路器 / 1121 母线侧刀闸 / 1123 线路侧刀闸 · 与操作票一致' } },
    { id: 'p1121', x: 740, y: 230, w: 320, h: 100, title: '核对 1121 位置', action: { act: [{ control: 'pos_1121' }], say: '⚠ 1121 刀闸：后台显示「分」，现场刀口只开了一半——没分到位，母线侧仍视为带电' } },
    { id: 'p112', x: 740, y: 380, w: 320, h: 80, title: '核对 112 位置', action: { act: [{ control: 'pos_112' }], say: '112 断路器：后台「分」，机械指示「分」，一致' } },
    { id: 'p1123', x: 740, y: 510, w: 320, h: 100, title: '核对 1123 位置', action: { act: [{ control: 'pos_1123' }], say: '1123 刀闸：后台「分」，刀口已拉开到位，一致' } },
    { id: 'test', x: 500, y: 140, w: 560, h: 70, title: '验电器自检（母线侧带电处）', action: { needTool: 1, toolMsg: '拿验电器', act: [{ control: 'test_dev' }], say: '验电器在母线侧带电处自检：声光正常', flash: { x: 780, y: 180 } } },
    { id: 'vbus', x: 500, y: 212, w: 220, h: 100, title: '母线侧验电', action: { needTool: 1, toolMsg: '拿验电器', act: [{ control: 'verify_bus' }], say: '母线侧验电：亮了！有电——1121 果然没分到位', flash: { x: 780, y: 180 } } },
    { id: 'gbus', x: 500, y: 312, w: 220, h: 60, title: '在母线侧挂接地线', action: { needTool: 2, toolMsg: '拿接地线', act: [{ control: 'g_bus' }], say: '在带电的母线侧挂接地线——弧光短路' } },
    { id: 'vline', x: 500, y: 620, w: 220, h: 120, title: '线路侧验电', action: { needTool: 1, toolMsg: '拿验电器', act: [{ control: 'verify_line' }], say: '线路侧验电：不亮……但验电器还没自检过，不亮不等于无电', sayWhen: [{ when: 'tested == 1', text: '线路侧验电：不亮不响——无电' }], flash: { x: 780, y: 690, color: '#3ddc97' } } },
    { id: 'gearth', x: 580, y: 770, w: 80, h: 60, title: '接地线：接接地端', action: { needTool: 2, toolMsg: '拿接地线', act: [{ control: 'g_earth' }], say: '接地线接地端已夹在接地桩上' } },
    { id: 'gcond', x: 740, y: 700, w: 80, h: 80, title: '接地线：接导体端', action: { needTool: 2, toolMsg: '拿接地线', act: [{ control: 'g_cond' }], say: '导体端先挂上去了——接地端还没接，这根线是悬着的', sayWhen: [{ when: 'g_earth_done == 1', text: '接地线导体端已挂上线路侧导体' }] } },
    { id: 'tag', x: 850, y: 770, w: 120, h: 60, title: '挂标示牌', action: { needTool: 3, toolMsg: '拿标示牌', act: [{ control: 'tag' }], say: '「在此工作」标示牌已挂' } },
    { id: 'cross', x: 1150, y: 120, w: 400, h: 300, title: '跨越遮栏', action: { act: [{ control: 'cross' }], say: '⚠ 跨越安全遮栏进入了 113 带电间隔' } },
  ],
  buttons: [
    { x: 1170, y: 505, w: 170, h: 54, label: '汇报异常', labelWhen: [{ when: 'reported == 1', text: '异常已汇报' }], litWhen: 'found == 1 && reported == 0', litColor: '#ff8a5f', action: { act: [{ control: 'report_abn' }], say: '已汇报调度：1121 未分到位，申请现场补拉；线路侧措施按票继续' } },
    { x: 1360, y: 505, w: 170, h: 54, label: '回令', labelWhen: [{ when: 'done == 1', text: '已回令' }], litWhen: 'grounded == 1 && tagged == 1 && done == 0', action: { act: [{ control: 'report' }], say: '回令了，但安全措施还没做完', sayWhen: [{ when: 'grounded == 1 && tagged == 1', text: '已向调度回令：112 间隔安全措施布置完毕' }] } },
  ],
  steps: [
    { label: '核对名称、112 / 1121 / 1123 实际位置', done: 'name_ok == 1 && p112 == 1 && p1123 == 1 && found == 1' },
    { label: '1121 没分到位 → 汇报调度', done: 'reported == 1' },
    { label: '验电器先自检，再线路侧验电', done: 'tested == 1 && v_line == 1', tool: 1 },
    { label: '接地线：先接地端、后导体端', done: 'grounded == 1', tool: 2 },
    { label: '挂标示牌', done: 'tagged == 1', tool: 3 },
    { label: '向调度回令', done: 'done == 1' },
  ],
  stepsAt: { x: 1150, y: 680, w: 400 },
  sayAt: { x: 470, y: 0, w: 620 },
};

export function switchingFieldSpec(image: string): BenchSpec {
  return { ...switchingSpec(image), surface: 'field', surfaceConfig: SWITCHING_FIELD };
}
