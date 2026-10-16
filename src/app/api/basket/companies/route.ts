import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { readBasketToken } from '@/lib/basket';

/** 插件里选「这一篮采的是哪家企业」：按名称 / 简称 / 工商名搜；也可以按网址的域名找 */
export async function GET(req: Request) {
  const user = await readBasketToken(req);
  if (!user) return NextResponse.json({ ok: false, error: '篮子口令无效或已过期' }, { status: 401 });
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') || '').trim();
  const host = (u.searchParams.get('host') || '').replace(/^www\./, '');
  let rows: any[] = [];
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, '')}%`;
    const { data } = await supabaseAdmin.from('companies').select('id, name, brief_name, official_website, campus_url').or(`name.ilike.${like},brief_name.ilike.${like},registered_name.ilike.${like}`).not('if_delete', 'is', true).limit(12);
    rows = data || [];
  } else if (host) {
    const base = host.split('.').slice(-2).join('.');
    const { data } = await supabaseAdmin.from('url_sources').select('company_id').ilike('url', `%${base}%`).not('company_id', 'is', null).limit(20);
    const ids = [...new Set((data || []).map(d => d.company_id))].slice(0, 8);
    if (ids.length) rows = (await supabaseAdmin.from('companies').select('id, name, brief_name, official_website, campus_url').in('id', ids).not('if_delete', 'is', true)).data || [];
  }
  return NextResponse.json({ ok: true, data: rows.map(c => ({ id: c.id, name: c.name, brief: c.brief_name, entry: c.campus_url || c.official_website })) });
}
