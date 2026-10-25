import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { extractText } from '@/lib/work/samples';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX = 20 * 1024 * 1024;
const BUCKET = 'lab-media';

/**
 * 题目附件（2026-10-24，王刚：有的题要读表格、读图片）——这是**给候选人的材料**，和「参考资料」（给 AI 照着出题的样本）是两回事。
 * multipart { file }，登录即可。存到 lab-media/work-attach/<用户>/…；PDF / Word / 文本顺手抽成文字（出题和评卷能读），图片只存链接（候选人能看，出题 AI 看不了图）。
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: '没有文件' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: '文件别超过 20MB' }, { status: 413 });
  const safe = (file.name || 'file').replace(/[^\w.\-一-龥]+/g, '_').slice(0, 80);
  const who = user.email.replace(/[^\w]+/g, '_').slice(0, 40);
  // 存储 key 只用 ASCII（Supabase 不收中文 key）；显示名保留原文件名
  const ext = (safe.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0].toLowerCase();
  const path = `work-attach/${who}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type && file.type !== 'application/octet-stream' ? file.type : ({ '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>)[ext] || 'application/octet-stream';
  const { error } = await db.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  let text = '';
  if (/\.xlsx?$/i.test(safe) || /spreadsheetml|ms-excel/.test(mime)) {
    // Excel：每个 sheet 抽成 CSV 文字（候选人端按表格渲染；出题 / 评卷能读）
    try { const XLSX = await import('xlsx'); const wb = XLSX.read(buf, { type: 'buffer' }); text = wb.SheetNames.slice(0, 5).map(n => `## ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n').slice(0, 20000); } catch {}
  } else if (/pdf|word|officedocument|text\/|csv/.test(mime) || /\.(pdf|docx|txt|md|csv)$/i.test(safe)) { try { text = (await extractText(buf, safe)).slice(0, 20000); } catch {} }
  return NextResponse.json({ ok: true, url, name: safe, mime, size: file.size, text, image: /^image\//.test(mime) });
}
