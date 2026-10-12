/**
 * 验证工作站（Sensor_IF 握手死锁）· 母版 A（desktop）配置版（2026-10-12）：和 surfaces/ChipDesk.tsx 画的、点的、说的一样。
 *   dock 版面：左边五个图标（波形查看器 / RTL 编辑器 / 时序报告 / 定向仿真 / 交接说明），一次只开一个窗口、前台是哪个 = 控件 app，底部任务栏。
 *   RTL / 约束改法（隐藏控件 fix / sta）、反压、跑仿真、发送条件、各种解释和提示全是数据；
 *   只有 40 拍波形（按 RTL 版本算、画、光标解释）是插件 waveform（components/lab/masters/plugins/waveform.tsx 的 valid-ready 模型），参数也在这里。
 *   波形按「最近一次跑仿真时」的版本算：watch 盯 run 事件，把当时的 fix_sel / bp 记进 ui.sim_*（演示回放同样走这条）。
 *   物理（vars / rules / goals / 老手脚本）原样沿用 chipdeskSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DBlock, DesktopConfig } from '@/lib/masters/desktop';
import { CHIP_APPS, DEADLOCK_CYCLE, RTL_FIXES, STA_FIXES, chipdeskSpec } from '@/lib/lab-chipdesk-spec';

const GRAY = '#6b7089', GREEN = '#12a150', PINK = '#d6336c';
const EXPERT_NOTE = `交接说明 · Sensor_IF → Filter_Core
1. RTL 提交：sensor_if.v 握手改法——valid 只看 data_pending，不再依赖 ready（原逻辑 valid 等 ready、ready 等 valid，复位释放后第 6 拍起互等挂死）。
2. 约束修订：cfg_en 属 cfg_clk → sample_clk 跨时钟域，加两级同步器；SDC 里只对同步器第一级输入设 false path，原 cfg_en → filter_state 路径不再例外。
3. 回归：定向用例开反压（ready 间歇拉低），4 帧全部收到、无挂死；CDC 检查通过。
4. 请后端关注：同步器两级寄存器不要被优化合并；sample_clk 域内 filter_state 路径仍按正常时序收敛。`;
/** 能发交接说明：够字数、握手改对、带反压回归通过 */
const CAN_SEND = 'words >= 80 && fix_sel == 1 && regress_ok >= 1';
const app = (id: number) => CHIP_APPS.find(a => a.id === id)!;
const small = (text: string, extra: Partial<Extract<DBlock, { kind: 'text' }>> = {}): DBlock => ({ kind: 'text', text, size: 12.5, color: GRAY, ...extra });

