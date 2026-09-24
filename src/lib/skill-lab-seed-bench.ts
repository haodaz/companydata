/**
 * Case C 的虚拟工位：高温合金真空感应熔炼 · 浇注（熔模精密铸造的最后一道热工序）。
 * 设备参数为教学化的简化模型，不代表任何企业的真实工艺参数。
 * 时间尺度：1 真实秒 = 10 模拟秒，专家一遍约 70 秒。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const BENCH_CASTING: BenchSpec = {
  name: '真空感应熔炼浇注工位',
  brief: '一炉高温合金母合金，浇一组涡轮叶片模壳。目标：抽真空 → 模壳预热 → 升温熔化并保温 → 在温度窗口内浇注 → 安全停机。每一次拨动都会被记录。',
  timeScale: 10,
  maxSeconds: 1500,
  // 场景：通义万相生成的车间底图（scripts/gen-image.mjs）+ 随状态变化的覆盖层（百分比坐标）
  scene: {
    image: '/lab/bench_casting.jpg', credit: '底图由通义万相生成',
    layers: [
      { id: 'furnace_glow', kind: 'glow', cold: true, x: 49.3, y: 50, w: 5.8, h: 10.4, level: 'clamp((temp - 500) / 1100, 0, 1)' },
      { id: 'shell_glow', kind: 'glow', cold: true, x: 26, y: 55.2, w: 5, h: 8.9, level: 'clamp((shell - 300) / 700, 0, 1)' },
      { id: 'door', kind: 'door', x: 46.4, y: 43.8, w: 11.8, h: 21.6, on: 'door == 1', level: 'clamp((temp - 300) / 1200, 0, 1)' },
      { id: 'haze', kind: 'haze', x: 38, y: 18, w: 28, h: 30, level: 'door == 1 ? clamp((temp - 300) / 900, 0, 1) : 0' },
      { id: 'pour', kind: 'stream', x: 51.2, y: 50.5, w: 2, h: 9.5, on: 'poured == 1 && pour_t > 0 && t - pour_t < 25' },
      { id: 'pump', kind: 'pulse', x: 82, y: 62, w: 8, h: 14, on: 'pump == 1 && power == 1', color: '#12b5cb' },
      { id: 'power_lamp', kind: 'lamp', x: 82.6, y: 44.3, w: 2.2, h: 4, on: 'power == 1', color: '#3ddc97' },
      { id: 'ro_temp', kind: 'readout', x: 76.5, y: 51.5, w: 9.5, h: 5, text: 'temp', unit: '℃', label: 'T' },
      { id: 'ro_vac', kind: 'readout', x: 76.5, y: 57, w: 9.5, h: 5, text: 'vac', unit: 'Pa', label: 'P', color: '#7cc8ff' },
    ],
  },
  vars: [
    // 熔炼温度：加热功率驱动，真空不足时感应效率低；自然散热
    { id: 'temp', label: '炉温', initial: 25, rate: 'power * heater * 0.06 * (vac < 1000 ? 1 : 0.6) - (temp - 25) * 0.0025', min: 25, max: 1750 },
    // 真空度：泵开且炉门关时指数抽气；炉门开立刻回到大气压
    { id: 'vac', label: '真空度', initial: 100000, set: 'door == 1 ? 100000 : (pump == 1 && power == 1 ? max(5, vac - (vac - 5) * 0.06) : min(100000, vac + 200))', min: 5, max: 100000 },
    // 模壳温度：预热炉开则趋近 980℃
    { id: 'shell', label: '模壳温度', initial: 25, rate: 'preheat == 1 ? (980 - shell) * 0.012 : -(shell - 25) * 0.004', min: 25, max: 1000 },
    // 是否已浇注（按钮瞬时 → 锁存）
    { id: 'poured', label: '已浇注', initial: 0, set: 'max(poured, pour)', min: 0, max: 1 },
    { id: 'pour_temp', label: '浇注温度', initial: 0, set: 'poured == 1 && pour_temp == 0 ? temp : pour_temp' },
    { id: 'pour_vac', label: '浇注时真空度', initial: 0, set: 'poured == 1 && pour_vac == 0 ? vac : pour_vac' },
    { id: 'pour_shell', label: '浇注时模壳温度', initial: 0, set: 'poured == 1 && pour_shell == 0 ? shell : pour_shell' },
    { id: 'pour_t', label: '浇注时刻', initial: 0, set: 'poured == 1 && pour_t == 0 ? t : pour_t' },
  ],
  controls: [
    { id: 'power', label: '炉体电源', kind: 'switch', hint: '总电源，先开' },
    { id: 'pump', label: '真空泵', kind: 'switch', hint: '关好炉门再抽' },
    { id: 'door', label: '炉门', kind: 'switch', hint: '1 = 打开；高温时严禁打开' },
    { id: 'preheat', label: '模壳预热炉', kind: 'switch', hint: '模壳要提前烤到 900℃ 以上' },
    { id: 'heater', label: '感应加热功率', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0, hint: '冷坩埚不要一上来就满功率' },
    { id: 'pour', label: '浇注', kind: 'button', hint: '只有一次机会' },
  ],
  gauges: [
    { id: 'g_temp', label: '炉温', unit: '℃', expr: 'temp', min: 0, max: 1750, warn: 'temp > 1580' },
    { id: 'g_vac', label: '真空度', unit: 'Pa', expr: 'vac', min: 0, max: 100000, warn: 'vac > 100 && temp > 300' },
    { id: 'g_shell', label: '模壳温度', unit: '℃', expr: 'shell', min: 0, max: 1000, warn: 'shell < 850 && poured == 1' },
    { id: 'g_rate', label: '升温速率', unit: '℃/s', expr: 'power * heater * 0.06 * (vac < 1000 ? 1 : 0.6) - (temp - 25) * 0.0025', min: -4, max: 6, digits: 1 },
  ],
  rules: [
    { id: 'door_hot', label: '高温开炉门（安全事故风险）', when: 'door == 1 && temp > 300', severity: 'violation' },
    { id: 'vac_low', label: '真空不足时熔炼（熔体氧化）', when: 'power == 1 && heater > 0 && temp > 300 && vac > 100', severity: 'violation' },
    { id: 'shock', label: '冷坩埚满功率升温（热冲击）', when: 'heater > 75 && temp < 600', severity: 'warning', once: true },
    { id: 'overheat', label: '过热：炉温超过 1600℃', when: 'temp > 1600', severity: 'violation' },
    { id: 'pour_cold', label: '浇注温度低于 1480℃（冷隔 / 浇不足）', when: 'poured == 1 && pour_temp > 0 && pour_temp < 1480', severity: 'violation', once: true },
    { id: 'pour_hot', label: '浇注温度高于 1580℃（晶粒粗大）', when: 'poured == 1 && pour_temp > 1580', severity: 'violation', once: true },
    { id: 'pour_shell', label: '模壳未预热到 850℃ 就浇注', when: 'poured == 1 && pour_shell > 0 && pour_shell < 850', severity: 'violation', once: true },
    { id: 'pour_vac', label: '真空未达标就浇注', when: 'poured == 1 && pour_vac > 100', severity: 'violation', once: true },
    { id: 'heat_after', label: '浇注后 30 秒仍在加热', when: 'poured == 1 && pour_t > 0 && heater > 0 && t - pour_t > 30', severity: 'warning', once: true },
  ],
  goals: [
    { id: 'vacuum', label: '真空度抽到 ≤ 10 Pa', when: 'vac <= 10' },
    { id: 'shell', label: '模壳预热到 ≥ 900℃', when: 'shell >= 900' },
    { id: 'melt', label: '炉温进入 1520–1580℃ 并保温 60 秒', when: 'temp >= 1520 && temp <= 1580', hold: 60 },
    { id: 'pour', label: '在窗口内完成浇注', when: 'poured == 1 && pour_temp >= 1480 && pour_temp <= 1580 && pour_shell >= 850 && pour_vac <= 100', after: 'melt' },
    { id: 'shutdown', label: '浇注后安全停机（功率归零、电源关闭）', when: 'poured == 1 && heater == 0 && power == 0', after: 'pour' },
  ],
  expertScript: [
    { t: 0, control: 'power', value: 1 },
    { t: 3, control: 'preheat', value: 1 },
    { t: 5, control: 'pump', value: 1 },
    { t: 40, control: 'heater', value: 30 },
    { t: 180, control: 'heater', value: 60 },
    { t: 430, control: 'heater', value: 100 },
    { t: 675, control: 'heater', value: 64 },
    { t: 745, control: 'pour', value: 1 },
    { t: 755, control: 'heater', value: 0 },
    { t: 765, control: 'pump', value: 0 },
    { t: 770, control: 'power', value: 0 },
  ],
};

export const CASTING_EXPERT_SCRIPT: BenchAction[] = BENCH_CASTING.expertScript!;

/** 演示用的几条「非专家」操作脚本：灌入时在模拟器里跑出各自的轨迹（无头运行，没有镜头快照） */
export const CASTING_SCRIPTS: Record<string, BenchAction[]> = {
  // 材料硕士在读：顺序基本对，但没等保温到位、温度偏低就浇了
  careful_rookie: [
    { t: 0, control: 'power', value: 1 }, { t: 4, control: 'pump', value: 1 }, { t: 60, control: 'preheat', value: 1 },
    { t: 40, control: 'heater', value: 40 }, { t: 200, control: 'heater', value: 80 },
    { t: 690, control: 'pour', value: 1 }, { t: 700, control: 'heater', value: 0 }, { t: 715, control: 'power', value: 0 },
  ],
  // 机械本科大四：先化料后抽真空，中途开炉门看料，模壳没烤热就浇
  careless_rookie: [
    { t: 0, control: 'power', value: 1 }, { t: 5, control: 'heater', value: 100 }, { t: 150, control: 'pump', value: 1 },
    { t: 320, control: 'preheat', value: 1 }, { t: 400, control: 'door', value: 1 }, { t: 425, control: 'door', value: 0 },
    { t: 560, control: 'heater', value: 60 }, { t: 700, control: 'pour', value: 1 },
  ],
  // AI 裸答：知道要抽真空和预热，但一上来满功率，冲过上限才降功率，偏热浇注
  ai_bare: [
    { t: 0, control: 'power', value: 1 }, { t: 2, control: 'pump', value: 1 }, { t: 4, control: 'preheat', value: 1 },
    { t: 20, control: 'heater', value: 100 }, { t: 480, control: 'heater', value: 40 }, { t: 500, control: 'pour', value: 1 },
    { t: 510, control: 'heater', value: 0 }, { t: 520, control: 'pump', value: 0 }, { t: 525, control: 'power', value: 0 },
  ],
  // AI + 专家技能：和专家同样的先后顺序与功率台阶，时刻略有出入
  ai_skill: [
    { t: 0, control: 'power', value: 1 }, { t: 2, control: 'preheat', value: 1 }, { t: 4, control: 'pump', value: 1 },
    { t: 45, control: 'heater', value: 30 }, { t: 190, control: 'heater', value: 60 }, { t: 440, control: 'heater', value: 100 },
    { t: 680, control: 'heater', value: 65 }, { t: 752, control: 'pour', value: 1 }, { t: 760, control: 'heater', value: 0 },
    { t: 770, control: 'pump', value: 0 }, { t: 775, control: 'power', value: 0 },
  ],
};

