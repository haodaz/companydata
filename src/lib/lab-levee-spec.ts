/**
 * 应急 · 河堤抢险的一线交互故事（2026-10-11，用户：指挥之外得有一线的活——防汛物料怎么布、设备怎么架）。
 *   青石村河堤有一段低洼堤顶（低 0.3 m），水一直涨：先在迎水面铺土工布防渗，再在堤顶堆沙袋子堤（错缝码放，一层 8 袋 = 0.3 m），
 *   第 40 分钟堤脚冒浑水——管涌：用沙袋围成反滤围井，围井里按「砂 → 小石 → 大石」自下而上铺反滤料，浑水变清才算压住；
 *   村里低洼处积水：架排水泵——放到位、加油、出水管一定要接到堤外（接堤内等于白抽）。上迎水面之前系安全绳。
 *   红线：漫顶；没错缝的子堤被冲垮；没铺土工布就堆袋（渗水）；反滤料顺序反了；泵出水口接在堤内；不系安全绳上迎水面；管涌晾着不管。
 * 台面组件：src/components/lab/surfaces/Levee.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const LEVEE_TOOLS = [
  { v: 0, label: '手', icon: '✋' }, { v: 1, label: '沙袋', icon: '🧱' }, { v: 2, label: '土工布', icon: '🧵' }, { v: 3, label: '反滤料', icon: '🪨' }, { v: 4, label: '排水泵', icon: '⚙️' },
];
export const CREST = 3.1;           // 低洼堤顶高程（米）
export const PIPING_T = 40;         // 管涌出现的分钟
export const BAGS_PER_LAYER = 8, WELL_BAGS = 12;

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'rope', 1); push(4, 'tool', 2); push(6, 'cloth', 1);                 // 系绳、铺土工布
  push(8, 'pattern', 1); push(9, 'tool', 1);
  for (let i = 0; i < 16; i++) push(10 + i * 2, 'bag', 1);                      // 两层子堤（0.6 m）
  push(41, 'tool', 1); for (let i = 0; i < 12; i++) push(42 + i * 1.2, 'well', 1);   // 管涌一冒头就围井 12 袋
  push(57, 'tool', 3); push(58, 'lay_sand', 1); push(60, 'lay_gravel', 1); push(62, 'lay_stone', 1);   // 反滤料自下而上
  push(64, 'tool', 4); push(65, 'pump_place', 1); push(67, 'fuel', 1); push(69, 'hose_out', 1); push(70, 'pump_on', 1);
  push(73, 'tool', 1); for (let i = 0; i < 8; i++) push(75 + i * 2, 'bag', 1);  // 第三层（0.9 m），顶住洪峰
  return a;
}

export function leveeSpec(image: string): BenchSpec {
  return {
    name: '青石村河堤 · 子堤 / 围井 / 排涝', surface: 'levee',
    brief: '你在青石村河堤抢险队。这段堤顶比两边低三十公分，水一直涨。先系安全绳，到迎水面铺土工布，再在堤顶堆沙袋子堤——错缝码放、一层八袋。过一会儿堤脚会冒浑水（管涌）：用沙袋围成围井，里面按砂、小石、大石自下而上铺反滤料，浑水变清才算压住。村里低洼处在积水：把排水泵放到位、加油、出水管接到堤外再开。漫顶、子堤被冲垮、反滤顺序反了、泵出水口接在堤内、不系绳上迎水面，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 240,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'level', label: '河水位', initial: 2.2, min: 0, max: 5, rate: 'level < 3.65 ? 0.015 : 0' },
      { id: 'roped', label: '系了安全绳', initial: 0, set: 'rope' },
      { id: 'cloth_done', label: '土工布铺好', initial: 0, set: 'max(cloth_done, cloth == 1 && tool == 2 ? 1 : 0)' },
      { id: 'cloth_norope', label: '没系绳上迎水面', initial: 0, set: 'max(cloth_norope, cloth == 1 && rope == 0 ? 1 : 0)' },
      { id: 'bags', label: '子堤沙袋数', initial: 0, set: 'bags + (bag == 1 && tool == 1 ? 1 : 0)' },
      { id: 'bag_nocloth', label: '没铺布就堆袋', initial: 0, set: 'max(bag_nocloth, bag == 1 && cloth_done == 0 ? 1 : 0)' },
      { id: 'dike_h', label: '子堤高度', initial: 0, set: 'bags >= 24 ? 0.9 : (bags >= 16 ? 0.6 : (bags >= 8 ? 0.3 : 0))' },
      { id: 'top', label: '挡水高程', initial: 3.1, set: '3.1 + dike_h' },
      { id: 'overtop', label: '漫顶', initial: 0, set: 'max(overtop, level > top ? 1 : 0)' },
      { id: 'dike_fail', label: '子堤垮了', initial: 0, set: 'max(dike_fail, pattern == 0 && bags >= 8 && level > top - 0.25 ? 1 : 0)' },
      { id: 'seep', label: '子堤渗水', initial: 0, set: 'bags >= 8 && cloth_done == 0 && level > 3.0 ? 1 : 0' },
      // 管涌
      { id: 'piping', label: '管涌出现', initial: 0, set: 't >= 40 ? 1 : 0' },
      { id: 'well_n', label: '围井沙袋', initial: 0, set: 'well_n + (well == 1 && tool == 1 && piping == 1 ? 1 : 0)' },
      { id: 'well_done', initial: 0, set: 'well_n >= 12 ? 1 : 0' },
      { id: 'sand', initial: 0, set: 'max(sand, lay_sand == 1 && tool == 3 && well_done == 1 ? 1 : 0)' },
      { id: 'gravel', initial: 0, set: 'max(gravel, lay_gravel == 1 && tool == 3 && well_done == 1 ? 1 : 0)' },
      { id: 'stone', initial: 0, set: 'max(stone, lay_stone == 1 && tool == 3 && well_done == 1 ? 1 : 0)' },
      { id: 'filter_bad', label: '反滤顺序反了', initial: 0, set: 'max(filter_bad, (lay_gravel == 1 && sand == 0) || (lay_stone == 1 && gravel == 0) ? 1 : 0)' },
      { id: 'filter_ok', label: '反滤围井成了', initial: 0, set: 'well_done == 1 && sand == 1 && gravel == 1 && stone == 1 && filter_bad == 0 ? 1 : 0' },
      { id: 'flow', label: '管涌流量', initial: 0, min: 0, max: 10, rate: 'piping == 0 ? 0 : (filter_ok == 1 ? -0.6 : 0.06)' },
      { id: 'piping_wait', label: '管涌晾着的分钟', initial: 0, set: 'piping == 1 && filter_ok == 0 ? piping_wait + dt : piping_wait' },
      { id: 'piping_late', initial: 0, set: 'max(piping_late, piping_wait > 25 ? 1 : 0)' },
      // 排涝
      { id: 'placed', initial: 0, set: 'max(placed, pump_place == 1 && tool == 4 ? 1 : 0)' },
      { id: 'fueled', initial: 0, set: 'max(fueled, fuel == 1 && placed == 1 ? 1 : 0)' },
      { id: 'pumping', label: '在抽水', initial: 0, set: 'placed == 1 && fueled == 1 && pump_on == 1 ? 1 : 0' },
      { id: 'pump_in', label: '出水口接在堤内', initial: 0, set: 'max(pump_in, pumping == 1 && hose_out == 0 ? 1 : 0)' },
      { id: 'pump_dry', label: '没加油就开泵', initial: 0, set: 'max(pump_dry, pump_on == 1 && fueled == 0 ? 1 : 0)' },
      { id: 'water', label: '村内积水', initial: 12, min: 0, max: 200, rate: '0.03 + flow * 0.25 + seep * 0.1 + (overtop == 1 && dike_fail == 0 ? 0.6 : 0) + dike_fail * 1.2 - (pumping == 1 && hose_out == 1 ? 0.55 : 0)' },
      { id: 'drained', label: '积水退到安全线', initial: 0, set: 'max(drained, pumping == 1 && hose_out == 1 && water < 10 ? 1 : 0)' },
      { id: 'held', label: '顶住了洪峰', initial: 0, set: 'max(held, level >= 3.65 && overtop == 0 && dike_fail == 0 ? 1 : 0)' },
      { id: 'quality', label: '抢险质量', initial: 0, min: 0, max: 100, set: 'clamp((cloth_done == 1 ? 10 : 0) + (dike_h >= 0.9 ? 25 : dike_h >= 0.6 ? 15 : dike_h >= 0.3 ? 5 : 0) + (filter_ok == 1 ? 20 : well_done == 1 ? 8 : 0) + (drained == 1 ? 15 : pumping == 1 && hose_out == 1 ? 8 : 0) + (held == 1 ? 20 : 0) + (roped == 1 ? 5 : 0) + (pattern == 1 ? 5 : 0) - overtop * 30 - dike_fail * 40 - bag_nocloth * 10 - filter_bad * 15 - pump_in * 10 - cloth_norope * 20 - piping_late * 10 - pump_dry * 5, 0, 100)' },
    ],
    controls: [
      { id: 'tool', label: '手里拿的', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '0 手 · 1 沙袋 · 2 土工布 · 3 反滤料 · 4 排水泵' },
      { id: 'rope', label: '系安全绳', kind: 'switch' },
      { id: 'cloth', label: '迎水面铺土工布', kind: 'button' },
      { id: 'pattern', label: '错缝码放', kind: 'switch' },
      { id: 'bag', label: '子堤：堆一袋', kind: 'button' },
      { id: 'well', label: '围井：堆一袋', kind: 'button' },
      { id: 'lay_sand', label: '围井铺砂', kind: 'button' },
      { id: 'lay_gravel', label: '围井铺小石', kind: 'button' },
      { id: 'lay_stone', label: '围井铺大石', kind: 'button' },
      { id: 'pump_place', label: '排水泵就位', kind: 'button' },
      { id: 'fuel', label: '加油', kind: 'button' },
      { id: 'hose_out', label: '出水管接到堤外', kind: 'switch' },
      { id: 'pump_on', label: '开泵', kind: 'switch' },
    ],
    gauges: [
      { id: 'g_level', label: '河水位', unit: 'm', expr: 'level', min: 0, max: 5, digits: 2, warn: 'level > top - 0.2' },
      { id: 'g_top', label: '挡水高程', unit: 'm', expr: 'top', min: 0, max: 5, digits: 1 },
      { id: 'g_flow', label: '管涌流量', unit: '', expr: 'flow', min: 0, max: 10, digits: 1, warn: 'flow > 1' },
      { id: 'g_water', label: '村内积水', unit: 'cm', expr: 'water', min: 0, max: 100, warn: 'water > 30' },
      { id: 'g_q', label: '抢险质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'overtop', label: '漫顶：水从子堤上过去了', when: 'overtop == 1', severity: 'violation', once: true },
      { id: 'fail', label: '子堤没错缝码放，被水冲垮', when: 'dike_fail == 1', severity: 'violation', once: true },
      { id: 'norope', label: '没系安全绳就上迎水面（水流一带人就没了）', when: 'cloth_norope == 1', severity: 'violation', once: true },
      { id: 'nocloth', label: '没铺土工布就堆沙袋：子堤会渗水', when: 'bag_nocloth == 1', severity: 'warning', once: true },
      { id: 'filter', label: '反滤料顺序反了（要自下而上：砂 → 小石 → 大石）', when: 'filter_bad == 1', severity: 'warning', once: true },
      { id: 'pumpin', label: '泵的出水口接在堤内，水又流回来了', when: 'pump_in == 1', severity: 'warning', once: true },
      { id: 'dry', label: '没加油就开泵', when: 'pump_dry == 1', severity: 'warning', once: true },
      { id: 'late', label: '管涌出现 25 分钟了还没压住', when: 'piping_late == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：系安全绳，迎水面铺土工布', when: 'cloth_done == 1 && cloth_norope == 0' },
      { id: 'g2', label: '第二步：错缝码放两层子堤（0.6 m）', when: 'dike_h >= 0.6 && pattern == 1' },
      { id: 'g3', label: '第三步：管涌围井 12 袋，反滤料砂 → 小石 → 大石，流量压到 0', when: 'filter_ok == 1 && flow < 0.1', after: 'piping == 1' },
      { id: 'g4', label: '第四步：排水泵就位、加油、出水接堤外，积水退到 10 cm 以下', when: 'drained == 1' },
      { id: 'g5', label: '第五步：子堤加到三层（0.9 m）顶住洪峰', when: 'held == 1 && dike_h >= 0.9' },
    ],
    expertScript: expertScript(),
  };
}
