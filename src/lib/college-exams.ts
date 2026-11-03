/**
 * 科研能力测评题的库读写 + 导师校正（迁移 060，2026-11-03）。
 * 用户口径：人只做校正、不做起草——AI 代导师出完整初稿，导师在 /college/review/<token> 逐项「通过 / 改 / 作废」，每处改动记进 corrections。
 * 一次提交是一组 edit：
 *   design  item = question|independent|dependent|baselines|data|scale   value = 文本（列表项一行一个）
 *   brief   value = 盲测简介全文
 *   prop    item = 论断编号 i   fields: statement / truth / discard
 *   planted item = 埋错序号（0 起）fields: changed / why_wrong / discard（改了 changed，稿件节选里同步替换）
 */
import { randomBytes } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase';

export type ExamRow = { id: string; title: string; url: string | null; license: string | null; field: string | null; scope: 'public' | 'private'; org: string | null; status: string; mentor: string | null; checker: string | null; exam: any; corrections: any[]; review_token: string | null; reviewer: any; reviewed_at: string | null; built_at: string | null; updated_at: string | null };
export type Edit = { part: 'design' | 'brief' | 'prop' | 'planted'; item?: string | number; field?: string; value: any; note?: string };

const LIST_KEYS = ['independent', 'dependent', 'baselines', 'data'];

export async function examByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  const { data } = await db.from('college_research_exams').select('*').eq('review_token', token).maybeSingle();
  return (data as ExamRow) || null;
}

/** 导师看到的：题目本体 + 核对结果；不给 review_token 本身以外的内部字段 */
export function forMentor(r: ExamRow) {
  const { review_token: _t, ...rest } = r;
  return rest;
}

export async function reviewLink(id: string) {
  const { data: r } = await db.from('college_research_exams').select('id, review_token').eq('id', id).single();
  if (!r) throw new Error('没有这道题');
  if (r.review_token) return r.review_token as string;
  const token = randomBytes(16).toString('base64url');
  await db.from('college_research_exams').update({ review_token: token, updated_at: new Date().toISOString() }).eq('id', id);
  return token;
}

/** 应用导师的一组修改，逐条记进 corrections（before / after 留痕）；done=true 标为导师已校正 */
export async function applyCorrections(token: string, reviewer: { name: string; org?: string; contact?: string }, edits: Edit[], done: boolean) {
  const r = await examByToken(token);
  if (!r) throw new Error('校正链接不对');
  if (!reviewer?.name?.trim()) throw new Error('先写上你的名字（会记在每一处修改上）');
  const ex = JSON.parse(JSON.stringify(r.exam || {}));
  const by = reviewer.name.trim().slice(0, 40), at = new Date().toISOString();
  const log: any[] = [];
  const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
  for (const e of (edits || []).slice(0, 80)) {
    const note = String(e.note || '').slice(0, 300);
    if (e.part === 'design' && e.item) {
      const k = String(e.item); ex.design_key = ex.design_key || {};
      const v = LIST_KEYS.includes(k) ? String(e.value || '').split('\n').map(x => x.trim()).filter(Boolean) : String(e.value || '').trim();
      if (!same(ex.design_key[k], v)) { log.push({ by, at, part: 'design', item: k, before: ex.design_key[k], after: v, note }); ex.design_key[k] = v; }
    } else if (e.part === 'brief') {
      const v = String(e.value || '').trim();
      if (v && v !== ex.blind_brief) { log.push({ by, at, part: 'brief', before: ex.blind_brief, after: v, note }); ex.blind_brief = v; }
    } else if (e.part === 'prop') {
      const p = (ex.propositions || []).find((x: any) => x.i === Number(e.item)); if (!p || !e.field) continue;
      const f = e.field, v = f === 'truth' || f === 'discard' ? !!e.value : String(e.value || '').trim();
      if (!same(p[f] ?? (f === 'discard' ? false : undefined), v)) { log.push({ by, at, part: 'prop', item: p.i, field: f, before: p[f], after: v, note }); p[f] = v; }
    } else if (e.part === 'planted') {
      const i = Number(e.item); const p = (ex.planted || [])[i]; if (!p || !e.field) continue;
      const f = e.field, v = f === 'discard' ? !!e.value : String(e.value || '').trim();
      if (same(p[f] ?? (f === 'discard' ? false : undefined), v)) continue;
      log.push({ by, at, part: 'planted', item: i, field: f, before: p[f], after: v, note });
      if (f === 'changed' && typeof ex.review_excerpt === 'string' && p.changed && ex.review_excerpt.includes(p.changed)) ex.review_excerpt = ex.review_excerpt.replace(p.changed, v);
      p[f] = v;
    }
  }
  const patch: Record<string, any> = { exam: ex, corrections: [...(r.corrections || []), ...log], reviewer: { name: by, org: String(reviewer.org || '').slice(0, 80), contact: String(reviewer.contact || '').slice(0, 80) }, updated_at: at };
  if (done) { patch.status = 'mentor_reviewed'; patch.reviewed_at = at; patch.mentor = `${r.mentor || ''}${r.mentor?.includes(by) ? '' : ` · 导师校正：${by}`}`.trim(); }
  const { error } = await db.from('college_research_exams').update(patch).eq('id', r.id);
  if (error) throw new Error(error.message);
  return { changed: log.length, status: done ? 'mentor_reviewed' : r.status };
}

export async function listExams() {
  const { data, error } = await db.from('college_research_exams').select('id, title, url, field, scope, org, status, mentor, checker, corrections, review_token, reviewer, reviewed_at, built_at, exam').order('built_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, exam: undefined, corrections: (r.corrections || []).length,
    doubts: [...(r.exam?.check?.props || []).filter((x: any) => !x.label_ok), ...(r.exam?.check?.planted_ok || []).filter((x: any) => !x.ok)].length + (r.exam?.check?.brief_leaks || []).length,
    props: (r.exam?.propositions || []).length, planted: (r.exam?.planted || []).length }));
}

/** 脚本写库用：一份题（JSON 文件格式）→ 一行；已有行保留导师的修改记录、链接和状态 */
export async function upsertExam(ex: any) {
  const { data: old } = await db.from('college_research_exams').select('status, corrections, review_token, reviewer').eq('id', ex.id).maybeSingle();
  const { id, title, url, license, field, scope, org, mentor, checker, built_at, status, corrections, ...body } = ex;
  const row = { id, title, url, license, field, scope: scope || 'public', org: org || null, mentor, checker, built_at, exam: body, status: old?.status || status || 'ai_draft', corrections: old?.corrections || corrections || [], updated_at: new Date().toISOString() };
  const { error } = await db.from('college_research_exams').upsert(row);
  if (error) throw error;
}
