import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { getSessionUser, requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 职业问答日志（迁移 029）：「和我聊」里所有职业的提问放在一起，整体质检、排补全任务、把合格的转译进平方问答库。
 * GET 筛选：occupation / status / gap=1（只看平方答不上的）/ surface / search；带统计和职业分面
 */
export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const get = (k: string) => sp.get(k) || '';
    const { from, to, page, pageSize } = pageParams(sp, 50);
    let q = supabaseAdmin.from('kg_questions').select('*, occupation:occupations(id, name)', { count: 'exact' });
    if (get('occupation')) q = q.eq('occupation_id', Number(get('occupation')));
    if (get('status')) q = q.eq('status', get('status'));
    if (get('gap') === '1') q = q.not('gap', 'is', null);
    if (get('surface')) q = q.eq('surface', get('surface'));
    if (get('search')) q = q.or(orIlike(['question', 'reply', 'gap'], get('search')));
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    const { data: all } = await selectAll(() => supabaseAdmin.from('kg_questions').select('occupation_id, status, gap, occupation:occupations(name)').order('id'));
    const stats: Record<string, number> = { total: 0, new: 0, ok: 0, bad: 0, task: 0, ingested: 0, gaps: 0 };
    const occ = new Map<number, { id: number; name: string; total: number; gaps: number; pending: number }>();
    for (const r of all as any[]) {
      stats.total++; stats[r.status] = (stats[r.status] || 0) + 1; if (r.gap) stats.gaps++;
      if (!r.occupation_id) continue;
      const o = occ.get(r.occupation_id) || { id: r.occupation_id, name: r.occupation?.name || `#${r.occupation_id}`, total: 0, gaps: 0, pending: 0 };
      o.total++; if (r.gap) o.gaps++; if (r.status === 'new') o.pending++;
      occ.set(r.occupation_id, o);
    }
    const { count: faqs } = await supabaseAdmin.from('occupation_faqs').select('id', { count: 'exact', head: true }).eq('if_delete', false).eq('status', 'ok');
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize, stats: { ...stats, faqs: faqs || 0 }, occupations: Array.from(occ.values()).sort((a, b) => b.gaps - a.gaps || b.total - a.total) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/** 质检：{ ids, status: ok|bad|new, qc_note? } */
export async function PATCH(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { ids, status, qc_note } = await req.json();
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: '没选' }, { status: 400 });
  const user = await getSessionUser(req).catch(() => null);
  const patch: Record<string, any> = { reviewer: user?.email || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (qc_note !== undefined) patch.qc_note = qc_note;
  const { error } = await supabaseAdmin.from('kg_questions').update(patch).in('id', ids);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
