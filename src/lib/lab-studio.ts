/**
 * 百业工厂 · 工作室校验（前后端共用）。
 * 两类问题：error 不许发布（存成草稿可以）；warn 只提醒。
 * 「一天」的规则见 docs/lab-studio.md：按时间排、内容配得上时段（别一大早做全天复盘）、前后接得上。
 */
import type { Sim, SimTrace } from '@/lib/skill-sim';
import { sanitizeBenchSpec } from '@/lib/bench';

export interface StudioChapter {
  id: string;
  seq: number;
  slot?: string | null;
  title: string;
  kind: 'daily' | 'incident' | 'assessment';
  brief?: string | null;
  sim: Sim;
  expert_trace?: SimTrace | null;
  status: 'draft' | 'published';
  locked?: boolean;
}

export interface StudioIssue { level: 'error' | 'warn'; chapter?: string; step?: string; msg: string }

export const CHAPTER_KINDS = [
  { k: 'daily', label: '日常', color: '#6b5cff' },
  { k: 'incident', label: '突发', color: '#ef4444' },
  { k: 'assessment', label: '考核', color: '#0ea5a4' },
] as const;

export const STEP_TYPES: { k: string; label: string; hint: string }[] = [
  { k: 'choose', label: '单选', hint: '几个做法选一个' },
  { k: 'multi', label: '多选', hint: '选出该做的几件事' },
  { k: 'drill', label: '下钻', hint: '点开查看信息，选够了再往下' },
  { k: 'classify', label: '分类', hint: '把每一项归到某一类' },
  { k: 'allocate', label: '分配', hint: '把总量分给几项' },
  { k: 'slider', label: '滑块', hint: '给一个数' },
  { k: 'text', label: '写一段', hint: '自由作答' },
  { k: 'bench', label: '虚拟工位', hint: '设备操作（结构复杂，用 JSON 编辑）' },
];

