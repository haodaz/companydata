import { NextResponse } from 'next/server';
import { findCompanyList } from '@/lib/agents/finder-pipeline';
import { resolveCompanyId } from '@/lib/company-match';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** AI 建名单：按描述列出目标企业，并标出哪些已在企业库里 */
export async function POST(req: Request) {
  try {
    const { query, count, model } = await req.json();
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    const result = await findCompanyList(query, count || 30, model || undefined);
    const companies = await Promise.all(result.companies.map(async c => ({
      ...c,
      existing_id: (await resolveCompanyId(c.name)) ?? (c.name_en ? await resolveCompanyId(c.name_en) : null),
    })));
    return NextResponse.json({ search_queries: result.search_queries, companies });
  } catch (e: any) {
    console.error('[Finder/company-list]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
