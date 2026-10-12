/**
 * 火箭发动机试车台的交互故事（2026-10-11，第二批「高风险型」）：一次液氧甲烷发动机热试车，从预冷到紧急关机。
 *   顺序：预冷液氧管路（到位才能点火，不然泵气蚀）→ 贮箱增压到窗口 → 点火前吹除 → 点火器先亮、再开燃料阀、再开氧阀 →
 *   稳态燃烧 → 第 12 秒出现燃烧不稳定（室压振荡、喉部温度飙升）→ 2.5 秒内紧急关机 → 关机后吹除 → 泄压。
 *   红线：没预冷就点火（气蚀）；先开阀再点火（推进剂灌进燃烧室 → 硬启动）；贮箱超压；不稳定了还不关；关机后不吹除。
 * 台面组件：src/components/lab/surfaces/TestStand.tsx。（教学化简化模型，数值不是真实发动机参数）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const STAND_P_BAND: [number, number] = [26, 36];   // 贮箱增压窗口 bar
export const STAND_PC_BAND: [number, number] = [65, 90];  // 稳态室压 bar

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'chill', 1);                       // 预冷：液氧管路从常温降到 -150 ℃ 以下
  push(16, 'press', 1);                      // 增压：到窗口就停
  push(22, 'purge', 1); push(25, 'purge', 0); // 点火前吹除 3 秒
  push(28, 'press', 0);
  push(29, 'igniter', 1); push(29.5, 'mv_fuel', 1); push(30, 'mv_ox', 1);   // 先点火器、再燃料、再氧
  push(43.5, 'abort', 1);                    // 第 12 秒燃烧不稳定 → 1.5 秒内紧急关机
  push(46, 'purge', 1); push(50, 'purge', 0); // 关机后吹除
  push(52, 'vent', 1);                       // 泄压
  return a;
}

export function teststandSpec(image: string): BenchSpec {
  return {
    name: '试车台 · 液氧甲烷发动机热试车', surface: 'teststand',
    brief: '发动机已经吊装到试车台上，今天这台要跑一次短程热试车。你坐在测控间：预冷到位、贮箱增压到窗口、点火前吹除，然后按顺序点火——点火器先亮，再开燃料阀，最后开氧阀。燃烧稳定后盯着室压和喉部温度，一旦振荡立刻紧急关机，关机后吹除、泄压。没预冷就点火、先开阀再点火、超压、不稳定了还硬撑，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'lox_t', label: '液氧管路温度', initial: 20, min: -190, max: 20, rate: 'chill == 1 ? -12 : (lox_t < 20 ? 1.5 : 0)' },
      { id: 'chilled', label: '预冷到位', initial: 0, set: 'max(chilled, lox_t <= -150 ? 1 : 0)' },
      { id: 'tank_p', label: '贮箱压力', initial: 0, min: 0, max: 60, rate: 'press == 1 ? 2.5 : (vent == 1 ? -5 : (lit == 1 ? -0.3 : 0))' },
      { id: 'over_p', label: '贮箱超压', initial: 0, set: 'max(over_p, tank_p > 42 ? 1 : 0)' },
      { id: 'purge_s', label: '点火前吹除秒数', initial: 0, set: 'purge == 1 && lit == 0 && run_s == 0 ? purge_s + dt : purge_s' },
      { id: 'purge_done', initial: 0, set: 'max(purge_done, purge_s >= 3 ? 1 : 0)' },
      { id: 'ign_s', label: '点火器余焰', initial: 0, set: 'igniter == 1 ? 3 : max(0, ign_s - dt)' },
      // 紧急关机会把主阀一起关掉，所以关机后不再往燃烧室里积
      { id: 'wet', label: '燃烧室里积的推进剂', initial: 0, set: 'lit == 1 || aborted == 1 ? 0 : ((mv_fuel == 1 || mv_ox == 1) && ign_s <= 0 ? min(10, wet + dt) : wet)' },
      { id: 'hard_start', label: '硬启动', initial: 0, set: 'max(hard_start, ign_s > 0 && wet >= 1.5 && lit == 0 ? 1 : 0)' },
      { id: 'cold_start', label: '没预冷就点火', initial: 0, set: 'max(cold_start, igniter == 1 && chilled == 0 ? 1 : 0)' },
      { id: 'offband_start', label: '压力不在窗口就点火', initial: 0, set: 'max(offband_start, igniter == 1 && (tank_p < 26 || tank_p > 36) ? 1 : 0)' },
      { id: 'no_purge_start', initial: 0, set: 'max(no_purge_start, igniter == 1 && purge_done == 0 ? 1 : 0)' },
      { id: 'lit', label: '发动机在燃烧', initial: 0, set: 'aborted == 1 || mv_fuel == 0 || mv_ox == 0 || tank_p < 10 ? 0 : (lit == 1 ? 1 : (ign_s > 0 && mv_fuel == 1 && mv_ox == 1 && chilled == 1 && hard_start == 0 ? 1 : 0))' },
      { id: 'pc', label: '燃烧室压力', initial: 0, min: 0, max: 140, set: 'lit == 1 ? min(pc + 30 * dt, clamp(tank_p * 2.6, 0, 110)) + (unstable == 1 ? (unstable_s * 7) % 23 - 11 : 0) : max(0, pc - 45 * dt)' },
      { id: 'run_s', label: '累计燃烧秒数', initial: 0, set: 'lit == 1 ? run_s + dt : run_s' },
      { id: 'unstable', label: '燃烧不稳定', initial: 0, set: 'lit == 1 && run_s >= 12 ? 1 : 0' },
      { id: 'unstable_s', label: '不稳定持续秒数', initial: 0, set: 'unstable == 1 ? unstable_s + dt : unstable_s' },
      { id: 'aborted', label: '已紧急关机', initial: 0, set: 'max(aborted, abort)' },
      { id: 'abort_ok', label: '及时关机', initial: 0, set: 'max(abort_ok, abort == 1 && unstable == 1 && unstable_s <= 2.5 ? 1 : 0)' },
      { id: 'abort_late', label: '关机太晚', initial: 0, set: 'max(abort_late, unstable_s > 2.5 ? 1 : 0)' },
      { id: 'blown', label: '喉部烧穿', initial: 0, set: 'max(blown, unstable_s > 5 ? 1 : 0)' },
      { id: 't_throat', label: '喉部温度', initial: 20, min: 20, max: 2400, rate: 'lit == 1 ? (unstable == 1 ? 320 : 150) : -80' },
      { id: 'shut_done', label: '已关机', initial: 0, set: 'max(shut_done, run_s > 0 && lit == 0 ? 1 : 0)' },
      { id: 'shut_s', label: '关机后秒数', initial: 0, set: 'shut_done == 1 ? shut_s + dt : 0' },
      { id: 'post_purge_s', initial: 0, set: 'shut_done == 1 && purge == 1 ? post_purge_s + dt : post_purge_s' },
      { id: 'post_purge', label: '关机后吹除', initial: 0, set: 'max(post_purge, post_purge_s >= 3 ? 1 : 0)' },
      { id: 'vented', label: '已泄压', initial: 0, set: 'max(vented, shut_done == 1 && tank_p <= 2 ? 1 : 0)' },
      { id: 'quality', label: '试车质量', initial: 0, min: 0, max: 100, set: 'clamp((chilled == 1 ? 10 : 0) + (purge_done == 1 ? 10 : 0) + (run_s >= 10 && hard_start == 0 ? 35 : run_s > 0 ? 15 : 0) + (abort_ok == 1 ? 25 : 0) + (post_purge == 1 ? 10 : 0) + (vented == 1 ? 10 : 0) - cold_start * 40 - hard_start * 50 - over_p * 30 - abort_late * 25 - blown * 40 - offband_start * 10, 0, 100)' },
    ],
    controls: [
      { id: 'chill', label: '预冷（液氧管路）', kind: 'switch' },
      { id: 'press', label: '贮箱增压', kind: 'switch' },
      { id: 'vent', label: '泄压', kind: 'switch' },
      { id: 'purge', label: '氮气吹除', kind: 'switch' },
      { id: 'igniter', label: '点火器', kind: 'button' },
      { id: 'mv_fuel', label: '燃料主阀（甲烷）', kind: 'switch' },
      { id: 'mv_ox', label: '氧化剂主阀（液氧）', kind: 'switch' },
      { id: 'abort', label: '紧急关机', kind: 'button' },
    ],
    gauges: [
      { id: 'g_lox', label: '液氧管路', unit: '℃', expr: 'lox_t', min: -190, max: 20, warn: 'igniter == 1 && chilled == 0' },
      { id: 'g_tank', label: '贮箱压力', unit: 'bar', expr: 'tank_p', min: 0, max: 60, digits: 1, warn: 'tank_p > 36' },
      { id: 'g_pc', label: '室压', unit: 'bar', expr: 'pc', min: 0, max: 140, warn: 'unstable == 1' },
      { id: 'g_throat', label: '喉部温度', unit: '℃', expr: 't_throat', min: 0, max: 2400, warn: 't_throat > 1900' },
      { id: 'g_run', label: '燃烧时长', unit: '秒', expr: 'run_s', min: 0, max: 20, digits: 1 },
    ],
    rules: [
      { id: 'cold', label: '没预冷就点火：液氧管路里是气液两相，泵会气蚀', when: 'cold_start == 1', severity: 'violation', once: true },
      { id: 'hard', label: '先开阀再点火：推进剂先灌进燃烧室，点火瞬间就是爆燃（硬启动）', when: 'hard_start == 1', severity: 'violation', once: true },
      { id: 'overp', label: '贮箱超压（增压没停）', when: 'over_p == 1', severity: 'violation', once: true },
      { id: 'late', label: '燃烧不稳定超过 2.5 秒还没紧急关机', when: 'abort_late == 1', severity: 'violation', once: true },
      { id: 'blown', label: '喉部烧穿——这台发动机报废了', when: 'blown == 1', severity: 'violation', once: true },
      { id: 'offband', label: '贮箱压力不在窗口就点火', when: 'offband_start == 1', severity: 'warning', once: true },
      { id: 'nopurge', label: '点火前没吹除（管路里残留的气体会让点火不干净）', when: 'no_purge_start == 1', severity: 'warning', once: true },
      { id: 'nopost', label: '关机 10 秒了还没吹除（残余推进剂留在管路里）', when: 'shut_s > 10 && post_purge == 0', severity: 'warning', once: true },
      { id: 'wet', label: '阀门开着、点火器没亮：推进剂正往燃烧室里积', when: 'wet >= 1 && lit == 0', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：预冷到位（液氧管路 ≤ -150 ℃）', when: 'chilled == 1' },
      { id: 'g2', label: '第二步：贮箱增压到窗口并稳住', when: 'tank_p >= 26 && tank_p <= 36', hold: 3 },
      { id: 'g3', label: '第三步：点火前吹除 3 秒', when: 'purge_done == 1' },
      { id: 'g4', label: '第四步：按顺序点火，发动机起燃', when: 'lit == 1 && hard_start == 0' },
      { id: 'g5', label: '第五步：稳态燃烧 10 秒', when: 'run_s >= 10 && hard_start == 0' },
      { id: 'g6', label: '第六步：燃烧不稳定出现后 2.5 秒内紧急关机', when: 'abort_ok == 1' },
      { id: 'g7', label: '收尾：关机后吹除、泄压', when: 'post_purge == 1 && vented == 1' },
    ],
    expertScript: expertScript(),
  };
}
