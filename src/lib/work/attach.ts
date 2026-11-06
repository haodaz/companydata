/**
 * 真活题目素材上传（2026-10-24 起；11-05 抽成公共函数）：出任务时（登录）和任务空间补传（凭管理链接）共用。
 * 存 lab-media/work-attach/<who>/…（key 只用 ASCII）；Excel 抽 CSV，PDF / Word / 文本抽文字，图片看图写说明。
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { extractText } from '@/lib/work/samples';
import { labMediaUrl } from '@/lib/media-url';

const MAX = 20 * 1024 * 1024;
const BUCKET = 'lab-media';

export async function handleAttach(req: NextRequest, whoRaw: string) {
  const who = whoRaw.replace(/[^\w]+/g, '_').slice(0, 40);
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: '没有文件' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: '文件别超过 20MB' }, { status: 413 });
  const safe = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
  // 存储 key 只用 ASCII（Supabase 不收中文 key）；显示名保留原文件名
  const ext = (safe.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0].toLowerCase();
  const path = `work-attach/${who}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type && file.type !== 'application/octet-stream' ? file.type : ({ '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>)[ext] || 'application/octet-stream';
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const url = labMediaUrl(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  let text = '';
  if (/\.xlsx?$/i.test(safe) || /spreadsheetml|ms-excel/.test(mime)) {
    // Excel：每个 sheet 抽成 CSV 文字（候选人端按表格渲染；出题 / 评卷能读）
    try { const XLSX = await import('xlsx'); const wb = XLSX.read(buf, { type: 'buffer' }); text = wb.SheetNames.slice(0, 5).map(n => `## ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n').slice(0, 20000); } catch {}
  } else if (/pdf|word|officedocument|text\/|csv/.test(mime) || /\.(pdf|docx|txt|md|csv)$/i.test(safe)) { try { text = (await extractText(buf, safe)).slice(0, 20000); } catch {} }
  const image = /^image\//.test(mime);
  if (image && !text) { try { const { describeImage } = await import('@/lib/work/vision'); text = await describeImage(buf, mime, safe); } catch (e) { console.warn('[attach] 看图失败', String((e as any)?.message).slice(0, 100)); } }
  return NextResponse.json({ ok: true, url, name: safe, mime, size: file.size, text, image });
}
