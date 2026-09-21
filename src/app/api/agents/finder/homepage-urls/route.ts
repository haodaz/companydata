import { NextResponse } from 'next/server';
import { findHomepageUrls } from '@/lib/agents/finder-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { company, unit, model } = await req.json();
    if (!company) return NextResponse.json({ error: 'Missing company' }, { status: 400 });
    const result = await findHomepageUrls(company, unit || '', model || undefined);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[Finder/homepage-urls]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
