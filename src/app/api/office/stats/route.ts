import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { JOB_CORE_FIELDS, JOB_FIELD_MAP } from '@/lib/job-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 质检简报（纯统计，不耗 Token）。?companyIds=1,2 只看这些企业；不传看全库 */
export async function GET(req: Request) {
  try {
    const ids = (new URL(req.url).searchParams.get('companyIds') || '').split(',').map(s => parseInt(s)).filter(Number.isFinite);

    let q = supabaseAdmin.from('jobs').select(['id', 'institute_or_company_name', 'name', 'job_type', 'status', 'remote_type', 'completeness_score', 'human_review_status', ...JOB_CORE_FIELDS.filter(f => f !== 'title' && f !== 'job_type' && f !== 'remote_type')].join(',')).limit(20000);
    if (ids.length) q = q.in('company_id', ids);
    const { data, error } = await q;
    if (error) throw error;
    const jobs: any[] = data || [];

    const filled = (v: unknown) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    const missing: Record<string, number> = {};
    for (const j of jobs) for (const f of JOB_CORE_FIELDS) if (!filled(j[f])) missing[f] = (missing[f] || 0) + 1;

    const byCompany: Record<string, number> = {};
    for (const j of jobs) byCompany[j.institute_or_company_name || '未关联'] = (byCompany[j.institute_or_company_name || '未关联'] || 0) + 1;

    const count = (fn: (j: any) => boolean) => jobs.filter(fn).length;
    const [companies, urls] = await Promise.all([
      ids.length ? Promise.resolve({ count: ids.length }) : supabaseAdmin.from('companies').select('id', { count: 'exact', head: true }),
      ids.length ? supabaseAdmin.from('url_sources').select('id', { count: 'exact', head: true }).in('company_id', ids) : supabaseAdmin.from('url_sources').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      ok: true,
      stats: {
        companies: companies.count || 0,
        urls: urls.count || 0,
        jobs: jobs.length,
        open: count(j => j.status === 'open'),
        closed: count(j => j.status === 'closed'),
        graduate: count(j => j.job_type === 'graduate'),
        intern: count(j => j.job_type === 'intern'),
        program: count(j => j.job_type === 'program'),
        remote: count(j => j.remote_type === 'remote'),
        overseas: count(j => j.accepts_overseas_students === true),
        unreviewed: count(j => !j.human_review_status),
        approved: count(j => j.human_review_status === 'complete'),
        avg_completeness: jobs.length ? Math.round(jobs.reduce((a, j) => a + (j.completeness_score || 0), 0) / jobs.length) : 0,
        low_completeness: count(j => (j.completeness_score || 0) < 40),
        missing_fields: Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, n]) => ({ key, label: JOB_FIELD_MAP[key]?.label || key, count: n })),
        by_company: Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([company, n]) => ({ company, count: n })),
        worst: [...jobs].sort((a, b) => (a.completeness_score || 0) - (b.completeness_score || 0)).slice(0, 5).map(j => ({ id: j.id, title: j.name, company: j.institute_or_company_name, score: j.completeness_score || 0 })),
      },
    });
  } catch (e: any) {
    console.error('[Office/stats]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
