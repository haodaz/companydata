import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { familyOf } from '@/lib/career-family';

export const runtime = 'nodejs';

/**
 * AI 百业首页要的东西：人、脸、场景底图、领域分布、上下游企业。
 * 首页本身不连数据后台，它只问这一个接口；接口挂了页面退回静态文案照样能看。
 *
 * 首页是公开的（proxy.ts 只放开了它和这个接口），所以这里只给宣传页该看的：
 * 人、脸、场景图、汇总数。作答、账本明细、技能卡正文一概不出。
 * 公开了谁都能刷，结果在进程里缓存 60 秒。
 */
let cache: { at: number; body: any } | null = null;
const TTL = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.body);
  try {
    const { data: rows } = await supabaseAdmin
      .from('skill_tasks')
      .select('id, title, profile, jd_snapshot, sim, created_at, skill:skills(name, domain, expert_name, expert_location, source)')
      .order('created_at', { ascending: true });

    const spaces = (rows || []).map((t: any) => {
      const sk = Array.isArray(t.skill) ? t.skill[0] : t.skill;
      const jd = t.jd_snapshot || {}, p = t.profile || {};
      const prof = jd.career?.profession || jd.title || sk?.name || '';
      const scenes: string[] = Object.values(t.sim?.art?.scenes || {}).filter((u: any) => typeof u === 'string') as string[];
      return {
        id: t.id, name: p.name || '', role: p.role || '', avatar: p.avatar || '', tagline: p.tagline || '',
        profession: prof, company: jd.company || '', location: jd.location || '',
        family: familyOf(prof, sk?.domain, jd.title, jd.company),
        cover: scenes[0] || '', scenes: scenes.slice(0, 3),
        hasBench: !!t.sim?.steps?.some((s: any) => s.type === 'bench'),
        expert: sk?.expert_name && sk.source !== 'jd-draft' ? `${sk.expert_name}（${sk.expert_location || ''}）` : '',
      };
    }).filter(s => s.name);

    const famCount = new Map<string, number>();
    for (const s of spaces) famCount.set(s.family, (famCount.get(s.family) || 0) + 1);

    // 胶片条用的场景图：图库里现成的，不重新生成
    const { data: art } = await supabaseAdmin.from('lab_art_assets').select('url').eq('kind', 'scene').limit(80);
    const tiles = [...new Set([...(art || []).map((a: any) => a.url), ...spaces.flatMap(s => s.scenes)])].filter(Boolean);

    // 上下游里出现的真实企业：首页只拿名字做一条「这些名字来自真实企业库」的带子
    const { data: firms } = await supabaseAdmin.from('companies')
      .select('name, industry').not('name', 'is', null).order('id', { ascending: true }).limit(400);

    // 汇总数：以前首页还得另外去问 /api/lab/spaces（要登录），公开之后就拿不到了
    const { data: invs } = await supabaseAdmin.from('skill_invocations').select('actor_location, volume');
    const skills = (rows || []).map((t: any) => (Array.isArray(t.skill) ? t.skill[0] : t.skill)).filter(Boolean);
    const real = skills.filter((k: any) => k.source !== 'jd-draft');
    const totals = {
      spaces: spaces.length,
      experts: real.length,
      expertPlaces: [...new Set(real.map((k: any) => k.expert_location).filter(Boolean))],
      places: new Set((invs || []).map((x: any) => x.actor_location).filter(Boolean)).size,
      served: (invs || []).reduce((a: number, x: any) => a + (x.volume || 1), 0),
      faces: spaces.map(s => s.avatar).filter(Boolean).slice(0, 12),
    };

    const body = {
      ok: true,
      totals,
      spaces,
      tiles,
      families: [...famCount.entries()].sort((a, b) => b[1] - a[1]),
      companies: (firms || []).map((c: any) => c.name).filter((n: string) => n && n.length <= 12),
      companyTotal: (firms || []).length,
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e: any) {
    console.error('[Lab/landing]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
