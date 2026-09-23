import { NextResponse } from 'next/server';
import { searchCompanyTopic } from '@/lib/agents/company-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 工序 4：按主题联网检索（basic / financing / news / team / industry / campus） */
export async function POST(req: Request) {
  try {
    const { topic, company, missing, model, batchId } = await req.json();
    if (!topic || !company?.name) return NextResponse.json({ success: false, error: 'Missing topic or company' }, { status: 400 });
    const result = await searchCompanyTopic(topic, company, Array.isArray(missing) ? missing : [], model || 'gemini-3.8-flash', batchId || Date.now());
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[CompanySearch]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
