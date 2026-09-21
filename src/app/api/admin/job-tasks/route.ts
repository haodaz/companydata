import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_COLUMNS = 'id, task_id, target_url, company, company_id, hint, fetcher_status, structurer_status, jobs_saved, pushed_to_db, error_message, created_at, job_count:structured_json->jobs';

// ────── GET: 任务列表（含每个任务的 URL 与进度） ──────
export async function GET() {
  try {
    const { data: tasks, error } = await supabaseAdmin.from('job_tasks').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (tasks || []).map(t => t.id);
    const byTask = new Map<string, any[]>();
    if (ids.length) {
      const { data: logs, error: logErr } = await supabaseAdmin.from('job_crawl_logs').select(LOG_COLUMNS).in('task_id', ids).order('id', { ascending: true }).limit(20000);
      if (logErr) throw logErr;
      for (const l of logs || []) {
        const { job_count, ...rest } = l as any;
        const row = { ...rest, jobs_extracted: Array.isArray(job_count) ? job_count.length : 0 };
        if (!byTask.has(l.task_id)) byTask.set(l.task_id, []);
        byTask.get(l.task_id)!.push(row);
      }
    }

    const enriched = (tasks || []).map(task => {
      const urls = byTask.get(task.id) || [];
      const total = urls.length;
      const completed = urls.filter(l => l.structurer_status === 'success').length;
      const failed = urls.filter(l => l.fetcher_status === 'failed' || l.structurer_status === 'failed').length;
      const running = urls.filter(l => l.fetcher_status === 'running').length;
      return {
        ...task, urls,
        progress: { total, completed, failed, running, pending: Math.max(0, total - completed - failed - running) },
        jobs_total: urls.reduce((acc, l) => acc + (l.jobs_extracted || 0), 0),
      };
    });

    return NextResponse.json({ ok: true, tasks: enriched });
  } catch (error: any) {
    console.error('[JobTasks] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── POST: 创建任务 ──────
export async function POST(request: Request) {
  try {
    const { name, notes, model_id, scope, created_by } = await request.json();
    if (!name) return NextResponse.json({ ok: false, error: 'Missing task name' }, { status: 400 });

    const { data: task, error } = await supabaseAdmin
      .from('job_tasks')
      .insert({ name, notes: notes || '', model_id: model_id || '', scope: scope === 'all' ? 'all' : 'campus', created_by: created_by || '', status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, task });
  } catch (error: any) {
    console.error('[JobTasks] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── PATCH: 更新任务 ──────
export async function PATCH(request: Request) {
  try {
    const { id, name, notes, status, scope } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    if (scope !== undefined) updates.scope = scope === 'all' ? 'all' : 'campus';

    const { error } = await supabaseAdmin.from('job_tasks').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── DELETE: 删除任务（级联删除爬取日志；已入库的岗位保留） ──────
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('job_tasks').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
