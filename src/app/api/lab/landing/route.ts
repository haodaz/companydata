import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { familyOf } from '@/lib/career-family';

export const runtime = 'nodejs';

/**
 * AI 百业首页要的东西：人、脸、场景底图、领域分布、上下游企业。
 * 首页本身不连数据后台，它只问这一个接口；接口挂了页面退回静态文案照样能看。
 */
export async function GET() {
  try {
    const { data: rows } = await supabaseAdmin
      .from('skill_tasks')
      .select('id, title, profile, jd_snapshot, sim, created_at, skill:skills(name, domain, expert_name, expert_location)')
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
        expert: sk?.expert_name ? `${sk.expert_name}（${sk.expert_location || ''}）` : '',
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

    return NextResponse.json({
      ok: true,
      spaces,
      tiles,
      families: [...famCount.entries()].sort((a, b) => b[1] - a[1]),
      companies: (firms || []).map((c: any) => c.name).filter((n: string) => n && n.length <= 12),
      companyTotal: (firms || []).length,
    });
  } catch (e: any) {
    console.error('[Lab/landing]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
