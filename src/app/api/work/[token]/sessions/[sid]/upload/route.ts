import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX = 200 * 1024 * 1024;   // 录屏可能大
const BUCKET = 'lab-media';

/**
 * 开放模式上传（用自己的软件做）：multipart { file, kind: 'recording' | 'file', t }
 * 存到 lab-media/work/<sid>/…，并记一条事件（recording / file）。不用登录（链接即身份）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '链接不可用' }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('id, events, submitted_at, started_at').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = String(form.get('kind') || 'file') === 'recording' ? 'recording' : 'file';
  if (!file) return NextResponse.json({ ok: false, error: '没有文件' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: '文件太大（上限 200MB）' }, { status: 413 });
  const safe = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
  const path = `work/${sid}/${Date.now()}-${kind === 'recording' ? 'recording.webm' : safe}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: file.type || (kind === 'recording' ? 'video/webm' : 'application/octet-stream'), upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const tsec = Number(form.get('t')) || Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const ev = { t: tsec, type: kind, name: safe, size: file.size, url, ...(kind === 'recording' ? { duration: Number(form.get('duration')) || 0 } : {}) };
  await db.from('work_sessions').update({ events: [...(s.events || []), ev].slice(-3000) }).eq('id', sid);
  return NextResponse.json({ ok: true, url, name: safe, size: file.size });
}
