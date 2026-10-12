/**
 * 转炉炼钢 · 吹炼终点控制的交互故事（2026-10-11，第二批「二产 · 能数采」）：302 炉一炉钢，从下枪到出钢。
 *   炉里是铁水 + 废钢，吹氧把碳烧掉、把温度顶上去。你控三样：氧枪枪位（高枪化渣、低枪脱碳）、供氧流量、石灰 / 冷却矿石下料；
 *   盯四样：熔池温度、碳含量、炉渣状态（渣太高 / 太干都出事）、氧枪冷却水。
 *   终点：碳 0.05–0.08%、温度 1640–1680 ℃ 同时到——副枪测温定碳确认后才出钢；出钢前挡渣，出钢时底吹氩。
 *   第 150 秒氧枪冷却水流量会掉：必须提枪、降氧，等流量恢复再下枪（枪头烧穿 = 漏水进炉 = 爆炸）。
 *   红线：冷却水掉了还不提枪；没测温定碳就出钢；碳过烧（<0.03）；温度过高（>1720）；喷溢（渣位过高且低枪大氧）。
 *   数采点：温度、碳、枪位、氧流量、冷却水流量、炉渣——都是真炉子上会采的点。
 * 台面组件：src/components/lab/surfaces/Converter.tsx。（教学化简化模型，数值不是真实工艺参数）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const C_BAND: [number, number] = [0.05, 0.08];
export const T_BAND: [number, number] = [1640, 1680];
export const WATER_DROP_T = 150;

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'lance', 2.2); push(4, 'o2', 70); push(6, 'lime', 1);            // 高枪小氧，先造渣
  push(40, 'lance', 1.6); push(42, 'o2', 85);                                 // 降枪脱碳
  push(60, 'lime', 1);
  push(90, 'lance', 1.3); push(92, 'o2', 95);                                 // 低枪大氧，主脱碳期
  push(120, 'ore', 1);                                                        // 温度冲高，加冷却矿石
  push(152, 'lance', 2.4); push(153, 'o2', 20);                               // 冷却水掉了：提枪降氧
  push(172, 'lance', 1.4); push(174, 'o2', 90);                               // 流量恢复，再下枪
  push(220, 'o2', 40); push(221, 'lance', 1.8);                               // 接近终点：收氧
  push(228, 'sublance', 1);                                                   // 副枪测温定碳
  push(229, 'o2', 0); push(230, 'lance', 3.0);                                // 停吹提枪
  push(231, 'slag_stop', 1); push(232, 'argon', 1); push(234, 'tap', 1);      // 挡渣、底吹氩、出钢
  return a;
}

export function converterSpec(image: string): BenchSpec {
  return {
    name: '302 炉 · 吹炼与终点控制', surface: 'converter',
    brief: '302 炉装完铁水和废钢，老周让你来控这一炉。氧枪先高枪小氧化渣，再降枪大氧脱碳；温度冲高就加冷却矿石，渣稀了补石灰。盯住碳和温度，两样同时进窗口（碳 0.05–0.08、温度 1640–1680）就收氧、副枪测温定碳，确认后挡渣、底吹氩、出钢。中途氧枪冷却水流量会掉——立刻提枪降氧，等恢复再下。冷却水掉了不提枪、没测温定碳就出钢、碳过烧、温度过高、低枪大氧喷溢，都会记下来。（教学化简化模型）',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'blowing', label: '在吹氧', initial: 0, set: 'o2 > 5 && lance < 2.6 && tapped == 0 ? 1 : 0' },
      // 脱碳：氧越大、枪越低脱得越快；碳低于 0.3 后脱碳减半（氧转去烧铁），这就是收氧的时机
      { id: 'carbon', label: '碳含量', initial: 4.0, min: 0.01, max: 4.5, rate: 'blowing == 1 ? -(o2 / 100) * (lance < 1.5 ? 0.028 : lance < 1.9 ? 0.022 : 0.012) * (carbon > 0.3 ? 1 : 0.5) : 0' },
      // 温度：吹氧放热（低枪更猛）、石灰 / 矿石吸热（按一下 -60 / -110 ℃）、不吹时散热
      { id: 'temp', label: '熔池温度', initial: 1360, min: 1200, max: 1800, rate: '(blowing == 1 ? (o2 / 100) * (lance < 1.5 ? 3.4 : 2.4) : -0.4) - lime * 240 - ore * 440' },
      // 炉渣：高枪化渣 → 渣位涨；低枪大氧 → 渣位掉；石灰一下 +12
      { id: 'slag', label: '渣位', initial: 30, min: 0, max: 100, rate: '(blowing == 1 ? (lance > 1.8 ? 0.35 : lance < 1.5 ? -0.3 : 0) * (o2 / 80) : 0) + lime * 48' },
      { id: 'spit', label: '喷溢', initial: 0, set: 'max(spit, slag > 75 && lance < 1.5 && o2 > 80 ? 1 : 0)' },
      { id: 'dry', label: '返干', initial: 0, set: 'max(dry, slag < 8 && blowing == 1 ? 1 : 0)' },
      // 冷却水：第 150 秒掉到 60%，20 秒后恢复；掉的时候枪还在低位 → 枪头过热
      { id: 'water', label: '氧枪冷却水流量', initial: 100, set: 't >= 150 && t < 170 ? 60 : 100' },
      { id: 'tip_heat', label: '枪头过热', initial: 0, min: 0, max: 100, rate: 'water < 80 && lance < 2.2 && o2 > 30 ? 12 : -8' },
      { id: 'tip_burn', label: '枪头烧穿', initial: 0, set: 'max(tip_burn, tip_heat >= 100 ? 1 : 0)' },
      { id: 'water_ok', label: '冷却水报警处置对了', initial: 0, set: 'max(water_ok, water < 80 && lance >= 2.2 && o2 <= 30 ? 1 : 0)' },
      // 终点
      { id: 'in_band', label: '碳温同在窗口', initial: 0, set: 'carbon >= 0.05 && carbon <= 0.08 && temp >= 1640 && temp <= 1680 ? 1 : 0' },
      { id: 'measured', label: '副枪测过', initial: 0, set: 'max(measured, sublance)' },
      { id: 'meas_ok', label: '测温定碳时在窗口', initial: 0, set: 'max(meas_ok, sublance == 1 && in_band == 1 ? 1 : 0)' },
      { id: 'overblow', label: '碳过烧', initial: 0, set: 'max(overblow, carbon < 0.03 ? 1 : 0)' },
      { id: 'overheat', label: '温度过高', initial: 0, set: 'max(overheat, temp > 1720 ? 1 : 0)' },
      { id: 'slag_held', initial: 0, set: 'max(slag_held, slag_stop)' },
      { id: 'argon_on', initial: 0, set: 'max(argon_on, argon)' },
      { id: 'tapped', label: '已出钢', initial: 0, set: 'max(tapped, tap)' },
      { id: 'tap_blind', label: '没测温定碳就出钢', initial: 0, set: 'max(tap_blind, tap == 1 && measured == 0 ? 1 : 0)' },
      { id: 'tap_off', label: '出钢时不在窗口', initial: 0, set: 'max(tap_off, tap == 1 && in_band == 0 ? 1 : 0)' },
      { id: 'tap_noslag', label: '没挡渣出钢', initial: 0, set: 'max(tap_noslag, tap == 1 && slag_held == 0 ? 1 : 0)' },
      { id: 'tap_noargon', label: '出钢没底吹氩', initial: 0, set: 'max(tap_noargon, tap == 1 && argon_on == 0 ? 1 : 0)' },
      { id: 'tap_blowing', label: '没停吹就出钢', initial: 0, set: 'max(tap_blowing, tap == 1 && o2 > 5 ? 1 : 0)' },
      { id: 'quality', label: '这一炉的质量', initial: 0, min: 0, max: 100, set: 'clamp((meas_ok == 1 ? 30 : measured == 1 ? 10 : 0) + (tapped == 1 && tap_off == 0 ? 30 : tapped == 1 ? 10 : 0) + (water_ok == 1 ? 15 : 0) + (slag_held == 1 ? 8 : 0) + (argon_on == 1 ? 7 : 0) + (spit == 0 ? 5 : 0) + (dry == 0 ? 5 : 0) - tip_burn * 60 - overblow * 25 - overheat * 25 - tap_blind * 30 - tap_noslag * 10 - tap_noargon * 10 - tap_blowing * 15 - spit * 10, 0, 100)' },
    ],
    controls: [
      { id: 'lance', label: '氧枪枪位', kind: 'knob', min: 1.0, max: 3.0, step: 0.1, unit: 'm', initial: 3.0, hint: '高枪化渣（≥1.9）· 低枪脱碳（≤1.5）· 3.0 = 提出炉口' },
      { id: 'o2', label: '供氧流量', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0 },
      { id: 'lime', label: '加活性石灰', kind: 'button' },
      { id: 'ore', label: '加冷却矿石', kind: 'button' },
      { id: 'sublance', label: '副枪测温定碳', kind: 'button' },
      { id: 'slag_stop', label: '挡渣', kind: 'button' },
      { id: 'argon', label: '底吹氩', kind: 'switch' },
      { id: 'tap', label: '出钢', kind: 'button' },
    ],
    gauges: [
      { id: 'g_temp', label: '熔池温度', unit: '℃', expr: 'temp', min: 1200, max: 1800, warn: 'temp > 1700' },
      { id: 'g_c', label: '碳含量', unit: '%', expr: 'carbon', min: 0, max: 4.5, digits: 2, warn: 'carbon < 0.04' },
      { id: 'g_slag', label: '渣位', unit: '', expr: 'slag', min: 0, max: 100, warn: 'slag > 75 || slag < 10' },
      { id: 'g_water', label: '氧枪冷却水', unit: '%', expr: 'water', min: 0, max: 100, warn: 'water < 80' },
      { id: 'g_tip', label: '枪头过热', unit: '', expr: 'tip_heat', min: 0, max: 100, warn: 'tip_heat > 40' },
    ],
    rules: [
      { id: 'burn', label: '冷却水掉了枪还在低位——枪头烧穿，漏水进炉', when: 'tip_burn == 1', severity: 'violation', once: true },
      { id: 'blind', label: '没副枪测温定碳就出钢（凭感觉出的钢，成分谁负责）', when: 'tap_blind == 1', severity: 'violation', once: true },
      { id: 'over', label: '碳过烧（低于 0.03%）：钢水过氧化，合金白加', when: 'overblow == 1', severity: 'violation', once: true },
      { id: 'hot', label: '温度过高（>1720 ℃）：炉衬侵蚀、出钢温度失控', when: 'overheat == 1', severity: 'violation', once: true },
      { id: 'spit', label: '喷溢：渣位高还低枪大氧', when: 'spit == 1', severity: 'warning', once: true },
      { id: 'dry', label: '返干：渣没了还在吹，炉衬直接挨氧', when: 'dry == 1', severity: 'warning', once: true },
      { id: 'noslag', label: '没挡渣就出钢，渣带进钢包', when: 'tap_noslag == 1', severity: 'warning', once: true },
      { id: 'noargon', label: '出钢没开底吹氩，钢水成分不均', when: 'tap_noargon == 1', severity: 'warning', once: true },
      { id: 'tapblow', label: '没停吹就出钢', when: 'tap_blowing == 1', severity: 'warning', once: true },
      { id: 'off', label: '出钢时碳 / 温不在窗口', when: 'tap_off == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：高枪小氧化渣（渣位起来、不返干）', when: 'slag >= 45 && dry == 0' },
      { id: 'g2', label: '第二步：降枪脱碳，碳降到 1% 以下', when: 'carbon <= 1.0' },
      { id: 'g3', label: '第三步：冷却水报警时提枪降氧，等恢复再下', when: 'water_ok == 1 && tip_burn == 0' },
      { id: 'g4', label: '第四步：碳和温度同时进窗口', when: 'in_band == 1', hold: 3 },
      { id: 'g5', label: '第五步：副枪测温定碳确认', when: 'meas_ok == 1' },
      { id: 'g6', label: '收尾：停吹提枪 → 挡渣 → 底吹氩 → 出钢', when: 'tapped == 1 && tap_blind == 0 && tap_off == 0 && tap_noslag == 0 && tap_noargon == 0' },
    ],
    expertScript: expertScript(),
  };
}
