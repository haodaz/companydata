import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { computeBoard } from '@/lib/flywheel/board';
import { SOURCES, WEB_PROBES } from '@/lib/flywheel/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 飞轮看板：四个口径的热度 / 供给 / 缺口、最近信号、每日检测记录 */
export async function GET(req: Request) {
  try {
    if (!(await getSessionUser(req))) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
    const [board, { data: recent }, { count: pending }, { data: days }, { data: groups }] = await Promise.all([
      computeBoard(),
      supabaseAdmin.from('demand_signals').select('id, source, query, actor, weight, industry, job_function, career_family, profession, company_id, company_name, normalized_by, meta, created_at').order('created_at', { ascending: false }).limit(80),
      supabaseAdmin.from('demand_signals').select('id', { count: 'exact', head: true }).is('normalized_at', null),
      supabaseAdmin.from('flywheel_days').select('*').order('day', { ascending: false }).limit(14),
      supabaseAdmin.from('demand_signals').select('source').gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(20000),
    ]);
    const bySource: Record<string, number> = {};
    for (const g of groups || []) bySource[g.source] = (bySource[g.source] || 0) + 1;
    const { compById: _drop, ...rest } = board;
    return NextResponse.json({ ok: true, ...rest, recent: recent || [], pending: pending || 0, days: days || [], bySource, sources: SOURCES, probes: WEB_PROBES.map(p => ({ key: p.key, label: p.label })) });
  } catch (e: any) {
    console.error('[flywheel] GET', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
