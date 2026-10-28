/**
 * AI 职业能力榜（2026-10-28）：同一门课、同一把尺子，看各家大模型能不能干好这一行。
 * 数据来自学院学籍：入学考 = 裸考（没装任何技能卡和要点，模型的原生本事）；毕业考 = 培养后（装了老师傅技能卡 + 上课要点 + 错题本）。
 * 只算平台自己的大模型（客户送来的模型不上榜）；只公开聚合后的分数，不露学籍细节。
 * 总榜：每个模型在它考过的课上取平均；分榜：至少两个模型都考过的课，一门课一张。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { MODEL_OPTIONS } from '@/lib/model-options';

export type LbRow = { model: string; label: string; provider: string; courses: number; before: number | null; after: number | null; gain: number | null };
export type LbBoard = { space_id: string; role: string; company: string; rows: LbRow[] };
export type Leaderboard = { updated: string; models: LbRow[]; boards: LbBoard[]; totals: { models: number; courses: number; exams: number } };

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const one = (v: any) => (Array.isArray(v) ? v[0] : v);

export async function buildLeaderboard(): Promise<Leaderboard> {
  const [{ data: ens }, { data: sts }, { data: sps }] = await Promise.all([
    db.from('college_enrollments').select('student_id, space_id, entrance_score, final_score, updated_at'),
    db.from('college_students').select('id, name, kind, model_id'),
    db.from('skill_tasks').select('id, title, profile, jd_snapshot'),
  ]);
  const stu = new Map((sts || []).filter((s: any) => s.kind === 'platform' && s.model_id).map((s: any) => [s.id, s]));
  const spc = new Map((sps || []).map((s: any) => [s.id, s]));
  const label = (m: string) => { const o = MODEL_OPTIONS.find(x => x.id === m); return { label: o?.label || m, provider: (o as any)?.provider || '' }; };
  const scored = (ens || []).filter((e: any) => stu.has(e.student_id) && (e.entrance_score != null || e.final_score != null));
  // 同一模型同一门课可能有多份学籍：取最近一份
  const latest = new Map<string, any>();
  for (const e of scored) { const s: any = stu.get(e.student_id); const k = `${s.model_id}|${e.space_id}`; const cur = latest.get(k); if (!cur || String(e.updated_at) > String(cur.updated_at)) latest.set(k, { ...e, model: s.model_id }); }
  const rows = [...latest.values()];
  const row = (model: string, list: any[]): LbRow => {
    const b = list.map(x => x.entrance_score).filter((v: any) => typeof v === 'number'), a = list.map(x => x.final_score).filter((v: any) => typeof v === 'number');
    const both = list.filter(x => typeof x.entrance_score === 'number' && typeof x.final_score === 'number');
    return { model, ...label(model), courses: list.length, before: avg(b), after: avg(a), gain: both.length ? avg(both.map(x => x.final_score - x.entrance_score)) : null };
  };
  const byModel = new Map<string, any[]>(); for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) || []), r]);
  const rank = (x: LbRow, y: LbRow) => (y.after ?? y.before ?? -1) - (x.after ?? x.before ?? -1) || (y.before ?? -1) - (x.before ?? -1);
  const models = [...byModel.entries()].map(([m, list]) => row(m, list)).sort(rank);
  const bySpace = new Map<string, any[]>(); for (const r of rows) bySpace.set(r.space_id, [...(bySpace.get(r.space_id) || []), r]);
  const boards: LbBoard[] = [...bySpace.entries()].filter(([, list]) => new Set(list.map(x => x.model)).size >= 2).map(([sid, list]) => {
    const s: any = spc.get(sid) || {}; const p = s.profile || {}, jd = s.jd_snapshot || {};
    return { space_id: sid, role: p.role || jd.title || s.title || '课程', company: jd.company || '', rows: list.map(x => row(x.model, [x])).sort(rank) };
  }).sort((a, b) => b.rows.length - a.rows.length);
  const updated = rows.reduce((m, r) => (String(r.updated_at) > m ? String(r.updated_at) : m), '');
  return { updated, models, boards, totals: { models: models.length, courses: bySpace.size, exams: rows.reduce((n, r) => n + (r.entrance_score != null ? 1 : 0) + (r.final_score != null ? 1 : 0), 0) } };
}
