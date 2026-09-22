import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exportAll = searchParams.get('exportAll') === 'true';
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const get = (k: string) => searchParams.get(k) || '';

    let query = supabaseAdmin
      .from('jobs')
      .select('*, company_ref:companies(id, name, name_en, segment, industry)', { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (search) query = query.or(orIlike(['name', 'title_cn', 'institute_or_company_name', 'program_name', 'location', 'department'], search));
    if (get('jobType')) query = query.in('job_type', get('jobType').split(','));
    if (get('season')) query = query.eq('recruit_season', get('season'));
    if (get('remote')) query = query.eq('remote_type', get('remote'));
    if (get('status')) query = query.eq('status', get('status'));
    if (get('overseas') === '1') query = query.eq('accepts_overseas_students', true);
    if (get('companyId')) query = query.eq('company_id', parseInt(get('companyId')));
    if (get('review') === 'none') query = query.is('human_review_status', null);
    else if (get('review')) query = query.eq('human_review_status', get('review'));

    const { data, count, error } = exportAll ? await query.limit(20000) : await query.range(from, to);
    if (error) throw error;

    let stats: Record<string, number> | undefined;
    if (searchParams.get('withStats') === '1') {
      stats = { total: 0, open: 0, graduate: 0, intern: 0, program: 0, remote: 0, overseas: 0, reviewed: 0 };
      const { data: all } = await supabaseAdmin.from('jobs').select('job_type, status, remote_type, accepts_overseas_students, human_review_status').limit(100000);
      for (const r of all || []) {
        stats.total++;
        if (r.status === 'open') stats.open++;
        if (r.job_type && r.job_type in stats) stats[r.job_type]++;
        if (r.remote_type === 'remote') stats.remote++;
        if (r.accepts_overseas_students) stats.overseas++;
        if (r.human_review_status === 'complete') stats.reviewed++;
      }
    }

    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize, stats });
  } catch (error: any) {
    console.error('[Jobs] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 批量审核 / 批量改状态：{ ids: [], human_review_status?, status? } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status, status } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };
    if (human_review_status !== undefined) { updates.human_review_status = human_review_status; updates.human_review_at = now; }
    if (status !== undefined) updates.status = status;
    const { error } = await supabaseAdmin.from('jobs').update(updates).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(s => parseInt(s)).filter(Number.isFinite);
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const { error } = await supabaseAdmin.from('jobs').delete().in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
