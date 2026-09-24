/**
 * 导出 /report 用的静态数据快照 → src/data/report-data.json（公开报告页不连库）。
 *   npx tsx scripts/export-report-data.mts
 */
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');

async function all<T = any>(table: string, select: string, mod?: (q: any) => any): Promise<T[]> {
  const out: T[] = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(select).range(from, from + PAGE - 1);
    if (mod) q = mod(q);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[])); if (!data || data.length < PAGE) break;
  }
  return out;
}
const count = (rows: any[], f: (r: any) => string | null | undefined) => { const m: Record<string, number> = {}; for (const r of rows) { const k = f(r); if (k) m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
const filled = (v: any) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// ── 企业 ──
const companies = await all('companies', '*');
const fieldFill: Record<string, number> = {};
for (const c of companies) for (const [k, v] of Object.entries(c)) if (filled(v)) fieldFill[k] = (fieldFill[k] || 0) + 1;
const profiled = companies.filter(c => c.profile_crawled_at);
const scores = companies.map(c => Number(c.completeness_score) || 0);
const bucket = (s: number) => s >= 80 ? '80-100' : s >= 60 ? '60-79' : s >= 40 ? '40-59' : '0-39';
const tagged = companies.filter(c => Array.isArray(c.tags) && c.tags.some((t: string) => /高企/.test(t)));

// ── 信源 ──
const sources = await all('url_sources', 'company_id, company, url, type, subtype, health_status, verification_status, last_checked_at, title, url_health');
// 体检细分：alive / redirect / gone(404,410) / blocked(403,405,406,412,429) / server(5xx) / unreachable(超时、连不上)
const healthKind = (s: any) => { const h = s.url_health || {}; const c = Number(h.httpCode || 0); if (s.health_status === 'alive') return 'alive'; if (s.health_status === 'redirect') return 'redirect'; if (s.health_status !== 'dead') return 'unknown'; if (c === 404 || c === 410) return 'gone'; if ([401, 403, 405, 406, 412, 429].includes(c)) return 'blocked'; if (c >= 500) return 'server'; return 'unreachable'; };
const hosts = new Set(sources.map(s => host(s.url)).filter(Boolean));
const checked = sources.filter(s => s.health_status && s.health_status !== 'unknown');

// ── 画像流水线日志 ──
const logs = await all('company_crawl_logs', 'id, task_id, company_id, company, status, steps_done, markdown_len, pages_fetched, fields_filled, financings_saved, news_saved, executives_saved, completeness_before, completeness_after, llm_calls, token_total, cost_usd, model_id, error_message, started_at, finished_at, created_at');
const ok = logs.filter(l => l.status === 'success'), bad = logs.filter(l => l.status === 'failed');
const secs = ok.map(l => l.started_at && l.finished_at ? (new Date(l.finished_at).getTime() - new Date(l.started_at).getTime()) / 1000 : 0).filter(x => x > 0);
const errKind = (e: string) => /超时|timeout|abort/i.test(e) ? '超时' : /JSON/i.test(e) ? '模型返回坏 JSON' : /定位官方页面|找不到|未找到/.test(e) ? '找不到官网' : /抓取|fetch|403|反爬/i.test(e) ? '页面抓不到' : '其他';
const pagesFetched = logs.reduce((a, l) => a + (Array.isArray(l.pages_fetched) ? l.pages_fetched.length : 0), 0);
const pagesOk = logs.reduce((a, l) => a + (Array.isArray(l.pages_fetched) ? l.pages_fetched.filter((p: any) => p.ok).length : 0), 0);
const stepCount = count(logs.flatMap(l => l.steps_done || []), s => String(s).replace(/:.*/, ''));

// ── 批次 ──
const tasksRaw = await all('company_tasks', '*');
const batches = tasksRaw.map(t => { const its = logs.filter(l => l.task_id === t.id); const okIts = its.filter(l => l.status === 'success'); return { id: t.id, name: t.name, created_at: t.created_at, status: t.status, total: new Set(its.map(l => l.company_id)).size, completed: new Set(okIts.map(l => l.company_id)).size, cost_usd: its.reduce((a, l) => a + Number(l.cost_usd || 0), 0), runs: its.length, fields: okIts.reduce((a, l) => a + (l.fields_filled || []).length, 0), subs: okIts.reduce((a, l) => a + Number(l.financings_saved || 0) + Number(l.news_saved || 0) + Number(l.executives_saved || 0), 0), llmCalls: okIts.reduce((a, l) => a + Number(l.llm_calls || 0), 0), tokens: okIts.reduce((a, l) => a + Number(l.token_total || 0), 0), avgSeconds: Math.round(avg(okIts.map(l => l.started_at && l.finished_at ? (new Date(l.finished_at).getTime() - new Date(l.started_at).getTime()) / 1000 : 0).filter(x => x > 0))) }; }).filter(b => b.total > 0).sort((a, b) => a.created_at < b.created_at ? -1 : 1);

// ── 子实体 ──
const fin = await all('company_financings', 'company_id, finance_round, finance_amount, finance_enterprise, publish_date, publish_date_str, source_url');
const news = await all('company_news', 'company_id, description, publish_date, publish_date_str, publish_source, kind, source_url');
const execs = await all('company_executives', 'company_id, name, title, education, is_founder, description, source_url');
const products = await all('company_products', 'company_id, name, category, tech_keywords, kind, status, is_flagship, description');

// ── 岗位 / 赛事 / 技能空间 ──
const jobs = (await all('jobs', 'id, company_id, institute_or_company_name, name, job_type, program_name, location, responsibilities, accepts_overseas_students, completeness_score, status, source_url')).map(j => ({ ...j, company: j.institute_or_company_name, title: j.name }));
const comps = await all('competitions', 'id, name, organizer, kind, level, region, prize_total, reward_types, hardware_prize, offer_track, student_only, registration_deadline_str, official_url, theme');
const compSearches = await all('competition_searches', 'id');
const skills = await all('skills', 'id, name, source'); const spaces = await all('skill_tasks', 'id, title, sim, jd_snapshot'); const subs = await all('skill_submissions', 'id, candidate_type'); const invs = await all('skill_invocations', 'id, volume');

// ── 成本 ──
const usage = await all('token_usage_logs', 'tool_name, task_name, model_id, total_input_tokens, total_output_tokens, total_tokens, total_cost_usd, success, created_at');
const agg = (key: (r: any) => string) => { const m: Record<string, { calls: number; tokens: number; input: number; usd: number }> = {}; for (const r of usage) { const k = key(r) || '其他'; const x = m[k] || (m[k] = { calls: 0, tokens: 0, input: 0, usd: 0 }); x.calls++; x.tokens += Number(r.total_tokens || 0); x.input += Number(r.total_input_tokens || 0); x.usd += Number(r.total_cost_usd || 0); } return Object.entries(m).sort((a, b) => b[1].usd - a[1].usd); };

// ── 样本企业：完整度高、子实体多、类型有差异 ──
const byId = new Map(companies.map(c => [c.id, c]));
const subCount = (id: number) => ({ fin: fin.filter(x => x.company_id === id).length, news: news.filter(x => x.company_id === id).length, exec: execs.filter(x => x.company_id === id).length, prod: products.filter(x => x.company_id === id).length, src: sources.filter(x => x.company_id === id).length, jobs: jobs.filter(x => x.company_id === id).length });
const rich = companies.filter(c => (c.completeness_score || 0) >= 70).map(c => ({ c, n: subCount(c.id) })).map(x => ({ ...x, score: x.n.fin * 2 + x.n.news + x.n.exec + x.n.prod * 1.5 + x.n.src * 0.5 })).sort((a, b) => b.score - a.score);
const pick = (pred: (x: any) => boolean, used: Set<number>) => { const x = rich.find(r => !used.has(r.c.id) && pred(r)); if (x) used.add(x.c.id); return x; };
const used = new Set<number>();
const chosen = [pick(x => !!x.c.stock_code, used), pick(x => !x.c.stock_code && x.n.fin >= 2, used), pick(x => x.n.prod >= 3, used)].filter(Boolean) as any[];
while (chosen.length < 3) { const x = pick(() => true, used); if (!x) break; chosen.push(x); }
const sampleCompanies = chosen.map(({ c, n }) => {
  const log = ok.filter(l => l.company_id === c.id).sort((a, b) => b.created_at < a.created_at ? -1 : 1)[0];
  const keys = Object.entries(c).filter(([, v]) => filled(v)).map(([k]) => k);
  return {
    id: c.id, name: c.name, name_en: c.name_en, brief: c.one_sentence || c.description?.slice(0, 120) || '', industry: c.industry, sub_industry: c.sub_industry, city: c.hq_city || c.city, province: c.province, founded: c.founded_year || c.info_founding_year, employees: c.employee_count || c.company_employees, registered_capital: c.registered_capital, stock_code: c.stock_code, website: c.website || c.official_website, kind: c.kind, company_type: c.company_type, segment: c.segment, tags: c.tags,
    completeness: c.completeness_score, fieldsFilled: keys.length, counts: n,
    log: log ? { markdown_len: log.markdown_len, pages: Array.isArray(log.pages_fetched) ? log.pages_fetched.length : 0, pagesOk: Array.isArray(log.pages_fetched) ? log.pages_fetched.filter((p: any) => p.ok).length : 0, llm_calls: log.llm_calls, tokens: log.token_total, cost_usd: Number(log.cost_usd || 0), seconds: log.started_at && log.finished_at ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000) : null, before: log.completeness_before, after: log.completeness_after, steps: log.steps_done, model: log.model_id, fields: (log.fields_filled || []).length } : null,
    financings: fin.filter(x => x.company_id === c.id).slice(0, 5), news: news.filter(x => x.company_id === c.id).slice(0, 4), executives: execs.filter(x => x.company_id === c.id).slice(0, 5), products: products.filter(x => x.company_id === c.id).slice(0, 5),
    sources: sources.filter(x => x.company_id === c.id).slice(0, 8).map(s => ({ url: s.url, type: s.type, subtype: s.subtype, health: s.health_status, title: s.title })),
    highlights: { tech_advantage: c.tech_advantage, research_area: c.research_area, growth_signals: c.growth_signals, industry_position: c.industry_position, benefits_package: c.benefits_package, public_sentiment: c.public_sentiment, candidate_reputation: c.candidate_reputation, business_range: c.business_range, ai_comprehensive_evaluate: c.ai_comprehensive_evaluate, ai_admission_analysis: c.ai_admission_analysis },
  };
});

const withCompany = (rows: any[]) => rows.map(r => ({ ...r, company: byId.get(r.company_id)?.name || '' }));
const out = {
  generatedAt: new Date().toISOString(),
  companies: {
    total: companies.length, profiled: profiled.length, tagged: tagged.length,
    bySegment: count(companies, c => c.segment), byCompanyType: count(companies, c => c.company_type), byKind: count(companies, c => c.kind), byProvince: count(companies, c => c.province), byIndustry: count(companies, c => c.industry), byCity: count(companies, c => c.hq_city || c.city),
    withStock: companies.filter(c => c.stock_code).length, withWebsite: companies.filter(c => c.website || c.official_website).length,
    completeness: { avg: Math.round(avg(scores)), avgProfiled: Math.round(avg(profiled.map(c => Number(c.completeness_score) || 0))), buckets: count(companies, c => bucket(Number(c.completeness_score) || 0)) },
    fieldFill, fieldCount: Object.keys(companies[0] || {}).length,
    listed: { n: companies.filter(c => c.stock_code).length, avg: Math.round(avg(companies.filter(c => c.stock_code).map(c => Number(c.completeness_score) || 0))) },
    unlisted: { n: companies.filter(c => !c.stock_code && c.profile_crawled_at).length, avg: Math.round(avg(companies.filter(c => !c.stock_code && c.profile_crawled_at).map(c => Number(c.completeness_score) || 0))) },
    byTypeCompleteness: Object.fromEntries(Object.keys(count(companies, c => c.company_type)).map(k => [k, { n: companies.filter(c => c.company_type === k).length, avg: Math.round(avg(companies.filter(c => c.company_type === k).map(c => Number(c.completeness_score) || 0))) }])),
    withCampus: companies.filter(c => c.campus_url || c.careers_url).length, withCampusOverview: companies.filter(c => c.campus_overview).length, withEvaluate: companies.filter(c => c.ai_comprehensive_evaluate).length, withSentiment: companies.filter(c => c.public_sentiment).length, withBenefits: companies.filter(c => c.benefits_package).length, withReputation: companies.filter(c => c.candidate_reputation).length, withCoop: companies.filter(c => c.school_company_coop_exp).length,
  },
  sources: { total: sources.length, hosts: hosts.size, byType: count(sources, s => s.type), bySubtype: count(sources, s => s.subtype), health: count(sources, s => s.health_status), healthKinds: count(sources, healthKind), checked: checked.length, alive: checked.filter(s => s.health_status === 'alive' || s.health_status === 'redirect').length, dead: checked.filter(s => s.health_status === 'dead').length, gone: sources.filter(s => healthKind(s) === 'gone').length, blocked: sources.filter(s => healthKind(s) === 'blocked').length, unreachable: sources.filter(s => healthKind(s) === 'unreachable').length, serverErr: sources.filter(s => healthKind(s) === 'server').length, verified: count(sources, s => s.verification_status), companiesWithSources: new Set(sources.map(s => s.company_id).filter(Boolean)).size, perCompany: +(sources.length / Math.max(1, new Set(sources.map(s => s.company_id).filter(Boolean)).size)).toFixed(1) },
  pipeline: {
    runs: logs.length, success: ok.length, failed: bad.length, companiesDone: new Set(ok.map(l => l.company_id).filter(Boolean)).size,
    avgMarkdownLen: Math.round(avg(ok.map(l => Number(l.markdown_len) || 0))), pagesFetched, pagesOk, avgPagesPerCompany: +(pagesFetched / Math.max(1, logs.length)).toFixed(1),
    llmCalls: logs.reduce((a, l) => a + Number(l.llm_calls || 0), 0), tokens: logs.reduce((a, l) => a + Number(l.token_total || 0), 0), costUsd: logs.reduce((a, l) => a + Number(l.cost_usd || 0), 0), costUsdSuccess: ok.reduce((a, l) => a + Number(l.cost_usd || 0), 0),
    avgCostPerSuccess: +(ok.reduce((a, l) => a + Number(l.cost_usd || 0), 0) / Math.max(1, ok.length)).toFixed(4), avgSeconds: Math.round(avg(secs)), medianSeconds: secs.length ? secs.sort((a, b) => a - b)[Math.floor(secs.length / 2)] : 0,
    financingsSaved: ok.reduce((a, l) => a + Number(l.financings_saved || 0), 0), newsSaved: ok.reduce((a, l) => a + Number(l.news_saved || 0), 0), executivesSaved: ok.reduce((a, l) => a + Number(l.executives_saved || 0), 0),
    avgFieldsFilled: Math.round(avg(ok.map(l => (l.fields_filled || []).length))), completenessBefore: Math.round(avg(ok.filter(l => l.completeness_before !== null).map(l => Number(l.completeness_before)))), completenessAfter: Math.round(avg(ok.filter(l => l.completeness_after !== null).map(l => Number(l.completeness_after)))),
    errors: count(bad, l => errKind(String(l.error_message || ''))), byModel: count(logs, l => l.model_id), steps: stepCount,
  },
  batches,
  subs: {
    financings: { withSource: fin.filter(x => x.source_url).length, total: fin.length, withAmount: fin.filter(x => x.finance_amount).length, withDate: fin.filter(x => x.publish_date || x.publish_date_str).length, withInvestor: fin.filter(x => x.finance_enterprise).length, byRound: count(fin, x => x.finance_round), companies: new Set(fin.map(x => x.company_id)).size },
    news: { total: news.length, withDate: news.filter(x => x.publish_date || x.publish_date_str).length, byKind: count(news, x => x.kind), companies: new Set(news.map(x => x.company_id)).size, fresh: (() => { const now = Date.now(); const f = { m3: 0, m12: 0, older: 0 }; for (const n of news) { if (!n.publish_date) continue; const d = (now - new Date(n.publish_date).getTime()) / 86400000; if (d <= 92) f.m3++; else if (d <= 366) f.m12++; else f.older++; } return f; })(), withSource: news.filter(x => x.source_url).length },
    executives: { withSource: execs.filter(x => x.source_url).length, total: execs.length, withTitle: execs.filter(x => x.title).length, founders: execs.filter(x => x.is_founder).length, withEducation: execs.filter(x => x.education).length, companies: new Set(execs.map(x => x.company_id)).size },
    products: { total: products.length, flagship: products.filter(x => x.is_flagship).length, byCategory: count(products, x => x.category), byKind: count(products, x => x.kind), companies: new Set(products.map(x => x.company_id)).size },
  },
  jobs: { total: jobs.length, byType: count(jobs, j => j.job_type), withJd: jobs.filter(j => j.responsibilities).length, overseas: jobs.filter(j => j.accepts_overseas_students).length, programs: new Set(jobs.map(j => j.program_name).filter(Boolean)).size, companies: new Set(jobs.map(j => j.company_id).filter(Boolean)).size, avgCompleteness: Math.round(avg(jobs.map(j => Number(j.completeness_score) || 0))) },
  competitions: { total: comps.length, byKind: count(comps, c => c.kind), byLevel: count(comps, c => c.level), hardwarePrize: comps.filter(c => c.hardware_prize).length, offerTrack: comps.filter(c => c.offer_track).length, studentOnly: comps.filter(c => c.student_only).length, withDeadline: comps.filter(c => c.registration_deadline_str).length, withPrize: comps.filter(c => c.prize_total).length, searches: compSearches.length, organizers: new Set(comps.map(c => c.organizer).filter(Boolean)).size },
  lab: { skills: skills.length, expertSkills: skills.filter(s => s.source !== 'jd-draft').length, spaces: spaces.length, immersive: spaces.filter(s => s.sim?.art?.cover).length, bench: spaces.filter(s => (s.sim?.steps || []).some((x: any) => x.type === 'bench')).length, career: spaces.filter(s => s.jd_snapshot?.kind === 'career').length, submissions: subs.length, humanSubs: subs.filter(s => s.candidate_type === 'human').length, invocations: invs.length, served: invs.reduce((a, x) => a + (x.volume || 1), 0) },
  cost: { byTool: agg(r => r.tool_name).map(([k, v]) => ({ tool: k, ...v })), byModel: agg(r => r.model_id).map(([k, v]) => ({ model: k, ...v })), total: { calls: usage.length, tokens: usage.reduce((a, r) => a + Number(r.total_tokens || 0), 0), input: usage.reduce((a, r) => a + Number(r.total_input_tokens || 0), 0), usd: usage.reduce((a, r) => a + Number(r.total_cost_usd || 0), 0) } },
  samples: {
    companies: sampleCompanies,
    financings: withCompany(fin.filter(x => x.finance_amount && x.finance_round).slice(0, 10)),
    executives: withCompany(execs.filter(x => x.title).slice(0, 10)),
    news: withCompany(news.filter(x => x.publish_date_str).slice(0, 8)),
    products: withCompany(products.filter(x => x.category).slice(0, 10)),
    deadUrls: sources.filter(s => healthKind(s) === 'gone').slice(0, 6).map(s => ({ company: s.company, url: s.url, type: s.type, code: s.url_health?.httpCode })),
    competitions: comps.filter(c => c.prize_total || c.hardware_prize || c.offer_track).slice(0, 8),
    jobs: jobs.filter(j => j.responsibilities).slice(0, 6).map(j => ({ company: j.company, title: j.title, program: j.program_name, location: j.location, type: j.job_type })),
    topIndustries: Object.entries(count(companies, c => c.industry)).slice(0, 10), topProvinces: Object.entries(count(companies, c => c.province)).slice(0, 10),
  },
};
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/report-data.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ companies: out.companies.total, profiled: out.companies.profiled, sources: out.sources.total, hosts: out.sources.hosts, runs: out.pipeline.runs, success: out.pipeline.success, cost: out.pipeline.costUsd.toFixed(2), subs: { fin: fin.length, news: news.length, exec: execs.length, prod: products.length }, jobs: jobs.length, comps: comps.length, usageUsd: out.cost.total.usd.toFixed(2), samples: sampleCompanies.map(s => `${s.name}(${s.completeness})`) }, null, 1));