/** 时段 → 当天第几分钟。认 08:30 / 8：30，也认「早上 / 上午 / 中午 / 下午 / 傍晚 / 晚上」这类粗时段；认不出就是 null */
export function slotMinutes(slot?: string | null): number | null {
  const s = String(slot || '');
  const m = s.match(/(\d{1,2})[:：](\d{2})/);
  if (m) return +m[1] * 60 + +m[2];
  const rough: [RegExp, number][] = [[/清晨|凌晨/, 6 * 60], [/早上|早晨|早班/, 8 * 60], [/上午/, 10 * 60], [/中午|午间/, 12 * 60], [/下午/, 15 * 60], [/傍晚/, 18 * 60], [/晚上|夜间|夜班/, 20 * 60]];
  for (const [re, v] of rough) if (re.test(s)) return v;
  return null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 只该出现在一天后段的事（收尾、复盘、下班），和只该出现在前段的事（晨会、开店、岗前准备） */
const LATE = /复盘|全天总结|今日总结|当日总结|下班|收尾|日报|日结|闭店|打烊|收档|交班/;
const EARLY = /晨会|早会|班前会|开店|开门营业|开档|岗前准备|上岗准备|接班/;
const LUNCH = /午餐|午饭|午休/;

const chapterText = (c: StudioChapter) => [c.title, c.brief, c.sim?.title].filter(Boolean).join(' ');

/** 整天的问题：时段缺失 / 重复、内容和时段对不上 */
export function checkDay(chapters: StudioChapter[]): StudioIssue[] {
  const out: StudioIssue[] = [];
  const live = chapters.filter(c => c.status === 'published');
  const many = chapters.length > 1;
  const seen = new Map<string, string>();
  for (const c of chapters) {
    const name = `「${c.title || '未命名'}」`;
    const slot = (c.slot || '').trim();
    if (many && !slot) out.push({ level: 'warn', chapter: c.id, msg: `${name}没写时段：多章时每章都要有时段，时间轴才排得出先后` });
    if (slot && seen.has(slot)) out.push({ level: 'warn', chapter: c.id, msg: `${name}和「${seen.get(slot)}」时段都是 ${slot}` });
    if (slot) seen.set(slot, c.title);
    const t = slotMinutes(slot);
    if (t == null) continue;
    const text = chapterText(c);
    const late = text.match(LATE), early = text.match(EARLY);
    if (late && t < 12 * 60) out.push({ level: 'error', chapter: c.id, msg: `${name}排在 ${slot}，却在做「${late[0]}」——这是一天后段的事，挪到下午或傍晚` });
    if (early && t >= 15 * 60) out.push({ level: 'warn', chapter: c.id, msg: `${name}排在 ${slot}，内容是「${early[0]}」——一般是早上 / 上班时的事` });
    if (LUNCH.test(text) && (t < 11 * 60 || t > 14 * 60)) out.push({ level: 'warn', chapter: c.id, msg: `${name}讲的是午间的事，时段却是 ${slot}` });
  }
  if (chapters.length && !live.length) out.push({ level: 'warn', msg: '还没有已发布的章节：体验端看不到这个空间的任何一章' });
  return out;
}

/** 单章的问题：步骤结构、场景时间和时段对不上、示范轨迹对不上 */
export function checkChapter(c: StudioChapter, fallbackTrace?: SimTrace | null): StudioIssue[] {
  const out: StudioIssue[] = [];
  const add = (level: StudioIssue['level'], msg: string, step?: string) => out.push({ level, chapter: c.id, step, msg });
  if (!c.title?.trim()) add('error', '章节没有标题');
  const steps = Array.isArray(c.sim?.steps) ? c.sim.steps : [];
  if (!steps.length) { add('error', '这一章还没有步骤'); return out; }
  if (steps.length < 3) add('warn', `只有 ${steps.length} 步，一章一般 4–8 步`);
  if (steps.length > 10) add('warn', `${steps.length} 步偏长，考虑拆成两章`);
  const ids = new Set<string>();
  const slotMin = slotMinutes(c.slot);
  steps.forEach((s: any, i: number) => {
    const n = `第 ${i + 1} 步`;
    const sid = String(s?.id || '');
    if (!sid) add('error', `${n}没有编号`);
    else if (ids.has(sid)) add('error', `${n}编号「${sid}」重复`, sid);
    ids.add(sid);
    if (!STEP_TYPES.some(t => t.k === s?.type)) { add('error', `${n}题型「${s?.type}」不认识`, sid); return; }
    if (!String(s.prompt || '').trim()) add('error', `${n}没有题干`, sid);
    if (s.type === 'bench') { if (!sanitizeBenchSpec(s.bench)) add('error', `${n}是虚拟工位，但工位定义不完整（用 JSON 编辑补齐）`, sid); return; }
    const opts = Array.isArray(s.options) ? s.options : [];
    if (['choose', 'multi', 'drill', 'classify', 'allocate'].includes(s.type)) {
      if (opts.length < 2) add('error', `${n}至少要两个选项`, sid);
      const oids = opts.map((o: any) => String(o?.id || ''));
      if (oids.some((x: string) => !x) || new Set(oids).size !== oids.length) add('error', `${n}选项编号有空的或重复的`, sid);
      if (opts.some((o: any) => !String(o?.label || '').trim())) add('error', `${n}有空选项`, sid);
    }
    if (s.type === 'classify' && !(Array.isArray(s.labels) && s.labels.length >= 2)) add('error', `${n}是分类题，至少要两个分类`, sid);
    if (s.type === 'multi' && s.max && s.max >= opts.length) add('warn', `${n}最多可选 ${s.max} 个，等于全选`, sid);
    // 场景里写的时刻和章节时段差太远（章节是 08:30，台词里却是 18:10）
    const st = s.scene?.time ? slotMinutes(s.scene.time) : null;
    if (slotMin != null && st != null && Math.abs(st - slotMin) > 180) add('warn', `${n}场景时间 ${hhmm(st)} 和章节时段 ${c.slot} 差了 ${Math.round(Math.abs(st - slotMin) / 60)} 小时`, sid);
  });
  if (steps[steps.length - 1]?.type !== 'text') add('warn', '最后一步一般是「写下你的结论」（写一段），评分要靠它');
  // 示范轨迹：选项被改掉后，示范里的选择对不上了，评分里「和专家一致」会失真
  const trace = c.expert_trace && Object.keys(c.expert_trace).length ? c.expert_trace : fallbackTrace;
  if (trace) {
    let miss = 0, stale = 0;
    for (const s of steps as any[]) {
      if (s.type === 'text' || s.type === 'bench') continue;
      const v = trace[s.id];
      if (v === undefined || v === null) { miss++; continue; }
      const oids = new Set((s.options || []).map((o: any) => String(o.id)));
      const used = s.type === 'choose' ? [v] : s.type === 'multi' || s.type === 'drill' ? (Array.isArray(v) ? v : []) : s.type === 'classify' || s.type === 'allocate' ? Object.keys(v || {}) : [];
      if (used.some((x: any) => !oids.has(String(x)))) stale++;
    }
    if (stale) add('warn', `示范轨迹里有 ${stale} 步的选择对不上现在的选项（改过选项？请老师傅重新示范或改示范）`);
    if (miss) add('warn', `${miss} 步没有示范答案，评分时这几步不和专家比`);
  } else add('warn', '这一章还没有示范轨迹：评分只看岗位标准，不和专家比');
  return out;
}

export function checkAll(chapters: StudioChapter[], fallbackTrace?: SimTrace | null, firstSeq = 1): StudioIssue[] {
  return [
    ...checkDay(chapters),
    // 空间技能里的示范轨迹只属于第 1 章（老空间迁来的那章）
    ...chapters.flatMap(c => checkChapter(c, c.seq === firstSeq ? fallbackTrace : null)),
  ];
}

/** 新步骤的模板 */
export function blankStep(type: string, n: number): any {
  const id = `s${Date.now().toString(36)}${n}`;
  const base: any = { id, type, prompt: '', scene: { who: '', text: '' } };
  if (['choose', 'multi', 'drill', 'classify', 'allocate'].includes(type)) base.options = [{ id: 'a', label: '' }, { id: 'b', label: '' }];
  if (type === 'multi' || type === 'drill') base.max = 2;
  if (type === 'classify') base.labels = [{ id: 'l1', label: '' }, { id: 'l2', label: '' }];
  if (type === 'allocate') { base.total = 100; base.unit = '%'; }
  if (type === 'slider') { base.min = 0; base.maxValue = 100; base.unit = '%'; }
  if (type === 'text') base.placeholder = '';
  return base;
}
