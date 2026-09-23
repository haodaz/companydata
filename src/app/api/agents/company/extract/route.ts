import { NextResponse } from 'next/server';
import { extractFromPages } from '@/lib/agents/company-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 工序 3：从官方页面原文提取画像字段 + 管理团队 + 动态（不联网） */
export async function POST(req: Request) {
  try {
    const { company, markdown, model, batchId } = await req.json();
    if (!company?.name || !markdown) return NextResponse.json({ success: false, error: 'Missing company or markdown' }, { status: 400 });
    const result = await extractFromPages(company, markdown, model || 'gemini-3.8-flash', batchId || Date.now());
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[CompanyExtract]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
