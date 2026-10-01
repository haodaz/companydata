/**
 * Case H 的虚拟工位：液氧甲烷火箭 · 造一发、试一台。
 *   H1 贮箱纵缝搅拌摩擦焊（轨迹工位）——转速、下压量、焊速三个参数配死了才动枪；
 *      走太快是未焊透、走太慢是过热飞边、下压不够是根部未焊合。航天贮箱漏一点都不行。
 *   H2 发动机试车点火时序（时序工位）——阀门先后差半秒，结果是富氧烧蚀还是硬启动。
 *      这台考的不是手稳，是「什么时候该做什么、出事了多快能关」。
 * ⚠ 全部参数为教学化的简化模型，用于演示操作过程的采集与评估，不代表任何型号的真实工艺或试车程序。
 */
import type { BenchSpec, BenchAction, BenchLayer } from '@/lib/bench';

// ════════════════════════════════════════════════════════════════
// H1：贮箱纵缝搅拌摩擦焊
// ════════════════════════════════════════════════════════════════
const WX0 = 470, WY0 = 585, WX1 = 1120, WY1 = 545;     // 焊缝两端（场景坐标 1600 × 900）
const FSW_POINTS = [{ x: WX0 / 16, y: WY0 / 9 }, { x: WX1 / 16, y: WY1 / 9 }];
const coach = (id: string, on: string, label: string, y = 9, color?: string): BenchLayer =>
  ({ id, kind: 'coach', x: 50, y, w: 0, h: 0, on, label, color });

