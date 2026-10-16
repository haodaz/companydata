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
    // 网址的主域名（talent.baidu.com → baidu.com）：企业的官网 / 校招官网 / 信息源里出现过的都算候选
    const parts = host.split('.'); const two = parts.length >= 3 && /^(com|net|org|gov|edu|co)$/.test(parts[parts.length - 2]);
    const base = parts.slice(two ? -3 : -2).join('.');
    const like = `%${base}%`;
    const [{ data: a }, { data: s }] = await Promise.all([
      supabaseAdmin.from('companies').select('id').or(`official_website.ilike.${like},campus_url.ilike.${like},careers_url.ilike.${like}`).not('if_delete', 'is', true).limit(20),
      supabaseAdmin.from('url_sources').select('company_id').ilike('url', like).not('company_id', 'is', null).limit(200),
    ]);
    const ids = [...new Set([...(a || []).map(d => d.id), ...(s || []).map(d => d.company_id)])].slice(0, 30);
    if (ids.length) rows = (await supabaseAdmin.from('companies').select('id, name, brief_name, official_website, campus_url').in('id', ids).not('if_delete', 'is', true)).data || [];
  }
  // 带上已有岗位数，岗位多的排前面（同一个招聘站常对应名单里好几家：百度公司 / 百度（中国）/ 网讯 / Apollo）
  const { data: cnt } = rows.length ? await supabaseAdmin.from('company_relation_counts').select('company_id, jobs_total').in('company_id', rows.map(r => r.id)) : { data: [] as any[] };
  const jobs = new Map((cnt || []).map((c: any) => [c.company_id, c.jobs_total || 0]));
  rows.sort((x, y) => (jobs.get(y.id) || 0) - (jobs.get(x.id) || 0));
  return NextResponse.json({ ok: true, data: rows.slice(0, 8).map(c => ({ id: c.id, name: c.name, brief: c.brief_name, entry: c.campus_url || c.official_website, jobs: jobs.get(c.id) || 0 })) });
}
