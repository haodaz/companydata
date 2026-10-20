/**
 * 手套箱的交互故事（2026-10-21，科研版第一个研究岗台面）：在氩气手套箱里组装一只 Li | Li6PS5Cl | Li 对称电池。
 *
 * | 槽位 | 内容 |
 * |---|---|
 * | 场景与任务 | 界面表征课题组新进博士后，第一天上手套箱：给组里的原位 EIS 准备一只硫化物对称电池 |
 * | 你控什么 | 过渡舱抽洗、内门、粉瓶盖、天平上的粉量、压片机压力、锂片、堆叠压力、手套口盖、循环净化 |
 * | 你盯什么 | 箱内水值 / 氧值（ppm）、硫化氢传感器、天平读数、压片机压力表 |
 * | 该做的顺序 | 过渡舱抽洗 3 次 → 开内门取料 → 开瓶称 80 mg → 盖瓶 → 倒进模具 → 375 MPa 保压 3 秒 → 卸压 → 贴锂片 → 堆叠压力 3–8 MPa → 封装送出 |
 * | 中途突发 | 压完片 8 秒后右手手套有针孔，水值开始往上爬：盖瓶、找漏点封手套口、加大净化，等水值回到 0.1 ppm 以下再接着做 |
 * | 烟雾弹 | 开内门时氧值会小跳一下（过渡舱里残留的一点气），几秒就回落，不是事故 |
 * | 红线 | 过渡舱没抽洗够就开内门；粉瓶开着遇水放出 H2S；压片超压压裂；水值没降就贴锂；堆叠压力过大锂蠕变短路 |
 * | 数采点 | 水值、氧值、H2S、称量质量、压片压力与保压时间、堆叠压力（真实手套箱 / 压片机都能采） |
 * | 时间缩放 | 1 秒 = 1 秒（抽洗一次真实要几分钟，这里压成 4 秒） |
 * | 免责 | 教学化简化模型，数值不是任何设备的真实参数 |
 *
 * 台面组件：src/components/lab/surfaces/Glovebox.tsx。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const GB_MASS_BAND: [number, number] = [75, 85];       // 称量窗口 mg
export const GB_PRESS_BAND: [number, number] = [350, 400];    // 压片窗口 MPa
export const GB_STACK_BAND: [number, number] = [3, 8];        // 堆叠压力窗口 MPa
export const GB_ANTE_SEC = 4;                                 // 抽洗一次（压缩后）秒数

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  push(2, 'ante', 1); push(7, 'ante', 1); push(12, 'ante', 1);   // 过渡舱抽真空 / 回填氩气，三次
  push(17.5, 'door', 1); push(20, 'door', 0);                     // 开内门取锂箔罐和模具（氧值小跳是正常的）
  push(22, 'jar', 1);
  push(24, 'mass', 50); push(26, 'mass', 74); push(27.5, 'mass', 80);
  push(29, 'jar', 0);                                             // 称完马上盖瓶
  push(30, 'load', 1);
  push(32, 'press', 200); push(33, 'press', 375);                 // 加压到 375 MPa 保压
  push(37.5, 'press', 0);                                         // 卸压
  push(49, 'inspect', 1); push(50, 'port_cap', 1); push(51, 'purify', 1);   // 水值上来了：找漏点、封手套口、加大净化
  push(66, 'li', 1);                                              // 水值回到 0.1 以下再贴锂
  push(68, 'stack', 5);
  push(72, 'seal', 1); push(74, 'out', 1);
  return a;
}

export function gloveboxSpec(image: string): BenchSpec {
  return {
    name: '手套箱 · 硫化物对称电池组装', surface: 'glovebox',
    brief: '第一天上手套箱。组里下午要用原位 EIS 看 Li | Li6PS5Cl 界面，你来组装一只对称电池：过渡舱抽洗三次再开内门，开瓶称 80 mg 电解质粉，375 MPa 压片，两面贴锂片，堆叠压力 3–8 MPa，封装送出。硫化物见水就放硫化氢，所以眼睛一直盯着顶上的水值。（教学化简化模型，数值不是任何设备的真实参数）',
    timeScale: 1, maxSeconds: 360,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      // 过渡舱：按一次「抽洗」跑 4 秒，跑完计一次
      { id: 'ante_prev', initial: 0, set: 'ante_t' },
      { id: 'ante_t', label: '过渡舱抽洗剩余', initial: 0, set: 'ante == 1 && ante_t <= 0 && door == 0 ? 4 : max(0, ante_t - dt)' },
      { id: 'ante_n', label: '过渡舱抽洗次数', initial: 0, set: 'ante_prev > 0 && ante_t <= 0 ? ante_n + 1 : ante_n' },
      { id: 'opened_early', label: '没抽洗够就开内门', initial: 0, set: 'max(opened_early, door == 1 && ante_n < 3 && taken == 0 ? 1 : 0)' },
      { id: 'taken', label: '料已取进箱', initial: 0, set: 'max(taken, door == 1 ? 1 : 0)' },
      // 氧值：开内门那一下小跳（烟雾弹），没抽洗够就是一大口空气
      { id: 'o2', label: '箱内氧值', initial: 0.3, min: 0, max: 80, set: 'door == 1 && door_was == 0 ? o2 + (opened_early == 1 ? 28 : 0.9) : max(0.3, o2 - (o2 - 0.3) * (purify == 1 ? 0.45 : 0.3) * dt)' },
      { id: 'door_was', initial: 0, set: 'door' },
      // 压完片 8 秒后右手手套漏
      { id: 'since_pellet', initial: 0, rate: 'pellet_done == 1 ? 1 : 0' },
      { id: 'leak', label: '手套漏气', initial: 0, set: 'max(leak, pellet_done == 1 && since_pellet >= 8 ? 1 : 0)' },
      { id: 'h2o', label: '箱内水值', initial: 0.06, min: 0.05, max: 50, set: 'clamp(h2o + dt * ((leak == 1 && port_cap == 0 ? 0.22 : 0) + (opened_early == 1 && door == 1 ? 0.6 : 0) - (purify == 1 ? 0.35 : 0.06) * (h2o - 0.05)), 0.05, 50)' },
      { id: 'h2o_hi', label: '水值超标过', initial: 0, set: 'max(h2o_hi, h2o > 0.5 ? 1 : 0)' },
      { id: 'resp_ok', label: '异常处置到位', initial: 0, set: 'max(resp_ok, h2o_hi == 1 && jar == 0 && port_cap == 1 && purify == 1 && hi_s <= 20 ? 1 : 0)' },
      { id: 'hi_s', label: '水值超标未处置秒数', initial: 0, rate: 'h2o_hi == 1 && resp_ok == 0 ? 1 : 0' },
      { id: 'found', label: '找到漏点', initial: 0, set: 'max(found, inspect == 1 && leak == 1 ? 1 : 0)' },
      // 硫化氢：粉瓶开着遇水最多，模具里没封装的片子也会慢慢放
      { id: 'h2s', label: '硫化氢', initial: 0, min: 0, max: 20, rate: '(h2o > 0.5 ? (h2o - 0.5) * (jar == 1 ? 0.8 : (loaded == 1 && sealed == 0 ? 0.12 : 0)) : 0) - h2s * 0.08' },
      { id: 'h2s_alarm', label: '硫化氢报警', initial: 0, set: 'max(h2s_alarm, h2s > 1 ? 1 : 0)' },
      // 称量 → 倒进模具
      { id: 'back_used', initial: 0, set: 'max(back_used, back)' },
      { id: 'loaded', label: '粉已倒进模具', initial: 0, set: 'max(loaded, load == 1 && mass > 0 ? 1 : 0)' },
      { id: 'load_mass', label: '倒进模具的粉', initial: 0, set: 'loaded == 1 && load_mass == 0 ? mass : load_mass' },
      // 压片
      { id: 'pmax', label: '最大压片压力', initial: 0, set: 'loaded == 1 ? max(pmax, press) : pmax' },
      { id: 'p_hold', label: '窗口内保压秒数', initial: 0, rate: 'loaded == 1 && press >= 350 && press <= 400 ? 1 : 0' },
      { id: 'cracked', label: '电解质片压裂', initial: 0, set: 'max(cracked, loaded == 1 && press > 500 ? 1 : 0)' },
      { id: 'pellet_done', label: '电解质片压好', initial: 0, set: 'max(pellet_done, p_hold >= 3 && press < 50 ? 1 : 0)' },
      { id: 'empty_press', initial: 0, set: 'max(empty_press, loaded == 0 && press > 50 ? 1 : 0)' },
      // 贴锂、堆叠、封装
      { id: 'li_on', label: '锂片已贴', initial: 0, set: 'max(li_on, li == 1 && pellet_done == 1 ? 1 : 0)' },
      { id: 'li_wet', label: '水值没降就贴锂', initial: 0, set: 'max(li_wet, li == 1 && h2o > 0.1 ? 1 : 0)' },
      { id: 'short', label: '锂蠕变短路', initial: 0, set: 'max(short, li_on == 1 && stack > 15 ? 1 : 0)' },
      { id: 'sealed', label: '已封装', initial: 0, set: 'max(sealed, seal == 1 && li_on == 1 ? 1 : 0)' },
      { id: 'out_done', label: '已送出', initial: 0, set: 'max(out_done, out == 1 && sealed == 1 ? 1 : 0)' },
      { id: 'quality', label: '电池质量', initial: 0, min: 0, max: 100,
        set: 'clamp((loaded == 1 && load_mass >= 75 && load_mass <= 85 ? 15 : loaded == 1 ? 6 : 0) + (pellet_done == 1 && cracked == 0 ? (pmax >= 330 ? 25 : 12) : 0) + (resp_ok == 1 ? 15 : 0) + (li_on == 1 && li_wet == 0 ? 15 : li_on == 1 ? 4 : 0) + (li_on == 1 && stack >= 3 && stack <= 8 ? 10 : 0) + (out_done == 1 ? 10 : 0) + (opened_early == 0 && taken == 1 ? 10 : 0) - h2s_alarm * 30 - cracked * 30 - short * 40 - opened_early * 25 - back_used * 5, 0, 100)' },
    ],
    controls: [
      { id: 'ante', label: '过渡舱抽真空 / 回填氩气', kind: 'button' },
      { id: 'door', label: '过渡舱内门', kind: 'switch' },
      { id: 'jar', label: 'Li6PS5Cl 粉瓶', kind: 'switch' },
      { id: 'mass', label: '天平上的粉', kind: 'knob', min: 0, max: 150, step: 1, unit: 'mg' },
      { id: 'back', label: '多的粉倒回原瓶', kind: 'button' },
      { id: 'waste', label: '多的粉倒进废料瓶', kind: 'button' },
      { id: 'load', label: '把粉倒进模具', kind: 'button' },
      { id: 'press', label: '压片机压力', kind: 'knob', min: 0, max: 600, step: 5, unit: 'MPa', hidden: true },
      { id: 'release', label: '压片机卸压', kind: 'button' },
      { id: 'inspect', label: '检查手套', kind: 'button' },
      { id: 'port_cap', label: '手套口盖', kind: 'switch' },
      { id: 'purify', label: '循环净化加大', kind: 'switch' },
      { id: 'li', label: '两面贴锂片', kind: 'button' },
      { id: 'stack', label: '堆叠压力', kind: 'knob', min: 0, max: 20, step: 1, unit: 'MPa' },
      { id: 'seal', label: '封装', kind: 'button' },
      { id: 'out', label: '经过渡舱送出', kind: 'button' },
    ],
    gauges: [
      { id: 'g_h2o', label: '水值', unit: 'ppm', expr: 'h2o', min: 0, max: 5, digits: 2, warn: 'h2o > 0.5' },
      { id: 'g_o2', label: '氧值', unit: 'ppm', expr: 'o2', min: 0, max: 5, digits: 2, warn: 'o2 > 5' },
      { id: 'g_h2s', label: '硫化氢', unit: 'ppm', expr: 'h2s', min: 0, max: 5, digits: 2, warn: 'h2s > 0.5' },
      { id: 'g_press', label: '压片压力', unit: 'MPa', expr: 'press', min: 0, max: 600, warn: 'press > 450' },
      { id: 'g_q', label: '电池质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'early', label: '过渡舱没抽洗满 3 次就开内门：空气直接灌进箱体', when: 'opened_early == 1', severity: 'violation', once: true },
      { id: 'h2s', label: '硫化氢报警：硫化物电解质遇水分解放出 H2S（有毒）', when: 'h2s_alarm == 1', severity: 'violation', once: true },
      { id: 'cracked', label: '压片压力超过 500 MPa：电解质片压裂', when: 'cracked == 1', severity: 'violation', once: true },
      { id: 'li_wet', label: '水值还没回到 0.1 ppm 以下就贴锂片：锂表面先长一层 LiOH，界面阻抗先天就高', when: 'li_wet == 1', severity: 'violation', once: true },
      { id: 'short', label: '堆叠压力超过 15 MPa：锂蠕变挤进电解质孔隙，一组装就短路', when: 'short == 1', severity: 'violation', once: true },
      { id: 'back', label: '多称的粉倒回原瓶：一勺粉会污染整瓶（倒进废料瓶）', when: 'back_used == 1', severity: 'warning', once: true },
      { id: 'jar_hi', label: '水值在升，粉瓶还开着', when: 'jar == 1 && h2o > 0.3', severity: 'warning', once: true },
      { id: 'slow', label: '水值超标 20 秒还没处置', when: 'hi_s > 20', severity: 'warning', once: true },
      { id: 'empty', label: '模具里没粉就加压', when: 'empty_press == 1', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'g1', label: '第一步：过渡舱抽洗 3 次，再开内门把锂箔罐和模具取进来', when: 'taken == 1 && opened_early == 0' },
      { id: 'g2', label: '第二步：称 80 ± 5 mg 电解质粉，倒进模具', when: 'loaded == 1 && load_mass >= 75 && load_mass <= 85' },
      { id: 'g3', label: '第三步：350–400 MPa 保压 3 秒，卸压取片', when: 'pellet_done == 1 && cracked == 0' },
      { id: 'g4', label: '突发：水值上来了——盖瓶、封住漏气的手套口、加大净化（20 秒内）', when: 'resp_ok == 1' },
      { id: 'g5', label: '第四步：水值回到 0.1 ppm 以下，再两面贴锂片', when: 'li_on == 1 && li_wet == 0' },
      { id: 'g6', label: '第五步：堆叠压力调到 3–8 MPa', when: 'li_on == 1 && stack >= 3 && stack <= 8', hold: 2 },
      { id: 'g7', label: '收尾：封装、经过渡舱送出', when: 'out_done == 1' },
    ],
    expertScript: expertScript(),
  };
}
