import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { upsertCompetitions } from '@/lib/competition-store';
import { REWARD_KEYS } from '@/lib/competition-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 赛事实体库：列表 + 顶部统计 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const kind = searchParams.get('kind') || '';
    const level = searchParams.get('level') || '';
    const status = searchParams.get('status') || '';
    const reward = searchParams.get('reward') || '';
    const review = searchParams.get('review') || '';
    const organizerId = searchParams.get('organizerId') || '';
    const sort = searchParams.get('sort') || 'deadline';

    let q = supabaseAdmin.from('competitions').select('*', { count: 'exact' });
    if (search) q = q.or(orIlike(['name', 'name_en', 'organizer', 'theme'], search));
    if (kind) q = q.eq('kind', kind);
    if (level) q = q.eq('level', level);
    if (status) q = q.eq('status', status);
    if (reward && REWARD_KEYS.includes(reward)) q = q.contains('reward_types', [reward]);
    if (review === 'none') q = q.is('human_review_status', null); else if (review) q = q.eq('human_review_status', review);
    if (organizerId) q = q.eq('organizer_company_id', parseInt(organizerId));
    q = sort === 'created' ? q.order('created_at', { ascending: false }) : q.order('registration_deadline', { ascending: true, nullsFirst: false }).order('id', { ascending: false });

    const { data, count, error } = await q.range(from, to);
    if (error) throw error;

    let stats: Record<string, number> | undefined;
    if (searchParams.get('withStats') === '1') {
      const { data: all } = await supabaseAdmin.from('competitions').select('status, reward_types, level, human_review_status').limit(50000);
      stats = { total: 0, open: 0, hardware: 0, cash: 0, internship: 0, offer: 0, credits: 0, global: 0, reviewed: 0 };
      for (const r of all || []) {
        stats.total++;
        if (r.status === 'open') stats.open++;
        for (const t of r.reward_types || []) if (t in stats) stats[t]++;
        if (r.level === 'global') stats.global++;
        if (r.human_review_status === 'complete') stats.reviewed++;
      }
    }
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize, stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 手动新增 / 批量写入：{ competition } 或 { competitions: [...] } */
export async function POST(request: Request) {
  try {
    const b = await request.json();
    const rows = Array.isArray(b.competitions) ? b.competitions : b.competition ? [b.competition] : [];
    if (!rows.length) return NextResponse.json({ success: false, error: '没有可写入的赛事' }, { status: 400 });
    const result = await upsertCompetitions(rows, { searchId: b.searchId || null, sources: b.sources || {} });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 批量审核：{ ids, human_review_status } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('competitions').update({ human_review_status, human_review_at: now, updated_at: now }).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
