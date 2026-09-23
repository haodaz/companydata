import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ITEM_COLUMNS = 'id, task_id, query, company, company_id, kinds, region, only_open, rewards, count, enrich, model_id, candidates_found, saved, status, error_message, llm_calls, token_total, cost_usd, created_at, updated_at, ai_summary:structured_json->>ai_summary';

/** 赛事检索任务列表（含每条检索的状态与进度） */
export async function GET() {
  try {
    const { data: tasks, error } = await supabaseAdmin.from('competition_tasks').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (tasks || []).map(t => t.id);
    const byTask = new Map<string, any[]>();
    if (ids.length) {
      const { data: items, error: e2 } = await supabaseAdmin.from('competition_searches').select(ITEM_COLUMNS).in('task_id', ids).order('id', { ascending: true }).limit(20000);
      if (e2) throw e2;
      for (const it of items || []) { if (!byTask.has(it.task_id)) byTask.set(it.task_id, []); byTask.get(it.task_id)!.push(it); }
    }
    const enriched = (tasks || []).map(t => {
      const items = byTask.get(t.id) || [];
      const total = items.length, completed = items.filter(i => i.status === 'success').length, failed = items.filter(i => i.status === 'failed').length, running = items.filter(i => i.status === 'running').length;
      return {
        ...t, items,
        progress: { total, completed, failed, running, pending: Math.max(0, total - completed - failed - running) },
        found_total: items.reduce((a, i) => a + (i.candidates_found || 0), 0),
        saved_total: items.reduce((a, i) => a + (i.saved || 0), 0),
        cost_usd: items.reduce((a, i) => a + (parseFloat(i.cost_usd) || 0), 0),
      };
    });
    return NextResponse.json({ ok: true, tasks: enriched });
  } catch (error: any) {
    console.error('[CompetitionTasks] GET', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, notes, model_id, created_by } = await request.json();
    if (!name) return NextResponse.json({ ok: false, error: 'Missing task name' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('competition_tasks').insert({ name, notes: notes || '', model_id: model_id || '', created_by: created_by || '', status: 'draft' }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, task: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, name, notes, status } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    const { error } = await supabaseAdmin.from('competition_tasks').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** 删除任务（级联删除检索记录；已入库的赛事保留） */
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('competition_tasks').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
