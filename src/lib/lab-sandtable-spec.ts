/**
 * 应急指挥 · 山洪的交互故事（2026-10-11，第二批「高风险型」）：浅色整屏沙盘——青岚河涨水、两个村、一处厂区坍塌，七支力量，信息不全。
 *   时间：1 模拟秒 = 故事里 1 分钟。红色预警已发，河水一直涨：青石村（地势低、有行动不便的人）先淹，柳湾村后淹。
 *   第 120 分钟厂区坍塌、6 人被困——力量不够，要在搜救 / 青石转移 / 柳湾转移之间取舍，而且每个取舍都要留痕。
 *   该做的：10 分钟内首报 → 青石村先下令转移、派巡查员 + 救援队（行动不便的人要救援队）→ 安置点满了开第二个 →
 *   柳湾村道路先核实再下令 → 坍塌一报就派消防（10 分钟内）→ 续报 → 每次取舍记决策。
 *   红线：青石村淹了还有人没走；坍塌 10 分钟没派消防；柳湾先于青石转移；信息没核实就下令；取舍不留痕。
 * 台面组件：src/components/lab/surfaces/Sandtable.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const UNITS = [
  { id: 'f1', name: '消防一中队', kind: 'fire', icon: '🚒' }, { id: 'f2', name: '消防二中队', kind: 'fire', icon: '🚒' },
  { id: 'r1', name: '蓝天救援队', kind: 'rescue', icon: '🛶' }, { id: 'r2', name: '民兵应急分队', kind: 'rescue', icon: '🛶' },
  { id: 'p1', name: '巡查员·小刘', kind: 'patrol', icon: '🧍' }, { id: 'p2', name: '巡查员·老陈', kind: 'patrol', icon: '🧍' }, { id: 'p3', name: '巡查员·小周', kind: 'patrol', icon: '🧍' },
];
export const TASKS = ['待命', '青石村转移', '柳湾村转移', '坍塌点搜救'];
export const COLLAPSE_T = 120;          // 厂区坍塌发生的分钟
export const QS_FLOOD = 3.6, LW_FLOOD = 4.3;   // 淹没水位（米）
export const SITE1_CAP = 83;            // 青石村临时安置点只装得下 83%，要开第二安置点

const sum = (kind: string, task: number) => UNITS.filter(u => u.kind === kind).map(u => `(${u.id} == ${task} ? 1 : 0)`).join(' + ');

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(3, 'report', 1);                                           // 首报
  push(5, 'order_qs', 1); push(6, 'p1', 1); push(7, 'p2', 1); push(8, 'r1', 1); push(10, 'log', 1);   // 青石村先转，派人
  push(30, 'verify', 1);                                          // 核实柳湾道路
  push(34, 'open_site2', 1);                                      // 安置点快满，开第二个
  push(46, 'r1', 2); push(50, 'order_lw', 1); push(51, 'p3', 2); push(52, 'r2', 2); push(54, 'log', 1);   // 青石转完，转柳湾
  push(122, 'f1', 3); push(123, 'f2', 3); push(126, 'log', 1);    // 坍塌：消防立刻上
  push(150, 'report', 1);                                         // 续报
  push(170, 'log', 1);
  return a;
}

export function sandtableSpec(image: string): BenchSpec {
  return {
    name: '指挥沙盘 · 青岚河山洪', surface: 'sandtable',
    brief: '暴雨红色预警，青岚河一直在涨。你是值班调度员：沙盘上两个村——青石村地势低、有行动不便的人，先淹；柳湾村在上游高处，晚一点。手里七支力量：两支消防、两支救援队、三个巡查员。十分钟内要首报；青石村先下令转移、派巡查员带路、救援队背行动不便的人；安置点只装得下八成，满了要开第二个；柳湾村的路淹没淹先打电话核实再下令。第 120 分钟厂区会坍塌、6 人被困——消防必须 10 分钟内到。每一次取舍都要记进决策记录。青石村淹了还有人没走、坍塌没人管、信息没核实就下令、取舍不留痕，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 240,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'level', label: '青岚河水位', initial: 2.0, min: 0, max: 6, rate: '0.012' },
      { id: 'qs_fire', initial: 0, set: sum('fire', 1) }, { id: 'qs_rescue', initial: 0, set: sum('rescue', 1) }, { id: 'qs_patrol', initial: 0, set: sum('patrol', 1) },
      { id: 'lw_fire', initial: 0, set: sum('fire', 2) }, { id: 'lw_rescue', initial: 0, set: sum('rescue', 2) }, { id: 'lw_patrol', initial: 0, set: sum('patrol', 2) },
      { id: 'co_fire', initial: 0, set: sum('fire', 3) }, { id: 'co_rescue', initial: 0, set: sum('rescue', 3) },
      // 青石村：转移进度（%），安置点容量、行动不便的人要救援队
      { id: 'qs_cap', initial: 83, set: 'open_site2 == 1 ? 100 : 83' },
      { id: 'qs_had_rescue', label: '青石村来过救援队', initial: 0, set: 'max(qs_had_rescue, qs_rescue > 0 ? 1 : 0)' },
      { id: 'qs_prog', label: '青石村转移', initial: 0, min: 0, max: 100, set: 'order_qs == 1 && qs_flooded == 0 ? min(min(qs_cap, qs_had_rescue == 1 ? 100 : 93), qs_prog + (0.6 * qs_patrol + 1.5 * qs_rescue + 1.0 * qs_fire) * dt) : qs_prog' },
      { id: 'qs_flooded', label: '青石村淹没', initial: 0, set: 'max(qs_flooded, level >= 3.6 ? 1 : 0)' },
      { id: 'qs_lost', label: '青石村淹了还有人', initial: 0, set: 'max(qs_lost, qs_flooded == 1 && qs_prog < 100 ? 1 : 0)' },
      { id: 'qs_done', label: '青石村转完', initial: 0, set: 'max(qs_done, qs_prog >= 100 ? 1 : 0)' },
      { id: 'site_full', label: '安置点满了', initial: 0, set: 'max(site_full, qs_prog >= 83 && open_site2 == 0 ? 1 : 0)' },
      // 柳湾村：道路要先核实；没核实转移慢一半
      { id: 'verified', label: '柳湾道路已核实', initial: 0, set: 'max(verified, verify)' },
      { id: 'lw_prog', label: '柳湾村转移', initial: 0, min: 0, max: 100, set: 'order_lw == 1 && lw_flooded == 0 ? min(100, lw_prog + (0.5 * lw_patrol + 1.2 * lw_rescue + 0.8 * lw_fire) * (verified == 1 ? 1 : 0.5) * dt) : lw_prog' },
      { id: 'lw_flooded', label: '柳湾村淹没', initial: 0, set: 'max(lw_flooded, level >= 4.3 ? 1 : 0)' },
      { id: 'lw_done', label: '柳湾村转完', initial: 0, set: 'max(lw_done, lw_prog >= 90 ? 1 : 0)' },
      { id: 'lw_lost', label: '柳湾村淹了还有人', initial: 0, set: 'max(lw_lost, lw_flooded == 1 && lw_prog < 90 ? 1 : 0)' },
      { id: 'lw_first', label: '柳湾先于青石', initial: 0, set: 'max(lw_first, order_lw == 1 && order_qs == 0 ? 1 : 0)' },
      { id: 'lw_blind', label: '没核实就下令柳湾', initial: 0, set: 'max(lw_blind, order_lw == 1 && verified == 0 ? 1 : 0)' },
      // 坍塌
      { id: 'collapsed', label: '厂区坍塌', initial: 0, set: 't >= 120 ? 1 : 0' },
      { id: 'co_prog', label: '搜救进度', initial: 0, min: 0, max: 100, set: 'collapsed == 1 ? min(100, co_prog + (2.2 * co_fire + 0.8 * co_rescue) * dt) : 0' },
      { id: 'co_wait', label: '坍塌后没消防的分钟', initial: 0, set: 'collapsed == 1 && co_fire == 0 && co_prog < 100 ? co_wait + dt : co_wait' },
      { id: 'co_late', label: '消防 10 分钟没到', initial: 0, set: 'max(co_late, co_wait > 10 ? 1 : 0)' },
      { id: 'co_done', label: '6 人全部救出', initial: 0, set: 'max(co_done, co_prog >= 100 ? 1 : 0)' },
      { id: 'co_timely', label: '消防及时到位', initial: 0, set: 'max(co_timely, collapsed == 1 && co_fire > 0 && co_wait <= 10 ? 1 : 0)' },
      // 报告与留痕
      { id: 'reports', label: '报告次数', initial: 0, set: 'reports + report' },
      { id: 'first_report_t', initial: -1, set: 'first_report_t < 0 && report == 1 ? t : first_report_t' },
      { id: 'report_ok', label: '10 分钟内首报', initial: 0, set: 'max(report_ok, report == 1 && t <= 10 ? 1 : 0)' },
      { id: 'report_late', initial: 0, set: 'max(report_late, t > 10 && reports == 0 ? 1 : 0)' },
      { id: 'followup', label: '坍塌后续报', initial: 0, set: 'max(followup, collapsed == 1 && report == 1 ? 1 : 0)' },
      { id: 'logs', label: '决策记录条数', initial: 0, set: 'logs + log' },
      { id: 'idle_all', label: '力量全在待命', initial: 0, set: 'order_qs == 1 && qs_patrol + qs_rescue + qs_fire == 0 && qs_done == 0 ? idle_all + dt : 0' },
      { id: 'no_log_tradeoff', label: '坍塌后调力量没留痕', initial: 0, set: 'max(no_log_tradeoff, collapsed == 1 && co_fire > 0 && t > 135 && logs < 3 ? 1 : 0)' },
      { id: 'quality', label: '处置质量', initial: 0, min: 0, max: 100, set: 'clamp((report_ok == 1 ? 10 : 0) + (qs_done == 1 ? 25 : qs_prog * 0.15) + (lw_done == 1 ? 15 : lw_prog * 0.1) + (co_done == 1 ? 20 : co_prog * 0.1) + (co_timely == 1 ? 10 : 0) + (followup == 1 ? 5 : 0) + min(15, logs * 4) - qs_lost * 40 - lw_lost * 20 - co_late * 25 - lw_first * 10 - lw_blind * 10 - report_late * 5 - no_log_tradeoff * 10, 0, 100)' },
    ],
    controls: [
      { id: 'report', label: '向上级报告（首报 / 续报）', kind: 'button' },
      { id: 'order_qs', label: '下令：青石村转移', kind: 'switch' },
      { id: 'order_lw', label: '下令：柳湾村转移', kind: 'switch' },
      { id: 'open_site2', label: '启用第二安置点', kind: 'switch' },
      { id: 'verify', label: '电话核实柳湾村道路', kind: 'button' },
      { id: 'log', label: '记一条决策记录', kind: 'button' },
      ...UNITS.map(u => ({ id: u.id, label: `${u.name} 去向`, kind: 'knob' as const, min: 0, max: 3, step: 1, initial: 0, hint: '0 待命 · 1 青石村 · 2 柳湾村 · 3 坍塌点', hidden: true })),
    ],
    gauges: [
      { id: 'g_level', label: '青岚河水位', unit: 'm', expr: 'level', min: 0, max: 6, digits: 2, warn: 'level >= 3.2' },
      { id: 'g_qs', label: '青石村转移', unit: '%', expr: 'qs_prog', min: 0, max: 100, warn: 'qs_flooded == 1 && qs_prog < 100' },
      { id: 'g_lw', label: '柳湾村转移', unit: '%', expr: 'lw_prog', min: 0, max: 100 },
      { id: 'g_co', label: '搜救进度', unit: '%', expr: 'co_prog', min: 0, max: 100, warn: 'co_wait > 5' },
      { id: 'g_q', label: '处置质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'qs_lost', label: '青石村淹没时还有人没转出来', when: 'qs_lost == 1', severity: 'violation', once: true },
      { id: 'co_late', label: '厂区坍塌 10 分钟了还没派消防', when: 'co_late == 1', severity: 'violation', once: true },
      { id: 'lw_lost', label: '柳湾村淹没时转移没完成', when: 'lw_lost == 1', severity: 'violation', once: true },
      { id: 'lw_first', label: '柳湾村先于青石村下令（地势低、有行动不便的人的村要先走）', when: 'lw_first == 1', severity: 'warning', once: true },
      { id: 'lw_blind', label: '柳湾村道路没核实就下令转移（路淹了人往哪走）', when: 'lw_blind == 1', severity: 'warning', once: true },
      { id: 'report_late', label: '超过 10 分钟没有首报', when: 'report_late == 1', severity: 'warning', once: true },
      { id: 'idle', label: '下了转移令但一支力量都没派（令是空的）', when: 'idle_all > 5', severity: 'warning', once: true },
      { id: 'site', label: '安置点满了、转移停住，还没开第二安置点', when: 'site_full == 1 && open_site2 == 0 && qs_done == 0', severity: 'warning', once: true },
      { id: 'nolog', label: '坍塌后调走力量却没留决策记录（事后谁都说不清为什么）', when: 'no_log_tradeoff == 1', severity: 'warning', once: true },
      { id: 'nomob', label: '青石村只有巡查员带路，行动不便的人没人背（要派救援队）', when: 'order_qs == 1 && qs_prog >= 90 && qs_had_rescue == 0', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '10 分钟内首报', when: 'report_ok == 1' },
      { id: 'g2', label: '青石村先下令转移并派出力量', when: 'order_qs == 1 && qs_patrol + qs_rescue + qs_fire > 0 && lw_first == 0' },
      { id: 'g3', label: '青石村淹没前全部转出（含行动不便的人）', when: 'qs_done == 1 && qs_lost == 0' },
      { id: 'g4', label: '坍塌 10 分钟内消防到位、6 人全部救出', when: 'co_done == 1 && co_late == 0' },
      { id: 'g5', label: '柳湾村核实后转移、淹没前完成', when: 'lw_done == 1 && lw_blind == 0' },
      { id: 'g6', label: '坍塌后续报，决策记录不少于 3 条', when: 'followup == 1 && logs >= 3' },
    ],
    expertScript: expertScript(),
  };
}
