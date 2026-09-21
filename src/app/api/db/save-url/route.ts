import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';
import { normalizeUrlType } from '@/lib/url-types';

export const runtime = 'nodejs';

/** 根路径的主页（https://www.xxx.com/）才回填为企业官网 */
function isRootHomepage(url: string) {
  try { const u = new URL(url); return u.pathname === '/' || u.pathname === ''; } catch { return false; }
}

/**
 * URL 获取工具落库：写入信息源库，并把企业沉淀进企业库（找不到就建档）。
 * 顺带回填企业的入口字段（只填空）：官网 / 校招官网 / 招聘总入口。
 */
export async function POST(req: Request) {
  try {
    const { company, unit, title, targetUrl, type, subtype, reasoning, companyId } = await req.json();
    if (!company || !targetUrl) return NextResponse.json({ error: 'Missing company or targetUrl' }, { status: 400 });

    const company_id: number | null = companyId ?? await resolveOrCreateCompany(company);
    const normType = normalizeUrlType(type);

    const { data, error } = await supabaseAdmin
      .from('url_sources')
      .upsert([{
        company, company_id,
        unit: unit || null,
        title: title || null,
        url: targetUrl,
        type: normType || 'unknown',
        subtype: subtype || null,
        reasoning: reasoning || null,
      }], { onConflict: 'company,url' })
      .select()
      .single();

    if (error) {
      console.error('[SaveUrl] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (company_id && !unit) {
      const fill = async (field: string) => supabaseAdmin.from('companies').update({ [field]: targetUrl }).eq('id', company_id).is(field, null);
      if (normType === 'homepage' && (subtype === 'group' || !subtype) && isRootHomepage(targetUrl)) await fill('website');
      if (normType === 'campus' && (subtype === 'portal' || subtype === 'list')) await fill('campus_url');
      if (normType === 'careers' && subtype === 'portal') await fill('careers_url');
    }

    return NextResponse.json({ success: true, id: data?.id, company_id });
  } catch (error: any) {
    console.error('Save URL API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
