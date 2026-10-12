/**
 * 机械设计 · CAD 工程图的交互故事（2026-10-11，第二批「机器中介型」）：浅色整屏，像真的二维 CAD 出图界面。
 *   任务：传送模组的电机座，草图是资深工程师画的，工程图上三处尺寸缺失、基准没标、公差没标，首件试装还查出电机座和护罩干涉。
 *   该做的：① 对照草图补齐三处尺寸（定位孔深度、安装面高度、销孔中心距）——不是看着像就填 ② 标基准：安装底面 A、定位销孔 B、轴端面 C
 *   ③ 公差要车间检得出来：安装面对 A 平行度 0.02，安装面粗糙度 Ra1.6 ④ 跑干涉检查，电机座和护罩在极限位置干涉——改长圆孔让位，不是加垫片凑
 *   ⑤ 出图检查零错误、投影关系对得上。
 *   红线：尺寸填错（填了看着像的数）；基准标在不能定位的面上；公差标得车间检不出来（Ra0.1）；用垫片凑干涉；检查没过就出图。
 * 台面组件：src/components/lab/surfaces/Cad.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

/** 缺失的三处尺寸：候选里只有一个是草图上的数 */
export const CAD_DIMS = [
  { id: 'd1', label: '定位销孔深度', unit: 'mm', options: [12, 15, 18], answer: 15, hint: '草图：销孔 φ6H7 深 15，底部不通' },
  { id: 'd2', label: '安装面高度（到底面 A）', unit: 'mm', options: [42, 45, 48], answer: 45, hint: '草图：安装面高 45，公差 ±0.05' },
  { id: 'd3', label: '两销孔中心距', unit: 'mm', options: [80, 85, 90], answer: 85, hint: '草图：中心距 85，与电机法兰一致' },
];
export const CAD_DATUMS = [
  { id: 'A', label: '基准 A', options: ['安装底面', '顶面', '侧面'], answer: '安装底面' },
  { id: 'B', label: '基准 B', options: ['定位销孔', '螺栓孔', '倒角'], answer: '定位销孔' },
  { id: 'C', label: '基准 C', options: ['轴端面', '护罩面', '肋板'], answer: '轴端面' },
];
export const CAD_TOLS = [
  { id: 'par', label: '安装面对 A 的平行度', options: ['0.02', '0.5', '0.001'], answer: '0.02', note: '0.5 太松（电机装歪），0.001 车间检不出来' },
  { id: 'ra', label: '安装面粗糙度', options: ['Ra1.6', 'Ra12.5', 'Ra0.1'], answer: 'Ra1.6', note: 'Ra12.5 是毛坯面，Ra0.1 是镜面、白花钱' },
];
export const CAD_FIXES = [
  { v: 1, label: '支架改长圆孔，护罩让位 2 mm', good: true, note: '在极限位置留出间隙，装配可调' },
  { v: 2, label: '加 1.5 mm 垫片垫高电机座', good: false, note: '凑合，装配一致性没了' },
  { v: 3, label: '换一个大一号的护罩', good: false, note: '外购件改型号，交期和成本都上去了' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(3, 'tool', 1); push(6, 'd1', 2); push(10, 'd2', 2); push(14, 'd3', 2);          // 补尺寸（候选下标 1-based：2 = 正确值）
  push(18, 'tool', 2); push(20, 'datA', 1); push(23, 'datB', 1); push(26, 'datC', 1);    // 基准
  push(30, 'tool', 3); push(32, 'tol_par', 1); push(35, 'tol_ra', 1);                  // 公差
  push(40, 'tool', 4); push(42, 'check', 1); push(50, 'fix', 1); push(53, 'check', 1); // 干涉检查 → 改长圆孔 → 复查
  push(58, 'tool', 5); push(60, 'review', 1); push(64, 'release', 1);                  // 出图检查、发布
  return a;
}

export function cadSpec(image: string): BenchSpec {
  return {
    name: 'CAD 工程图 · 电机座补图与干涉整改', surface: 'cad',
    brief: '张工丢给你一张资深工程师的草图和一份缺东西的电机座工程图：三处尺寸没标、基准没标、公差没标，首件试装还查出电机座和护罩干涉。对照草图补齐尺寸（别填看着像的数），标基准 A / B / C，公差标得车间检得出来，跑干涉检查、改结构让位，最后出图检查零错误再发布 B.0 版。填错尺寸、基准标错面、公差车间检不出来、用垫片凑干涉、检查没过就出图，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '', layers: [] },
    vars: [
      { id: 'd1_ok', initial: 0, set: 'd1 == 2 ? 1 : 0' }, { id: 'd2_ok', initial: 0, set: 'd2 == 2 ? 1 : 0' }, { id: 'd3_ok', initial: 0, set: 'd3 == 2 ? 1 : 0' },
      { id: 'dims_ok', label: '三处尺寸都对', initial: 0, set: 'd1_ok + d2_ok + d3_ok' },
      { id: 'dim_wrong', label: '填了错的尺寸', initial: 0, set: 'max(dim_wrong, (d1 > 0 && d1 != 2) || (d2 > 0 && d2 != 2) || (d3 > 0 && d3 != 2) ? 1 : 0)' },
      { id: 'dat_ok', label: '基准对了几个', initial: 0, set: '(datA == 1 ? 1 : 0) + (datB == 1 ? 1 : 0) + (datC == 1 ? 1 : 0)' },
      { id: 'dat_wrong', label: '基准标错面', initial: 0, set: 'max(dat_wrong, (datA > 1) || (datB > 1) || (datC > 1) ? 1 : 0)' },
      { id: 'tol_ok', label: '公差对了几个', initial: 0, set: '(tol_par == 1 ? 1 : 0) + (tol_ra == 1 ? 1 : 0)' },
      { id: 'tol_loose', label: '公差太松', initial: 0, set: 'max(tol_loose, tol_par == 2 || tol_ra == 2 ? 1 : 0)' },
      { id: 'tol_tight', label: '公差车间检不出来', initial: 0, set: 'max(tol_tight, tol_par == 3 || tol_ra == 3 ? 1 : 0)' },
      { id: 'checked', label: '跑过干涉检查', initial: 0, set: 'max(checked, check)' },
      { id: 'checks', initial: 0, set: 'checks + check' },
      { id: 'fix_sel', label: '整改方案', initial: 0, set: 'fix > 0 ? fix : fix_sel' },
      { id: 'fix_blind', label: '没查就改', initial: 0, set: 'max(fix_blind, fix > 0 && checked == 0 ? 1 : 0)' },
      { id: 'interf', label: '仍有干涉', initial: 1, set: 'fix_sel == 1 ? 0 : 1' },
      { id: 'recheck_ok', label: '整改后复查通过', initial: 0, set: 'max(recheck_ok, check == 1 && fix_sel == 1 ? 1 : 0)' },
      { id: 'shim', label: '用垫片凑', initial: 0, set: 'max(shim, fix_sel == 2 ? 1 : 0)' },
      { id: 'errors', label: '出图检查错误数', initial: 6, set: '(3 - dims_ok) + (3 - dat_ok) + (2 - tol_ok) + (recheck_ok == 1 ? 0 : 1) + dim_wrong + dat_wrong' },
      { id: 'reviewed', label: '跑过出图检查', initial: 0, set: 'max(reviewed, review)' },
      { id: 'released', label: '已发布 B.0', initial: 0, set: 'max(released, release)' },
      { id: 'release_bad', label: '带错发布', initial: 0, set: 'max(release_bad, release == 1 && (errors > 0 || reviewed == 0) ? 1 : 0)' },
      { id: 'quality', label: '出图质量', initial: 0, min: 0, max: 100, set: 'clamp(dims_ok * 8 + dat_ok * 6 + tol_ok * 7 + (recheck_ok == 1 ? 20 : checked == 1 ? 5 : 0) + (released == 1 && release_bad == 0 ? 20 : 0) + (reviewed == 1 ? 4 : 0) - dim_wrong * 10 - dat_wrong * 10 - tol_loose * 8 - tol_tight * 8 - shim * 15 - fix_blind * 10 - release_bad * 25, 0, 100)' },
    ],
    controls: [
      { id: 'tool', label: '当前工具', kind: 'knob', min: 0, max: 5, step: 1, initial: 0, hint: '1 尺寸 · 2 基准 · 3 公差 · 4 干涉检查 · 5 出图检查' },
      { id: 'd1', label: '定位销孔深度', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'd2', label: '安装面高度', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'd3', label: '两销孔中心距', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'datA', label: '基准 A', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'datB', label: '基准 B', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'datC', label: '基准 C', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'tol_par', label: '平行度', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'tol_ra', label: '粗糙度', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'check', label: '跑干涉检查', kind: 'button' },
      { id: 'fix', label: '整改方案', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hidden: true },
      { id: 'review', label: '出图检查', kind: 'button' },
      { id: 'release', label: '发布 B.0 版', kind: 'button' },
    ],
    gauges: [
      { id: 'g_dims', label: '尺寸补齐', unit: '/3', expr: 'dims_ok', min: 0, max: 3 },
      { id: 'g_dat', label: '基准', unit: '/3', expr: 'dat_ok', min: 0, max: 3 },
      { id: 'g_err', label: '出图错误', unit: '项', expr: 'errors', min: 0, max: 10, warn: 'errors > 0 && reviewed == 1' },
      { id: 'g_q', label: '出图质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'dim', label: '尺寸填了看着像的数（要对照草图，不是猜）', when: 'dim_wrong == 1', severity: 'warning', once: true },
      { id: 'dat', label: '基准标在不能定位的面上', when: 'dat_wrong == 1', severity: 'warning', once: true },
      { id: 'loose', label: '公差太松：电机装上会歪', when: 'tol_loose == 1', severity: 'warning', once: true },
      { id: 'tight', label: '公差车间检不出来 / 白花钱（0.001、Ra0.1）', when: 'tol_tight == 1', severity: 'warning', once: true },
      { id: 'shim', label: '用垫片凑干涉：装配一致性没了', when: 'shim == 1', severity: 'violation', once: true },
      { id: 'blind', label: '没跑干涉检查就改结构', when: 'fix_blind == 1', severity: 'warning', once: true },
      { id: 'bad', label: '出图检查没过（或没跑）就发布', when: 'release_bad == 1', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：对照草图补齐三处尺寸', when: 'dims_ok == 3' },
      { id: 'g2', label: '第二步：基准 A 安装底面 / B 定位销孔 / C 轴端面', when: 'dat_ok == 3' },
      { id: 'g3', label: '第三步：平行度 0.02、粗糙度 Ra1.6', when: 'tol_ok == 2' },
      { id: 'g4', label: '第四步：干涉检查 → 改长圆孔让位 → 复查通过', when: 'recheck_ok == 1 && shim == 0' },
      { id: 'g5', label: '收尾：出图检查零错误，发布 B.0', when: 'released == 1 && release_bad == 0' },
    ],
    expertScript: expertScript(),
  };
}
