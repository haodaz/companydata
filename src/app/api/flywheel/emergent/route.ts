import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { researchOccupation } from '@/lib/agents/occupation-enrich';
import { findOccupation, upsertOccupation, upsertSalaries } from '@/lib/occupation-store';
import { settleSignals, type EmergentCandidate } from '@/lib/occupation-signals';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 飞轮看板「职业缺口」上的操作（市场新兴职业，见 occupation-signals.ts）：
 *   { action: 'create', candidate, model }  建成职业（origin = market，联网生成画像 + 薪资，待审核），岗位挂上、信号标 created
 *   { action: 'merge',  candidate }         并进已有职业 candidate.merge_into（叫法记别名），岗位挂上、信号标 merged
 *   { action: 'ignore', candidate }         先不管：信号标 ignored（以后同类叫法再多起来会重新冒出来）
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const { action, candidate, model } = await req.json() as { action: string; candidate: EmergentCandidate; model?: string };
    if (!candidate?.keys?.length) return NextResponse.json({ ok: false, error: '缺候选' }, { status: 400 });

    if (action === 'ignore') {
      const { error } = await supabaseAdmin.from('occupation_signals').update({ status: 'ignored' }).in('norm_key', candidate.keys).eq('status', 'open');
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    let occ: any = null, created = false;
    if (action === 'merge') {
      if (!candidate.merge_into?.id) return NextResponse.json({ ok: false, error: '没有可并进的职业' }, { status: 400 });
      const { data } = await supabaseAdmin.from('occupations').select('id, external_id, name, aliases').eq('id', candidate.merge_into.id).single();
      occ = data;
    } else if (action === 'create') {
      if (!model) return NextResponse.json({ ok: false, error: '缺模型（看板右上角选单里选）' }, { status: 400 });
      occ = await findOccupation({ name: candidate.name });
      if (!occ) {
        const r = await researchOccupation({ name: candidate.name, aliases: candidate.names }, model, Date.now());
        const saved = await upsertOccupation({ ...r.fields, name: candidate.name, aliases: [...new Set([...candidate.names, ...(r.fields.aliases || [])])].filter(n => n !== candidate.name) }, { mode: 'fill', source: 'ai', sources: r.sources });
        await upsertSalaries(saved.id, r.salaries, 'fill');
        created = saved.created;
        const { data } = await supabaseAdmin.from('occupations').select('id, external_id, name, aliases').eq('id', saved.id).single();
        occ = data;
      }
      // 市场新兴：打来源标签 + 涌现数据（之后飞轮每次检测刷新）
      await supabaseAdmin.from('occupations').update({
        origin: 'market',
        emergence: { jobs: candidate.jobs, companies: candidate.companies, cities: candidate.cities, first_seen: candidate.first_seen, last_30d: candidate.last_30d, titles: candidate.titles, names: candidate.names, updated_at: new Date().toISOString() },
      }).eq('id', occ.id);
    } else return NextResponse.json({ ok: false, error: `不认识的操作 ${action}` }, { status: 400 });

    if (!occ?.external_id) return NextResponse.json({ ok: false, error: '职业没有 external_id，挂不上岗位' }, { status: 500 });
    const r = await settleSignals(candidate.keys, occ, action === 'merge' ? 'merged' : 'created');
    return NextResponse.json({ ok: true, id: occ.id, name: occ.name, created, ...r });
  } catch (e: any) {
    console.error('[flywheel/emergent]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
