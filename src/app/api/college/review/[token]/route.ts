import { NextRequest, NextResponse } from 'next/server';
import { applyCorrections, examByToken, forMentor } from '@/lib/college-exams';
export const runtime = 'nodejs';

/** 导师校正（不用登录，凭链接里的密钥）：GET 题目 + 核对结果；POST { reviewer, edits, done } 保存修改（逐条留痕），done = 校正完成 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await examByToken((await params).token);
  if (!r) return NextResponse.json({ ok: false, error: '校正链接不对或已失效' }, { status: 404 });
  return NextResponse.json({ ok: true, data: forMentor(r) });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const b = await req.json().catch(() => ({}));
    const r = await applyCorrections((await params).token, b.reviewer || {}, Array.isArray(b.edits) ? b.edits : [], !!b.done);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 }); }
}
