/**
 * 沥青摊铺 · 摊铺机控速控厚 + 运料便道压车的交互故事（2026-10-11，第二批「二产 · 能数采」）：
 *   左右分屏——左边是驾驶室里的操作台（速度手柄、松铺厚度、料斗、料车队、翼板、压路机间距），右边是机器在路面上的真实画面。
 *   该做的：匀速（0.9–1.1 m/min）、松铺厚度 7.5 cm 左右；料车到场先看温度，低于 140 ℃ 的退回；料斗快空、车还没到时收翼板把余料归中；
 *   压路机跟在 8–12 m 的初压区里；第 140 分钟运料便道压车、下一车晚到——降速不断料（≥ 0.3 m/min），别停机（停了就是冷接缝）。
 *   红线：摊铺中停机；料斗抽空（断料）；收了低温料；卸料时收翼板；压路机离太远（料凉了压不实）或太近（推移）。
 *   数采点：速度、厚度、料温、料斗余量、压路机间距——都是真机上会采的点。
 * 台面组件：src/components/lab/surfaces/Paving.tsx。（教学化简化模型，数值不是真实施工参数）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const SPEED_BAND: [number, number] = [0.9, 1.1];
export const THICK_BAND: [number, number] = [7.2, 7.8];
export const ROLLER_BAND: [number, number] = [8, 12];
export const MIN_TEMP = 140;
/** 料车时刻表：到场分钟、料温；第 5 车因为便道压车晚到 */
export const TRUCKS = [
  { id: 1, arrive: 6, temp: 165 }, { id: 2, arrive: 50, temp: 158 }, { id: 3, arrive: 92, temp: 134 }, { id: 4, arrive: 100, temp: 160 }, { id: 5, arrive: 185, temp: 156 }, { id: 6, arrive: 230, temp: 161 },
];
export const JAM_T = 140;   // 便道压车：从这分钟起下一车延误

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  // 示范里料车的温度和卸料由脚本自己写（真人操作时是台面写 tt / dock）
  const truck = (t: number, temp: number, ok = true) => { push(t - 1, 'tt', temp); push(t, ok ? 'accept' : 'reject', 1); if (ok) { push(t + 0.25, 'dock', 1); push(t + 10, 'dock', 0); } };
  push(2, 'thick', 7.5); push(4, 'roller', 10); push(5, 'speed', 1.0);
  truck(8, 165); truck(52, 158); truck(94, 134, false); truck(102, 160);   // 第 3 车 134 ℃ 退回
  push(150, 'speed', 0.4);                                                 // 压车：降速不断料
  push(175, 'fold', 1);                                                    // 料斗快空、车没到：收翼板归中
  truck(187, 156); push(192, 'speed', 1.0);                                // 第 5 车晚到
  truck(232, 161);
  return a;
}

