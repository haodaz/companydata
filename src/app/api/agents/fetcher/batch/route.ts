import { NextResponse } from 'next/server';
import { fetchAndEvaluateBatch } from '@/lib/agents/fetcher';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { urls, model, batchId } = await req.json();
    if (!urls || !Array.isArray(urls)) return NextResponse.json({ error: 'Missing or invalid urls array' }, { status: 400 });
    const result = await fetchAndEvaluateBatch(urls, model || undefined, batchId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
