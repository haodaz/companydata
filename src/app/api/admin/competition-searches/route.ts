import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveCompanyId } from '@/lib/company-match';
import { upsertCompetitions } from '@/lib/competition-store';
import { summarizeCost } from '@/lib/company-store';
import { pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 赛事检索记录
 * GET   — 列表 / ?id= 单条（含 raw）
 * POST  — 新建一条记录 { query, company, kinds, region, rewards, onlyOpen, model_id, created_by }
 * PATCH — 更新；带 save: true 时把 structured_json.competitions 写入赛事库
 */
const LIST_COLUMNS = 'id, task_id, query, company, company_id, kinds, region, only_open, rewards, count, enrich, model_id, candidates_found, saved, status, error_message, llm_calls, token_total, cost_usd, created_by, created_at, ai_summary:structured_json->>ai_summary, task:competition_tasks(id, name)';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (id) {
      const { data, error } = await supabaseAdmin.from('competition_searches').select('*').eq('id', parseInt(id)).single();
      if (error) throw error;
      return NextResponse.json({ ok: true, search: data });
    }
    const { page, pageSize, from, to } = pageParams(searchParams, 20);
    const { data, count, error } = await supabaseAdmin.from('competition_searches').select(LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    return NextResponse.json({ ok: true, searches: data || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const company = String(b.company || '').trim() || null;
    const row = {
      task_id: b.taskId || null, query: String(b.query || '').trim(), company, company_id: company ? await resolveCompanyId(company) : null,
      kinds: Array.isArray(b.kinds) ? b.kinds : [], region: b.region || 'all', only_open: b.onlyOpen !== false, rewards: Array.isArray(b.rewards) ? b.rewards : [],
      count: b.count || 12, enrich: b.enrich !== false, model_id: b.model_id || null, created_by: b.created_by || '', status: 'pending',
    };
    if (!row.query && !row.company) return NextResponse.json({ ok: false, error: '请输入检索主题或主办企业' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('competition_searches').insert(row).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, search: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json();
    if (!b.id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const allowed = ['status', 'error_message', 'search_queries', 'raw_candidates', 'raw_pages', 'structured_json', 'candidates_found', 'model_id', 'batch_id'];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
    if (Array.isArray(updates.raw_pages)) updates.raw_pages = updates.raw_pages.map((p: any) => ({ ...p, markdown: String(p.markdown || '').slice(0, 120000) }));

    let saved: any = null;
    if (b.save && Array.isArray(b.competitions) && b.competitions.length) {
      const { data: sr } = await supabaseAdmin.from('competition_searches').select('company, company_id').eq('id', b.id).single();
      saved = await upsertCompetitions(b.competitions, { searchId: b.id, sources: b.sources || {}, companyId: sr?.company_id, companyName: sr?.company });
      updates.saved = saved.inserted + saved.updated;
    }
    // 跑完（成功 / 失败）按 batch_id 汇总这条检索的调用次数 / token / 费用
    let cost: any = null;
    if (updates.status === 'success' || updates.status === 'failed') {
      cost = await summarizeCost(b.batch_id);
      if (cost.llm_calls) Object.assign(updates, cost);
    }
    const { error } = await supabaseAdmin.from('competition_searches').update(updates).eq('id', b.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, saved, cost });
  } catch (error: any) {
    console.error('[CompetitionSearches] PATCH', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
