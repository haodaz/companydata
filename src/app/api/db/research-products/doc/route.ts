import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 产品资料：GET ?id= 跳到存储桶里的文件（10 分钟签名链接）；没存下来的跳官网原链接。?text=1 返回抽出来的全文 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const { data: d } = await supabaseAdmin.from('research_product_docs').select('url, storage_path, text_content, title').eq('id', u.get('id') || '0').single();
  if (!d) return NextResponse.json({ success: false, error: '没有这份资料' }, { status: 404 });
  if (u.get('text') === '1') return NextResponse.json({ success: true, title: d.title, text: d.text_content || '' });
  if (d.storage_path) {
    const { data } = await supabaseAdmin.storage.from('research-docs').createSignedUrl(d.storage_path, 600);
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl);
  }
  return NextResponse.redirect(d.url);
}
