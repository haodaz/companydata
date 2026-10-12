/**
 * 变电站倒闸 · 现场验电挂地线的交互故事（2026-10-11，第二批「高风险型」）：110 kV 清枫线 112 间隔检修前的安全措施。
 *   操作票说 112 断路器、1121 母线侧刀闸、1123 线路侧刀闸都已拉开。到了现场要先核对双重名称和**实际位置**——
 *   陷阱：1121 的后台位置显示「分」，现场机械指示其实没分到位（母线侧还带电）。该做的：发现 → 汇报调度，不能当没看见。
 *   然后：验电器先在带电处自检 → 线路侧验电（无电）→ 装设接地线：先接接地端、后接导体端 → 挂标示牌 → 向调度回令。
 *   红线：没验电就挂地线；在有电的母线侧挂地线；接地线先接导体端；跨越安全遮栏进带电间隔；验电器没自检；发现异常不汇报。
 * 台面组件：src/components/lab/surfaces/Switching.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const SW_TOOLS = [
  { v: 0, label: '手', icon: '✋' }, { v: 1, label: '验电器', icon: '🔦' }, { v: 2, label: '接地线', icon: '🔗' }, { v: 3, label: '标示牌', icon: '🪧' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'check_name', 1); push(4, 'pos_112', 1); push(6, 'pos_1123', 1); push(8, 'pos_1121', 1);   // 核对名称、位置——1121 没分到位
  push(11, 'report_abn', 1);                                                                          // 汇报调度
  push(14, 'tool', 1); push(16, 'test_dev', 1); push(19, 'verify_line', 1); push(22, 'verify_bus', 1); // 自检 → 线路侧无电 → 母线侧有电（印证）
  push(25, 'tool', 2); push(27, 'g_earth', 1); push(30, 'g_cond', 1);                                 // 先接地端、后导体端
  push(33, 'tool', 3); push(35, 'tag', 1);
  push(38, 'report', 1);
  return a;
}

export function switchingSpec(image: string): BenchSpec {
  return {
    name: '112 间隔 · 验电挂地线', surface: 'switching',
    brief: '调度令：110 kV 清枫线 112 间隔转检修。操作票上 112 断路器、1121 母线侧刀闸、1123 线路侧刀闸都已拉开，陈工监护，你操作。到现场先核对设备双重名称和实际位置——别只信后台；验电器先在带电处自检，再到线路侧验电；确认无电才装接地线，先接接地端、后接导体端；挂标示牌；最后向调度回令。没验电就挂、在有电的地方挂、接地线接反、跨遮栏、发现异常不汇报，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'name_ok', label: '核对了双重名称', initial: 0, set: 'max(name_ok, check_name)' },
      { id: 'p112', initial: 0, set: 'max(p112, pos_112)' }, { id: 'p1123', initial: 0, set: 'max(p1123, pos_1123)' },
      { id: 'found', label: '发现 1121 未分到位', initial: 0, set: 'max(found, pos_1121)' },
      { id: 'reported', label: '异常已汇报', initial: 0, set: 'max(reported, report_abn)' },
      { id: 'bus_live', label: '母线侧带电', initial: 1, set: '1' },
      { id: 'tested', label: '验电器已自检', initial: 0, set: 'max(tested, test_dev == 1 && tool == 1 ? 1 : 0)' },
      { id: 'v_line', label: '线路侧验电：无电', initial: 0, set: 'max(v_line, verify_line == 1 && tool == 1 ? 1 : 0)' },
      { id: 'v_line_untested', label: '没自检就验电', initial: 0, set: 'max(v_line_untested, verify_line == 1 && tested == 0 ? 1 : 0)' },
      { id: 'v_bus', label: '母线侧验电：有电', initial: 0, set: 'max(v_bus, verify_bus == 1 && tool == 1 ? 1 : 0)' },
      { id: 'g_earth_done', label: '接地端已接', initial: 0, set: 'max(g_earth_done, g_earth == 1 && tool == 2 ? 1 : 0)' },
      { id: 'g_cond_done', label: '导体端已接', initial: 0, set: 'max(g_cond_done, g_cond == 1 && tool == 2 && g_earth_done == 1 ? 1 : 0)' },
      { id: 'g_rev', label: '接地线接反', initial: 0, set: 'max(g_rev, g_cond == 1 && g_earth_done == 0 ? 1 : 0)' },
      { id: 'g_blind', label: '没验电就挂地线', initial: 0, set: 'max(g_blind, (g_earth == 1 || g_cond == 1) && v_line == 0 ? 1 : 0)' },
      { id: 'g_live', label: '在带电的母线侧挂地线', initial: 0, set: 'max(g_live, g_bus)' },
      { id: 'crossed', label: '跨越安全遮栏', initial: 0, set: 'max(crossed, cross)' },
      { id: 'tagged', label: '标示牌已挂', initial: 0, set: 'max(tagged, tag == 1 && tool == 3 ? 1 : 0)' },
      { id: 'grounded', label: '接地线装设完成', initial: 0, set: 'g_earth_done == 1 && g_cond_done == 1 ? 1 : 0' },
      { id: 'done', label: '已回令', initial: 0, set: 'max(done, report == 1 && grounded == 1 && tagged == 1 ? 1 : 0)' },
      { id: 'report_early', label: '措施没做完就回令', initial: 0, set: 'max(report_early, report == 1 && (grounded == 0 || tagged == 0) ? 1 : 0)' },
      { id: 'skip_check', label: '没核对就动手', initial: 0, set: 'max(skip_check, (test_dev == 1 || verify_line == 1) && (name_ok == 0 || p112 == 0 || p1123 == 0 || found == 0) ? 1 : 0)' },
      { id: 'unreported', label: '发现异常没汇报就继续', initial: 0, set: 'max(unreported, found == 1 && reported == 0 && (verify_line == 1 || g_earth == 1) ? 1 : 0)' },
      { id: 'quality', label: '操作质量', initial: 0, min: 0, max: 100, set: 'clamp((name_ok == 1 ? 8 : 0) + (found == 1 ? 10 : 0) + (reported == 1 ? 12 : 0) + (tested == 1 ? 8 : 0) + (v_line == 1 ? 12 : 0) + (grounded == 1 ? 20 : 0) + (tagged == 1 ? 10 : 0) + (done == 1 ? 20 : 0) - g_live * 60 - g_blind * 40 - crossed * 40 - g_rev * 20 - v_line_untested * 10 - unreported * 25 - skip_check * 10 - report_early * 15, 0, 100)' },
    ],
    controls: [
      { id: 'tool', label: '手里拿的', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, hint: '0 手 · 1 验电器 · 2 接地线 · 3 标示牌' },
      { id: 'check_name', label: '核对设备双重名称', kind: 'button' },
      { id: 'pos_112', label: '核对 112 断路器位置', kind: 'button' },
      { id: 'pos_1121', label: '核对 1121 刀闸位置', kind: 'button' },
      { id: 'pos_1123', label: '核对 1123 刀闸位置', kind: 'button' },
      { id: 'report_abn', label: '向调度汇报异常', kind: 'button' },
      { id: 'test_dev', label: '验电器在带电处自检', kind: 'button' },
      { id: 'verify_line', label: '线路侧验电', kind: 'button' },
      { id: 'verify_bus', label: '母线侧验电', kind: 'button' },
      { id: 'g_earth', label: '接地线：接接地端', kind: 'button' },
      { id: 'g_cond', label: '接地线：接导体端', kind: 'button' },
      { id: 'g_bus', label: '在母线侧挂接地线', kind: 'button', hidden: true },
      { id: 'cross', label: '跨越安全遮栏', kind: 'button', hidden: true },
      { id: 'tag', label: '悬挂标示牌', kind: 'button' },
      { id: 'report', label: '向调度回令', kind: 'button' },
    ],
    gauges: [
      { id: 'g_bus', label: '母线侧', unit: '', expr: 'bus_live', min: 0, max: 1, warn: 'bus_live == 1' },
      { id: 'g_ground', label: '接地线', unit: '组', expr: 'grounded', min: 0, max: 1 },
      { id: 'g_q', label: '操作质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'quality < 50 && t > 60' },
    ],
    rules: [
      { id: 'live', label: '在带电的母线侧挂接地线——这是会出人命的那一步', when: 'g_live == 1', severity: 'violation', once: true },
      { id: 'blind', label: '没验电就装接地线（验电是为了确认无电，不是走形式）', when: 'g_blind == 1', severity: 'violation', once: true },
      { id: 'cross', label: '跨越安全遮栏进入带电间隔', when: 'crossed == 1', severity: 'violation', once: true },
      { id: 'rev', label: '接地线先接了导体端（应先接接地端、后接导体端）', when: 'g_rev == 1', severity: 'violation', once: true },
      { id: 'unrep', label: '发现 1121 没分到位却不汇报、继续操作', when: 'unreported == 1', severity: 'violation', once: true },
      { id: 'untested', label: '验电器没在带电处自检就验电（坏的验电器也不亮）', when: 'v_line_untested == 1', severity: 'warning', once: true },
      { id: 'skip', label: '没核对完名称和位置就动手', when: 'skip_check == 1', severity: 'warning', once: true },
      { id: 'early', label: '安全措施没做完就向调度回令', when: 'report_early == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：核对双重名称和三台设备的实际位置', when: 'name_ok == 1 && p112 == 1 && p1123 == 1 && found == 1' },
      { id: 'g2', label: '第二步：发现 1121 未分到位，向调度汇报', when: 'reported == 1' },
      { id: 'g3', label: '第三步：验电器自检后，线路侧验电确认无电', when: 'tested == 1 && v_line == 1' },
      { id: 'g4', label: '第四步：线路侧装设接地线（先接地端、后导体端）', when: 'grounded == 1 && g_rev == 0' },
      { id: 'g5', label: '第五步：悬挂标示牌', when: 'tagged == 1' },
      { id: 'g6', label: '收尾：向调度回令', when: 'done == 1' },
    ],
    expertScript: expertScript(),
  };
}
