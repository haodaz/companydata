import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { featuredIndex } from '@/lib/lab-featured';
import { familyOf } from '@/lib/career-family';
import { labError } from '@/lib/skill-lab-server';
import { matchCompanies } from '@/lib/lab-ecosystem';

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

    // ── 同行：同一个一级领域里的其他数字人。只列点得开的（有已发布章节），精选的、有工位的排前面 ──
    const [{ data: all }, { data: pubCh }] = await Promise.all([
      supabaseAdmin.from('skill_tasks').select('id, profile, jd_snapshot, skill:skills(name, domain)').neq('id', id).limit(300),
      supabaseAdmin.from('lab_chapters').select('task_id').eq('status', 'published'),
    ]);
    const pubCount = new Map<string, number>();
    for (const c of pubCh || []) pubCount.set(c.task_id, (pubCount.get(c.task_id) || 0) + 1);
    const peers = (all || []).map((t: any) => {
      const s = Array.isArray(t.skill) ? t.skill[0] : t.skill;
      const p = t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || s?.name || '';
      return { id: t.id, name: t.profile?.name, role: t.profile?.role, avatar: t.profile?.avatar, profession: p, family: familyOf(p, s?.domain, t.jd_snapshot?.title), chapters: pubCount.get(t.id) || 0 };
    }).filter(p => p.family === family && p.name && p.chapters > 0)
      .sort((a, b) => { const fa = featuredIndex(a.id), fb = featuredIndex(b.id); return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb) || b.chapters - a.chapters; })
      .slice(0, 10);

    // ── 此刻在招（一）直接对口：岗位库里和这个职业沾边的真实 JD。职业名之外再拆出核心词（火箭总装工程师 → 火箭总装 / 总装） ──
    const base = [profession, profile.role, skill?.name, jd.title].filter(Boolean).flatMap((s: string) => s.replace(/[（(].*?[)）]/g, '').split(/[·\s/、,，]+/));
    const core = base.map((w: string) => w.replace(/(工程师|技术员|操作工|管理员|值班员|调度员|施工员|师傅|技师|助理|主管|专员|老师|教师|教练|医师|医生|护士|师|员|工)$/, ''));
    const terms = [...new Set([...base, ...core].filter((w: string) => w.length >= 2))].slice(0, 8);
    const jobOr = terms.flatMap(k => [`name.ilike.%${k}%`, `job_function.ilike.%${k}%`, `department.ilike.%${k}%`]).join(',');
    const JOB_COLS = 'id, name, institute_or_company_name, company_id, city, province, location, education_requirement, link, source_url, status, graduation_year';
    const { data: jobs } = jobOr ? await supabaseAdmin.from('jobs').select(JOB_COLS).or(jobOr).order('id', { ascending: false }).limit(80) : { data: [] as any[] };
    const job = (j: any, extra: Record<string, any> = {}) => ({ id: j.id, name: j.name, company: j.institute_or_company_name, city: j.city || j.location, edu: j.education_requirement, year: j.graduation_year, url: j.link || j.source_url, ...extra });

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
      await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Ecosystem · Chain', institution: '', model_id: 'gemini-3.8-flash', usageMetadata: r.usageMetadata, success: true, space_id: id, stage: 'use' }).catch(() => {});
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

    // ── 此刻在招（二）上下游企业在招：上面那些真实公司正在招的岗位（万物相连：从一个职业连到一条产业链上的机会） ──
    const firmStage = new Map<number, string>();
    for (const [side, nodes] of [['上游', upstream], ['下游', downstream]] as const) for (const n of nodes) for (const c of n.companies) if (!firmStage.has(c.id)) firmStage.set(c.id, `${side} · ${n.stage}`);
    const { data: chainJobs } = firmStage.size ? await supabaseAdmin.from('jobs').select(JOB_COLS).in('company_id', [...firmStage.keys()]).order('id', { ascending: false }).limit(200) : { data: [] as any[] };
    // 岗位按城市拆成了多行：同一家同一个岗位名合成一条、城市并起来；上下游按公司轮流取（每家最多 3 条），别让一家刷屏
    const merge = (rows: any[], extra: (j: any) => Record<string, any> = () => ({})) => {
      const m = new Map<string, any>();
      for (const j of rows) { const k = `${j.institute_or_company_name}|${j.name}`; const c = j.city || j.location; const cur = m.get(k); if (cur) { if (c && !cur.cities.includes(c)) cur.cities.push(c); } else m.set(k, { ...job(j, extra(j)), cities: c ? [c] : [] }); }
      return [...m.values()].map(x => ({ ...x, city: x.cities.slice(0, 3).join(' / ') + (x.cities.length > 3 ? ` 等 ${x.cities.length} 城` : '') }));
    };
    const roundRobin = (list: any[], per = 3) => {
      const by = new Map<string, any[]>(); for (const x of list) by.set(x.company, [...(by.get(x.company) || []), x]);
      const out: any[] = []; for (let r = 0; r < per; r++) for (const l of by.values()) if (l[r]) out.push(l[r]);
      return out;
    };
    const direct = merge(jobs || []);
    const directKeys = new Set(direct.map(j => `${j.company}|${j.name}`));
    const viaChain = roundRobin(merge(chainJobs || [], (j: any) => ({ stage: firmStage.get(j.company_id) })).filter(j => !directKeys.has(`${j.company}|${j.name}`)));
    const allJobs = [...(jobs || []), ...(chainJobs || [])];
    const cities = [...new Set(allJobs.map((j: any) => j.city || j.location).filter(Boolean))];
    const firms = [...new Set(allJobs.map((j: any) => j.institute_or_company_name).filter(Boolean))];
    const hiring = {
      total: direct.length + viaChain.length, direct: direct.length, chain: viaChain.length,
      cities: cities.slice(0, 12), companies: firms.slice(0, 12),
      samples: direct.slice(0, 12), chainSamples: viaChain.slice(0, 12),
    };

    return NextResponse.json({ ok: true, family, profession, peers, hiring, chain: { upstream, downstream } });
  } catch (e: any) {
    console.error('[Lab/ecosystem]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
