import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';
import { applyProfileBundle, summarizeCost } from '@/lib/company-store';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 企业画像日志 API
 * GET   — 分页查询 / logId 单条（含 raw）
 * POST  — 单家工具：新建一条不挂任务的日志 { company, companyId? }
 * PATCH — 更新日志；status = success 时把画像 + 子实体写入企业库，并汇总成本
 */

const LIST_COLUMNS = 'id, task_id, company_id, company, status, steps_done, markdown_len, pages_fetched, fields_filled, financings_saved, news_saved, executives_saved, completeness_before, completeness_after, llm_calls, token_total, cost_usd, model_id, error_message, started_at, finished_at, created_at, updated_at, ai_summary:structured_json->>ai_summary, task:company_tasks(id, name)';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const logId = searchParams.get('logId');
    if (logId) {
      const { data: log, error } = await supabaseAdmin.from('company_crawl_logs').select('*, task:company_tasks(id, name)').eq('id', parseInt(logId)).single();
      if (error) throw error;
      return NextResponse.json({ ok: true, log });
    }

    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const companyId = searchParams.get('companyId') || '';

    let query = supabaseAdmin.from('company_crawl_logs').select(LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.or(orIlike(['company'], search));
    if (status) query = query.eq('status', status);
    if (companyId) query = query.eq('company_id', parseInt(companyId));

    const { data: logs, count, error } = await query.range(from, to);
    if (error) throw error;
    return NextResponse.json({ ok: true, logs: logs || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    console.error('[JournalCompany] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.company || '').trim();
    let companyId: number | null = Number.isInteger(body.companyId) ? body.companyId : null;
    if (!companyId) {
      if (!name) return NextResponse.json({ ok: false, error: 'Missing company' }, { status: 400 });
      companyId = await resolveOrCreateCompany(name);
    }
    if (!companyId) throw new Error('企业建档失败');
    const { data: company } = await supabaseAdmin.from('companies').select('id, name').eq('id', companyId).single();
    const { data: log, error } = await supabaseAdmin.from('company_crawl_logs')
      .insert({ task_id: body.taskId || null, company_id: companyId, company: company?.name || name, status: 'pending', model_id: body.model_id || null })
      .select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, log });
  } catch (error: any) {
    console.error('[JournalCompany] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ ok: false, error: 'Missing log id' }, { status: 400 });

    const allowed = ['status', 'steps_done', 'raw_markdown', 'markdown_len', 'pages_fetched', 'raw_searches', 'structured_json', 'model_id', 'batch_id', 'error_message', 'started_at', 'finished_at'];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];
    if (updates.raw_markdown) updates.raw_markdown = String(updates.raw_markdown).slice(0, 600000);
    if (updates.status === 'running' && !body.started_at) updates.started_at = updates.updated_at;
    if ((updates.status === 'success' || updates.status === 'failed') && !body.finished_at) updates.finished_at = updates.updated_at;

    const { data: log, error } = await supabaseAdmin.from('company_crawl_logs').update(updates).eq('id', id).select('id, company_id, batch_id, structured_json').single();
    if (error) throw error;

    let applied: any = null;
    let storeError: string | null = null;
    if (updates.status === 'success' && log.structured_json && log.company_id) {
      try {
        applied = await applyProfileBundle(log.id, log.company_id, log.structured_json);
        const cost = await summarizeCost(log.batch_id);
        await supabaseAdmin.from('company_crawl_logs').update({
          pushed_to_db: true, fields_filled: applied.filled, financings_saved: applied.financings_saved, news_saved: applied.news_saved, executives_saved: applied.executives_saved,
          completeness_before: applied.completeness_before, completeness_after: applied.completeness_after, ...cost,
        }).eq('id', id);
        applied = { ...applied, ...cost };
      } catch (e: any) {
        storeError = e.message;
        console.error('[JournalCompany] apply error:', e);
        await supabaseAdmin.from('company_crawl_logs').update({ error_message: `入库失败: ${e.message}` }).eq('id', id);
      }
    } else if (updates.status === 'failed') {
      const cost = await summarizeCost(log.batch_id);
      await supabaseAdmin.from('company_crawl_logs').update(cost).eq('id', id);
    }

    return NextResponse.json({ ok: true, applied, storeError });
  } catch (error: any) {
    console.error('[JournalCompany] PATCH error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
