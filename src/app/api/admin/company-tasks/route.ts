import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PROFILE_TOPIC_KEYS } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_COLUMNS = 'id, task_id, company_id, company, status, steps_done, fields_filled, financings_saved, news_saved, executives_saved, completeness_before, completeness_after, llm_calls, token_total, cost_usd, error_message, started_at, finished_at, created_at, updated_at';

// ────── GET: 画像任务列表（含每家企业进度） ──────
export async function GET() {
  try {
    const { data: tasks, error } = await supabaseAdmin.from('company_tasks').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (tasks || []).map(t => t.id);
    const byTask = new Map<string, any[]>();
    if (ids.length) {
      const { data: logs, error: logErr } = await supabaseAdmin.from('company_crawl_logs').select(LOG_COLUMNS).in('task_id', ids).order('id', { ascending: true }).limit(20000);
      if (logErr) throw logErr;
      for (const l of logs || []) {
        if (!byTask.has(l.task_id)) byTask.set(l.task_id, []);
        byTask.get(l.task_id)!.push(l);
      }
    }

    const enriched = (tasks || []).map(task => {
      const items = byTask.get(task.id) || [];
      const total = items.length;
      const completed = items.filter(l => l.status === 'success').length;
      const failed = items.filter(l => l.status === 'failed').length;
      const running = items.filter(l => l.status === 'running').length;
      return {
        ...task, items,
        progress: { total, completed, failed, running, pending: Math.max(0, total - completed - failed - running) },
        cost_usd: items.reduce((a, l) => a + (parseFloat(l.cost_usd) || 0), 0),
        fields_total: items.reduce((a, l) => a + ((l.fields_filled || []).length), 0),
        entities_total: items.reduce((a, l) => a + (l.financings_saved || 0) + (l.news_saved || 0) + (l.executives_saved || 0), 0),
      };
    });

    return NextResponse.json({ ok: true, tasks: enriched });
  } catch (error: any) {
    console.error('[CompanyTasks] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── POST: 创建任务 ──────
export async function POST(request: Request) {
  try {
    const { name, notes, model_id, topics, skip_filled, created_by } = await request.json();
    if (!name) return NextResponse.json({ ok: false, error: 'Missing task name' }, { status: 400 });
    const cleanTopics = Array.isArray(topics) ? topics.filter((t: string) => PROFILE_TOPIC_KEYS.includes(t)) : [];

    const { data: task, error } = await supabaseAdmin
      .from('company_tasks')
      .insert({ name, notes: notes || '', model_id: model_id || '', topics: cleanTopics, skip_filled: !!skip_filled, created_by: created_by || '', status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, task });
  } catch (error: any) {
    console.error('[CompanyTasks] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── PATCH: 更新任务 ──────
export async function PATCH(request: Request) {
  try {
    const { id, name, notes, status, topics, skip_filled } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    if (topics !== undefined) updates.topics = Array.isArray(topics) ? topics.filter((t: string) => PROFILE_TOPIC_KEYS.includes(t)) : [];
    if (skip_filled !== undefined) updates.skip_filled = !!skip_filled;

    const { error } = await supabaseAdmin.from('company_tasks').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── DELETE: 删除任务（级联删除日志；已入库的画像 / 子实体保留） ──────
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('company_tasks').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
