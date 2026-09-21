import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const missing = (e: any) => /does not exist|schema cache|Could not find the table|PGRST205/i.test(String(e?.message || e));

/** 生产线任务历史。GET 列表（不含工单 / 日志）；GET ?id= 单条完整现场 */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const { data, error } = await supabaseAdmin.from('factory_runs').select('*').eq('id', id).single();
      if (error) throw error;
      return NextResponse.json({ ok: true, run: data });
    }
    const { data, error } = await supabaseAdmin.from('factory_runs')
      .select('id, task, title, status, companies_count, jobs_saved, model_id, created_by, started_at, finished_at')
      .order('started_at', { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ ok: true, runs: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, needMigration: missing(e), runs: [] }, { status: missing(e) ? 200 : 500 });
  }
}

/** 开工时建一条 */
export async function POST(req: Request) {
  try {
    const { task, model, createdBy } = await req.json();
    const { data, error } = await supabaseAdmin.from('factory_runs').insert({ task, model_id: model || '', created_by: createdBy || '', status: 'running' }).select('id').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, needMigration: missing(e) });
  }
}

/** 过程中 / 结束时更新现场 */
export async function PATCH(req: Request) {
  try {
    const { id, ...body } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const updates: Record<string, any> = {};
    for (const k of ['title', 'status', 'plan', 'items', 'logs', 'report', 'companies_count', 'jobs_saved']) if (body[k] !== undefined) updates[k] = body[k];
    if (['completed', 'failed', 'stopped'].includes(body.status)) updates.finished_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from('factory_runs').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('factory_runs').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
