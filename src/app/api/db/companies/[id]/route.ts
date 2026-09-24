import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { COMPANY_EDITABLE_KEYS } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 企业详情 + 关联实体（信息源 / 岗位 / URL 日志） */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { data: company, error } = await supabaseAdmin.from('companies').select('*').eq('id', id).single();
    if (error) throw error;

    const [urls, jobs, journals, financings, news, executives, profileLogs, products] = await Promise.all([
      supabaseAdmin.from('url_sources').select('*').eq('company_id', id).order('type').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('jobs')
        .select('id, name, title_cn, job_type, program_name, recruit_season, location, remote_type, graduation_year, accepts_overseas_students, application_end_date_str, status, human_review_status, completeness_score, link, updated_at')
        .eq('company_id', id).order('updated_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('url_journal').select('id, search_type, unit, ai_overview, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('company_financings').select('*').eq('company_id', id).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(200),
      supabaseAdmin.from('company_news').select('*').eq('company_id', id).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(300),
      supabaseAdmin.from('company_executives').select('*').eq('company_id', id).eq('if_delete', false).order('id', { ascending: true }).limit(200),
      supabaseAdmin.from('company_crawl_logs').select('id, task_id, status, fields_filled, financings_saved, news_saved, executives_saved, products_saved, completeness_before, completeness_after, llm_calls, token_total, cost_usd, model_id, error_message, created_at, finished_at, ai_summary:structured_json->>ai_summary').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('company_products').select('*').eq('company_id', id).eq('if_delete', false).order('is_flagship', { ascending: false }).order('id', { ascending: true }).limit(100),
    ]);

    return NextResponse.json({
      success: true, company, urls: urls.data || [], jobs: jobs.data || [], journals: journals.data || [],
      financings: financings.data || [], news: news.data || [], executives: executives.data || [], profileLogs: profileLogs.data || [], products: products.data || [],
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const body = await req.json();
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };
    const { data: current } = await supabaseAdmin.from('companies').select('*').eq('id', id).single();
    const locked = new Set<string>(current?.human_locked_fields || []);
    for (const k of COMPANY_EDITABLE_KEYS) {
      if (body[k] === undefined) continue;
      const v = body[k] === '' ? null : body[k];
      updates[k] = v;
      // 人工改过的字段锁定，AI 补全不再覆盖
      if (current && JSON.stringify(v ?? null) !== JSON.stringify(current[k] ?? null)) locked.add(k);
    }
    for (const k of body.unlock || []) locked.delete(k);
    updates.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { updates.human_review_status = body.human_review_status; updates.human_review_at = now; }
    if (body.human_review_note !== undefined) updates.human_review_note = body.human_review_note;
    if (updates.name === null) return NextResponse.json({ success: false, error: '企业名称不能为空' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('companies').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // 改名后同步冗余的企业名称
    if (updates.name) {
      await Promise.all([
        supabaseAdmin.from('url_sources').update({ company: updates.name }).eq('company_id', id),
        supabaseAdmin.from('jobs').update({ institute_or_company_name: updates.name }).eq('company_id', id),
      ]);
    }
    return NextResponse.json({ success: true, company: data });
  } catch (error: any) {
    const dup = /duplicate key/i.test(error.message || '');
    return NextResponse.json({ success: false, error: dup ? '已存在同名企业' : error.message }, { status: dup ? 409 : 500 });
  }
}

/** 删除企业：关联的信息源 / 岗位保留（company_id 置空） */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { error } = await supabaseAdmin.from('companies').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
