import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 往画像任务里加企业：{ taskId, companyIds?: number[], names?: string[] }
 * 名单里库里没有的企业自动建档；同一任务里同一家企业只加一次。
 */
export async function POST(request: Request) {
  try {
    const { taskId, companyIds, names } = await request.json();
    if (!taskId) return NextResponse.json({ ok: false, error: 'Missing taskId' }, { status: 400 });

    const ids = new Set<number>();
    for (const id of Array.isArray(companyIds) ? companyIds : []) if (Number.isInteger(id)) ids.add(id);
    let unresolved = 0;
    for (const raw of Array.isArray(names) ? names : []) {
      const name = String(raw || '').trim();
      if (!name) continue;
      const id = await resolveOrCreateCompany(name);
      if (id) ids.add(id); else unresolved++;
    }
    if (!ids.size) return NextResponse.json({ ok: false, error: '没有可添加的企业' }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from('company_crawl_logs').select('company_id').eq('task_id', taskId).in('company_id', Array.from(ids));
    const have = new Set((existing || []).map(r => r.company_id));
    const fresh = Array.from(ids).filter(id => !have.has(id));

    const { data: companies } = await supabaseAdmin.from('companies').select('id, name').in('id', fresh);
    const rows = (companies || []).map(c => ({ task_id: taskId, company_id: c.id, company: c.name, status: 'pending' }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from('company_crawl_logs').insert(rows);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, added: rows.length, skipped: ids.size - rows.length + unresolved });
  } catch (error: any) {
    console.error('[CompanyTasks/companies] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** 从任务里移除一家企业（删除这条日志） */
export async function DELETE(request: Request) {
  try {
    const logId = new URL(request.url).searchParams.get('logId');
    if (!logId) return NextResponse.json({ ok: false, error: 'Missing logId' }, { status: 400 });
    const { error } = await supabaseAdmin.from('company_crawl_logs').delete().eq('id', parseInt(logId));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
