/**
 * 「入一行，过一生」英文版（One Job, One Life）：卡的英文是一份「覆盖层」（src/lib/game/cards/en/<id>.json），
 * 按位置 / id 对上中文卡的每一段文字；数字、年限、概率、效果都用中文卡的，英文只换字。服务端合并后给前端。
 */
import type { GameCard } from './types';

export type Lang = 'zh' | 'en';

/** 英文覆盖层的格式（翻译照这个写；数组按中文卡的顺序一一对应，事件和抉择按 id） */
export interface CardEn {
  id: string;
  /** 职业名（如 Surgeon） */
  occupation: string;
  role: string; headline: string; unit: string; unit_type: string; city: string; city_tier: string; education: string;
  level: string; intro: string; salary_note: string;
  facts: { label: string; value: string; source: string }[];
  day: string[];
  ladder: { title: string; stage: string; focus: string }[];
  ai_tasks: { name: string; how: string }[];
  events: Record<string, string>;
  choices: Record<string, { title: string; situation: string; options: { label: string; result: string; end?: string }[] }>;
  endings: { retire: string; burnout: string };
  past: string[];
  /** 和中文卡 stages / work 同序 */
  stages?: string[];
  work?: string[];
  late: { pension_note: string; scenes: string[]; closing: { retire: string; burnout: string; end: string } };
}

/** 中文卡 + 英文覆盖层 → 英文卡（缺的地方留中文，校验脚本会报出来） */
export function mergeEn(c: GameCard, en: CardEn | null | undefined): GameCard {
  if (!en) return c;
  const pick = <T,>(v: T | undefined | null, fb: T) => (v === undefined || v === null || v === '' ? fb : v);
  return {
    ...c,
    role: pick(en.role, c.role), headline: pick(en.headline, c.headline), unit: pick(en.unit, c.unit), unit_type: pick(en.unit_type, c.unit_type),
    city: pick(en.city, c.city), city_tier: pick(en.city_tier, c.city_tier), education: pick(en.education, c.education),
    start: { ...c.start, level: pick(en.level, c.start.level) }, intro: pick(en.intro, c.intro), salary_note: pick(en.salary_note, c.salary_note),
    occupation: { ...c.occupation, name: pick(en.occupation, c.occupation.name) },
    facts: c.facts.map((f, i) => ({ label: pick(en.facts?.[i]?.label, f.label), value: pick(en.facts?.[i]?.value, f.value), source: pick(en.facts?.[i]?.source, f.source) })),
    day: c.day.map((d, i) => ({ ...d, text: pick(en.day?.[i], d.text) })),
    ladder: c.ladder.map((l, i) => ({ ...l, title: pick(en.ladder?.[i]?.title, l.title), stage: pick(en.ladder?.[i]?.stage, l.stage), focus: pick(en.ladder?.[i]?.focus, l.focus) })),
    ai: { ...c.ai, tasks: c.ai.tasks.map((t, i) => ({ ...t, name: pick(en.ai_tasks?.[i]?.name, t.name), how: pick(en.ai_tasks?.[i]?.how, t.how) })) },
    events: c.events.map(e => ({ ...e, text: pick(en.events?.[e.id], e.text) })),
    choices: c.choices.map(ch => { const x = en.choices?.[ch.id]; return { ...ch, title: pick(x?.title, ch.title), situation: pick(x?.situation, ch.situation), options: ch.options.map((o, i) => ({ ...o, label: pick(x?.options?.[i]?.label, o.label), result: pick(x?.options?.[i]?.result, o.result), ...(o.end ? { end: pick(x?.options?.[i]?.end, o.end) } : {}) })) }; }),
    endings: { retire: pick(en.endings?.retire, c.endings.retire), burnout: pick(en.endings?.burnout, c.endings.burnout) },
    past: c.past?.map((p, i) => ({ ...p, text: pick(en.past?.[i], p.text) })),
    stages: c.stages?.map((x, i) => ({ ...x, text: pick(en.stages?.[i], x.text) })),
    work: c.work?.map((x, i) => ({ ...x, text: pick(en.work?.[i], x.text) })),
    late: c.late && { ...c.late, pension_note: pick(en.late?.pension_note, c.late.pension_note), scenes: c.late.scenes.map((s, i) => ({ ...s, text: pick(en.late?.scenes?.[i], s.text) })), closing: { retire: pick(en.late?.closing?.retire, c.late.closing.retire), burnout: pick(en.late?.closing?.burnout, c.late.closing.burnout), end: pick(en.late?.closing?.end, c.late.closing.end) } },
  };
}

/** 校验：英文覆盖层和中文卡对不对得上、还有没有漏下的中文 */
export function checkEn(c: GameCard, en: CardEn): string[] {
  const out: string[] = [];
  const cjk = /[一-鿿]/;
  const need = (ok: any, msg: string) => { if (!ok) out.push(msg); };
  need(en.day?.length === c.day.length, `day ${en.day?.length} ≠ ${c.day.length}`);
  need(en.ladder?.length === c.ladder.length, `ladder ${en.ladder?.length} ≠ ${c.ladder.length}`);
  need(en.ai_tasks?.length === c.ai.tasks.length, `ai_tasks ${en.ai_tasks?.length} ≠ ${c.ai.tasks.length}`);
  need(en.facts?.length === c.facts.length, `facts ${en.facts?.length} ≠ ${c.facts.length}`);
  need(en.past?.length === (c.past?.length || 0), `past ${en.past?.length} ≠ ${c.past?.length}`);
  need((en.stages?.length || 0) === (c.stages?.length || 0), `stages ${en.stages?.length || 0} ≠ ${c.stages?.length || 0}`);
  need((en.work?.length || 0) === (c.work?.length || 0), `work ${en.work?.length || 0} ≠ ${c.work?.length || 0}`);
  need(en.late?.scenes?.length === (c.late?.scenes.length || 0), `late.scenes ${en.late?.scenes?.length} ≠ ${c.late?.scenes.length}`);
  for (const e of c.events) need(en.events?.[e.id], `缺事件 ${e.id}`);
  for (const ch of c.choices) { const x = en.choices?.[ch.id]; need(x && x.options?.length === ch.options.length, `抉择 ${ch.id} 缺或选项数不对`); ch.options.forEach((o, i) => { if (o.end) need(x?.options?.[i]?.end, `抉择 ${ch.id} 第 ${i + 1} 个选项缺 end`); }); }
  const text = JSON.stringify(en);
  const m = text.match(/[一-鿿][^"]{0,20}/);
  need(!cjk.test(text), `还有中文：${m?.[0]}`);
  return out;
}
