/**
 * 外科的交互故事（2026-10-11 重做）：开腹分层入腹，一层一个动作，深度靠「按住」不靠滑块。
 *   ① 皮肤与皮下：手术刀，按住让刀沉到 6–12 mm，再沿线划
 *   ② 腹外斜肌腱膜：电刀，沉到 13–16 mm 划
 *   ③ 肌层：血管钳，在线上三处各撑开一次（拿刀切就是违规）
 *   ④ 腹膜：镊子先夹起（左手留在那儿），换刀在中段划一个小口（没夹起就切 = 刀尖下面是肠子）
 *   ⑤ 牵开器放进切口，显露
 * 台面组件：src/components/lab/surfaces/Laparotomy.tsx。这里只有「物理」：变量 / 规则 / 目标 / 示范脚本，评分管线照旧。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export const LAP_TOOLS = [
  { v: 0, name: 'scalpel', label: '手术刀' }, { v: 1, name: 'cautery', label: '电刀' }, { v: 2, name: 'clamp', label: '血管钳' },
  { v: 3, name: 'forceps', label: '镊子' }, { v: 4, name: 'retractor', label: '牵开器' },
];

/** 五个层次（和 cut 的 20 分一段对应） */
export const LAP_BANDS = [
  { id: 'skin', title: '① 皮肤与皮下', tools: [0], depth: [6, 12] as [number, number], kind: 'stroke' as const, span: [0, 1] as [number, number], tip: '手术刀。按住不动，刀会慢慢沉，沉到绿色区间再沿线划到头' },
  { id: 'fascia', title: '② 腹外斜肌腱膜', tools: [1, 0], depth: [13, 16] as [number, number], kind: 'stroke' as const, span: [0, 1] as [number, number], tip: '换电刀，沉到 13–16 mm，顺着纤维方向再划一遍' },
  { id: 'muscle', title: '③ 肌层钝性分离', tools: [2], depth: [0, 0] as [number, number], kind: 'spread' as const, span: [0, 1] as [number, number], tip: '换血管钳。钳尖插进切口，往两边一撑——三处各撑一次。这一层别用刀' },
  { id: 'perit', title: '④ 腹膜：先提起再切', tools: [3, 0], depth: [25, 29] as [number, number], kind: 'liftcut' as const, span: [0.34, 0.66] as [number, number], tip: '先用镊子夹起腹膜（它会留在那儿当你的左手），再换手术刀在中段划一个小口。刀尖下面就是肠子' },
  { id: 'expose', title: '⑤ 牵开显露', tools: [4], depth: [0, 0] as [number, number], kind: 'place' as const, span: [0, 1] as [number, number], tip: '拿牵开器，放进切口，把两边拉开，看见回盲部' },
];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t: Math.round(t * 100) / 100, control, value });
  const stroke = (t0: number, from: number, to: number, secs: number) => { const n = Math.round(secs * 4); for (let i = 0; i <= n; i++) { push(t0 + i * 0.25, 'dev', 4 + Math.round(Math.abs(Math.sin(i)) * 6)); push(t0 + i * 0.25, 'cut', from + (to - from) * i / n); } return t0 + n * 0.25; };
  push(1, 'tool', 0); push(2, 'depth', 9);
  let t = stroke(2.5, 0, 20, 6); push(t + 0.5, 'depth', 0);
  push(t + 1, 'tool', 1); push(t + 2, 'depth', 14);
  t = stroke(t + 2.5, 20, 40, 6); push(t + 0.5, 'depth', 0);
  push(t + 1, 'tool', 2); push(t + 3, 'spread', 1); push(t + 3, 'cut', 46.7); push(t + 5, 'spread', 2); push(t + 5, 'cut', 53.3); push(t + 7, 'spread', 3); push(t + 7, 'cut', 60);
  push(t + 8, 'tool', 3); push(t + 9.5, 'lift', 1); push(t + 10.5, 'tool', 0); push(t + 11.5, 'depth', 27);
  t = stroke(t + 12, 60, 80, 4); push(t + 0.5, 'depth', 0);
  push(t + 1, 'tool', 4); push(t + 3, 'retract', 1); push(t + 3, 'cut', 100);
  return a;
}

