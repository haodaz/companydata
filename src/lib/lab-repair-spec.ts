/**
 * 电气设备维修的交互故事（2026-10-11）：查一台按了不启动的风机——诊断是「看、量、推理」，不是换件。
 *   真相：急停被人按下去了（复位后能启动）→ 启动几秒热继电器跳脱 → 万用表一量，FU2 熔断器断了（电机缺相）→ 换熔断器 → 试机 10 秒不跳。
 *   烟雾弹：控制面板的 E07「通讯超时」（是上次的历史报警）；接触器看着有点发黑（没坏，换了白换）。
 *   红线：没断电挂牌就开柜门；带电换熔断器；没量就换件。
 * 台面组件：src/components/lab/surfaces/Repair.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const REPAIR_TOOLS = [
  { v: 0, label: '手', icon: '✋' }, { v: 1, label: '万用表', icon: '🔧' }, { v: 2, label: '验电笔', icon: '🖊️' }, { v: 3, label: '螺丝刀', icon: '🪛' },
];
/** 测试点：万用表量出来的读数（通电 / 断电两种） */
export const REPAIR_POINTS: Record<string, { label: string; on: string; off: string; key: boolean }> = {
  in: { label: '进线端 L1-L2-L3', on: '380V / 381V / 379V', off: '0V（已断电）', key: false },
  fu1: { label: 'FU1 两端', on: '0V（通）', off: '通（0.3Ω）', key: false },
  fu2: { label: 'FU2 两端', on: '380V（断！）', off: '不通（∞）', key: true },
  fu3: { label: 'FU3 两端', on: '0V（通）', off: '通（0.2Ω）', key: false },
  km: { label: 'KM1 接触器出线', on: 'L1 380V · L2 0V · L3 380V', off: '0V', key: false },
  motor: { label: '电机接线端', on: 'U-V 380V · V-W 0V · W-U 380V（缺相）', off: '三相绕组各 1.1Ω（电机没坏）', key: false },
};

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'tool', 0); push(4, 'estop', 1); push(6, 'start', 1); push(12, 'fr_reset', 1);
  push(14, 'power', 0); push(16, 'lock', 1); push(18, 'tool', 2); push(20, 'verify', 1); push(22, 'tool', 3); push(24, 'open', 1);
  push(27, 'tool', 1); push(29, 'm_fu1', 1); push(31, 'm_fu2', 1); push(33, 'm_motor', 1);
  push(36, 'tool', 0); push(38, 'fuse', 1); push(40, 'open', 0); push(42, 'lock', 0); push(44, 'power', 1); push(46, 'start', 1);
  return a;
}