/** 波形窗口：工具条 + 插件 */
const WAVE: DBlock[] = [
  { kind: 'box', dir: 'row', gap: 10, pad: '10px 14px', border: 'bottom', wrap: true, blocks: [
    { kind: 'button', tone: 'toggle', label: '▶ 跑仿真', labelWhen: [{ when: 'ran >= 1', text: '▶ 跑仿真（重跑）' }], litWhen: 'ran < 1', action: { set: [{ control: 'run' }] } },
    small('还没跑过仿真，波形是空的。', { textWhen: [{ when: 'ui.sim_ran == 1', text: 'RTL 版本：{{rtl_fixes[ui.sim_fix].short ?? 原始（有 bug）}} · 反压 {{onoff[ui.sim_bp].label}}' }] }),
    { kind: 'spacer' },
    small('光标：第 {{cursor:i}} 拍'),
    { kind: 'button', tone: 'toggle', label: '标记：死锁从这一拍开始', labelWhen: [{ when: 'mark_at >= 0', text: '已标记：第 {{mark_at:i}} 拍' }],
      litWhen: 'mark_at < 0', enabled: 'ui.sim_ran == 1', dimWhen: 'ui.sim_ran != 1', action: { set: [{ control: 'mark' }] } },
  ] },
  { kind: 'box', pad: 12, scroll: true, grow: true, blocks: [
    { kind: 'custom', plugin: 'waveform', exprs: ['ui.sim_fix', 'ui.sim_bp', 'ui.sim_ran == 1', 'mark_at', 'cursor'], controls: ['cursor'], props: {
      model: 'valid-ready', cycles: 40,
      params: { variant: 'ui.sim_fix', bp: 'ui.sim_bp' },
      consts: { reset: 4, frames: 4, busy: [8, 9, 15, 16, 22, 23], timeout: 30 },
      show: 'ui.sim_ran == 1', control: 'cursor', mark: 'mark_at',
      signals: [
        { label: 'clk', key: 'clk', color: '#9aa0b8' },
        { label: 'data_pending', key: 'pending', color: '#c7cbe6' },
        { label: 'valid', key: 'valid', color: '#ffb86b' },
        { label: 'ready', key: 'ready', color: '#7cc8ff' },
        { label: 'xfer', key: 'xfer', color: '#3ddc97', marks: [{ when: 'row.xfer == -1', text: '✕', color: '#ff5fa2' }] },
      ],
      // 状态行：收到绿；死锁那几拍（IDLE 还压着数据）红
      states: { key: 'state', color: GRAY, colorWhen: [{ when: 'row.sid == 3', color: '#3ddc97' }, { when: `row.sid == 1 && row.i >= ${DEADLOCK_CYCLE} && row.pending == 1`, color: '#ff5fa2' }] },
      idle: '点「跑仿真」，然后在波形上点一拍看解释。',
      explain: [
        { when: 'row.rst == 1', text: '第 {{row.i}} 拍：复位中，所有信号为 0。' },
        { when: 'row.xfer == 1', text: '第 {{row.i}} 拍：valid=1 且 ready=1，一拍握手成功，Filter_Core 收下一帧（累计 {{row.rx}}）。' },
        { when: 'row.xfer == -1', text: '第 {{row.i}} 拍：发送方以为对方收了，其实接收方正忙——这一帧丢了。' },
        { when: 'row.pending == 1 && row.valid == 0 && row.ready == 0', text: '第 {{row.i}} 拍：有数据（pending=1）但 valid=0、ready=0——发送方在等 ready，接收方在等 valid，互相等：死锁。' },
        { when: 'row.pending == 1 && row.valid == 1 && row.ready == 0', text: '第 {{row.i}} 拍：valid=1 等待，ready=0（接收方忙 / 反压），数据保持住——这是正常的等待。' },
        { when: 'row.pending == 0', text: '第 {{row.i}} 拍：没有待发数据。' },
        { text: '第 {{row.i}} 拍：valid={{row.valid}} ready={{row.ready}}' },
      ],
      summary: [{ text: '这次仿真：收到 {{row.rx}} / 4 帧' }, { when: 'row.lost > 0', text: ' · 丢 {{row.lost}} 帧' }, { when: 'row.rx == 0', text: ' · 总线挂死' }],
    } },
  ] },
];

/** RTL 编辑器：可疑那一行按改法换成改后的样子 */
const RTL: DBlock[] = [
  { kind: 'code', parts: [
    { text: `// sensor_if.v · 发送侧握手
always @(posedge sample_clk or negedge rst_n)
  if (!rst_n) data_pending <= 1'b0;
  else if (frame_in)  data_pending <= 1'b1;
  else if (valid && ready) data_pending <= 1'b0;

` },
    { text: 'assign valid = ready && data_pending;        // ← 可疑：valid 依赖 ready', textWhen: [{ when: 'fix_sel == 1', text: 'assign valid = data_pending;                 // 改后：valid 只看自己' }],
      hl: 'rgba(255,95,162,.3)', hlWhen: [{ when: 'fix_sel == 1', color: 'rgba(61,220,151,.25)' }] },
    { text: `

// filter_core.v · 接收侧
assign ready = valid_q;                      // ready 跟着上一拍的 valid
always @(posedge sample_clk) valid_q <= valid;` },
  ] },
  { kind: 'text', text: '怎么改？', size: 13.5, weight: 800, color: '#171a2e', mt: 14 },
  { kind: 'choices', control: 'fix', look: 'list', mono: true, current: 'fix_sel', lockSel: true,
    options: RTL_FIXES.map(f => ({ v: f.v, label: f.label, note: f.note, noteColor: f.good ? GREEN : PINK })) },
  small('先把波形看明白再改——没看波形就改，等于猜。', { mt: 10, textWhen: [{ when: 'fix_sel > 0', text: '改完要去「定向仿真」重跑才算数。' }] }),
];

