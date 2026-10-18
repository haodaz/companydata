import { NextRequest, NextResponse } from 'next/server';
import { companyJobs, searchCompanies, suggestRoles } from '@/lib/work/generator';

export const runtime = 'nodejs';

/** 出题时选企业 / 岗位（公开，只给名字和统计）：?q=宁德 搜企业；?company_id=10 列这家在招的岗位 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    if (q.get('role_q') != null) return NextResponse.json({ ok: true, ...(await suggestRoles(q.get('role_q') || '', q.get('company_id') ? Number(q.get('company_id')) : null)) });
    if (q.get('company_id')) return NextResponse.json({ ok: true, jobs: await companyJobs(Number(q.get('company_id'))) });
    return NextResponse.json({ ok: true, companies: await searchCompanies(q.get('q') || '') });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
