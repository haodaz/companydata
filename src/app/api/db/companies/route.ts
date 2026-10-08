import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/supabase-all';
import { supabaseAdmin } from '@/lib/supabase';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { COMPANY_EDITABLE_KEYS } from '@/lib/company-fields';
import { trackDemand } from '@/lib/flywheel/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const segment = searchParams.get('segment') || '';
    const industry = searchParams.get('industry') || '';

    let query = supabaseAdmin.from('companies').select('*', { count: 'exact' }).order('id', { ascending: false });
    if (search) query = query.or(orIlike(['name', 'name_en', 'industry'], search));
    // 飞轮：后台有人在找这个（只记第一页，翻页不重复算）
    if (page === 1) trackDemand(request, [
      search && { source: 'admin_company_search', query: search },
      industry && { source: 'admin_company_search', query: industry, industry: null, meta: { filter: 'industry' } },
    ].filter(Boolean) as any);
    const review = searchParams.get('review') || '';
    if (review === 'none') query = query.is('human_review_status', null);
    else if (review) query = query.eq('human_review_status', review);
    if (segment === 'none') query = query.is('segment', null);
    else if (segment) query = query.eq('segment', segment);
    if (industry) query = query.eq('industry', industry);

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    // 关联计数（信息源 / 岗位）
    const ids = (data || []).map(c => c.id);
    const counts = new Map<number, any>();
    if (ids.length) {
      const { data: rel } = await supabaseAdmin.from('company_relation_counts').select('*').in('company_id', ids);
      for (const r of rel || []) counts.set(r.company_id, r);
    }

    // 已有深度尽调的企业：专题数（列表上打标，否则不知道哪些有报告）
    const deepCount = new Map<number, number>();
    if (ids.length) {
      const { data: deep } = await supabaseAdmin.from('company_deep_research').select('company_id').in('company_id', ids);
      for (const r of deep || []) deepCount.set(r.company_id, (deepCount.get(r.company_id) || 0) + 1);
    }

    // 顶部统计：各 segment 数量
    let stats: Record<string, number> | undefined;
    if (searchParams.get('withStats') === '1') {
      stats = { total: 0, reviewed: 0 };
      const { data: all } = await selectAll(() => supabaseAdmin.from('companies').select('segment, human_review_status').order('id'));
      for (const r of all || []) { stats.total++; const k = r.segment || 'none'; stats[k] = (stats[k] || 0) + 1; if (r.human_review_status === 'complete') stats.reviewed++; }
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map(c => ({ ...c, counts: counts.get(c.id) || null, deep_topics: deepCount.get(c.id) || 0 })),
      total: count || 0, page, pageSize, stats,
    });
  } catch (error: any) {
    console.error('[Companies] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * 新增企业：{ company: {...} } 单个，或 { companies: [{...}, ...] } 批量（AI 建名单 / 粘贴导入）。
 * 同名（忽略大小写）已存在的跳过。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input: any[] = Array.isArray(body.companies) ? body.companies : body.company ? [body.company] : [];
    const rows = new Map<string, any>();
    for (const c of input) {
      const name = String(c?.name || '').trim();
      if (!name) continue;
      const row: Record<string, any> = { name };
      for (const k of COMPANY_EDITABLE_KEYS) if (k !== 'name' && c[k] !== undefined && c[k] !== null && c[k] !== '') row[k] = c[k];
      rows.set(name.toLowerCase(), row);
    }
    if (rows.size === 0) return NextResponse.json({ success: false, error: '没有可导入的企业名称' }, { status: 400 });

    // 已存在的同名企业
    const existing = new Set<string>();
    // 同名去重要看全库：以前只看到前 1000 家，第 1001 家以后的同名企业会被重复建档
    const { data: all } = await selectAll(() => supabaseAdmin.from('companies').select('name').order('id'));
    for (const r of all || []) existing.add(String(r.name).toLowerCase());

    const fresh = Array.from(rows.entries()).filter(([k]) => !existing.has(k)).map(([, v]) => v);
    let created: any[] = [];
    if (fresh.length) {
      const { data, error } = await supabaseAdmin.from('companies').insert(fresh).select('id, name');
      if (error) throw error;
      created = data || [];
    }
    return NextResponse.json({ success: true, created: created.length, skipped: rows.size - fresh.length, data: created });
  } catch (error: any) {
    console.error('[Companies] POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 批量审核：{ ids: number[], human_review_status } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('companies').update({ human_review_status, human_review_at: now, updated_at: now }).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
