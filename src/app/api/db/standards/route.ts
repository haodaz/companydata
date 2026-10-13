import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/supabase-all';
import { supabaseAdmin } from '@/lib/supabase';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 行业标准与操作规程库：列表 + 顶部统计（迁移 022） */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '', kind = searchParams.get('kind') || '', docType = searchParams.get('docType') || '';
    const status = searchParams.get('status') || '', review = searchParams.get('review') || '', profession = searchParams.get('profession') || '';
    let q = supabaseAdmin.from('industry_standards').select('*', { count: 'exact' });
    if (search) q = q.or(orIlike(['code', 'title', 'issuer', 'industry', 'scope'], search));
    if (kind) q = q.eq('kind', kind);
    if (docType) q = q.eq('doc_type', docType);
    if (status) q = q.eq('status', status);
    if (profession) q = q.contains('professions', [profession]);
    if (review) q = q.eq('human_review_status', review);
    const { data, count, error } = await q.order('updated_at', { ascending: false }).range(from, to);
    if (error) throw error;
    let stats: Record<string, number> | undefined; let professions: [string, number][] | undefined;
    if (searchParams.get('withStats') === '1') {
      const { data: all } = await selectAll(() => supabaseAdmin.from('industry_standards').select('kind, status, professions, key_points, human_review_status').order('id'));
      stats = { total: 0, current: 0, withPoints: 0, points: 0, reviewed: 0, national_mandatory: 0, national: 0, industry: 0, international: 0 };
      const pm = new Map<string, number>();
      for (const r of all || []) {
        stats.total++; if (r.status === 'current') stats.current++;
        const n = Array.isArray(r.key_points) ? r.key_points.length : 0; stats.points += n; if (n) stats.withPoints++;
        if (r.human_review_status === 'complete') stats.reviewed++;
        if (r.kind in stats) stats[r.kind]++;
        for (const p of r.professions || []) pm.set(p, (pm.get(p) || 0) + 1);
      }
      professions = [...pm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
    }
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize, stats, professions });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 批量审核：{ ids, human_review_status } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('industry_standards').update({ human_review_status, human_review_at: now, updated_at: now }).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
