import { NextResponse } from 'next/server';
import { generateFinderReport } from '@/lib/agents/finder-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { company, unit, searchType, urls, model } = await req.json();
    if (!company) return NextResponse.json({ error: 'Missing company' }, { status: 400 });
    const result = await generateFinderReport(company, unit || '', searchType === 'homepage' ? 'homepage' : 'campus', urls || [], model || undefined);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[Finder/report]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