export function laparotomySpec(image: string): BenchSpec {
  return {
    name: '开腹工位 · 麦氏切口分层入腹', surface: 'laparotomy',
    brief: '急性阑尾炎，右下腹麦氏点斜切口。五个层次五种动作：皮肤皮下用刀划、腱膜用电刀划、肌层用血管钳撑、腹膜先夹起再切小口、最后放牵开器显露。刀沉多深靠按住的时间，不是数字。（教学化简化模型，不构成医疗指导）',
    timeScale: 1, maxSeconds: 420,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'prev', initial: 0, set: 'cut' },
      { id: 'rate_c', label: '推进速度', initial: 0, set: '(cut - prev) / dt', min: 0, max: 80 },
      { id: 'cutting', initial: 0, set: 'rate_c > 0.4 ? 1 : 0' },
      { id: 'layer', label: '当前层次', initial: 0, set: 'cut < 20 ? 0 : cut < 40 ? 1 : cut < 60 ? 2 : cut < 80 ? 3 : 4' },
      { id: 'pass', label: '已完成层次', initial: 0, min: 0, max: 5, set: '(cut >= 20 ? 1 : 0) + (cut >= 40 ? 1 : 0) + (cut >= 60 ? 1 : 0) + (cut >= 80 ? 1 : 0) + (cut >= 100 ? 1 : 0)' },
      { id: 'dev_sum', initial: 0, rate: 'cutting == 1 && layer != 2 ? dev : 0' },
      { id: 'dev_time', initial: 0, rate: 'cutting == 1 && layer != 2 ? 1 : 0' },
      { id: 'dev_avg', label: '平均偏离', initial: 0, set: 'dev_time > 0.5 ? dev_sum / dev_time : 0' },
      { id: 'sharp_muscle', label: '肌层用刀的秒数', initial: 0, max: 14, rate: 'cutting == 1 && layer == 2 && cut > 40.5 && tool < 2 ? 1 : 0' },
      { id: 'blind_perit', label: '腹膜没提起就切的秒数', initial: 0, max: 14, rate: 'cutting == 1 && layer == 3 && cut > 60.5 && lift == 0 ? 1 : 0' },
      { id: 'too_deep', label: '刀过深的秒数', initial: 0, max: 14, rate: 'depth > 32 ? 1 : 0' },
      { id: 'shallow_s', label: '没切透就走的秒数', initial: 0, max: 14, rate: 'shallow == 1 ? 1 : 0' },
      { id: 'stall', label: '停顿秒数', initial: 0, set: 'cut > 3 && cut < 99 && rate_c < 0.4 ? stall + dt : 0' },
      { id: 'stall_max', initial: 0, set: 'max(stall_max, stall)' },
      { id: 'bowel_risk', label: '肠管损伤风险', initial: 0, min: 0, max: 100, set: 'clamp(blind_perit * 6 + too_deep * 9, 0, 100)' },
      { id: 'quality', label: '入腹质量', initial: 0, min: 0, max: 100, set: 'clamp(100 - dev_avg * 0.4 - sharp_muscle * 4 - blind_perit * 4.5 - too_deep * 5 - shallow_s * 2 - max(0, 5 - pass) * 12 - max(0, stall_max - 8) * 2, 0, 100)' },
    ],
    controls: [
      { id: 'tool', label: '器械', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '0 手术刀 · 1 电刀 · 2 血管钳 · 3 镊子 · 4 牵开器' },
      { id: 'cut', label: '入腹进度', kind: 'path', hint: '五个层次各占 20%' },
      { id: 'spread', label: '钝性分离', kind: 'knob', min: 0, max: 3, step: 1, initial: 0, unit: '处' },
      { id: 'lift', label: '夹起腹膜', kind: 'switch' },
      { id: 'retract', label: '牵开器', kind: 'switch' },
      { id: 'depth', label: '刀深', kind: 'knob', min: 0, max: 40, unit: 'mm', hidden: true, initial: 0 },
      { id: 'dev', label: '偏离', kind: 'knob', min: 0, max: 400, hidden: true, initial: 0 },
      { id: 'shallow', label: '没切透就走', kind: 'switch', hidden: true },
    ],
    gauges: [
      { id: 'g_pass', label: '已完成层次', unit: '层', expr: 'pass', min: 0, max: 5 },
      { id: 'g_depth', label: '刀深', unit: 'mm', expr: 'depth', min: 0, max: 36, warn: 'depth > 32' },
      { id: 'g_risk', label: '肠管损伤风险', unit: '', expr: 'bowel_risk', min: 0, max: 100, warn: 'bowel_risk > 20' },
      { id: 'g_q', label: '入腹质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'pass > 1 && quality < 60' },
    ],
    rules: [
      { id: 'sharp_muscle', label: '肌层用刀切（腹内斜肌与腹横肌应顺纤维钝性分离，锐切出血多且无必要）', when: 'cutting == 1 && layer == 2 && cut > 40.5 && tool < 2', severity: 'violation', once: true },
      { id: 'blind_perit', label: '腹膜没提起就切（刀尖下面可能就是肠管）', when: 'cutting == 1 && layer == 3 && cut > 60.5 && lift == 0', severity: 'violation', once: true },
      { id: 'too_deep', label: '刀过深，已经超过腹膜（肠管损伤）', when: 'depth > 32', severity: 'violation' },
      { id: 'shallow', label: '刀还没沉到这一层就往前划（切不透，来回补刀切缘不整齐）', when: 'shallow == 1', severity: 'warning', once: true },
      { id: 'off', label: '偏离切口轴线（切口歪斜、显露困难）', when: 'cutting == 1 && layer != 2 && dev > 150', severity: 'violation' },
      { id: 'rush', label: '推进过快（层次辨认不清）', when: 'cutting == 1 && layer != 2 && rate_c > 14', severity: 'warning', once: true },
    ],
    goals: [
      { id: 'skin', label: '第一层：手术刀切开皮肤与皮下', when: 'cut >= 20' },
      { id: 'fascia', label: '第二层：电刀沿纤维切开腱膜', when: 'cut >= 40', after: 'skin' },
      { id: 'muscle', label: '第三层：血管钳钝性分离三处，没动刀', when: 'cut >= 60 && sharp_muscle < 1', after: 'fascia' },
      { id: 'perit', label: '第四层：夹起腹膜再切开', when: 'cut >= 80 && lift == 1 && blind_perit < 1', after: 'muscle' },
      { id: 'expose', label: '放牵开器，显露回盲部', when: 'cut >= 100 && retract == 1', after: 'perit' },
      { id: 'safe', label: '安全入腹：未伤及肠管、入腹质量 ≥ 70 分', when: 'pass >= 5 && bowel_risk < 10 && quality >= 70', after: 'expose' },
    ],
    expertScript: expertScript(),
  };
}
