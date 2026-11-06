import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { extractText } from '@/lib/work/samples';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 百业工厂 · 新建空间的参考资料：{ filename, file（base64）} → 抽出文字（PDF / Word / TXT / MD），给「生成要求」用；不落库 */
export async function POST(req: Request) {
  const me = await getSessionUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const b = await req.json();
    const buf = Buffer.from(String(b.file || ''), 'base64');
    if (!buf.length) return NextResponse.json({ ok: false, error: '没收到文件' }, { status: 400 });
    if (buf.length > 12 * 1024 * 1024) return NextResponse.json({ ok: false, error: '文件别超过 12 MB' }, { status: 400 });
    const text = (await extractText(buf, String(b.filename || 'file.txt'))).replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 20) return NextResponse.json({ ok: false, error: '这个文件里抽不出文字（扫描件请把文字粘贴进来）' }, { status: 422 });
    return NextResponse.json({ ok: true, name: String(b.filename || '参考资料'), text: text.slice(0, 12000), truncated: text.length > 12000 });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
