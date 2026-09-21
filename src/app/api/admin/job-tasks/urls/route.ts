import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ────── POST: 向任务添加 URL（同一任务内同一 URL 不重复添加） ──────
export async function POST(request: Request) {
  try {
    const { taskId, urls } = await request.json();
    if (!taskId) return NextResponse.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
    if (!Array.isArray(urls) || urls.length === 0) return NextResponse.json({ ok: false, error: 'Missing urls array' }, { status: 400 });

    const { data: task } = await supabaseAdmin.from('job_tasks').select('model_id').eq('id', taskId).single();
    const { data: existing } = await supabaseAdmin.from('job_crawl_logs').select('target_url').eq('task_id', taskId);
    const seen = new Set((existing || []).map(r => r.target_url));

    const rows: any[] = [];
    for (const u of urls) {
      const target_url = String(u.url || u.target_url || '').trim();
      if (!/^https?:\/\//i.test(target_url) || seen.has(target_url)) continue;
      seen.add(target_url);
      const company = String(u.company || '').trim();
      rows.push({
        task_id: taskId,
        target_url,
        company,
        company_id: u.company_id ?? (company ? await resolveOrCreateCompany(company) : null),
        hint: u.hint || '',
        fetcher_status: 'pending',
        structurer_status: 'pending',
        raw_markdown: '',
        markdown_len: 0,
        model_id: task?.model_id || '',
      });
    }

    if (rows.length) {
      const { error } = await supabaseAdmin.from('job_crawl_logs').insert(rows);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, added: rows.length, skipped: urls.length - rows.length });
  } catch (error: any) {
    console.error('[JobTasks/urls] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ────── DELETE: 从任务移除某个 URL ──────
export async function DELETE(request: Request) {
  try {
    const logId = new URL(request.url).searchParams.get('logId');
    if (!logId) return NextResponse.json({ ok: false, error: 'Missing logId' }, { status: 400 });
    const { error } = await supabaseAdmin.from('job_crawl_logs').delete().eq('id', parseInt(logId));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
