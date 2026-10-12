/**
 * 数字芯片设计 · 验证工程师的交互故事（2026-10-11，第二批「机器中介型」）：浅色整屏桌面，像真的 EDA 工作站。
 *   故事：Sensor_IF 往 Filter_Core 发数据，仿真红灯——总线挂死、一笔都收不到。
 *   波形里看得见：复位释放后 valid 和 ready 互相等对方（valid 依赖 ready、ready 又等 valid），从第 6 拍起两根线一起趴着。
 *   该做的：① 先跑仿真、在波形里把死锁开始的那一拍标出来 ② 改 RTL：valid 不能依赖 ready（握手铁律）③ 时序报告里 cfg_en→filter_state
 *   的违例是跨时钟域，加两级同步器 + 只对同步器输入设 false path，不能整条路径一刀 false path 掩盖 ④ 带反压跑定向仿真，4 帧零丢包不挂死 ⑤ 写交接说明。
 *   红线：没看波形就改代码（猜着改）；用 false path 把真问题盖住；加「ready 恒为 1」这种治标不治本的补丁。
 * 台面组件：src/components/lab/surfaces/ChipDesk.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const CHIP_APPS = [
  { id: 1, name: '波形查看器', icon: '📈', hint: 'sim.vcd' },
  { id: 2, name: 'RTL 编辑器', icon: '🧩', hint: 'sensor_if.v' },
  { id: 3, name: '时序报告', icon: '⏱️', hint: 'sta.rpt · 1 条违例' },
  { id: 4, name: '定向仿真', icon: '▶️', hint: 'tb_sensor_if' },
  { id: 5, name: '交接说明', icon: '📝', hint: '给后端' },
];
/** 死锁从哪一拍开始（标记落在 ±2 拍内算对） */
export const DEADLOCK_CYCLE = 6;
export const RTL_FIXES = [
  { v: 1, label: 'valid 只看自己有没有数据：assign valid = data_pending;', good: true, note: '握手铁律：发送方的 valid 不能依赖 ready；ready 可以看 valid。' },
  { v: 2, label: '接收方 ready 恒为 1：assign ready = 1\'b1;', good: false, note: '通了，但 Filter_Core 忙的时候数据会被冲掉——治标不治本。' },
  { v: 3, label: '加个超时计数器，等 64 拍没 ready 就强拉 valid', good: false, note: '把死锁改成了偶发丢帧，波形更难查。' },
];
export const STA_FIXES = [
  { v: 1, label: 'cfg_en 加两级同步器，只对同步器第一级输入设 false path', good: true, note: 'cfg_clk → sample_clk 是跨时钟域：同步器解决亚稳态，例外只盖在同步器输入上。' },
  { v: 2, label: '对 cfg_en → filter_state 整条路径 set_false_path', good: false, note: '报告干净了，问题还在——这是掩盖，不是修。' },
  { v: 3, label: '把 sample_clk 周期约束放宽 1 ns', good: false, note: '改约束不改设计，芯片回来照样出错。' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'app', 1); push(4, 'run', 1); push(9, 'cursor', 6); push(11, 'mark', 1);          // 先跑仿真、看波形、标出死锁那一拍
  push(14, 'app', 2); push(18, 'fix', 1);                                                  // 改握手
  push(21, 'app', 3); push(25, 'sta', 1);                                                  // 时序违例按 CDC 处理
  push(28, 'app', 4); push(29, 'bp', 1); push(31, 'run', 1);                               // 带反压回归
  push(40, 'app', 5); push(44, 'words', 40); push(50, 'words', 90); push(56, 'words', 140); push(60, 'send', 1);
  return a;
}

