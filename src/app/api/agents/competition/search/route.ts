import { NextResponse } from 'next/server';
import { searchCompetitions } from '@/lib/agents/competition-radar';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 赛事雷达 · 步骤 1：联网检索候选赛事 */
export async function POST(req: Request) {
  try {
    const { query, company, kinds, region, rewards, onlyOpen, count, model, batchId } = await req.json();
    if (!String(query || '').trim() && !String(company || '').trim()) return NextResponse.json({ success: false, error: '请输入检索主题或主办企业' }, { status: 400 });
    const result = await searchCompetitions({ query: String(query || '').trim(), company: String(company || '').trim() || null, kinds, region, rewards, onlyOpen, count }, model || 'gemini-3.8-flash', batchId || Date.now());
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[CompetitionSearch]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
