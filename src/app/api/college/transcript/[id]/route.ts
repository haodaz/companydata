import { NextRequest, NextResponse } from 'next/server';
import { buildTranscript } from '@/lib/college-transcript';

export const runtime = 'nodejs';

/** 学员成绩单（公开、只读）：只出平台自己的模型 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const t = await buildTranscript(id); return t ? NextResponse.json({ ok: true, ...t }) : NextResponse.json({ ok: false, error: '没有这位学员的公开成绩单' }, { status: 404 }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