/** 时序报告：cfg_en 那条的 slack 跟着约束改法变（false path 记成 0，不算违例） */
const SLACK = 'row.cdc == 1 ? cdc_slack[sta_sel].v : row.slack';
const STA: DBlock[] = [
  { kind: 'text', text: 'sta.rpt · setup 检查 · {{sta_sel == 0 ? 1 : 0}} 条违例', textWhen: [{ when: 'sta_sel == 2', text: 'sta.rpt · setup 检查 · 0 条违例（例外已屏蔽 1 条）' }], size: 13.5, weight: 800, color: '#171a2e', mb: 8 },
  { kind: 'table', from: 'sta_paths', plain: true, mono: true, size: 12.5, head: ['起点', '终点', 'slack (ns)', '备注'],
    rowBgWhen: [{ when: `(${SLACK}) < 0`, color: 'rgba(255,95,162,.12)' }],
    cols: [
      { text: '{{row.from}}', size: 12.5, pad: '7px 10px' },
      { text: '{{row.to}}', size: 12.5, pad: '7px 10px' },
      { text: '{{row.slack:2}}', textWhen: [{ when: 'row.cdc == 1', text: '{{cdc_slack[sta_sel].text}}' }], size: 12.5, pad: '7px 10px', weight: 800,
        color: GREEN, colorWhen: [{ when: 'row.cdc == 1 && sta_sel == 2', color: GRAY }, { when: `(${SLACK}) < 0`, color: PINK }] },
      { text: '', textWhen: [{ when: 'row.cdc == 1 && sta_sel == 1', text: '经两级同步器 · 例外只在同步器输入' }, { when: 'row.cdc == 1', text: 'cfg_clk → sample_clk 跨时钟域' }], size: 12.5, pad: '7px 10px', color: GRAY },
    ] },
  { kind: 'text', text: '这条违例怎么处理？', size: 13.5, weight: 800, color: '#171a2e', mt: 14 },
  { kind: 'choices', control: 'sta', look: 'list', current: 'sta_sel', lockSel: true,
    options: STA_FIXES.map(f => ({ v: f.v, label: f.label, note: f.note, noteColor: f.good ? GREEN : PINK })) },
];

/** 定向仿真：反压开关 + 跑 + 结果三格 + 结论 */
const SIM: DBlock[] = [
  { kind: 'box', dir: 'row', gap: 10, wrap: true, blocks: [
    { kind: 'text', text: 'tb_sensor_if · 4 帧突发', size: 13.5, weight: 800, color: '#171a2e' },
    { kind: 'button', tone: 'toggle', label: '反压注入 {{onoff[bp].label}}', litWhen: 'bp == 1', action: { set: [{ control: 'bp', value: 'bp == 1 ? 0 : 1' }] } },
    { kind: 'button', tone: 'toggle', label: '▶ 跑定向仿真', litWhen: '1', color: GREEN, action: { set: [{ control: 'run' }] } },
    small('RTL：{{rtl_fixes[fix_sel].short ?? 原始}}'),
  ] },
  { kind: 'stats', when: 'ran >= 1', mt: 14, cols: 3, items: [
    { label: '收到帧', text: '{{rx:i}} / 4', color: PINK, colorWhen: [{ when: 'rx == 4', color: GREEN }] },
    { label: '总线', text: '正常', textWhen: [{ when: 'hang >= 1', text: '挂死' }], color: GREEN, colorWhen: [{ when: 'hang >= 1', color: PINK }] },
    { label: '反压', text: '未注入', textWhen: [{ when: 'bp == 1', text: '已注入' }], color: '#e0a800', colorWhen: [{ when: 'bp == 1', color: GREEN }] },
  ] },
  small('没跑过。开反压再跑，才测得到接收方忙的场景。', { mt: 14, lh: 1.7, textWhen: [
    { when: 'ran >= 1 && rx == 4 && hang < 1 && bp == 1', text: '✓ 带反压 4 帧全收、不挂死。可以去写交接说明了。' },
    { when: 'ran >= 1 && rx == 4 && hang < 1', text: '4 帧全收，但反压没开——接收方忙的场景没测到，开了再跑一次。' },
    { when: 'ran >= 1 && hang >= 1', text: '✗ 总线挂死：波形里看 valid / ready 是不是还在互等。' },
    { when: 'ran >= 1', text: '✗ 丢了 {{4 - rx:i}} 帧：这种改法在接收方忙的时候会冲掉数据。' },
  ] }),
];

