import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { upsertJobsFromLog } from '@/lib/job-store';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 岗位爬取日志 API
 * GET   — 分页查询 / logId 单条（含 raw_markdown）
 * PATCH — 更新日志；提取成功时把岗位写入岗位实体库
 */

const LIST_COLUMNS = 'id, task_id, company_id, company, target_url, hint, markdown_len, fetcher_status, structurer_status, pushed_to_db, jobs_saved, model_id, error_message, created_at, updated_at, ai_summary:structured_json->>ai_summary, task:job_tasks(id, name)';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const logId = searchParams.get('logId');
    if (logId) {
      const { data: log, error } = await supabaseAdmin.from('job_crawl_logs').select('*').eq('id', parseInt(logId)).single();
      if (error) throw error;
      return NextResponse.json({ ok: true, log });
    }

    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    let query = supabaseAdmin.from('job_crawl_logs').select(LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.or(orIlike(['target_url', 'company', 'hint'], search));
    if (status === 'success') query = query.eq('structurer_status', 'success');
    else if (status === 'failed') query = query.or('fetcher_status.eq.failed,structurer_status.eq.failed');
    else if (status === 'pending') query = query.eq('fetcher_status', 'pending');

    const { data: logs, count, error } = await query.range(from, to);
    if (error) throw error;
    return NextResponse.json({ ok: true, logs: logs || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    console.error('[JournalJob] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ ok: false, error: 'Missing log id' }, { status: 400 });

    const allowed = ['structured_json', 'structurer_status', 'fetcher_status', 'error_message', 'raw_markdown', 'markdown_len', 'sub_pages_fetched', 'model_id', 'batch_id'];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];

    const { error } = await supabaseAdmin.from('job_crawl_logs').update(updates).eq('id', id);
    if (error) throw error;

    // 提取成功 → 岗位逐条写入岗位实体库
    let jobsSaved = 0;
    let storeError: string | null = null;
    if (updates.structurer_status === 'success' && updates.structured_json) {
      try {
        jobsSaved = await upsertJobsFromLog(id, updates.structured_json);
        await supabaseAdmin.from('job_crawl_logs').update({ pushed_to_db: jobsSaved > 0, jobs_saved: jobsSaved }).eq('id', id);
      } catch (e: any) {
        storeError = e.message;
        console.error('[JournalJob] upsert jobs error:', e);
        await supabaseAdmin.from('job_crawl_logs').update({ error_message: `岗位入库失败: ${e.message}` }).eq('id', id);
      }
    }

    return NextResponse.json({ ok: true, jobsSaved, storeError });
  } catch (error: any) {
    console.error('[JournalJob] PATCH error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
