import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { orgByLabToken } from '@/lib/college-private';
import { extractText } from '@/lib/work/samples';
import { labMediaUrl } from '@/lib/media-url';
export const runtime = 'nodejs'; export const maxDuration = 120;

const MAX = 20 * 1024 * 1024, BUCKET = 'lab-media';
/** 实验室入口上传文件：存 lab-media/college-private/<机构>/…，PDF / Word / 文本 / Excel 抽成文字交回，由实验室确认后作为材料存 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const org = await orgByLabToken((await params).token);
  if (!org) return NextResponse.json({ ok: false, error: '实验室链接不对或已失效' }, { status: 404 });
  const file = (await req.formData()).get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: '没有文件' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: '文件别超过 20MB' }, { status: 413 });
  const name = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
  const ext = (name.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0].toLowerCase();
  if (!/^\.(pdf|docx|txt|md|csv|xlsx|xls)$/.test(ext)) return NextResponse.json({ ok: false, error: '支持 PDF / Word（docx）/ TXT / Markdown / CSV / Excel' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `college-private/${org.id.slice(0, 8)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let text = '';
  try {
    if (/\.xlsx?$/.test(ext)) { const XLSX = await import('xlsx'); const wb = XLSX.read(buf, { type: 'buffer' }); text = wb.SheetNames.slice(0, 6).map(n => `## ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n'); }
    else text = await extractText(buf, name);
  } catch (e) { console.warn('[lab-upload] 抽文字失败', String((e as any)?.message).slice(0, 100)); }
  return NextResponse.json({ ok: true, url: labMediaUrl(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl), name, text: text.slice(0, 60000) });
}