// ════════════════════════════════════════════════════════════════
// Case D 的虚拟工位：CO₂ 气体保护焊 · 平板对接（一维「沿焊缝行走」——以后正面摄像头里手的位置可以直接喂给它）
// 1 真实秒 = 1 模拟秒；焊缝 200 mm，专家 5 mm/s 约 40 秒焊完。
// ════════════════════════════════════════════════════════════════
export const BENCH_WELD: BenchSpec = {
  name: '气保焊平板对接工位',
  brief: '两块 6 mm 低碳钢板对接，一条 200 mm 焊缝。目标：先开保护气、把电流电压调进窗口 → 起弧 → 匀速走完（3–7 mm/s）→ 收弧后断电关气。焊枪要在场景里拖着走，每一次停顿、每一段过快都会被记录。',
  timeScale: 1,
  maxSeconds: 240,
  vars: [
    { id: 'torch_prev', initial: 0, set: 'torch' },
    // 行走速度 mm/s：焊缝 200 mm，1% = 2 mm
    { id: 'speed', label: '行走速度', initial: 0, set: '(torch - torch_prev) * 2 / dt', min: 0, max: 60 },
    { id: 'arc', label: '电弧', initial: 0, set: 'power == 1 && torch > 0 && torch < 100 ? 1 : 0' },
    { id: 'arc_started', initial: 0, set: 'max(arc_started, arc)' },
    { id: 'gas_at_arc', initial: -1, set: 'arc == 1 && gas_at_arc < 0 ? gas : gas_at_arc' },
    { id: 'stall', label: '停顿秒数', initial: 0, set: 'arc == 1 && speed < 0.3 ? stall + dt : 0' },
    { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
    { id: 'fast_mm', label: '过快焊段', initial: 0, rate: 'arc == 1 && speed > 7 ? speed : 0' },
    { id: 'slow_s', label: '过慢秒数', initial: 0, rate: 'arc == 1 && speed > 0.3 && speed < 2 ? 1 : 0' },
    { id: 'done_t', initial: 0, set: 'torch >= 100 && done_t == 0 ? t : done_t' },
  ],
  controls: [
    { id: 'power', label: '焊机电源', kind: 'switch', hint: '总电源' },
    { id: 'gas', label: '保护气 CO₂', kind: 'switch', hint: '起弧前先开，焊完再关' },
    { id: 'current', label: '焊接电流', kind: 'knob', min: 80, max: 260, step: 10, unit: 'A', initial: 100, hint: '6 mm 板对接 160–200 A' },
    { id: 'voltage', label: '电弧电压', kind: 'knob', min: 14, max: 32, step: 1, unit: 'V', initial: 18, hint: '与电流匹配 20–24 V' },
    { id: 'torch', label: '焊枪行走', kind: 'path', hint: '在场景里拖着焊枪沿焊缝走，3–7 mm/s，不要停' },
  ],
  gauges: [
    { id: 'g_i', label: '焊接电流', unit: 'A', expr: 'current', min: 0, max: 300, warn: 'arc == 1 && (current < 140 || current > 220)' },
    { id: 'g_u', label: '电弧电压', unit: 'V', expr: 'voltage', min: 0, max: 40, warn: 'arc == 1 && (voltage < 18 || voltage > 26)' },
    { id: 'g_v', label: '行走速度', unit: 'mm/s', expr: 'speed', min: 0, max: 12, digits: 1, warn: 'arc == 1 && (speed > 7 || speed < 2)' },
    { id: 'g_q', label: '热输入', unit: 'kJ/mm', expr: 'speed > 0.3 ? current * voltage * 0.001 / speed : 0', min: 0, max: 3, digits: 2 },
  ],
  rules: [
    { id: 'no_gas', label: '没开保护气就起弧（气孔）', when: 'arc == 1 && gas == 0', severity: 'violation' },
    { id: 'too_fast', label: '行走过快 > 8 mm/s（未焊透）', when: 'arc == 1 && speed > 8', severity: 'violation' },
    { id: 'stall', label: '焊枪停住超过 2 秒（烧穿）', when: 'stall > 2', severity: 'violation' },
    { id: 'i_low', label: '电流低于 140 A 起弧（未熔合）', when: 'arc == 1 && current < 140', severity: 'warning', once: true },
    { id: 'i_high', label: '电流高于 220 A（咬边 / 飞溅）', when: 'arc == 1 && current > 220', severity: 'violation', once: true },
    { id: 'u_off', label: '电压与电流不匹配', when: 'arc == 1 && (voltage < 18 || voltage > 26)', severity: 'warning', once: true },
    { id: 'arc_break', label: '焊到一半断电（断弧）', when: 'arc_started == 1 && torch < 100 && power == 0', severity: 'violation', once: true },
    { id: 'gas_left', label: '焊完 15 秒还没关气', when: 'done_t > 0 && gas == 1 && t - done_t > 15', severity: 'warning', once: true },
  ],
  goals: [
    { id: 'gas_first', label: '起弧前先开保护气', when: 'gas == 1 && arc_started == 0', hold: 1 },
    { id: 'params', label: '起弧前电流电压进窗口（160–200 A / 20–24 V）', when: 'current >= 160 && current <= 200 && voltage >= 20 && voltage <= 24 && arc_started == 0', hold: 1 },
    { id: 'arc', label: '起弧', when: 'arc_started == 1' },
    { id: 'done', label: '焊完整条焊缝', when: 'torch >= 100', after: 'arc' },
    { id: 'quality', label: '焊道匀速、无烧穿、全程有气', when: 'fast_mm < 20 && stall_max < 2 && gas_at_arc == 1', after: 'done' },
    { id: 'shutdown', label: '收弧后断电、关气', when: 'torch >= 100 && power == 0 && gas == 0', after: 'done' },
  ],
  scene: {
    image: '/lab/bench_weld.jpg', credit: '底图由通义万相生成',
    layers: [
      { id: 'seam', kind: 'seam', control: 'torch', x: 50.1, y: 40, w: 0, h: 28.5, on: 'arc == 1' },
      { id: 'smoke', kind: 'haze', x: 38, y: 12, w: 24, h: 30, level: 'arc * 0.7', color: '#9aa0b8' },
      { id: 'power_lamp', kind: 'lamp', x: 16, y: 28.4, w: 1.4, h: 2.5, on: 'power == 1', color: '#3ddc97' },
      { id: 'gas_pulse', kind: 'pulse', x: 91, y: 21, w: 5, h: 9, on: 'gas == 1', color: '#3ddc97' },
      { id: 'ro_i', kind: 'readout', x: 6.3, y: 31, w: 6.3, h: 3, text: 'current', unit: 'A', label: 'I' },
      { id: 'ro_u', kind: 'readout', x: 6.3, y: 34.3, w: 6.3, h: 3, text: 'voltage', unit: 'V', label: 'U', color: '#7cc8ff' },
    ],
  },
};

/** 匀速走完焊缝的脚本片段：从 t0 起以 mmPerS 走，每 0.5 秒一个采样 */
const walk = (t0: number, mmPerS: number, from = 0, to = 100): BenchAction[] => {
  const out: BenchAction[] = []; const pctPerS = mmPerS / 2;
  for (let t = t0, v = from; v < to; t += 0.5) { v = Math.min(to, from + (t - t0) * pctPerS); out.push({ t, control: 'torch', value: v }); if (v >= to) break; }
  return out;
};

export const WELD_EXPERT_SCRIPT: BenchAction[] = [
  { t: 0, control: 'power', value: 1 }, { t: 2, control: 'gas', value: 1 },
  { t: 4, control: 'current', value: 180 }, { t: 6, control: 'voltage', value: 22 },
  ...walk(10, 5),
  { t: 54, control: 'power', value: 0 }, { t: 57, control: 'gas', value: 0 },
];
BENCH_WELD.expertScript = WELD_EXPERT_SCRIPT;

export const WELD_SCRIPTS: Record<string, BenchAction[]> = {
  // 材料硕士：参数会调、速度稳，但忘了开气，焊到一半才想起来
  forgot_gas: [
    { t: 0, control: 'power', value: 1 }, { t: 3, control: 'current', value: 170 }, { t: 5, control: 'voltage', value: 22 },
    ...walk(8, 5), { t: 22, control: 'gas', value: 1 },
    { t: 52, control: 'power', value: 0 }, { t: 55, control: 'gas', value: 0 },
  ],
  // 机械本科：参数没动（100 A / 18 V），一开始走太快，中间停了 4 秒，焊完没关机
  fast_and_stall: [
    { t: 0, control: 'power', value: 1 }, { t: 1, control: 'gas', value: 1 },
    ...walk(4, 10, 0, 50), { t: 14, control: 'torch', value: 50 }, { t: 18, control: 'torch', value: 50 }, ...walk(18, 5, 50, 100),
  ],
  // AI 裸答：顺序对、有气、速度可以，但电流给到 240 A（咬边），电压 28 V
  ai_bare: [
    { t: 0, control: 'power', value: 1 }, { t: 1, control: 'gas', value: 1 }, { t: 2, control: 'current', value: 240 }, { t: 3, control: 'voltage', value: 28 },
    ...walk(6, 6), { t: 42, control: 'power', value: 0 }, { t: 44, control: 'gas', value: 0 },
  ],
  // AI + 专家技能：和专家一样的顺序与参数，时刻略有出入
  ai_skill: [
    { t: 0, control: 'power', value: 1 }, { t: 1.5, control: 'gas', value: 1 }, { t: 3, control: 'current', value: 180 }, { t: 4.5, control: 'voltage', value: 22 },
    ...walk(8, 5.5), { t: 48, control: 'power', value: 0 }, { t: 50, control: 'gas', value: 0 },
  ],
};
