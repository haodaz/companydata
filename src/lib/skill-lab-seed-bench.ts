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
