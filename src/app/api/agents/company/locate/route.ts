import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { locateCompanyPages } from '@/lib/agents/company-pipeline';
import { subEntityCounts } from '@/lib/company-store';
import { hasValue } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 工序 0/1：读企业当前档案 + 联网定位官方页面。
 * 顺带把官网 / 关于 / IR / 新闻 / 团队 / 文化页写进信息源库，并回填官网（只填空）。
 * 返回 company（含子实体计数）供后续「只跑缺的」判断。
 */
export async function POST(req: Request) {
  try {
    const { companyId, model, batchId } = await req.json();
    if (!companyId) return NextResponse.json({ success: false, error: 'Missing companyId' }, { status: 400 });
    const { data: company, error } = await supabaseAdmin.from('companies').select('*').eq('id', companyId).single();
    if (error || !company) return NextResponse.json({ success: false, error: '企业不存在' }, { status: 404 });

    const located = await locateCompanyPages(company, model || 'gemini-3.8-flash', batchId || Date.now());

    // 信息源库沉淀（type: homepage / about + subtype）
    const rows = located.pages.map(p => ({
      company: company.name, company_id: company.id, url: p.url, title: p.title,
      type: p.subtype === 'homepage' ? 'homepage' : 'about',
      subtype: p.subtype === 'homepage' ? 'group' : p.subtype,
      reasoning: '企业画像流水线定位的官方页面',
    }));
    if (rows.length) await supabaseAdmin.from('url_sources').upsert(rows, { onConflict: 'company,url', ignoreDuplicates: true });

    // 只填空：官网 / 英文名 / 简称
    const fill: Record<string, any> = {};
    if (located.official_website && !hasValue(company.official_website)) fill.official_website = located.official_website;
    if (located.name_en && !hasValue(company.name_en)) fill.name_en = located.name_en;
    if (located.brief_name && !hasValue(company.brief_name)) fill.brief_name = located.brief_name;
    const locked = new Set<string>(company.human_locked_fields || []);
    for (const k of Object.keys(fill)) if (locked.has(k)) delete fill[k];
    if (Object.keys(fill).length) await supabaseAdmin.from('companies').update(fill).eq('id', company.id);

    const counts = await subEntityCounts(company.id);
    return NextResponse.json({ success: true, company: { ...company, ...fill }, counts, pages: located.pages, official_website: located.official_website, name_cn: located.name_cn, searchQueries: located.searchQueries, raw: located.raw });
  } catch (e: any) {
    console.error('[CompanyLocate]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
