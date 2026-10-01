import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { familyOf } from '@/lib/career-family';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 一个数字人所在的「行当」：同行是谁、这个职业此刻在招什么、它的上下游是哪些真实企业。
 *
 * 同行与在招是现查的（空间多了、岗位库更新了就跟着变）；
 * 产业链的环节划分要过一次大模型，所以算完缓存在 profile.ecosystem 里，之后直接读。
 * 关键在于：环节是模型给的，但每个环节下面挂的公司全部来自我们自己的企业库——
 * 培训模拟器长不出这一块，因为它不连真实产业数据。
 */
type Ctx = { params: Promise<{ id: string }> };

interface ChainNode { stage: string; what: string; keywords: string[] }
interface Chain { upstream: ChainNode[]; downstream: ChainNode[] }

/**
 * 拿环节关键词去企业库里捞真实公司。
 * 字段不同可信度不同：行业 / 产品领域里写着「半导体」是真做半导体，
 * 经营范围那种长文本里提一口就不算——所以打分排序，分不够的宁可不给。
 */
async function matchCompanies(keywords: string[], limit = 4) {
  const kws = [...new Set(keywords.filter(k => k && k.length >= 2).slice(0, 5))];
  if (!kws.length) return [];
  const FIELDS: [string, number][] = [['industry', 3], ['sub_industry', 3], ['product_area', 3], ['name', 2.5], ['company_specialties', 2], ['business_range', 1]];
  const or = kws.flatMap(k => FIELDS.map(([f]) => `${f}.ilike.%${k}%`)).join(',');
  const { data } = await supabaseAdmin.from('companies')
    .select('id, name, industry, sub_industry, product_area, company_specialties, business_range, one_sentence, city, province')
    .or(or).limit(60);
  const scored = (data || []).map((c: any) => {
    let sc = 0, strong = false;
    for (const k of kws) {
      // 一个词只算它命中的最可信那个字段，别让同一个词在五个字段里重复计分
      let best = 0;
      for (const [f, w] of FIELDS) if (String(c[f] || '').includes(k)) best = Math.max(best, w);
      if (best >= 2.5) strong = true;
      sc += best;
    }
    return { c, sc, strong };
  })
    // 必须有一个词落在行业 / 产品领域 / 公司名上——只是简介里提过一口的不算同行
    .filter(x => x.strong && x.sc >= 3)
    .sort((a, b) => b.sc - a.sc);
  const seen = new Set<string>();
  return scored.filter(x => { if (seen.has(x.c.name)) return false; seen.add(x.c.name); return true; })
    .slice(0, limit)
    .map(x => ({ id: x.c.id, name: x.c.name, industry: x.c.industry || x.c.sub_industry, city: x.c.city || x.c.province, one_sentence: x.c.one_sentence }));
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { data: space, error } = await supabaseAdmin
      .from('skill_tasks').select('id, profile, jd_snapshot, skill:skills(name, domain, expert_location)').eq('id', id).single();
    if (error) throw error;
    const skill: any = Array.isArray(space.skill) ? space.skill[0] : space.skill;
    const profile: any = space.profile || {};
    const jd: any = space.jd_snapshot || {};
    const profession = jd.career?.profession || jd.title || skill?.name || '';
    const family = familyOf(profession, skill?.domain, jd.title, jd.company);

    // ── 同行：同一个一级领域里的其他数字人 ──
    const { data: all } = await supabaseAdmin
      .from('skill_tasks').select('id, profile, jd_snapshot, skill:skills(name, domain)').neq('id', id).limit(200);
    const peers = (all || []).map((t: any) => {
      const s = Array.isArray(t.skill) ? t.skill[0] : t.skill;
      const p = t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || s?.name || '';
      return { id: t.id, name: t.profile?.name, role: t.profile?.role, avatar: t.profile?.avatar, profession: p, family: familyOf(p, s?.domain, t.jd_snapshot?.title) };
    }).filter(p => p.family === family && p.name).slice(0, 8);

    // ── 此刻在招：岗位库里和这个职业沾边的真实 JD ──
    const terms = [...new Set([profession, skill?.name, jd.title].filter(Boolean)
      .flatMap((s: string) => s.replace(/[（(].*?[)）]/g, '').split(/[·\s/、,，]+/)).filter((w: string) => w.length >= 2))].slice(0, 6);
    const jobOr = terms.flatMap(k => [`name.ilike.%${k}%`, `job_function.ilike.%${k}%`, `department.ilike.%${k}%`]).join(',');
    const { data: jobs } = jobOr
      ? await supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, city, province, location, education_requirement, link, source_url, status, graduation_year').or(jobOr).limit(40)
      : { data: [] as any[] };
    const cities = [...new Set((jobs || []).map((j: any) => j.city || j.location).filter(Boolean))];
    const firms = [...new Set((jobs || []).map((j: any) => j.institute_or_company_name).filter(Boolean))];
    const hiring = {
      total: (jobs || []).length,
      cities: cities.slice(0, 8),
      companies: firms.slice(0, 8),
      samples: (jobs || []).slice(0, 5).map((j: any) => ({ id: j.id, name: j.name, company: j.institute_or_company_name, city: j.city || j.location, edu: j.education_requirement, year: j.graduation_year, url: j.link || j.source_url })),
    };

    // ── 上下游：环节由模型划分，公司全部来自企业库 ──
    let chain: Chain | null = profile.ecosystem?.chain || null;
    if (!chain) {
      const r = await generateContent(`「${profession}」这个职业，在产业链上的上下游有哪些环节？
上游 = 给他提供原料 / 设备 / 服务的；下游 = 用他的产出、或者雇他的。各 2–3 个环节。
每个环节给：stage（环节名，4–8 字）、what（这个环节给他什么 / 拿走什么，一句话 20 字内）、
keywords（3–5 个词，每个只能 2–4 个字的行业核心词）。
keywords 要能在企业的「所属行业 / 产品领域 / 公司名」里原样出现，所以越短越好：
  好：「咖啡」「烘焙」「乳品」「半导体」「航天」「消防」「冷链」
  差：「咖啡豆烘焙加工」「商用咖啡机设备供应」（这种整句在数据库里一条也找不到）
返回 JSON：{ "upstream": [{"stage":"","what":"","keywords":[]}], "downstream": [{"stage":"","what":"","keywords":[]}] }`, 'gemini-3.8-flash', { jsonMode: true });
      await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Ecosystem · Chain', institution: '', model_id: 'gemini-3.8-flash', usageMetadata: r.usageMetadata, success: true }).catch(() => {});
      const p = parseJsonLoose(r.text);
      const norm = (arr: any): ChainNode[] => (Array.isArray(arr) ? arr : []).slice(0, 3).map((n: any) => ({
        stage: String(n.stage || '').slice(0, 20), what: String(n.what || '').slice(0, 60),
        keywords: (Array.isArray(n.keywords) ? n.keywords : []).map((k: any) => String(k).slice(0, 20)).slice(0, 5),
      })).filter(n => n.stage);
      chain = { upstream: norm(p.upstream), downstream: norm(p.downstream) };
      await supabaseAdmin.from('skill_tasks').update({ profile: { ...profile, ecosystem: { chain, at: new Date().toISOString() } } }).eq('id', id);
    }

    const withFirms = async (nodes: ChainNode[]) =>
      Promise.all(nodes.map(async n => ({ ...n, companies: await matchCompanies(n.keywords) })));
    const [upstream, downstream] = await Promise.all([withFirms(chain.upstream), withFirms(chain.downstream)]);

    return NextResponse.json({ ok: true, family, profession, peers, hiring, chain: { upstream, downstream } });
  } catch (e: any) {
    console.error('[Lab/ecosystem]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
