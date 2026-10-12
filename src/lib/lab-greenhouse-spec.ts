/**
 * 温室 · 午间环控异常处置的交互故事（2026-10-11，第二批「一产 · 能数采」）：3 号连栋玻璃温室，番茄坐果期的一个中午。
 *   平时环控是自动的；第 30 分钟网关响应异常，自动模式不再执行——你得切到手动接管：开顶窗、拉内遮阳、开微雾降温，
 *   微雾水箱快空了要先补水再开泵（干抽烧泵）；开窗散热会把 CO₂ 放掉，别一直全开；第 150 分钟下阵雨，顶窗要收到 30% 以下，不然雨水进棚。
 *   坐果期：温度 24–30 ℃ 最好，超过 33 ℃ 持续一分钟就落花落果；湿度 60–80%；CO₂ 别掉到 350 ppm 以下。
 *   红线：异常后 5 分钟还没手动接管；高温持续落花；干抽烧泵；下雨顶窗大开；湿度 >90% 不开风机（灰霉）。
 *   数采点：温湿度、光照、CO₂、水箱液位、顶窗 / 遮阳开度——都是温室里真有的点位。
 * 台面组件：src/components/lab/surfaces/Greenhouse.tsx。（教学化简化模型）
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const T_OK: [number, number] = [24, 30];
export const RH_OK: [number, number] = [60, 80];
export const FAULT_T = 30, RAIN_T = 150;

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(34, 'manual', 1);                                        // 网关异常：切手动
  push(36, 'vent', 100); push(38, 'shade', 75);                 // 开窗、拉遮阳
  push(42, 'refill', 1);                                        // 水箱先补水
  push(60, 'refill', 0); push(62, 'mist', 1);                   // 补到位再开雾
  push(70, 'fan', 1);
  push(95, 'vent', 50);                                         // 温度下来了，窗收一半保 CO₂
  push(110, 'mist', 0);                                         // 湿度够了停雾
  push(125, 'log', 1);
  push(152, 'vent', 20); push(154, 'fan', 0);                   // 下雨：顶窗收到 20%
  push(185, 'vent', 40);                                        // 雨停
  return a;
}

export function greenhouseSpec(image: string): BenchSpec {
  return {
    name: '3 号温室 · 午间环控接管', surface: 'greenhouse',
    brief: '中午十二点，3 号温室番茄坐果期。环控本来是自动的，一会儿网关会出异常、自动模式不再执行——你要切到手动：开顶窗、拉内遮阳、微雾降温；微雾水箱快空了，先补水再开泵。开窗散热会把 CO₂ 放掉，温度下来就把窗收一半。下午会下阵雨，顶窗收到 30% 以下。温度超过 33 ℃ 持续一分钟就落花落果，干抽会烧泵，湿度太高开风机才不长灰霉。（教学化简化模型）',
    timeScale: 1, maxSeconds: 240,
    scene: { image, credit: '底图来自温室 3D 场景', layers: [] },
    vars: [
      { id: 'sun', label: '光照', initial: 70, set: 't >= 150 && t < 185 ? 25 : min(100, 70 + t * 0.6)' },
      { id: 'rain', label: '在下雨', initial: 0, set: 't >= 150 && t < 185 ? 1 : 0' },
      { id: 'fault', label: '网关异常', initial: 0, set: 't >= 30 ? 1 : 0' },
      // 自动模式：异常前跟着温度调窗；异常后什么都不动
      { id: 'vent_eff', label: '实际顶窗开度', initial: 30, set: 'manual == 1 ? vent : (fault == 0 ? clamp((temp - 26) * 25, 0, 100) : vent_eff)' },
      { id: 'shade_eff', label: '实际遮阳', initial: 0, set: 'manual == 1 ? shade : (fault == 0 ? (sun > 85 ? 60 : 0) : shade_eff)' },
      { id: 'mist_on', label: '微雾在喷', initial: 0, set: 'manual == 1 && mist == 1 && tank > 0 ? 1 : 0' },
      { id: 'tank', label: '微雾水箱', initial: 18, min: 0, max: 100, rate: 'refill * 2.2 - mist_on * 0.9' },
      { id: 'pump_dry', label: '泵干抽', initial: 0, set: 'max(pump_dry, manual == 1 && mist == 1 && tank <= 0 ? 1 : 0)' },
      { id: 'dry_s', initial: 0, set: 'manual == 1 && mist == 1 && tank <= 0 ? dry_s + dt : 0' },
      { id: 'pump_burn', label: '泵烧了', initial: 0, set: 'max(pump_burn, dry_s > 15 ? 1 : 0)' },
      // 温度：太阳加热（遮阳减）、开窗 / 风机 / 微雾降
      { id: 'temp', label: '室温', initial: 29, min: 15, max: 45, rate: 'sun * 0.0045 * (1 - shade_eff / 130) - vent_eff * 0.0035 - fan * 0.05 - mist_on * 0.12 - (rain == 1 ? 0.03 : 0) + 0.02' },
      { id: 'hot_s', label: '超 33 ℃ 持续秒', initial: 0, set: 'temp > 33 ? hot_s + dt : 0' },
      { id: 'drop', label: '落花落果', initial: 0, set: 'max(drop, hot_s >= 60 ? 1 : 0)' },
      { id: 'rh', label: '湿度', initial: 62, min: 20, max: 100, rate: 'mist_on * 0.3 - vent_eff * 0.0012 - fan * 0.03 - (temp > 30 ? 0.04 : 0) + (rain == 1 ? 0.08 : 0) + 0.02' },
      { id: 'mold', label: '灰霉风险', initial: 0, set: 'max(mold, rh > 90 && fan == 0 ? 1 : 0)' },
      { id: 'co2', label: 'CO₂', initial: 620, min: 200, max: 1200, rate: '-vent_eff * 0.012 - fan * 0.3 - sun * 0.004 + (vent_eff < 20 ? 0.35 : 0) + 0.15' },
      { id: 'co2_low', label: 'CO₂ 掉到 350 以下', initial: 0, set: 'max(co2_low, co2 < 350 ? 1 : 0)' },
      // 处置时效
      { id: 'took', label: '手动接管', initial: 0, set: 'max(took, manual == 1 && fault == 1 ? 1 : 0)' },
      { id: 'late', label: '异常 5 分钟没接管', initial: 0, set: 'max(late, fault == 1 && t > 35 && took == 0 ? 1 : 0)' },
      { id: 'rain_open', label: '雨天顶窗大开', initial: 0, set: 'max(rain_open, rain == 1 && t > 156 && vent_eff > 30 ? 1 : 0)' },
      { id: 'cooled', label: '温度回到 30 以下', initial: 0, set: 'max(cooled, took == 1 && temp <= 30 ? 1 : 0)' },
      { id: 'rh_ok_s', label: '湿度在带内秒数', initial: 0, set: 'took == 1 && rh >= 60 && rh <= 80 ? rh_ok_s + dt : rh_ok_s' },
      { id: 'tank_ok', label: '补过水', initial: 0, set: 'max(tank_ok, tank >= 40 ? 1 : 0)' },
      { id: 'logged', label: '记了异常', initial: 0, set: 'max(logged, log)' },
      { id: 'rain_ok', label: '雨天收窗', initial: 0, set: 'max(rain_ok, rain == 1 && vent_eff <= 30 ? 1 : 0)' },
      { id: 'quality', label: '处置质量', initial: 0, min: 0, max: 100, set: 'clamp((took == 1 ? 15 : 0) + (cooled == 1 ? 20 : 0) + min(15, rh_ok_s * 0.25) + (tank_ok == 1 ? 10 : 0) + (rain_ok == 1 ? 15 : 0) + (logged == 1 ? 5 : 0) + (co2_low == 0 ? 10 : 0) + (drop == 0 ? 10 : 0) - late * 15 - drop * 25 - pump_burn * 25 - pump_dry * 10 - rain_open * 15 - mold * 15, 0, 100)' },
    ],
    controls: [
      { id: 'manual', label: '手动接管', kind: 'switch' },
      { id: 'vent', label: '顶通风窗开度', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 30 },
      { id: 'shade', label: '内遮阳幕', kind: 'knob', min: 0, max: 100, step: 5, unit: '%', initial: 0 },
      { id: 'fan', label: '循环风机', kind: 'switch' },
      { id: 'mist', label: '高压微雾泵', kind: 'switch' },
      { id: 'refill', label: '微雾水箱补水阀', kind: 'switch' },
      { id: 'log', label: '记录异常事件', kind: 'button' },
    ],
    gauges: [
      { id: 'g_t', label: '室温', unit: '℃', expr: 'temp', min: 15, max: 45, digits: 1, warn: 'temp > 33' },
      { id: 'g_rh', label: '湿度', unit: '%', expr: 'rh', min: 20, max: 100, warn: 'rh > 90 || rh < 50' },
      { id: 'g_co2', label: 'CO₂', unit: 'ppm', expr: 'co2', min: 200, max: 1200, warn: 'co2 < 400' },
      { id: 'g_tank', label: '微雾水箱', unit: '%', expr: 'tank', min: 0, max: 100, warn: 'tank < 15' },
      { id: 'g_sun', label: '光照', unit: '', expr: 'sun', min: 0, max: 100 },
    ],
    rules: [
      { id: 'late', label: '网关异常 5 分钟了还没切手动（自动模式什么都不会做了）', when: 'late == 1', severity: 'violation', once: true },
      { id: 'drop', label: '超过 33 ℃ 持续一分钟：坐果期落花落果', when: 'drop == 1', severity: 'violation', once: true },
      { id: 'burn', label: '水箱空了还在抽：微雾泵烧了', when: 'pump_burn == 1', severity: 'violation', once: true },
      { id: 'rain', label: '下雨了顶窗还开着超过 30%：雨水进棚、病害', when: 'rain_open == 1', severity: 'violation', once: true },
      { id: 'dry', label: '水箱空着就开微雾泵（干抽）', when: 'pump_dry == 1', severity: 'warning', once: true },
      { id: 'co2', label: '窗开太久，CO₂ 掉到 350 以下，光合停了', when: 'co2_low == 1', severity: 'warning', once: true },
      { id: 'mold', label: '湿度超过 90% 没开风机：灰霉', when: 'mold == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：网关异常后 5 分钟内切手动接管', when: 'took == 1 && late == 0' },
      { id: 'g2', label: '第二步：开窗 + 遮阳 + 微雾，把温度压回 30 ℃ 以下', when: 'cooled == 1', after: 'took == 1' },
      { id: 'g3', label: '第三步：水箱先补到 40% 以上再开泵', when: 'tank_ok == 1 && pump_dry == 0' },
      { id: 'g4', label: '第四步：湿度稳在 60–80% 累计 40 秒、CO₂ 不掉到 350 以下', when: 'rh_ok_s >= 40 && co2_low == 0' },
      { id: 'g5', label: '第五步：下雨时顶窗收到 30% 以下', when: 'rain_ok == 1 && rain_open == 0' },
      { id: 'g6', label: '收尾：把这次异常记进平台', when: 'logged == 1' },
    ],
    expertScript: expertScript(),
  };
}
