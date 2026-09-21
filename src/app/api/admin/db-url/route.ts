import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const types = (searchParams.get('type') || '').split(',').filter(Boolean);
    const subtype = searchParams.get('subtype') || '';
    const health = searchParams.get('health') || '';
    const companyId = searchParams.get('companyId') || '';

    let query = supabaseAdmin
      .from('url_sources')
      .select('*, company_ref:companies(id, name, name_en, segment)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) query = query.or(orIlike(['company', 'title', 'unit', 'url'], search));
    if (types.length === 1) query = query.eq('type', types[0]);
    else if (types.length > 1) query = query.in('type', types);
    if (subtype) query = query.eq('subtype', subtype);
    if (health) query = query.eq('health_status', health);
    if (companyId) query = query.eq('company_id', parseInt(companyId));

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    // 各类型数量（不受 type 筛选影响，用于页面顶部统计）
    const stats: Record<string, number> = {};
    if (searchParams.get('withStats') === '1') {
      const { data: all } = await supabaseAdmin.from('url_sources').select('type').limit(50000);
      for (const r of all || []) stats[r.type || 'unknown'] = (stats[r.type || 'unknown'] || 0) + 1;
    }

    return NextResponse.json({ ok: true, data: data || [], total: count || 0, page, pageSize, stats });
  } catch (error: any) {
    console.error('[DbUrl] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

const EDITABLE = ['url', 'company', 'unit', 'title', 'type', 'subtype', 'reasoning', 'company_id', 'verification_status'];

/** 新增一条 URL */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.url || !body.company) return NextResponse.json({ ok: false, error: '请填写企业和 URL' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('url_sources')
      .insert({
        url: String(body.url).trim(), company: String(body.company).trim(),
        unit: body.unit || null, title: body.title || null, type: body.type || 'unknown',
        subtype: body.subtype || null, reasoning: body.reasoning || null,
        company_id: body.company_id ?? await resolveOrCreateCompany(body.company),
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    const dup = /duplicate key/i.test(error.message || '');
    return NextResponse.json({ ok: false, error: dup ? '该企业下已存在这个 URL' : error.message }, { status: dup ? 409 : 500 });
  }
}

/** 编辑一条 URL */
export async function PATCH(request: Request) {
  try {
    const { id, ...body } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const updates: Record<string, any> = {};
    for (const k of EDITABLE) if (body[k] !== undefined) updates[k] = body[k];
    // 改了企业名但没指定关联企业时，按新名称重新匹配
    if (updates.company !== undefined && updates.company_id === undefined) {
      updates.company_id = await resolveOrCreateCompany(updates.company);
    }

    const { data, error } = await supabaseAdmin.from('url_sources').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** 删除 URL（?id=1 或 ?ids=1,2,3） */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('ids') || searchParams.get('id') || '').split(',').map(s => parseInt(s)).filter(Number.isFinite);
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('url_sources').delete().in('id', ids);
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