export const BENCH_FSW: BenchSpec = {
  name: '贮箱工位 · 纵缝搅拌摩擦焊',
  brief: '一块 2219 铝合金贮箱壁板，一条 4 米纵缝。搅拌摩擦焊不熔化母材，靠搅拌头把两边塑化搅在一起——转速、下压量、焊接速度三个参数先配死，再匀速走完。走快了未焊透，走慢了过热飞边，下压不够根部焊不上。贮箱是要装几十吨低温推进剂的，漏一点都不行。（教学化简化模型，不代表任何型号真实工艺）',
  timeScale: 1,
  maxSeconds: 300,
  vars: [
    { id: 'prev', initial: 0, set: 'weld' },
    { id: 'rate_w', label: '焊接速度', initial: 0, set: '(weld - prev) / dt', min: 0, max: 60 },
    { id: 'welding', initial: 0, set: 'rate_w > 0.4 && plunge > 0.02 ? 1 : 0' },
    { id: 'dev_sum', initial: 0, rate: 'welding == 1 ? dev : 0' },
    { id: 'dev_time', initial: 0, rate: 'welding == 1 ? 1 : 0' },
    { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
    // 热输入 = 转速 / 焊速，太高过热飞边、太低未焊透
    { id: 'heat', label: '热输入指数', initial: 0, set: 'rate_w > 0.3 ? rpm / (rate_w * 42) : 0', min: 0, max: 40 },
    { id: 'hot', label: '过热秒数', initial: 0, max: 16, rate: 'welding == 1 && heat > 13 ? 1 : 0' },
    { id: 'cold', label: '热输入不足秒数', initial: 0, max: 16, rate: 'welding == 1 && heat < 6 ? 1 : 0' },
    { id: 'shallow', label: '下压不足秒数', initial: 0, max: 16, rate: 'welding == 1 && plunge < 0.15 ? 1 : 0' },
    { id: 'overplunge', label: '下压过深秒数', initial: 0, max: 16, rate: 'welding == 1 && plunge > 0.35 ? 1 : 0' },
    { id: 'preheat_t', label: '搅拌头预热秒数', initial: 0, rate: 'spin == 1 && weld < 1 ? 1 : 0' },
    { id: 'stall', label: '停顿秒数', initial: 0, set: 'weld > 2 && weld < 99 && rate_w < 0.4 ? stall + dt : 0' },
    { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
    { id: 'keyhole', label: '收尾匙孔', initial: 0, set: 'weld >= 100 && spin == 1 ? 1 : keyhole' },
    { id: 'quality', label: '焊缝质量', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - dev_avg * 0.5 - hot * 3.5 - cold * 4 - shallow * 4.5 - overplunge * 3 - max(0, stall_max - 3) * 5 - max(0, 100 - weld) * 0.5 - keyhole * 12, 0, 100)' },
  ],
  controls: [
    { id: 'rpm', label: '搅拌头转速', kind: 'knob', min: 200, max: 1200, step: 50, unit: 'r/min', initial: 300, hint: '2219 铝合金常用 600–900 r/min' },
    { id: 'plunge', label: '下压量', kind: 'knob', min: 0, max: 0.6, step: 0.05, unit: 'mm', initial: 0, hint: '轴肩压入 0.2–0.3 mm；压浅了根部焊不上，压深了减薄' },
    { id: 'spin', label: '主轴旋转', kind: 'switch', hint: '先转起来、原地预热几秒，再开始走' },
    { id: 'weld', label: '沿焊缝行走', kind: 'path', hint: '匀速走完 4 米纵缝；也可以打开摄像头用手走' },
    { id: 'dev', label: '偏离', kind: 'knob', min: 0, max: 400, initial: 0, hidden: true },
  ],
  gauges: [
    { id: 'g_heat', label: '热输入指数', unit: '', expr: 'heat', min: 0, max: 24, digits: 1, warn: 'welding == 1 && (heat > 13 || heat < 6)' },
    { id: 'g_rate', label: '焊接速度', unit: '%/s', expr: 'rate_w', min: 0, max: 8, digits: 1 },
    { id: 'g_dev', label: '偏离焊缝', unit: 'mm', expr: 'dev * 0.3', min: 0, max: 60, digits: 1, warn: 'dev > 110' },
    { id: 'g_q', label: '焊缝质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'weld > 10 && quality < 60' },
  ],
  rules: [
    { id: 'no_spin', label: '主轴没转就下压行走（搅拌头会折断）', when: 'weld > 1 && weld < 100 && spin == 0', severity: 'violation' },
    { id: 'no_preheat', label: '没预热就起步（起弧端根部未焊合）', when: 'weld > 2 && preheat_t < 3', severity: 'violation', once: true },
    { id: 'hot', label: '热输入过高（过热、飞边、晶粒粗大）', when: 'welding == 1 && heat > 13', severity: 'violation', once: true },
    { id: 'cold', label: '热输入不足（未焊透、隧道型缺陷）', when: 'welding == 1 && heat < 6', severity: 'violation', once: true },
    { id: 'shallow', label: '下压量不足（根部未焊合——贮箱会漏）', when: 'welding == 1 && plunge < 0.15', severity: 'violation', once: true },
    { id: 'deep', label: '下压过深（壁板减薄）', when: 'welding == 1 && plunge > 0.35', severity: 'warning', once: true },
    { id: 'off', label: '偏离焊缝中心线', when: 'welding == 1 && dev > 150', severity: 'violation' },
    { id: 'stall', label: '中途停住超过 3 秒（局部过热塌陷）', when: 'stall > 3 && weld > 3 && weld < 97', severity: 'violation' },
    { id: 'keyhole', label: '走完没提刀停转（收尾留下匙孔）', when: 'weld >= 100 && spin == 1 && t > 6', severity: 'warning', once: true },
  ],
  goals: [
    { id: 'params', label: '起步前把转速调到 600–900 r/min、下压量 0.2–0.3 mm', when: 'rpm >= 600 && rpm <= 900 && plunge >= 0.2 && plunge <= 0.3 && weld < 1', hold: 1 },
    { id: 'preheat', label: '主轴转起来原地预热 ≥ 3 秒', when: 'preheat_t >= 3 && spin == 1', after: 'params' },
    { id: 'run', label: '匀速走完整条纵缝', when: 'weld >= 100', after: 'preheat' },
    { id: 'heat', label: '全程热输入守在窗口内（6–13）', when: 'weld >= 100 && hot < 2 && cold < 2', after: 'run' },
    { id: 'end', label: '收尾提刀停转', when: 'weld >= 100 && spin == 0', after: 'run' },
    { id: 'quality', label: '焊缝质量 ≥ 70 分、无根部未焊合', when: 'weld >= 100 && quality >= 70 && shallow < 2', after: 'end' },
  ],
  scene: {
    image: '/lab/rocket_fsw.jpg', credit: '底图由通义万相生成',
    layers: [
      { id: 'seam', kind: 'pour', x: 0, y: 0, w: 0, h: 0, control: 'weld', deviation: 'dev', points: FSW_POINTS, pace: 1.4, on: 'welding == 1', label: '纵缝', icon: 'torch' },
      { id: 'heat_glow', kind: 'glow', x: 44, y: 60, w: 5, h: 8, level: 'welding == 1 ? clamp(heat / 16, 0, 1) : 0' },
      { id: 'ro_h', kind: 'readout', x: 2, y: 30, w: 9, h: 5, text: 'heat', unit: '', digits: 1, label: 'HEAT' },
      { id: 'ro_p', kind: 'readout', x: 2, y: 36, w: 9, h: 5, text: 'plunge', unit: 'mm', digits: 2, label: 'PLUNGE', color: '#ffd166' },
      { id: 'spin_lamp', kind: 'lamp', x: 88, y: 22, w: 2.4, h: 4.2, on: 'spin == 1', color: '#3ddc97' },
      coach('c1', 'weld < 1 && (rpm < 600 || rpm > 900 || plunge < 0.2 || plunge > 0.3)', '① 先配参数：转速 600–900 r/min、下压量 0.2–0.3 mm', 9, '#ffd166'),
      coach('c2', 'weld < 1 && rpm >= 600 && rpm <= 900 && plunge >= 0.2 && preheat_t < 3', '② 主轴转起来，原地预热 3 秒再动'),
      coach('c3', 'weld >= 1 && weld < 97', '③ 匀速走：热输入守在 6–13，快了未焊透、慢了过热飞边'),
      coach('c4', 'weld >= 97', '④ 收尾：提刀、停转，别在终点留匙孔', 9, '#ffd166'),
    ],
  },
};

const fswWalk = (t0: number, pct: number, dev = 7): BenchAction[] => {
  const out: BenchAction[] = [];
  for (let i = 0; ; i++) {
    const t = t0 + i * 0.5, v = Math.min(100, i * 0.5 * pct);
    out.push({ t, control: 'dev', value: Math.round(dev * (0.5 + Math.abs(Math.sin(i * 1.7)))) });
    out.push({ t, control: 'weld', value: v });
    if (v >= 100 || i > 400) return out;
  }
};
const fswRun = (rpm: number, plunge: number, speed: number, dev: number, preheat = 5): BenchAction[] => [
  { t: 1, control: 'rpm', value: rpm },
  { t: 2, control: 'plunge', value: plunge },
  { t: 3, control: 'spin', value: 1 },
  ...fswWalk(3 + preheat, speed, dev),
];
export const FSW_EXPERT_SCRIPT: BenchAction[] = [...fswRun(750, 0.25, 1.7, 6), { t: 80, control: 'spin', value: 0 }];
BENCH_FSW.expertScript = FSW_EXPERT_SCRIPT;
export const FSW_SCRIPTS: Record<string, BenchAction[]> = {
  // 材料硕士：参数查对了，但没预热就起步，走得也偏快
  no_preheat: [...fswRun(750, 0.22, 3.4, 13, 1), { t: 50, control: 'spin', value: 0 }],
  // 机械本科：转速拉满、走得慢，热输入爆表；下压量还忘了给够
  overheat: [...fswRun(1150, 0.1, 0.9, 24, 4)],
  // AI 裸答：参数说得出，下压量却只给到 0.1 mm——根部焊不上
  ai_bare: [...fswRun(800, 0.1, 1.9, 11, 4), { t: 70, control: 'spin', value: 0 }],
  ai_skill: [...fswRun(760, 0.25, 1.8, 8), { t: 78, control: 'spin', value: 0 }],
};

// ════════════════════════════════════════════════════════════════
// H2：液氧甲烷发动机试车点火时序
// ════════════════════════════════════════════════════════════════
export const BENCH_ENGINE: BenchSpec = {
  name: '试车台 · 液氧甲烷发动机点火',
  brief: '一台 80 吨级液氧甲烷发动机上试车台。这一台考的不是手稳，是时序：预冷到位才能开阀，燃料必须先于氧化剂进入（富燃启动），点火信号与推进剂到达要对得上，升推力要有台阶，关机必须先切氧化剂。顺序差半秒，结果是富氧烧蚀还是硬启动。（教学化简化模型，不代表任何型号真实试车程序）',
  timeScale: 1,
  maxSeconds: 360,
  vars: [
    // 预冷：泵前温度降到 -170℃ 以下才算到位
    { id: 'lox_t', label: '氧路泵前温度', initial: 20, rate: 'precool == 1 ? -9 : 1.2', min: -190, max: 25 },
    { id: 'cooled', initial: 0, set: 'max(cooled, lox_t <= -170 ? 1 : 0)' },
    // 推进剂到达与点火
    { id: 'fuel_in', initial: 0, set: 'max(fuel_in, fuel == 1 ? 1 : 0)' },
    { id: 'fuel_t', initial: 0, set: 'fuel == 1 && fuel_t == 0 ? t : fuel_t' },
    { id: 'lox_in', initial: 0, set: 'max(lox_in, lox == 1 ? 1 : 0)' },
    { id: 'lox_t0', initial: 0, set: 'lox == 1 && lox_t0 == 0 ? t : lox_t0' },
    { id: 'ign_t', initial: 0, set: 'ignite == 1 && ign_t == 0 ? t : ign_t' },
    { id: 'lit', label: '已点火', initial: 0, set: 'max(lit, ign_t > 0 && fuel_in == 1 && lox_in == 1 ? 1 : 0)' },
    // 室压与推力：点火后随节流阀爬升
    { id: 'pc', label: '燃烧室压力', initial: 0, set: 'lit == 1 ? clamp(pc + (throttle * 1.16 - pc) * 0.16, 0, 125) : max(0, pc - 8)', min: 0, max: 130 },
    { id: 'thrust', label: '推力', initial: 0, set: 'pc * 0.72', min: 0, max: 95 },
    { id: 'mr', label: '混合比 O/F', initial: 0, set: 'lit == 1 && fuel == 1 ? (lox == 1 ? 3.4 - (throttle - 60) * 0.004 : 9) : 0', min: 0, max: 9 },
    // 异常累计
    { id: 'ox_rich', label: '富氧启动秒数', initial: 0, max: 12, rate: 'lit == 0 && lox == 1 && fuel == 0 ? 1 : 0' },
    { id: 'dry_ign', label: '干点火秒数', initial: 0, max: 12, rate: 'lit == 0 && ignite == 1 && (fuel == 0 || lox == 0) ? 1 : 0' },
    { id: 'no_cool', label: '未预冷就开阀秒数', initial: 0, max: 12, rate: '(lox == 1 || fuel == 1) && cooled == 0 ? 1 : 0' },
    { id: 'hard', label: '硬启动风险', initial: 0, max: 100, set: 'clamp(ox_rich * 9 + dry_ign * 7 + no_cool * 6, 0, 100)' },
    { id: 'steady', label: '稳态秒数', initial: 0, rate: 'lit == 1 && pc >= 90 && pc <= 110 && mr >= 3.1 && mr <= 3.7 ? 1 : 0' },
    { id: 'over_pc', label: '超压秒数', initial: 0, max: 12, rate: 'pc > 118 ? 1 : 0' },
    { id: 'shutdown_bad', label: '关机顺序错', initial: 0, set: 'max(shutdown_bad, lit == 1 && fuel == 0 && lox == 1 && pc > 20 ? 1 : 0)' },
    { id: 'quality', label: '试车质量', initial: 0, min: 0, max: 100,
      set: 'clamp(100 - hard * 0.55 - over_pc * 4 - shutdown_bad * 20 - max(0, 20 - steady) * 2.5, 0, 100)' },
  ],
  controls: [
    { id: 'precool', label: '预冷阀', kind: 'switch', hint: '先把氧路预冷到 −170℃ 以下' },
    { id: 'fuel', label: '燃料主阀 CH₄', kind: 'switch', hint: '富燃启动：燃料必须先于氧化剂' },
    { id: 'lox', label: '氧化剂主阀 LOX', kind: 'switch', hint: '燃料到位之后再开；关机时必须先关它' },
    { id: 'ignite', label: '点火器', kind: 'switch', hint: '两路推进剂都到了再点' },
    { id: 'throttle', label: '节流阀', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0, hint: '分台阶升推力，别一把推到底' },
  ],
  gauges: [
    { id: 'g_pc', label: '燃烧室压力', unit: 'bar', expr: 'pc', min: 0, max: 130, warn: 'pc > 118' },
    { id: 'g_th', label: '推力', unit: 'tf', expr: 'thrust', min: 0, max: 95, digits: 1 },
    { id: 'g_mr', label: '混合比 O/F', unit: '', expr: 'mr', min: 0, max: 9, digits: 2, warn: 'lit == 1 && (mr < 3.1 || mr > 3.7)' },
    { id: 'g_t', label: '氧路泵前温度', unit: '℃', expr: 'lox_t', min: -190, max: 25, warn: 'lox_t > -170 && (lox == 1 || fuel == 1)' },
  ],
  rules: [
    { id: 'no_cool', label: '没预冷到位就开主阀（氧路气蚀、泵损坏）', when: '(lox == 1 || fuel == 1) && cooled == 0', severity: 'violation', once: true },
    { id: 'ox_first', label: '氧化剂先于燃料进入（富氧启动——烧穿头部）', when: 'lit == 0 && lox == 1 && fuel == 0', severity: 'violation' },
    { id: 'dry_ign', label: '干点火：点火器开了但推进剂没到齐', when: 'lit == 0 && ignite == 1 && (fuel == 0 || lox == 0)', severity: 'violation', once: true },
    { id: 'slam', label: '一把推到底（硬启动、压力尖峰）', when: 'lit == 1 && throttle > 85 && t - ign_t < 6', severity: 'violation', once: true },
    { id: 'over_pc', label: '室压超过 118 bar', when: 'pc > 118', severity: 'violation' },
    { id: 'mr_off', label: '混合比偏离 3.1–3.7（烧蚀或推力不足）', when: 'lit == 1 && lox == 1 && pc > 40 && (mr < 3.1 || mr > 3.7)', severity: 'warning', once: true },
    { id: 'shut_order', label: '关机先切了燃料（残余氧化剂烧蚀）', when: 'lit == 1 && fuel == 0 && lox == 1', severity: 'violation', once: true },
    { id: 'ign_late', label: '推进剂进入后 3 秒还没点火（积液爆燃）', when: 'lit == 0 && fuel_in == 1 && lox_in == 1 && t - lox_t0 > 3', severity: 'violation', once: true },
  ],
  goals: [
    { id: 'precool', label: '氧路预冷到 −170℃ 以下', when: 'cooled == 1' },
    { id: 'fuel_first', label: '燃料主阀先开（富燃启动）', when: 'fuel_in == 1 && lox_in == 0', after: 'precool' },
    { id: 'ignite', label: '两路推进剂到位后点火成功', when: 'lit == 1 && ox_rich < 2 && dry_ign < 1', after: 'fuel_first' },
    { id: 'ramp', label: '分台阶升到额定推力（室压 90–110 bar）', when: 'pc >= 90 && pc <= 110', after: 'ignite' },
    { id: 'steady', label: '额定工况稳定运行 20 秒', when: 'steady >= 20', after: 'ramp' },
    { id: 'shutdown', label: '按序关机：先切氧化剂、再切燃料、关点火', when: 'steady >= 20 && lox == 0 && fuel == 0 && ignite == 0 && shutdown_bad == 0', after: 'steady' },
  ],
  scene: {
    image: '/lab/rocket_teststand.jpg', credit: '底图由通义万相生成',
    layers: [
      { id: 'plume', kind: 'plume', x: 44, y: 58, w: 12, h: 30, level: 'clamp(pc / 105, 0, 1)' },
      { id: 'flame', kind: 'glow', x: 47.5, y: 55, w: 5, h: 6, level: 'clamp(pc / 95, 0, 1)' },
      { id: 'haze', kind: 'haze', x: 30, y: 62, w: 42, h: 32, level: 'clamp(pc / 150, 0, 0.7)', color: '#e8eef8' },
      { id: 'pump', kind: 'pulse', x: 80, y: 48, w: 7, h: 12, on: 'precool == 1', color: '#7cc8ff' },
      { id: 'lamp_f', kind: 'lamp', x: 8, y: 30, w: 2.2, h: 3.8, on: 'fuel == 1', color: '#ffb15f' },
      { id: 'lamp_o', kind: 'lamp', x: 12, y: 30, w: 2.2, h: 3.8, on: 'lox == 1', color: '#7cc8ff' },
      { id: 'ro_pc', kind: 'readout', x: 5, y: 36, w: 9.5, h: 5, text: 'pc', unit: 'bar', label: 'Pc' },
      { id: 'ro_t', kind: 'readout', x: 5, y: 42, w: 9.5, h: 5, text: 'lox_t', unit: '℃', label: 'T', color: '#7cc8ff' },
      coach('e1', 'cooled == 0', '① 先预冷：氧路泵前降到 −170℃ 以下才能开主阀', 9, '#7cc8ff'),
      coach('e2', 'cooled == 1 && fuel_in == 0', '② 富燃启动：先开燃料主阀 CH₄，再开氧化剂'),
      coach('e3', 'fuel_in == 1 && lit == 0', '③ 两路到位 3 秒内点火——晚了会积液爆燃', 9, '#ff5fa2'),
      coach('e4', 'lit == 1 && steady < 20', '④ 分台阶升推力到室压 90–110 bar，稳定 20 秒'),
      coach('e5', 'steady >= 20', '⑤ 关机：先切氧化剂、再切燃料、关点火器', 9, '#ffd166'),
    ],
  },
};

export const ENGINE_EXPERT_SCRIPT: BenchAction[] = [
  { t: 1, control: 'precool', value: 1 },
  { t: 24, control: 'fuel', value: 1 },
  { t: 25.5, control: 'lox', value: 1 },
  { t: 26.5, control: 'ignite', value: 1 },
  { t: 28, control: 'throttle', value: 40 },
  { t: 34, control: 'throttle', value: 70 },
  { t: 40, control: 'throttle', value: 95 },
  { t: 70, control: 'lox', value: 0 },
  { t: 71, control: 'fuel', value: 0 },
  { t: 72, control: 'ignite', value: 0 },
  { t: 73, control: 'throttle', value: 0 },
  { t: 74, control: 'precool', value: 0 },
];
BENCH_ENGINE.expertScript = ENGINE_EXPERT_SCRIPT;

export const ENGINE_SCRIPTS: Record<string, BenchAction[]> = {
  // 动力专业硕士：时序基本对，但没等预冷到位就开阀，升推力也急了点
  rush_precool: [
    { t: 1, control: 'precool', value: 1 }, { t: 8, control: 'fuel', value: 1 }, { t: 9, control: 'lox', value: 1 },
    { t: 10, control: 'ignite', value: 1 }, { t: 12, control: 'throttle', value: 95 },
    { t: 55, control: 'lox', value: 0 }, { t: 56, control: 'fuel', value: 0 }, { t: 57, control: 'ignite', value: 0 },
  ],
  // 本科生：氧化剂先开——富氧启动，关机还先切了燃料
  ox_first: [
    { t: 1, control: 'precool', value: 1 }, { t: 24, control: 'lox', value: 1 }, { t: 29, control: 'fuel', value: 1 },
    { t: 30, control: 'ignite', value: 1 }, { t: 32, control: 'throttle', value: 90 },
    { t: 60, control: 'fuel', value: 0 }, { t: 64, control: 'lox', value: 0 },
  ],
  // AI 裸答：顺序说得出，但点火后一把推到底
  ai_bare: [
    { t: 1, control: 'precool', value: 1 }, { t: 24, control: 'fuel', value: 1 }, { t: 25.5, control: 'lox', value: 1 },
    { t: 26.5, control: 'ignite', value: 1 }, { t: 28, control: 'throttle', value: 100 },
    { t: 68, control: 'lox', value: 0 }, { t: 69, control: 'fuel', value: 0 }, { t: 70, control: 'ignite', value: 0 },
  ],
  ai_skill: [
    { t: 1, control: 'precool', value: 1 }, { t: 25, control: 'fuel', value: 1 }, { t: 26.5, control: 'lox', value: 1 },
    { t: 27.5, control: 'ignite', value: 1 }, { t: 29, control: 'throttle', value: 40 },
    { t: 35, control: 'throttle', value: 70 }, { t: 41, control: 'throttle', value: 95 },
    { t: 71, control: 'lox', value: 0 }, { t: 72, control: 'fuel', value: 0 }, { t: 73, control: 'ignite', value: 0 }, { t: 74, control: 'throttle', value: 0 },
  ],
};
