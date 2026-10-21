/**
 * AI 百业｜AI 大学（/college，2026-10-21）：把百业的数字职人当成「AI 毕业生」来看。
 *   学了什么 = 空间里一整天的章节 + 老师傅（或 AI 草案）的技能；
 *   考得怎样 = 这个空间里 AI 的作答：没装技能（上学前）vs 装了老师傅的技能（上学后）；
 *   能干哪些活 = 职人能接的真实问题 / 能力；
 *   能去哪些公司 = 空间对上的职业 → 平方岗位库里标了这个职业（related_career_ids）的在招岗位。
 * 只读，不建新表。毕业生列表算起来要查几十次职业库 / 岗位库：进程内缓存 10 分钟。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { findOccupation } from '@/lib/occupation-store';
import { familyOf } from '@/lib/career-family';

export const PASS = 60;
export interface Graduate {
  id: string; name: string; role: string; avatar: string; tagline: string; cover: string;
  family: string; research: boolean;
  teacher: { expert: boolean; name: string; place: string };
  courses: number; slots: string[]; bench: boolean;
  canDo: string[];
  exam: { after: number | null; before: number | null; runs: number; models: string[] };
  graduated: boolean;
  occupation: { name: string; key: string } | null;
  hiring: { total: number; companies: string[] };
}

const pick = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const modelOf = (note: string) => String(note || '').split(' · ')[0].trim();

async function occupationOf(space: any) {
  const jd = space.jd_snapshot || {};
  for (const n of [jd.career?.profession, jd.title, space.profile?.role].filter(Boolean)) {
    const o = await findOccupation({ name: String(n).trim() }).catch(() => null);
    if (o) return o;
  }
  return null;
}

async function hiringFor(key: string, limit = 4) {
  const { data, count } = await supabaseAdmin.from('jobs').select('institute_or_company_name, name, location, link, source_url', { count: 'exact' })
    .ilike('related_career_ids', `%${key}%`).order('id', { ascending: false }).limit(limit);
  return { total: count || 0, rows: data || [] };
}

/** 并发跑，别压库（线上共用库：同时最多 4 路） */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

let cache: { at: number; data: Graduate[] } | null = null;

export async function listGraduates(): Promise<Graduate[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const { data: spaces } = await supabaseAdmin.from('skill_tasks')
    .select('id, title, profile, jd_snapshot, sim, skill:skills(name, domain, source, expert_name, expert_location)');
  const ids = (spaces || []).map(s => s.id);
  const [{ data: chs }, { data: subs }] = await Promise.all([
    supabaseAdmin.from('lab_chapters').select('task_id, slot, status, steps:sim->steps').in('task_id', ids).eq('status', 'published'),
    supabaseAdmin.from('skill_submissions').select('task_id, score, with_skill_id, candidate_note').eq('candidate_type', 'ai').in('task_id', ids),
  ]);
  const live = (spaces || []).filter(s => (chs || []).some(c => c.task_id === s.id));
  const grads = await pool(live, 4, async (s: any): Promise<Graduate> => {
    const p = s.profile || {}, jd = s.jd_snapshot || {}, sk: any = pick(s.skill);
    const mine = (chs || []).filter(c => c.task_id === s.id);
    const ai = (subs || []).filter(x => x.task_id === s.id);
    const best = (xs: any[]) => xs.length ? Math.max(...xs.map(x => x.score || 0)) : null;
    const after = best(ai.filter(x => x.with_skill_id)), before = best(ai.filter(x => !x.with_skill_id));
    const occ = await occupationOf(s);
    const hire = occ?.external_id ? await hiringFor(occ.external_id, 12) : { total: 0, rows: [] as any[] };
    const companies = [...new Set(hire.rows.map((r: any) => String(r.institute_or_company_name || '').trim()).filter(c => c && !/虚构|演示|示例/.test(c)))].slice(0, 4);
    if (jd.company && !/演示|虚构|示例/.test(jd.company) && !companies.includes(jd.company)) companies.unshift(jd.company);
    const art = s.sim?.art || {};
    return {
      id: s.id, name: p.name || 'NOVA', role: p.role || jd.title || s.title, avatar: p.avatar || '', tagline: p.tagline || '',
      cover: art.cover || Object.values(art.scenes || {})[0] as string || '',
      family: familyOf(jd.career?.profession || '', sk?.domain, jd.title, jd.company),
      research: jd.kind === 'research_post' || jd.kind === 'discipline',
      teacher: { expert: !!sk && sk.source !== 'jd-draft', name: sk && sk.source !== 'jd-draft' ? sk.expert_name : '', place: sk?.expert_location || '' },
      courses: mine.length, slots: mine.map(c => c.slot).filter(Boolean).sort(),
      bench: mine.some((c: any) => Array.isArray(c.steps) && c.steps.some((x: any) => x?.type === 'bench')),
      canDo: (p.can_solve || p.capabilities || []).slice(0, 3),
      exam: { after, before, runs: ai.length, models: [...new Set(ai.map(x => modelOf(x.candidate_note)).filter(m => m && !/通用|同一/.test(m)))] },
      graduated: (after ?? 0) >= PASS,
      occupation: occ ? { name: occ.name_lang_cn || occ.name, key: occ.external_id } : null,
      hiring: { total: hire.total, companies: companies.slice(0, 4) },
    };
  });
  grads.sort((a, b) => Number(b.graduated) - Number(a.graduated) || b.hiring.total - a.hiring.total);
  cache = { at: Date.now(), data: grads };
  return grads;
}

/** 单个毕业生档案：上面那些 + 每一门课 + 每一次考试 + 能去的在招岗位 */
export async function graduateDetail(id: string) {
  const all = await listGraduates();
  const g = all.find(x => x.id === id);
  if (!g) return null;
  const [{ data: chs }, { data: subs }, { data: space }] = await Promise.all([
    supabaseAdmin.from('lab_chapters').select('id, slot, title, kind, steps:sim->steps').eq('task_id', id).eq('status', 'published').order('seq'),
    supabaseAdmin.from('skill_submissions').select('id, score, with_skill_id, candidate_note, chapter_id, submitted_at').eq('task_id', id).eq('candidate_type', 'ai').order('submitted_at', { ascending: false }).limit(40),
    supabaseAdmin.from('skill_tasks').select('profile, jd_snapshot').eq('id', id).single(),
  ]);
  const jobs = g.occupation ? (await hiringFor(g.occupation.key, 30)).rows : [];
  return {
    ...g,
    capabilities: (space?.profile as any)?.capabilities || [],
    canSolve: (space?.profile as any)?.can_solve || [],
    company: (space?.jd_snapshot as any)?.company || '',
    lessons: (chs || []).map((c: any) => ({ id: c.id, slot: c.slot, title: c.title, kind: c.kind, bench: Array.isArray(c.steps) && c.steps.some((x: any) => x?.type === 'bench') })),
    exams: (subs || []).map(s => ({ id: s.id, score: s.score, after: !!s.with_skill_id, model: modelOf(s.candidate_note), chapterId: s.chapter_id || null, chapter: (chs || []).find(c => c.id === s.chapter_id)?.title || '第一段', at: s.submitted_at })),
    jobs: jobs.map((j: any) => ({ company: j.institute_or_company_name, name: j.name, city: j.location, url: j.link || j.source_url || '' })),
  };
}

export const clearCollegeCache = () => { cache = null; };
