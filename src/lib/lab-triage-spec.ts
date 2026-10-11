/**
 * 急诊护士的交互故事（2026-10-11）：预检分诊台——几个病人前后脚到，先看谁、量什么、分几级、送哪儿，中途还有人在候诊区掉血氧。
 *   考的是取舍和节奏：危重的不能等，看着「只是吐了」的孩子不量一下体征就放去候诊，是最常见的漏诊。
 * 台面组件：src/components/lab/surfaces/Triage.tsx（HTML，浅色整屏，像真的分诊系统）。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export interface TriagePatient {
  id: number; arrive: number; name: string; age: string; complaint: string; look: string;
  /** 量出来才知道的体征 */ vitals: { hr: number; bp: string; spo2: number; temp: number; rr: number };
  /** 问诊才知道的 */ history: string;
  /** 正确分级（1 濒危 2 危重 3 急症 4 非急症），可接受的集合 */ ok: number[]; /** 正确去向 0 候诊 1 诊室 2 抢救室 */ dest: number[];
  /** 危重：等着不分诊会恶化 */ critical: boolean; /** 不量体征就分级 = 盲分（对这位病人很危险） */ mustMeasure: boolean;
}
export const TRIAGE_PATIENTS: TriagePatient[] = [
  { id: 1, arrive: 0, name: '陈建国', age: '65 岁 · 男', complaint: '胸口闷痛 20 分钟，出冷汗', look: '面色苍白，按着胸口，说话还清楚', vitals: { hr: 104, bp: '150/95', spo2: 95, temp: 36.6, rr: 22 }, history: '高血压 10 年，今早搬花盆后开始痛，含了速效救心丸没缓解', ok: [1, 2], dest: [2], critical: true, mustMeasure: false },
  { id: 2, arrive: 0, name: '小雨', age: '8 岁 · 女', complaint: '发烧两天，今天 39.2℃', look: '有点蔫，但能自己走、会说话、还要喝水', vitals: { hr: 118, bp: '100/65', spo2: 98, temp: 39.1, rr: 24 }, history: '幼儿园有同学流感，昨晚吃了退烧药退过一次', ok: [3, 4], dest: [0, 1], critical: false, mustMeasure: false },
  { id: 3, arrive: 0, name: '林晓', age: '28 岁 · 女', complaint: '切菜割到手指，流血', look: '用纸巾包着食指，纸巾见血但没滴', vitals: { hr: 88, bp: '118/76', spo2: 99, temp: 36.7, rr: 16 }, history: '没有基础病，破伤风十年内打过', ok: [4], dest: [0, 1], critical: false, mustMeasure: false },
  { id: 4, arrive: 22, name: '王秀兰', age: '72 岁 · 女', complaint: '喘，这两天越来越重', look: '坐着不敢躺，说话一句要停两次', vitals: { hr: 112, bp: '160/90', spo2: 88, temp: 37.2, rr: 30 }, history: '慢阻肺多年，家里有制氧机，这两天咳黄痰', ok: [1, 2], dest: [2], critical: true, mustMeasure: true },
  { id: 5, arrive: 22, name: '赵强', age: '45 岁 · 男', complaint: '喝多了，家属说他摔了一跤', look: '满身酒气，骂骂咧咧，家属在旁边大声催', vitals: { hr: 92, bp: '135/85', spo2: 97, temp: 36.5, rr: 16 }, history: '额头有擦伤没出血，能认人、能走直线', ok: [4], dest: [0, 1], critical: false, mustMeasure: false },
  { id: 6, arrive: 48, name: '多多', age: '3 岁 · 男', complaint: '吐了两次，然后一直想睡', look: '妈妈抱着，叫他睁眼看一下又闭上，手脚有点凉', vitals: { hr: 168, bp: '78/45', spo2: 93, temp: 39.8, rr: 40 }, history: '昨天开始拉肚子，今天尿很少，皮肤按下去回血慢', ok: [1], dest: [2], critical: true, mustMeasure: true },
];
export const LEVELS = ['', 'Ⅰ 濒危', 'Ⅱ 危重', 'Ⅲ 急症', 'Ⅳ 非急症'];
export const DESTS = ['候诊区', '急诊诊室', '抢救室'];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  const tri = (t: number, id: number, measure: boolean, ask: boolean, level: number, dest: number) => {
    push(t, 'pick', id); if (measure) { push(t + 2, 'measure', 1); push(t + 6, `m${id}`, 1); } if (ask) push(t + 7, 'ask', 1);
    push(t + 8, 'level', level); push(t + 9, 'dest', dest); push(t + 10, 'confirm', 1); push(t + 10, `lv${id}`, level); push(t + 10, `ds${id}`, dest);
  };
  tri(2, 1, true, false, 1, 2); tri(14, 2, true, false, 3, 1); tri(26, 4, true, true, 2, 2); tri(40, 3, false, false, 4, 0); tri(52, 6, true, true, 1, 2); tri(66, 5, false, true, 4, 0);
  return a;
}

