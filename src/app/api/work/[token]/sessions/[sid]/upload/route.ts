import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { labMediaUrl } from '@/lib/media-url';
import { timing } from '@/lib/work/deadline';
import { errL } from '@/lib/work/errors-en';
import { fileWarn } from '@/lib/work/file-kinds';

/** 传完马上试读一下（11-26 潜历：附件读不了，交了才知道）：格式不认的直接提示怎么转；PDF / Word / Excel / PPT 打不开、PPT 全是图的也提示。读得了返回 null */
async function quickCheck(path: string, name: string, size: number, lang?: string): Promise<string | null> {
  const w = fileWarn(name, lang); if (w) return w;
  if (!/\.(pdf|docx|xlsx?|pptx)$/i.test(name) || size > 30_000_000) return null;
  const en = lang === 'en';
  try {
    const { data } = await db.storage.from(BUCKET).download(path); if (!data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (/\.xlsx?$/i.test(name)) { const XLSX = await import('xlsx'); XLSX.read(buf, { type: 'buffer' }); return null; }
    if (/\.pptx$/i.test(name)) { const { pptxText } = await import('@/lib/work/recording'); const t = await pptxText(buf); return t.replace(/[#\s]|第 \d+ 页|（这页没有文字，可能是图）/g, '').length > 20 ? null : en ? 'No text found in this PowerPoint (probably all images): export it to PDF and upload that too' : 'PPT 里没读出文字（可能全是图）：再导出一份 PDF 一起传更稳'; }
    const { extractText } = await import('@/lib/work/samples'); await extractText(buf, name); return null;   // PDF 抽不出字没关系，评估时 AI 会看原件
  } catch { return en ? "This file couldn't be opened (damaged or password-protected?): export it again and re-upload" : '这个文件打不开（可能损坏或加了密码）：重新导出一份再传'; }
}

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
  if (!t) return NextResponse.json({ ok: false, error: errL(t, '链接不可用') }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('id, events, submitted_at, started_at, participant').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: errL(t, '没有这次作答') }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: errL(t, '已经提交了') }, { status: 409 });
  if (timing(t.task, s).closed) return NextResponse.json({ ok: false, error: errL(t, '时间到了'), expired: true }, { status: 409 });
  // 交付文件直传（11-10）：sign 发签名地址 → 浏览器直传存储 → done 登记事件；remove 记一条 file_remove（交卷时不算）。见 lib/work/upload-client.ts
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    const b = await req.json().catch(() => ({}));
    const tsec = Number(b.t) || Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
    const safe = String(b.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
    if (b.step === 'sign') {
      if (Number(b.size) > MAX) return NextResponse.json({ ok: false, error: errL(t, '文件太大（上限 200MB）') }, { status: 413 });
      const ext = (safe.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
      const path = `work/${sid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return NextResponse.json({ ok: false, error: error?.message || '没拿到上传地址' }, { status: 500 });
      return NextResponse.json({ ok: true, signed_url: data.signedUrl, path });
    }
    if (b.step === 'done') {
      const path = String(b.path || '');
      if (!path.startsWith(`work/${sid}/`) || path.includes('..')) return NextResponse.json({ ok: false, error: errL(t, '路径不对') }, { status: 400 });
      const dir = path.slice(0, path.lastIndexOf('/')), base = path.slice(path.lastIndexOf('/') + 1);
      const { data: found } = await db.storage.from(BUCKET).list(dir, { search: base, limit: 5 });
      const obj = (found || []).find(o => o.name === base);
      if (!obj) return NextResponse.json({ ok: false, error: errL(t, '存储里没找到这个文件，再传一次') }, { status: 400 });
      const size = Number(obj.metadata?.size) || Number(b.size) || 0;
      const url = labMediaUrl(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      const part = String(b.part || '').slice(0, 20);
      if ((s.events || []).some((e: any) => e.type === 'file' && e.url === url)) return NextResponse.json({ ok: true, url, name: safe, size });   // 前端重试登记（11-19）：登记过的不再记一遍
      const ev = { t: tsec, type: 'file', name: safe, size, url, ...(part ? { part } : {}) };
      await db.from('work_sessions').update({ events: [...(s.events || []), ev].slice(-3000) }).eq('id', sid);
      const warn = await quickCheck(path, String(b.name || safe), size, t.task?.lang).catch(() => null);
      return NextResponse.json({ ok: true, url, name: safe, size, ...(warn ? { warn } : {}) });
    }
    if (b.step === 'remove') {
      const url = String(b.url || '');
      const f = (s.events || []).find((e: any) => e.type === 'file' && e.url === url);
      if (!f) return NextResponse.json({ ok: false, error: errL(t, '没有这个文件') }, { status: 404 });
      await db.from('work_sessions').update({ events: [...(s.events || []), { t: tsec, type: 'file_remove', url, name: f.name }].slice(-3000) }).eq('id', sid);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: errL(t, '不认识的操作') }, { status: 400 });
  }
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
  if (!file) return NextResponse.json({ ok: false, error: errL(t, '没有文件') }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: errL(t, '文件太大（上限 200MB）') }, { status: 413 });
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