export function chipdeskSpec(image: string): BenchSpec {
  return {
    name: '验证工作站 · Sensor_IF 握手死锁', surface: 'chipdesk',
    brief: '仿真回归红了：Sensor_IF 往 Filter_Core 发 4 帧数据，一帧都没收到，总线挂死。桌面上有波形查看器、RTL 编辑器、时序报告、定向仿真和交接说明。先跑仿真把波形看明白、标出死锁从哪一拍开始，再改握手逻辑；时序报告里那条 cfg_en→filter_state 的违例是跨时钟域问题，要加同步器而不是一刀 false path；改完带反压回归，4 帧零丢包、不挂死，最后写交接说明给后端。没看波形就改代码、用 false path 盖住真问题、ready 恒为 1 这种补丁，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 480,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'ran', label: '跑过仿真', initial: 0, set: 'max(ran, run)' },
      { id: 'runs', label: '仿真次数', initial: 0, set: 'runs + run' },
      { id: 'wave_s', label: '看波形的秒数', initial: 0, set: 'app == 1 && ran == 1 ? wave_s + dt : wave_s' },
      { id: 'seen_deadlock', label: '看见死锁', initial: 0, set: 'max(seen_deadlock, app == 1 && ran == 1 && cursor >= 6 ? 1 : 0)' },
      { id: 'mark_at', label: '标记的拍', initial: -1, set: 'mark == 1 ? cursor : mark_at' },
      { id: 'mark_ok', label: '标对了', initial: 0, set: 'max(mark_ok, mark == 1 && cursor >= 4 && cursor <= 8 ? 1 : 0)' },
      { id: 'fix_sel', label: 'RTL 改法', initial: 0, set: 'fix > 0 ? fix : fix_sel' },
      { id: 'sta_sel', label: '约束改法', initial: 0, set: 'sta > 0 ? sta : sta_sel' },
      { id: 'blind', label: '没看波形就改代码', initial: 0, set: 'max(blind, fix > 0 && seen_deadlock == 0 ? 1 : 0)' },
      { id: 'patch', label: '治标补丁', initial: 0, set: 'max(patch, fix == 2 || fix == 3 ? 1 : 0)' },
      { id: 'mask', label: '用 false path 掩盖', initial: 0, set: 'max(mask, sta == 2 ? 1 : 0)' },
      { id: 'loosen', label: '放宽时钟约束', initial: 0, set: 'max(loosen, sta == 3 ? 1 : 0)' },
      { id: 'fixed', label: '握手改对了', initial: 0, set: 'fix_sel == 1 ? 1 : 0' },
      { id: 'cdc_ok', label: 'CDC 处理对了', initial: 0, set: 'sta_sel == 1 ? 1 : 0' },
      // 回归：改对握手才能收到；开了反压、ready 恒 1 那种补丁会丢帧
      { id: 'rx', label: '收到的帧', initial: 0, set: 'run == 1 && app == 4 ? (fixed == 1 ? 4 : (fix_sel == 2 ? (bp == 1 ? 2 : 4) : fix_sel == 3 ? 3 : 0)) : rx' },
      { id: 'hang', label: '总线挂死', initial: 0, set: 'run == 1 && app == 4 ? (fix_sel == 1 || fix_sel == 2 || fix_sel == 3 ? 0 : 1) : hang' },
      // 按钮只在按下那一拍为 1，而 rx / hang 是同一拍才算出来的：先把「这次回归开没开反压」锁住，下一拍再判
      { id: 'ran4', label: '跑过定向仿真', initial: 0, set: 'max(ran4, run == 1 && app == 4 ? 1 : 0)' },
      { id: 'bp_at_run', label: '回归时反压', initial: -1, set: 'run == 1 && app == 4 ? bp : bp_at_run' },
      { id: 'regress_ok', label: '带反压回归通过', initial: 0, set: 'max(regress_ok, ran4 == 1 && bp_at_run == 1 && rx == 4 && hang == 0 && fixed == 1 ? 1 : 0)' },
      { id: 'regress_nobp', label: '没开反压就算通过', initial: 0, set: 'max(regress_nobp, ran4 == 1 && bp_at_run == 0 && rx == 4 && fixed == 1 ? 1 : 0)' },
      { id: 'note_ok', label: '交接说明写够了', initial: 0, set: 'max(note_ok, send == 1 && words >= 80 ? 1 : 0)' },
      { id: 'sent_thin', label: '交接说明太薄', initial: 0, set: 'max(sent_thin, send == 1 && words < 80 ? 1 : 0)' },
      { id: 'quality', label: '完成质量', initial: 0, min: 0, max: 100, set: 'clamp((seen_deadlock == 1 ? 10 : 0) + (mark_ok == 1 ? 15 : 0) + (fixed == 1 ? 25 : 0) + (cdc_ok == 1 ? 20 : 0) + (regress_ok == 1 ? 20 : 0) + (note_ok == 1 ? 10 : 0) - blind * 20 - patch * 15 - mask * 30 - loosen * 15 - regress_nobp * 10 - sent_thin * 5, 0, 100)' },
    ],
    controls: [
      { id: 'app', label: '打开的应用', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '1 波形 · 2 RTL · 3 时序报告 · 4 定向仿真 · 5 交接说明' },
      { id: 'run', label: '跑仿真', kind: 'button' },
      { id: 'cursor', label: '波形光标（第几拍）', kind: 'knob', min: 0, max: 39, step: 1, initial: 0 },
      { id: 'mark', label: '标记：死锁从这一拍开始', kind: 'button' },
      { id: 'fix', label: 'RTL 改法', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '1 valid 只看 data_pending · 2 ready 恒 1 · 3 超时强拉', hidden: true },
      { id: 'sta', label: '约束改法', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '1 同步器 + 局部 false path · 2 整条 false path · 3 放宽时钟', hidden: true },
      { id: 'bp', label: '反压注入', kind: 'switch' },
      { id: 'words', label: '交接说明字数', kind: 'knob', min: 0, max: 600, step: 1, initial: 0, hidden: true },
      { id: 'send', label: '发给后端', kind: 'button' },
    ],
    gauges: [
      { id: 'g_rx', label: '收到帧', unit: '/4', expr: 'rx', min: 0, max: 4 },
      { id: 'g_hang', label: '总线挂死', unit: '', expr: 'hang', min: 0, max: 1, warn: 'hang == 1' },
      { id: 'g_runs', label: '仿真次数', unit: '次', expr: 'runs', min: 0, max: 10 },
      { id: 'g_q', label: '完成质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'quality < 50 && t > 120' },
    ],
    rules: [
      { id: 'blind', label: '没看波形就改代码（猜着修，改对了也是撞上的）', when: 'blind == 1', severity: 'warning', once: true },
      { id: 'patch', label: '治标补丁：ready 恒为 1 / 超时强拉，会在真机上变成偶发丢帧', when: 'patch == 1', severity: 'warning', once: true },
      { id: 'mask', label: '整条路径 set_false_path：把跨时钟域的真问题盖住了', when: 'mask == 1', severity: 'violation', once: true },
      { id: 'loosen', label: '放宽时钟约束来「修」违例：设计没变，芯片回来照样出错', when: 'loosen == 1', severity: 'warning', once: true },
      { id: 'nobp', label: '回归没开反压：接收方忙的场景没测到', when: 'regress_nobp == 1', severity: 'warning', once: true },
      { id: 'thin', label: '交接说明太薄，后端看不懂改了什么、例外盖了哪里', when: 'sent_thin == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：跑仿真，在波形里看到 valid / ready 互等（死锁）', when: 'seen_deadlock == 1' },
      { id: 'g2', label: '第二步：标出死锁开始的那一拍', when: 'mark_ok == 1' },
      { id: 'g3', label: '第三步：改对握手——valid 不依赖 ready', when: 'fixed == 1' },
      { id: 'g4', label: '第四步：cfg_en 跨时钟域加同步器，例外只盖同步器输入', when: 'cdc_ok == 1' },
      { id: 'g5', label: '第五步：带反压回归，4 帧零丢包、不挂死', when: 'regress_ok == 1' },
      { id: 'g6', label: '收尾：交接说明发给后端', when: 'note_ok == 1' },
    ],
    expertScript: expertScript(),
  };
}