/** 交接说明：写够、改对、回归过了才能发 */
const NOTE: DBlock[] = [
  { kind: 'box', pad: '10px 14px', border: 'bottom', blocks: [small('给后端的交接说明要写清：RTL 改了什么、SDC 怎么修订、例外盖在哪、回归结论、还要后端关注什么。')] },
  { kind: 'write', control: 'words', count: 'nonspace', grow: true, look: 'paper', autoEdit: false, enabled: 'send != 1', demoText: EXPERT_NOTE, placeholder: '交接说明 · Sensor_IF → Filter_Core' },
  { kind: 'box', dir: 'row', gap: 10, pad: 12, border: 'top', blocks: [
    small('{{words:i}} 字 · 要 ≥ 80 字，且握手已改对、带反压回归已通过', { textWhen: [{ when: 'send == 1', text: '已发给后端。' }, { when: CAN_SEND, text: '{{words:i}} 字 · 可以发了' }] }),
    { kind: 'spacer' },
    { kind: 'button', tone: 'toggle', label: '发给后端', enabled: `${CAN_SEND} && send != 1`, litWhen: `${CAN_SEND} && send != 1`, dimWhen: `!(${CAN_SEND} && send != 1)`, action: { set: [{ control: 'send' }] } },
  ] },
];

const win = (id: number, blocks: DBlock[], extra: Partial<DesktopConfig['panes'][number]> = {}) => {
  const a = app(id);
  return { v: id, icon: a.icon, title: a.name, hint: a.hint, blocks, ...extra };
};

export const CHIPDESK_DESKTOP: DesktopConfig = {
  master: 'desktop', layout: 'dock', bg: 'linear-gradient(160deg, #eef0fb 0%, #f6f7fc 55%, #eaf4f6 100%)',
  dock: { control: 'app', brand: '验证工作站', empty: [
    { kind: 'text', text: '回归红了：Sensor_IF → Filter_Core 一帧都没收到。', size: 15, lh: 1.8 },
    { kind: 'text', text: '先开「波形查看器」跑仿真，把死锁看明白，再动代码。', size: 15, lh: 1.8 },
  ] },
  data: {
    // short：改法冒号前那半截（工具条 / 定向仿真里显示「RTL 版本」）
    rtl_fixes: RTL_FIXES.map(f => ({ id: f.v, short: f.label.split('：')[0] })),
    onoff: [{ id: 0, label: '关' }, { id: 1, label: '开' }],
    sta_paths: [
      { id: 1, from: 'cfg_en (cfg_clk)', to: 'filter_state (sample_clk)', slack: -0.42, cdc: 1 },
      { id: 2, from: 'data_pending', to: 'valid', slack: 1.12, cdc: 0 },
      { id: 3, from: 'valid_q', to: 'ready', slack: 0.87, cdc: 0 },
      { id: 4, from: 'sample_cnt[7]', to: 'frame_done', slack: 0.24, cdc: 0 },
    ],
    // cfg_en → filter_state 的 slack 按约束改法：0 原样违例 / 1 同步器 / 2 整条 false path / 3 放宽时钟
    cdc_slack: [{ id: 0, v: -0.42, text: '-0.42' }, { id: 1, v: 0.58, text: '0.58' }, { id: 2, v: 0, text: 'false path' }, { id: 3, v: 0.31, text: '0.31' }],
    regress: [{ id: 0, label: '待跑' }, { id: 1, label: '红' }, { id: 2, label: '绿' }],
  },
  ui: { sim_ran: 0, sim_fix: 0, sim_bp: 0 },
  // 跑仿真那一刻的 RTL 版本 / 反压记下来，波形按它画（改了代码要重跑才会变）；中途重挂从事件流补回来
  watch: [{ control: 'run', replay: true, do: { ui: [{ name: 'sim_fix', value: 'fix_sel' }, { name: 'sim_bp', value: 'bp' }, { name: 'sim_ran', value: 1 }] } }],
  topbar: [],
  panes: [
    win(1, WAVE, { pad: 0 }),
    win(2, RTL, { pad: 16, scroll: true, fs: 13.5 }),
    win(3, STA, { pad: 16, scroll: true, fs: 13.5, badges: [{ when: 'sta_sel == 0', text: '1 条违例' }] }),
    win(4, SIM, { pad: 16, scroll: true, fs: 13.5, badges: [{ when: 'hang >= 1', text: '红灯' }] }),
    win(5, NOTE, { pad: 0 }),
  ],
  taskbar: '10:3{{t / 60 % 10:i}} · 回归 {{regress[hang >= 1 ? 1 : rx == 4 ? 2 : 0].label}}',
};

export function chipdeskDesktopSpec(image: string): BenchSpec {
  return { ...chipdeskSpec(image), surface: 'desktop', surfaceConfig: CHIPDESK_DESKTOP };
}