export function repairSpec(image: string): BenchSpec {
  return {
    name: '维修台 · 3 号风机不启动', surface: 'repair',
    brief: '车间 3 号排风机按启动没反应，班长说「接触器都发黑了，换一个吧」。你是电工：先看现场（急停、指示灯、面板报警），再决定要不要量；开柜门之前必须断电、挂牌、验电；量出问题再换件，换完试机。换了没坏的件、带电开柜、不量就换，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 420,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'estop_in', label: '急停还按着', initial: 1, set: 'estop == 1 ? 0 : estop_in' },
      { id: 'fr_trip', label: '热继跳脱', initial: 0, set: 'fr_reset == 1 ? 0 : (run_s > 4 && fuse_ok == 0 ? 1 : fr_trip)' },
      { id: 'fuse_ok', label: 'FU2 换好了', initial: 0, set: 'max(fuse_ok, fuse)' },
      { id: 'verify_done', initial: 0, set: 'max(verify_done, verify)' },
      { id: 'fr_reset_done', initial: 0, set: 'max(fr_reset_done, fr_reset)' },
      { id: 'running', label: '风机在转', initial: 0, set: 'power == 1 && estop_in == 0 && fr_trip == 0 && open == 0 && (start == 1 || running == 1) ? 1 : 0' },
      { id: 'run_s', label: '连续运转秒数', initial: 0, set: 'running == 1 ? run_s + dt : 0' },
      { id: 'live_open', label: '带电开柜秒数', initial: 0, max: 30, rate: 'open == 1 && power == 1 ? 1 : 0' },
      { id: 'unlocked_open', label: '没挂牌开柜', initial: 0, set: 'max(unlocked_open, open == 1 && lock == 0 ? 1 : 0)' },
      { id: 'live_fuse', label: '带电换熔断器', initial: 0, set: 'max(live_fuse, fuse == 1 && power == 1 ? 1 : 0)' },
      { id: 'blind_swap', label: '没量就换件', initial: 0, set: 'max(blind_swap, (fuse == 1 || swap_km == 1) && m_fu2 == 0 ? 1 : 0)' },
      { id: 'waste', label: '换了没坏的件', initial: 0, set: 'max(waste, swap_km)' },
      { id: 'quality', label: '维修质量', initial: 0, min: 0, max: 100, set: 'clamp((run_s >= 10 ? 60 : running == 1 ? 30 : 0) + (m_fu2 == 1 ? 15 : 0) + (verify == 1 ? 10 : 0) + (lock == 1 || lock_done == 1 ? 15 : 0) - unlocked_open * 30 - live_fuse * 40 - blind_swap * 20 - waste * 15 - min(20, live_open * 4), 0, 100)' },
      { id: 'lock_done', initial: 0, set: 'max(lock_done, lock)' },
    ],
    controls: [
      { id: 'tool', label: '工具', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 手 · 1 万用表 · 2 验电笔 · 3 螺丝刀' },
      { id: 'power', label: '总开关', kind: 'switch', initial: 1 },
      { id: 'lock', label: '断电挂牌上锁', kind: 'switch' },
      { id: 'verify', label: '验电', kind: 'button' },
      { id: 'open', label: '打开柜门', kind: 'switch' },
      { id: 'estop', label: '复位急停', kind: 'switch' },
      { id: 'fr_reset', label: '复位热继电器', kind: 'button' },
      { id: 'fuse', label: '更换 FU2 熔断器', kind: 'button' },
      { id: 'swap_km', label: '更换接触器 KM1', kind: 'button' },
      { id: 'start', label: '按启动', kind: 'button' },
      ...Object.keys(REPAIR_POINTS).map(k => ({ id: `m_${k}`, label: `量了 ${REPAIR_POINTS[k].label}`, kind: 'switch' as const, hidden: true })),
    ],
    gauges: [
      { id: 'g_run', label: '连续运转', unit: '秒', expr: 'run_s', min: 0, max: 15 },
      { id: 'g_power', label: '总电源', unit: '', expr: 'power', min: 0, max: 1 },
      { id: 'g_live', label: '带电开柜', unit: '秒', expr: 'live_open', min: 0, max: 30, warn: 'live_open > 0' },
      { id: 'g_q', label: '维修质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'quality < 50 && t > 60' },
    ],
    rules: [
      { id: 'live_open', label: '没断电就开柜门（380V 裸露端子，电击风险）', when: 'open == 1 && power == 1', severity: 'violation', once: true },
      { id: 'unlocked', label: '断电了但没挂牌上锁（别人随手一合闸你就在柜子里）', when: 'open == 1 && lock == 0', severity: 'violation', once: true },
      { id: 'no_verify', label: '开柜前没验电（断电不等于无电）', when: 'open == 1 && verify_done == 0', severity: 'warning', once: true },
      { id: 'live_fuse', label: '带电换熔断器', when: 'live_fuse == 1', severity: 'violation', once: true },
      { id: 'blind', label: '没量就换件（猜着修）', when: 'blind_swap == 1', severity: 'warning', once: true },
      { id: 'waste', label: '换了没坏的接触器（看着发黑不等于坏，量一下 KM1 出线就知道）', when: 'waste == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'estop', label: '先看现场：急停被按下，复位', when: 'estop == 1' },
      { id: 'trip', label: '试启动后热继跳脱，复位热继', when: 'fr_reset_done == 1', after: 'estop' },
      { id: 'loto', label: '断电、挂牌、验电，再开柜', when: 'open == 1 && lock == 1 && power == 0 && verify_done == 1', after: 'trip' },
      { id: 'find', label: '万用表量出 FU2 断（电机缺相）', when: 'm_fu2 == 1', after: 'loto' },
      { id: 'fix', label: '断电状态下换 FU2', when: 'fuse_ok == 1 && live_fuse == 0', after: 'find' },
      { id: 'run', label: '关柜门、拆锁、合闸试机，连续运转 10 秒不跳', when: 'run_s >= 10', after: 'fix' },
      { id: 'q', label: '维修质量 ≥ 70', when: 'run_s >= 10 && quality >= 70', after: 'run' },
    ],
    expertScript: expertScript(),
  };
}
