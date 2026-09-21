import { NextResponse } from 'next/server';
import { fetchBaseAndLinks } from '@/lib/agents/fetcher';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { url, model, batchId, hint, scope } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    const result = await fetchBaseAndLinks(url, model || undefined, batchId, hint || '', scope === 'all' ? 'all' : 'campus');
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
