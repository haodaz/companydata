import { NextResponse } from 'next/server';
import { enrichCompetition, type Candidate } from '@/lib/agents/competition-radar';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 赛事雷达 · 步骤 2：抓官方页面原文并提取完整字段（抓不到就联网补） */
export async function POST(req: Request) {
  try {
    const { candidate, model, batchId } = await req.json();
    if (!candidate?.name) return NextResponse.json({ success: false, error: 'Missing candidate' }, { status: 400 });
    const result = await enrichCompetition(candidate as Candidate, model || 'gemini-3.8-flash', batchId || Date.now());
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[CompetitionDetail]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