export function triageSpec(image: string): BenchSpec {
  const P = TRIAGE_PATIENTS;
  const okExpr = (p: TriagePatient) => `(${p.ok.map(l => `lv${p.id} == ${l}`).join(' || ')}) && (${p.dest.map(d => `ds${p.id} == ${d}`).join(' || ')}) ? 1 : 0`;
  return {
    name: '预检分诊台 · 晚高峰', surface: 'triage',
    brief: '急诊预检台。病人会前后脚到：先看谁、要不要量体征、分几级、送哪儿，都是你定。危重的等不起，看着轻的未必轻——不量一下体征就放去候诊，是最常见的漏诊。候诊区有人恶化会报警，要回头重新分。（教学化简化模型，不构成医疗指导）',
    timeScale: 1, maxSeconds: 300,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      ...P.map(p => ({ id: `ok${p.id}`, initial: 0, set: okExpr(p) })),
      { id: 'done', label: '已分诊', initial: 0, set: P.map(p => `(lv${p.id} > 0 ? 1 : 0)`).join(' + ') },
      { id: 'correct', label: '分对的', initial: 0, set: P.map(p => `ok${p.id}`).join(' + ') },
      { id: 'crit_wait', label: '危重病人等候秒数', initial: 0, max: 300, rate: P.filter(p => p.critical).map(p => `(t >= ${p.arrive} && lv${p.id} == 0 ? 1 : 0)`).join(' + ') },
      { id: 'under', label: '危重分轻了', initial: 0, set: P.filter(p => p.critical).map(p => `(lv${p.id} >= 3 ? 1 : 0)`).join(' + ') },
      { id: 'blind', label: '没量体征就分', initial: 0, set: P.filter(p => p.mustMeasure).map(p => `(lv${p.id} > 0 && m${p.id} == 0 ? 1 : 0)`).join(' + ') },
      { id: 'over', label: '轻症占抢救室', initial: 0, set: P.filter(p => !p.critical).map(p => `(ds${p.id} == 2 ? 1 : 0)`).join(' + ') },
      { id: 'alarm_wait', label: '报警后没处理的秒数', initial: 0, max: 120, rate: 't >= 85 && lv4 == 0 ? 1 : 0' },
      { id: 'quality', label: '分诊质量', initial: 0, min: 0, max: 100, set: 'clamp(correct * 15 + (done >= 6 ? 10 : 0) - under * 20 - blind * 15 - over * 8 - max(0, crit_wait - 60) * 0.5 - alarm_wait * 0.5, 0, 100)' },
    ],
    controls: [
      { id: 'pick', label: '叫号', kind: 'knob', min: 0, max: 6, step: 1, initial: 0 },
      { id: 'measure', label: '量生命体征', kind: 'button' },
      { id: 'ask', label: '问诊', kind: 'button' },
      { id: 'level', label: '分级', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '1 濒危 · 2 危重 · 3 急症 · 4 非急症' },
      { id: 'dest', label: '去向', kind: 'knob', min: 0, max: 2, step: 1, initial: 0, hint: '0 候诊 · 1 诊室 · 2 抢救室' },
      { id: 'confirm', label: '确认分诊', kind: 'button' },
      ...P.flatMap(p => [
        { id: `lv${p.id}`, label: `${p.name} 的分级`, kind: 'knob' as const, min: 0, max: 4, hidden: true, initial: 0 },
        { id: `ds${p.id}`, label: `${p.name} 的去向`, kind: 'knob' as const, min: 0, max: 2, hidden: true, initial: 0 },
        { id: `m${p.id}`, label: `${p.name} 量过体征`, kind: 'switch' as const, hidden: true },
      ]),
    ],
    gauges: [
      { id: 'g_done', label: '已分诊', unit: '人', expr: 'done', min: 0, max: 6 },
      { id: 'g_wait', label: '危重等候', unit: '秒', expr: 'crit_wait', min: 0, max: 180, warn: 'crit_wait > 60' },
      { id: 'g_correct', label: '分对', unit: '人', expr: 'correct', min: 0, max: 6 },
      { id: 'g_q', label: '分诊质量', unit: '分', expr: 'quality', min: 0, max: 100, warn: 'done > 2 && quality < 50' },
    ],
    rules: [
      { id: 'under', label: '把危重病人分轻了（胸痛出汗、喘得说不完整句、嗜睡花斑的孩子——都不能等）', when: 'under > 0', severity: 'violation', once: true },
      { id: 'blind', label: '没量体征就分级（看着「只是吐了」「就是喘」，一量才知道血氧 / 血压不对）', when: 'blind > 0', severity: 'violation', once: true },
      { id: 'over', label: '轻症送进抢救室（占床，真危重的进不去）', when: 'over > 0', severity: 'warning', once: true },
      { id: 'crit_wait', label: '危重病人等了超过 60 秒还没分诊', when: 'crit_wait > 60', severity: 'violation', once: true },
      { id: 'alarm', label: '候诊区报警（王秀兰血氧 84%）没有马上处理', when: 'alarm_wait > 15', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'first', label: '先处理胸痛出汗的陈建国（Ⅰ/Ⅱ 级 → 抢救室）', when: 'ok1 == 1' },
      { id: 'measure4', label: '王秀兰量了血氧再分（Ⅰ/Ⅱ 级 → 抢救室）', when: 'ok4 == 1 && m4 == 1' },
      { id: 'kid', label: '多多量了体征、问了病史，分 Ⅰ 级进抢救室', when: 'ok6 == 1 && m6 == 1' },
      { id: 'all', label: '六个人都分完', when: 'done >= 6' },
      { id: 'no_over', label: '轻症没占抢救室', when: 'done >= 6 && over == 0', after: 'all' },
      { id: 'q', label: '分诊质量 ≥ 70', when: 'done >= 6 && quality >= 70', after: 'all' },
    ],
    expertScript: expertScript(),
  };
}
