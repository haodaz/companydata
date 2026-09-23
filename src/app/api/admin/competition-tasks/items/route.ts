import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveCompanyId } from '@/lib/company-match';
import { COMPETITION_KIND_LABELS, REWARD_KEYS } from '@/lib/competition-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 往任务里加检索条目：{ taskId, items: [{ query, company, companyId, kinds, region, rewards, onlyOpen, count, enrich }] }
 * 同一任务里「企业 + 主题」相同的只加一次。
 */
export async function POST(request: Request) {
  try {
    const { taskId, items } = await request.json();
    if (!taskId || !Array.isArray(items) || !items.length) return NextResponse.json({ ok: false, error: 'Missing taskId or items' }, { status: 400 });
    const { data: existing } = await supabaseAdmin.from('competition_searches').select('query, company').eq('task_id', taskId);
    const have = new Set((existing || []).map(r => `${(r.company || '').toLowerCase()}|${(r.query || '').toLowerCase()}`));
    const rows: any[] = [];
    let skipped = 0;
    for (const it of items) {
      const query = String(it.query || '').trim();
      const company = String(it.company || '').trim() || null;
      if (!query && !company) { skipped++; continue; }
      const key = `${(company || '').toLowerCase()}|${query.toLowerCase()}`;
      if (have.has(key)) { skipped++; continue; }
      have.add(key);
      rows.push({
        task_id: taskId, query, company, company_id: Number.isInteger(it.companyId) ? it.companyId : (company ? await resolveCompanyId(company) : null),
        kinds: (Array.isArray(it.kinds) ? it.kinds : []).filter((k: string) => k in COMPETITION_KIND_LABELS),
        region: ['all', 'china', 'overseas'].includes(it.region) ? it.region : 'all',
        rewards: (Array.isArray(it.rewards) ? it.rewards : []).filter((r: string) => REWARD_KEYS.includes(r)),
        only_open: it.onlyOpen !== false, count: Math.min(30, Math.max(3, parseInt(it.count) || 12)), enrich: it.enrich !== false, status: 'pending',
      });
    }
    if (rows.length) {
      const { error } = await supabaseAdmin.from('competition_searches').insert(rows);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, added: rows.length, skipped });
  } catch (error: any) {
    console.error('[CompetitionTasks/items] POST', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('competition_searches').delete().eq('id', parseInt(id));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
