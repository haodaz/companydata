import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { labMediaUrl } from '@/lib/media-url';
import { timing } from '@/lib/work/deadline';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX = 200 * 1024 * 1024;   // 录屏可能大
const BUCKET = 'lab-media';

/**
 * 开放模式上传（用自己的软件做）：multipart { file, kind: 'shot' | 'recording' | 'file', t }
 * shot（11-05）：整屏定时截图，存 lab-media/work/<sid>/shots/<秒数>.jpg，不写事件（每 10 秒一张，和作答页的过程同步抢着写 events 会丢）；交卷时按目录列出来。
 * 存到 lab-media/work/<sid>/…，并记一条事件（recording / file）。不用登录（链接即身份）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id, task').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '链接不可用' }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('id, events, submitted_at, started_at, participant').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  if (timing(t.task, s).closed) return NextResponse.json({ ok: false, error: '时间到了', expired: true }, { status: 409 });
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const k0 = String(form.get('kind') || 'file');
  if (k0 === 'shot') {
    if (!file || file.size > 3 * 1024 * 1024) return NextResponse.json({ ok: false, error: '截图不对' }, { status: 400 });
    const t = Math.max(0, Math.round(Number(form.get('t')) || (Date.now() - new Date(s.started_at).getTime()) / 1000));
    const { error } = await db.storage.from(BUCKET).upload(`work/${sid}/shots/${String(t).padStart(6, '0')}.jpg`, Buffer.from(await file.arrayBuffer()), { contentType: 'image/jpeg', upsert: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, t });
  }
  const kind = k0 === 'recording' ? 'recording' : 'file';
  if (!file) return NextResponse.json({ ok: false, error: '没有文件' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: '文件太大（上限 200MB）' }, { status: 413 });
  const safe = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
  // 存储路径只用 ASCII（中文文件名会报 Invalid key，11-05 自测发现）；显示仍用原名 safe
  const ext = (safe.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
  const path = `work/${sid}/${Date.now()}-${kind === 'recording' ? 'recording.webm' : Math.random().toString(36).slice(2, 8) + ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: file.type || (kind === 'recording' ? 'video/webm' : 'application/octet-stream'), upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const url = labMediaUrl(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  const tsec = Number(form.get('t')) || Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const part = String(form.get('part') || '').slice(0, 20);   // 工作台：这是哪份交付物的附件（11-05）
  const ev = { t: tsec, type: kind, name: safe, size: file.size, url, ...(part ? { part } : {}), ...(kind === 'recording' ? { duration: Number(form.get('duration')) || 0 } : {}) };
  await db.from('work_sessions').update({ events: [...(s.events || []), ev].slice(-3000) }).eq('id', sid);
  return NextResponse.json({ ok: true, url, name: safe, size: file.size });
}
