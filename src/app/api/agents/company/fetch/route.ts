import { NextResponse } from 'next/server';
import { fetchCompanyPages, joinPagesMarkdown, type LocatedPage } from '@/lib/agents/company-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 工序 2：抓取官方页面（Jina），整页原文返回，供 raw 层保存 */
export async function POST(req: Request) {
  try {
    const { pages } = await req.json();
    const list: LocatedPage[] = Array.isArray(pages) ? pages.filter((p: any) => p?.url && p?.subtype).slice(0, 8) : [];
    if (!list.length) return NextResponse.json({ success: true, pages: [], markdown: '' });
    const fetched = await fetchCompanyPages(list);
    return NextResponse.json({
      success: true,
      pages: fetched.map(({ markdown, ...rest }) => rest),
      markdown: joinPagesMarkdown(fetched),
    });
  } catch (e: any) {
    console.error('[CompanyFetch]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
