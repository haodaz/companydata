import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { researchOccupation } from '@/lib/agents/occupation-enrich';
import { findOccupation, upsertOccupation, upsertSalaries } from '@/lib/occupation-store';
import { checkOfficial, settleSignals, type EmergentCandidate, type OfficialCheck } from '@/lib/occupation-signals';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 飞轮看板「职业缺口」上的操作（市场新兴职业，见 occupation-signals.ts）：
 *   { action: 'check',  candidate, model }  先查官方身份（职业大典 / 人社部新职业 / O*NET），只返回建议给人看
 *   { action: 'create', candidate, model, asOfficial? }  人选了按官方建就带 asOfficial：用官方名称、origin = framework；
 *                                           没带 → origin = market。联网生成画像 + 薪资（待审核），岗位挂上、信号标 created
 *   { action: 'merge',  candidate }         并进已有职业 candidate.merge_into（叫法记别名），岗位挂上、信号标 merged
 *   { action: 'ignore', candidate }         先不管：信号标 ignored（以后同类叫法再多起来会重新冒出来）
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const { action, candidate, model, asOfficial } = await req.json() as { action: string; candidate: EmergentCandidate; model?: string; asOfficial?: OfficialCheck };
    if (!candidate?.keys?.length) return NextResponse.json({ ok: false, error: '缺候选' }, { status: 400 });

    // 先查官方身份，给人看（不写库）
    if (action === 'check') {
      if (!model) return NextResponse.json({ ok: false, error: '缺模型（看板右上角选单里选）' }, { status: 400 });
      return NextResponse.json({ ok: true, official: await checkOfficial(candidate.name, candidate.names, model, candidate.titles) });
    }

    if (action === 'ignore') {
      const { error } = await supabaseAdmin.from('occupation_signals').update({ status: 'ignored' }).in('norm_key', candidate.keys).eq('status', 'open');
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    let occ: any = null, created = false;
    let official: OfficialCheck = { official: false, verified: false, framework: null, official_name: null, code: null, url: null, note: '' };
    if (action === 'merge') {
      if (!candidate.merge_into?.id) return NextResponse.json({ ok: false, error: '没有可并进的职业' }, { status: 400 });
      const { data } = await supabaseAdmin.from('occupations').select('id, external_id, name, aliases').eq('id', candidate.merge_into.id).single();
      occ = data;
    } else if (action === 'create') {
      if (!model) return NextResponse.json({ ok: false, error: '缺模型（看板右上角选单里选）' }, { status: 400 });
      // 官方身份由人定：看板上先 check，人选了「按官方建」才带 official 过来；没带就按市场新兴
      if (asOfficial?.official && asOfficial.official_name) official = asOfficial;
      const name = official.official ? official.official_name! : candidate.name;
      const hit = await findOccupation({ name });
      if (hit) occ = (await supabaseAdmin.from('occupations').select('id, external_id, name, aliases, origin').eq('id', hit.id).single()).data;   // 读出原来的来源标签，别覆盖
      if (!occ) {
        const r = await researchOccupation({ name, aliases: candidate.names }, model, Date.now());
        const saved = await upsertOccupation({ ...r.fields, name, aliases: [...new Set([...(name !== candidate.name ? [candidate.name] : []), ...candidate.names, ...(r.fields.aliases || [])])].filter(n => n !== name) }, { mode: 'fill', source: 'ai', sources: r.sources });
        await upsertSalaries(saved.id, r.salaries, 'fill');
        created = saved.created;
        const { data } = await supabaseAdmin.from('occupations').select('id, external_id, name, aliases, origin').eq('id', saved.id).single();
        occ = data;
      }
      // 来源标签 + 涌现数据（之后飞轮每次检测刷新）；库里原来就有、已标过来源的不改
      await supabaseAdmin.from('occupations').update({
        ...(occ.origin && !created ? {} : { origin: official.official ? 'framework' : 'market' }),
        emergence: {
          jobs: candidate.jobs, companies: candidate.companies, cities: candidate.cities, first_seen: candidate.first_seen, last_30d: candidate.last_30d, titles: candidate.titles, names: candidate.names, updated_at: new Date().toISOString(),
          ...(official.official ? { official: { framework: official.framework, name: official.official_name, code: official.code, url: official.url, verified: official.verified } } : {}),
        },
      }).eq('id', occ.id);
    } else return NextResponse.json({ ok: false, error: `不认识的操作 ${action}` }, { status: 400 });

    if (!occ?.external_id) return NextResponse.json({ ok: false, error: '职业没有 external_id，挂不上岗位' }, { status: 500 });
    const r = await settleSignals(candidate.keys, occ, action === 'merge' ? 'merged' : 'created');
    return NextResponse.json({ ok: true, id: occ.id, name: occ.name, created, official: official.official ? official : null, ...r });
  } catch (e: any) {
    console.error('[flywheel/emergent]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
