import { NextResponse } from 'next/server';
import { runStandardSearch } from '@/lib/standard-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 跑一条标准检索：{ id, model }（检索 → 补题录与要点 → 入库，全在服务端） */
export async function POST(request: Request) {
  try {
    const { id, model } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const r = await runStandardSearch(parseInt(id), model || undefined);
    return NextResponse.json(r);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
