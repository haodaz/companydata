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

    const [urls, jobs, journals] = await Promise.all([
      supabaseAdmin.from('url_sources').select('*').eq('company_id', id).order('type').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('jobs')
        .select('id, title, title_cn, job_type, program_name, recruit_season, location, remote_type, graduation_year, accepts_overseas_students, deadline, status, human_review_status, completeness_score, job_url, updated_at')
        .eq('company_id', id).order('updated_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('url_journal').select('id, search_type, unit, ai_overview, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
    ]);

    return NextResponse.json({ success: true, company, urls: urls.data || [], jobs: jobs.data || [], journals: journals.data || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const body = await req.json();
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of COMPANY_EDITABLE_KEYS) if (body[k] !== undefined) updates[k] = body[k] === '' ? null : body[k];
    if (updates.name === null) return NextResponse.json({ success: false, error: '企业名称不能为空' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('companies').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // 改名后同步冗余的企业名称
    if (updates.name) {
      await Promise.all([
        supabaseAdmin.from('url_sources').update({ company: updates.name }).eq('company_id', id),
        supabaseAdmin.from('jobs').update({ company: updates.name }).eq('company_id', id),
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
