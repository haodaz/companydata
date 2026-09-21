import { NextResponse } from 'next/server';
import { structureJobData } from '@/lib/agents/structurer-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { markdown, company, hint, model, batchId, scope } = await req.json();
    if (!markdown) return NextResponse.json({ error: 'Missing markdown data' }, { status: 400 });
    const result = await structureJobData(markdown, company || '', hint || '', model || undefined, batchId, scope === 'all' ? 'all' : 'campus');
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
