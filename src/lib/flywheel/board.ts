/**
 * 飞轮看板的计算：四个口径各自的热度（需求）、供给（库里有多少、多新）、缺口。
 *
 * 热度 = 窗口内信号的加权和（权重见 sources.ts）；趋势 = 近 7 天对比再往前 7 天。
 * 缺口 = 热但薄 / 热但旧：企业看「有没有在招岗位、多久没刷新、有没有招聘入口、画像完整度」，
 * 行业 / 职能 / 职业领域看「库里的企业数、在招岗位数、职业空间数」。
 *
 * 现在信号量小，直接读明细在内存里算；ToC 起量后换成按天汇总的物化视图，接口形状不变。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { familyOf } from '@/lib/career-family';
import { SOURCES } from '@/lib/flywheel/sources';
import { aliasMap, industryOfCompany } from '@/lib/flywheel/signals';

export type Dim = 'industry' | 'job_function' | 'career_family' | 'company';

export interface BoardRow {
  key: string;
  label: string;
  heat7: number;
  heatPrev7: number;
  heat30: number;
  signals30: number;
  web30: number;                    // 其中来自联网前瞻信号的分
  sources: Record<string, number>;  // 来源 → 分
  supply: Record<string, number | string | boolean | null>;
  gap: number;                      // 缺口分：越大越该补
  reasons: string[];
  tags?: string[];
}

const DAY = 86_400_000;
const isBig = (c: any) => !!c.fortune_global_rank || (c.company_employees || 0) >= 1000 || /1000|2000|5000|10000|万人|大型/.test(String(c.company_scale || ''));

export async function computeBoard(now = Date.now()) {
  const since30 = new Date(now - 30 * DAY).toISOString();
  const [{ data: sigs }, { data: companies }, { data: jobs }, { data: spaces }, aliases] = await Promise.all([
    selectAll(() => supabaseAdmin.from('demand_signals')
      .select('source, weight, industry, job_function, career_family, profession, company_id, company_name, created_at')
      .gte('created_at', since30).order('id')),
    selectAll(() => supabaseAdmin.from('companies')
      .select('id, name, industry, sub_industry, campus_url, careers_url, completeness_score, company_employees, company_scale, fortune_global_rank, segment')
      .order('id')),
    selectAll(() => supabaseAdmin.from('jobs').select('company_id, job_function, status, last_seen_at, updated_at').order('id')),
    selectAll(() => supabaseAdmin.from('skill_tasks').select('jd_snapshot, skill:skills(name, domain)').order('created_at')),
    aliasMap(),
  ]);

  // ── 供给 ──
  const compById = new Map<number, any>();
  const indSupply = new Map<string, { companies: number; withLink: number; openJobs: number; big: number }>();
  for (const c of companies as any[]) {
    const ind = industryOfCompany(c, aliases) || '其他';
    c._industry = ind;
    c._openJobs = 0; c._lastSeen = 0;
    compById.set(c.id, c);
    const s = indSupply.get(ind) || { companies: 0, withLink: 0, openJobs: 0, big: 0 };
    s.companies++; if (c.campus_url || c.careers_url) s.withLink++; if (isBig(c)) s.big++;
    indSupply.set(ind, s);
  }
  const fnSupply = new Map<string, { openJobs: number; fresh14: number }>();
  for (const j of jobs as any[]) {
    const open = j.status === 'open';
    const seen = Date.parse(j.last_seen_at || j.updated_at || '') || 0;
    const c = compById.get(j.company_id);
    if (c && open) { c._openJobs++; c._lastSeen = Math.max(c._lastSeen, seen); indSupply.get(c._industry)!.openJobs++; }
    const fn = j.job_function || '其他';
    const s = fnSupply.get(fn) || { openJobs: 0, fresh14: 0 };
    if (open) { s.openJobs++; if (now - seen < 14 * DAY) s.fresh14++; }
    fnSupply.set(fn, s);
  }
  const famSupply = new Map<string, { spaces: number; professions: Set<string> }>();
  for (const t of spaces as any[]) {
    const sk = Array.isArray(t.skill) ? t.skill[0] : t.skill;
    const prof = t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || sk?.name || '';
    const fam = familyOf(prof, sk?.domain, t.jd_snapshot?.title);
    const s = famSupply.get(fam) || { spaces: 0, professions: new Set<string>() };
    s.spaces++; if (prof) s.professions.add(prof);
    famSupply.set(fam, s);
  }

  // ── 热度 ──
  const acc: Record<Dim, Map<string, BoardRow>> = { industry: new Map(), job_function: new Map(), career_family: new Map(), company: new Map() };
  const professions = new Map<string, number>();
  const touch = (dim: Dim, key: string, label: string, w: number, src: string, age: number) => {
    const m = acc[dim];
    const r = m.get(key) || { key, label, heat7: 0, heatPrev7: 0, heat30: 0, signals30: 0, web30: 0, sources: {}, supply: {}, gap: 0, reasons: [] };
    r.heat30 += w; r.signals30++;
    if (age < 7 * DAY) r.heat7 += w; else if (age < 14 * DAY) r.heatPrev7 += w;
    if (SOURCES[src]?.group === 'web') r.web30 += w;
    r.sources[src] = (r.sources[src] || 0) + w;
    m.set(key, r);
  };
  for (const s of sigs as any[]) {
    const w = Number(s.weight) || 1, age = now - Date.parse(s.created_at);
    if (s.industry) touch('industry', s.industry, s.industry, w, s.source, age);
    if (s.job_function) touch('job_function', s.job_function, s.job_function, w, s.source, age);
    if (s.career_family) touch('career_family', s.career_family, s.career_family, w, s.source, age);
    if (s.company_id || s.company_name) {
      const key = s.company_id ? `id:${s.company_id}` : `name:${s.company_name}`;
      touch('company', key, compById.get(s.company_id)?.name || s.company_name, w, s.source, age);
    }
    if (s.profession) professions.set(s.profession, (professions.get(s.profession) || 0) + w);
  }

  // ── 供给 + 缺口 ──
  const round = (n: number) => Math.round(n * 10) / 10;
  for (const r of acc.industry.values()) {
    const s = indSupply.get(r.key) || { companies: 0, withLink: 0, openJobs: 0, big: 0 };
    r.supply = { companies: s.companies, withLink: s.withLink, openJobs: s.openJobs, big: s.big };
    const linkRate = s.companies ? s.withLink / s.companies : 0;
    r.gap = round(r.heat30 / (1 + s.openJobs / 30) * (1.5 - linkRate));
    if (s.companies < 10) r.reasons.push(`库里只有 ${s.companies} 家企业`);
    if (s.companies && linkRate < 0.5) r.reasons.push(`${s.companies - s.withLink} 家没有招聘入口`);
    if (s.openJobs < 30) r.reasons.push(`在招岗位只有 ${s.openJobs} 个`);
  }
  for (const r of acc.job_function.values()) {
    const s = fnSupply.get(r.key) || { openJobs: 0, fresh14: 0 };
    r.supply = { openJobs: s.openJobs, fresh14: s.fresh14 };
    r.gap = round(r.heat30 / (1 + s.fresh14 / 20));
    if (s.openJobs < 20) r.reasons.push(`在招岗位只有 ${s.openJobs} 个`);
    if (s.openJobs && s.fresh14 / s.openJobs < 0.5) r.reasons.push(`近 14 天刷新过的只有 ${s.fresh14} 个`);
  }
  for (const r of acc.career_family.values()) {
    const s = famSupply.get(r.key);
    r.supply = { spaces: s?.spaces || 0, professions: s?.professions.size || 0 };
    r.gap = round(r.heat30 / (1 + (s?.spaces || 0) / 3));
    if (!s?.spaces) r.reasons.push('还没有这个领域的职业空间');
  }
  for (const r of acc.company.values()) {
    const id = r.key.startsWith('id:') ? Number(r.key.slice(3)) : null;
    const c = id ? compById.get(id) : null;
    if (!c) {
      r.supply = { inLibrary: false };
      r.gap = round(r.heat30 * 2);
      r.reasons.push('还没进企业库');
      continue;
    }
    const staleDays = c._lastSeen ? Math.floor((now - c._lastSeen) / DAY) : null;
    r.supply = { id: c.id, inLibrary: true, industry: c._industry, openJobs: c._openJobs, staleDays, campus: !!c.campus_url, careers: !!c.careers_url, completeness: c.completeness_score ?? null };
    r.tags = [isBig(c) ? '大企业' : '', c.segment === 'overseas_top' ? '海外百强' : ''].filter(Boolean);
    let f = 0;
    if (!c._openJobs) { f += 1; r.reasons.push('没有在招岗位'); }
    else if (staleDays !== null && staleDays > 7) { f += 0.6; r.reasons.push(`岗位 ${staleDays} 天没刷新`); }
    if (!c.campus_url && !c.careers_url) { f += 0.8; r.reasons.push('没有招聘入口'); }
    if ((c.completeness_score ?? 0) < 60) { f += 0.4; r.reasons.push(`画像完整度 ${c.completeness_score ?? 0}`); }
    r.gap = round(r.heat30 * f);
  }

  const sortRows = (m: Map<string, BoardRow>) => [...m.values()].sort((a, b) => b.heat30 - a.heat30);
  const dims = { industry: sortRows(acc.industry), job_function: sortRows(acc.job_function), career_family: sortRows(acc.career_family), company: sortRows(acc.company) };
  const totals = { signals30: (sigs as any[]).length, heat30: round((sigs as any[]).reduce((a, s) => a + (Number(s.weight) || 1), 0)), companies: (companies as any[]).length, openJobs: (jobs as any[]).filter((j: any) => j.status === 'open').length, spaces: (spaces as any[]).length };
  const topProfessions = [...professions].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, heat]) => ({ name, heat: round(heat) }));
  return { dims, totals, topProfessions, compById };
}