export function pavingSpec(image: string): BenchSpec {
  return {
    name: '摊铺机 · 控速控厚与便道压车', surface: 'paving',
    brief: '你坐在摊铺机驾驶位，老陈在旁边。手柄把速度稳在 0.9–1.1 m/min，松铺厚度 7.5 cm 左右，压路机跟在后面 8–12 m 的初压区里。料车到了先看温度，低于 140 ℃ 的退回。中途运料便道压车、下一车晚到——降速不断料，别停机，料斗快空时收翼板把余料归中。摊铺中停机、料斗抽空、收了低温料、卸料时收翼板、压路机跟得太远或太近，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 260,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'laid', label: '摊铺长度', initial: 0, min: 0, max: 500, rate: 'hopper > 0 ? speed : 0' },
      { id: 'hopper', label: '料斗余量', initial: 55, min: 0, max: 100, rate: 'dock * 8 - (hopper > 0 ? speed * 1.3 : 0)' },
      { id: 'started', label: '开铺了', initial: 0, set: 'max(started, laid > 0.5 ? 1 : 0)' },
      { id: 'stopped', label: '摊铺中停机', initial: 0, set: 'max(stopped, started == 1 && speed < 0.05 && laid < 480 ? 1 : 0)' },
      { id: 'starved', label: '断料', initial: 0, set: 'max(starved, started == 1 && hopper <= 0 ? 1 : 0)' },
      { id: 'speed_ok', label: '速度在窗口', initial: 0, set: 'speed >= 0.9 && speed <= 1.1 ? 1 : 0' },
      { id: 'steady_s', label: '匀速秒数', initial: 0, set: 'speed_ok == 1 && hopper > 0 ? steady_s + dt : steady_s' },
      { id: 'fast', label: '超速', initial: 0, set: 'max(fast, speed > 1.5 ? 1 : 0)' },
      { id: 'thick_ok', label: '厚度在窗口', initial: 0, set: 'thick >= 7.2 && thick <= 7.8 ? 1 : 0' },
      { id: 'thick_off', label: '厚度跑偏', initial: 0, set: 'max(thick_off, started == 1 && (thick < 6.8 || thick > 8.2) ? 1 : 0)' },
      // 料车：台面在接车时把该车温度写进 tt；accept / reject 按钮
      { id: 'cold_accept', label: '收了低温料', initial: 0, set: 'max(cold_accept, accept == 1 && tt < 140 ? 1 : 0)' },
      { id: 'good_reject', label: '退回低温料', initial: 0, set: 'max(good_reject, reject == 1 && tt < 140 ? 1 : 0)' },
      { id: 'bad_reject', label: '退回了合格料', initial: 0, set: 'max(bad_reject, reject == 1 && tt >= 140 ? 1 : 0)' },
      { id: 'trucks_in', label: '接了几车', initial: 0, set: 'trucks_in + (accept == 1 && tt >= 140 ? 1 : 0)' },
      { id: 'fold_bad', label: '卸料时收翼板', initial: 0, set: 'max(fold_bad, fold == 1 && dock == 1 ? 1 : 0)' },
      { id: 'fold_ok', label: '该收翼板时收了', initial: 0, set: 'max(fold_ok, fold == 1 && dock == 0 && hopper < 40 ? 1 : 0)' },
      // 压车期间（140–185）：没停、没断料、速度 ≥ 0.3
      { id: 'jam_slow', label: '压车期间降速不断料', initial: 0, set: 'max(jam_slow, t >= 150 && t < 185 && speed >= 0.3 && speed <= 0.6 && hopper > 0 ? 1 : 0)' },
      { id: 'jam_fail', label: '压车期间停机或断料', initial: 0, set: 'max(jam_fail, t >= 140 && t < 190 && (speed < 0.05 || hopper <= 0) && started == 1 ? 1 : 0)' },
      // 压路机：间距；料温随间距降
      { id: 'mat_t', label: '压路机处料温', initial: 150, set: 'clamp(162 - roller * 2.6 - (speed < 0.3 ? 8 : 0), 90, 170)' },
      { id: 'roller_ok', initial: 0, set: 'roller >= 8 && roller <= 12 ? 1 : 0' },
      { id: 'roll_ok_s', label: '初压区秒数', initial: 0, set: 'roller_ok == 1 && started == 1 && hopper > 0 ? roll_ok_s + dt : roll_ok_s' },
      { id: 'roll_far', label: '压路机跟太远', initial: 0, set: 'max(roll_far, started == 1 && roller > 15 ? 1 : 0)' },
      { id: 'roll_near', label: '压路机跟太近', initial: 0, set: 'max(roll_near, started == 1 && roller < 5 ? 1 : 0)' },
      { id: 'quality', label: '摊铺质量', initial: 0, min: 0, max: 100, set: 'clamp(min(25, steady_s * 0.25) + (thick_ok == 1 ? 10 : 0) + min(15, trucks_in * 4) + (good_reject == 1 ? 10 : 0) + (jam_slow == 1 ? 15 : 0) + (fold_ok == 1 ? 5 : 0) + min(15, roll_ok_s * 0.15) + (laid >= 150 ? 5 : 0) - stopped * 30 - starved * 30 - cold_accept * 25 - fold_bad * 10 - roll_far * 10 - roll_near * 10 - fast * 10 - thick_off * 10 - bad_reject * 10 - jam_fail * 20, 0, 100)' },
    ],
    controls: [
      { id: 'speed', label: '摊铺速度', kind: 'knob', min: 0, max: 2.0, step: 0.1, unit: 'm/min', initial: 0 },
      { id: 'thick', label: '松铺厚度', kind: 'knob', min: 5, max: 10, step: 0.1, unit: 'cm', initial: 7.0 },
      { id: 'roller', label: '压路机间距', kind: 'knob', min: 2, max: 25, step: 1, unit: 'm', initial: 14 },
      { id: 'accept', label: '接收料车', kind: 'button' },
      { id: 'reject', label: '退回料车', kind: 'button' },
      { id: 'fold', label: '收翼板归中', kind: 'button' },
      { id: 'tt', label: '当前料车温度', kind: 'knob', min: 0, max: 200, step: 1, initial: 0, hidden: true },
      { id: 'dock', label: '料车在卸料', kind: 'switch', hidden: true },
    ],
    gauges: [
      { id: 'g_speed', label: '摊铺速度', unit: 'm/min', expr: 'speed', min: 0, max: 2, digits: 1, warn: 'started == 1 && (speed < 0.3 || speed > 1.3)' },
      { id: 'g_hopper', label: '料斗余量', unit: '%', expr: 'hopper', min: 0, max: 100, warn: 'hopper < 20' },
      { id: 'g_thick', label: '松铺厚度', unit: 'cm', expr: 'thick', min: 5, max: 10, digits: 1 },
      { id: 'g_mat', label: '压路机处料温', unit: '℃', expr: 'mat_t', min: 80, max: 170, warn: 'mat_t < 125' },
      { id: 'g_laid', label: '已铺', unit: 'm', expr: 'laid', min: 0, max: 300 },
    ],
    rules: [
      { id: 'stop', label: '摊铺中停机：熨平板一停，这里就是一道冷接缝', when: 'stopped == 1', severity: 'violation', once: true },
      { id: 'starve', label: '料斗抽空（断料）：摊铺面出坑', when: 'starved == 1', severity: 'violation', once: true },
      { id: 'cold', label: '收了低于 140 ℃ 的料：压不实，返工', when: 'cold_accept == 1', severity: 'violation', once: true },
      { id: 'jam', label: '压车期间停机 / 断料（该降速等料，不该停）', when: 'jam_fail == 1', severity: 'violation', once: true },
      { id: 'foldbad', label: '卸料时收翼板：料撒一地', when: 'fold_bad == 1', severity: 'warning', once: true },
      { id: 'far', label: '压路机跟太远（>15 m）：料凉了压不实', when: 'roll_far == 1', severity: 'warning', once: true },
      { id: 'near', label: '压路机跟太近（<5 m）：推移、起皱', when: 'roll_near == 1', severity: 'warning', once: true },
      { id: 'fast', label: '超速（>1.5 m/min）：厚度和平整度都保不住', when: 'fast == 1', severity: 'warning', once: true },
      { id: 'thick', label: '松铺厚度跑偏超过 ±0.5 cm', when: 'thick_off == 1', severity: 'warning', once: true },
      { id: 'badrej', label: '把合格的料退回去了', when: 'bad_reject == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：厚度 7.5 cm 左右、压路机 8–12 m、起步匀速', when: 'thick_ok == 1 && roller_ok == 1 && speed_ok == 1', hold: 3 },
      { id: 'g2', label: '第二步：匀速摊铺累计 60 秒', when: 'steady_s >= 60' },
      { id: 'g3', label: '第三步：接三车合格料、退回那车低温料', when: 'trucks_in >= 3 && good_reject == 1 && cold_accept == 0' },
      { id: 'g4', label: '第四步：便道压车——降速不断料，收翼板归中', when: 'jam_slow == 1 && fold_ok == 1 && jam_fail == 0' },
      { id: 'g5', label: '第五步：晚到的料车接上，恢复匀速，铺过 150 m', when: 'laid >= 150 && trucks_in >= 4 && stopped == 0 && starved == 0' },
    ],
    expertScript: expertScript(),
  };
}
