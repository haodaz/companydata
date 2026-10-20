import { NextRequest, NextResponse } from 'next/server';
import { wsCtx, fail } from '../../../_ctx';
import { addCandidate } from '@/lib/ws/projects';

export const runtime = 'nodejs';
export const maxDuration = 120;
/** 加候选人：multipart（file = PDF / txt，或 text）或 JSON { text, name?, contact? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  const { id } = await params;
  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const fd = await req.formData(); const f = fd.get('file') as File | null; const text = String(fd.get('text') || '');
      if (f && f.size) {
        if (f.size > 12 * 1024 * 1024) throw new Error('文件太大（12MB 以内）');
        const buf = Buffer.from(await f.arrayBuffer());
        const cand = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? await addCandidate(c.org, c.user.email, id, { pdfBase64: buf.toString('base64') }) : await addCandidate(c.org, c.user.email, id, { text: buf.toString('utf8') });
        return NextResponse.json({ ok: true, candidate: cand });
      }
      if (text.trim().length < 20) throw new Error('简历内容太短');
      return NextResponse.json({ ok: true, candidate: await addCandidate(c.org, c.user.email, id, { text }) });
    }
    const b = await req.json();
    if (String(b.text || '').trim().length < 20) throw new Error('简历内容太短');
    return NextResponse.json({ ok: true, candidate: await addCandidate(c.org, c.user.email, id, { text: b.text, name: b.name, contact: b.contact }) });
  } catch (e) { return fail(e); }
}
