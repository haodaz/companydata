/** /invest 的数据：全量读企业 + 融资 + 在招岗位（10 分钟缓存），各视图都在内存里算 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { cachedStats } from '@/lib/db-stats';
import { regionName } from '@/lib/region-codes';
import { CHAINS, STAGES, classify, notFinancing, parseInvestors, roundName, stageOf, type StageKey } from './taxonomy';

type Co = { id: number; name: string; industry: string | null; sub_industry: string | null; one_sentence: string | null; product_area: string | null; country: string | null; province: string | null; city: string | null; company_type: string | null; stock_code: string | null; info_founding_year: number | null; registered_capital: string | null; supplier_categories: string[] | null; logo_url: string | null; chains: { chain: string; node: string | null }[] };
type Fin = { company_id: number; round: string; stage: StageKey; amount: string | null; date: string | null; year: number | null; investors: string[]; source_url: string | null };
const SAR: Record<string, string> = { '344': '香港', '446': '澳门', '158': '台湾' };
const short = (s: string) => s.replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, '');
const placeOf = (c: Co) => SAR[c.country || ''] || (c.country === '156' && c.province ? short(regionName('province', c.province)) : c.country === '156' ? null : '海外');

async function base() {
  return cachedStats('invest:base:2', async () => {
    const { data: cs, error } = await selectAll(() => db.from('companies').select('id, name, industry, sub_industry, one_sentence, product_area, country, province, city, company_type, stock_code, info_founding_year, registered_capital, supplier_categories, logo_url, human_review_status').not('if_delete', 'is', true).order('id'));
    if (error) throw error;
    const cos = (cs as any[]).filter(c => !['hidden', 'rejected'].includes(c.human_review_status || '')).map(c => ({ ...c, chains: classify(c) })) as Co[];
    const byId = new Map(cos.map(c => [c.id, c]));
    const { data: fs } = await selectAll(() => db.from('company_financings').select('company_id, finance_round, finance_round_str, finance_amount, finance_enterprise, publish_date, source_url').not('if_delete', 'is', true).order('id'));
    const nowY = new Date().getFullYear();
    const rawFins: Fin[] = (fs as any[]).filter(f => byId.has(f.company_id)).map(f => {
      const y = f.publish_date ? Number(String(f.publish_date).slice(0, 4)) : null;
      return { company_id: f.company_id, round: roundName(f.finance_round, f.finance_round_str), stage: stageOf(f.finance_round, f.finance_round_str), amount: /\d|数/.test(f.finance_amount || '') ? f.finance_amount : null, date: y && y <= nowY ? f.publish_date : null, year: y && y <= nowY ? y : null, investors: parseInvestors(f.finance_enterprise), source_url: f.source_url };
    }).filter(f => !notFinancing(f.round));
    const { data: js } = await selectAll(() => db.from('jobs').select('company_id, created_at').eq('status', 'open').not('if_delete', 'is', true).order('id'));
    const jobs = new Map<number, { open: number; d30: number }>(), cut = Date.now() - 30 * 864e5;
    for (const j of js as any[]) { if (!j.company_id) continue; const v = jobs.get(j.company_id) || { open: 0, d30: 0 }; v.open++; if (new Date(j.created_at).getTime() > cut) v.d30++; jobs.set(j.company_id, v); }
    // 同一笔融资常被不同来源各记一条：同一家企业、同一阶段，金额相同或同一个月的并成一起，投资方取并集，优先留有日期的
    const finBy = new Map<number, Fin[]>();
    for (const f of [...rawFins].sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))) {
      const list = finBy.get(f.company_id) || [];
      const same = list.find(x => x.stage === f.stage && ((x.amount && x.amount === f.amount) || (x.date && f.date && x.date.slice(0, 7) === f.date.slice(0, 7)) || (!f.date && !f.amount)));
      if (same) { same.investors = [...new Set([...same.investors, ...f.investors])]; same.amount = same.amount || f.amount; same.source_url = same.source_url || f.source_url; } else list.push({ ...f });
      finBy.set(f.company_id, list);
    }
    const fins = [...finBy.values()].flat();
    const Y0 = nowY - 7;
    const chains = CHAINS.map(ch => { const list = cos.filter(c => c.chains.some(x => x.chain === ch.key)), ev = list.flatMap(c => finBy.get(c.id) || []); return { key: ch.key, name: ch.name, companies: list.length, events: ev.length, recent: ev.filter(f => (f.date || '') >= `${nowY - 3}`).length, jobs: list.reduce((s, c) => s + (jobs.get(c.id)?.open || 0), 0), spark: Array.from({ length: nowY - Y0 + 1 }, (_, i) => ev.filter(f => f.year === Y0 + i).length) }; });
    return { cos, byId, fins, jobs, finBy, chains };
  }, 600_000);
}

const inChain = (c: Co, chain: string, node?: string | null) => chain === 'all' || c.chains.some(x => x.chain === chain && (!node || x.node === node));
const tally = (a: string[]) => { const m = new Map<string, number>(); for (const k of a) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1]); };
const emptyStages = () => Object.fromEntries([...STAGES.map(s => s.key), 'other'].map(k => [k, 0])) as Record<StageKey, number>;
const chainLabel = (k: string) => k === 'all' ? '全库' : CHAINS.find(c => c.key === k)?.name || k;
const row = (c: Co, b: Awaited<ReturnType<typeof base>>) => { const f = b.finBy.get(c.id) || [], j = b.jobs.get(c.id); const invs = [...new Set(f.flatMap(x => x.investors))]; return { id: c.id, name: c.name, logo: c.logo_url, sub: c.sub_industry || c.industry, place: placeOf(c) === '海外' ? regionName('country', c.country) : [placeOf(c), c.city ? short(regionName('city', c.city)) : ''].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '), founded: c.info_founding_year, listed: !!c.stock_code || c.company_type === 'public', stock: c.stock_code, lastRound: f[0]?.round || null, lastDate: f[0]?.date || null, investors: invs.slice(0, 3), events: f.length, jobs: j?.open || 0, jobs30: j?.d30 || 0 }; };

export async function overview(chain: string) {
  const b = await base();
  const cs = b.cos.filter(c => inChain(c, chain)), ids = new Set(cs.map(c => c.id)), fs = b.fins.filter(f => ids.has(f.company_id));
  const nowY = new Date().getFullYear(), years: { y: number; total: number; stages: Record<StageKey, number> }[] = [];
  for (let y = 2015; y <= nowY; y++) { const stages = emptyStages(); let total = 0; for (const f of fs) if (f.year === y) { stages[f.stage]++; total++; } years.push({ y, total, stages }); }
  const stageTotals = emptyStages(); for (const f of fs) stageTotals[f.stage]++;
  const prov = new Map<string, { companies: number; events: number }>();
  for (const c of cs) { const p = placeOf(c); if (!p) continue; const v = prov.get(p) || { companies: 0, events: 0 }; v.companies++; v.events += b.finBy.get(c.id)?.length || 0; prov.set(p, v); }
  const invEvents = new Map<string, Record<StageKey, number>>();
  for (const f of fs) for (const n of f.investors) { const v = invEvents.get(n) || emptyStages(); v[f.stage]++; invEvents.set(n, v); }
  const cut3 = `${nowY - 3}`, invCo = new Map<string, Set<number>>(), invRecent = new Map<string, number>();
  for (const f of fs) for (const n of f.investors) { invCo.set(n, (invCo.get(n) || new Set()).add(f.company_id)); if ((f.date || '') >= cut3) invRecent.set(n, (invRecent.get(n) || 0) + 1); }
  const topInvestors = [...invEvents.entries()].map(([name, st]) => ({ name, stages: st, total: Object.values(st).reduce((s, n) => s + n, 0), companies: invCo.get(name)?.size || 0, recent: invRecent.get(name) || 0 })).sort((x, y) => y.total - x.total).slice(0, 15);
  const provinces = [...prov.entries()].map(([name, v]) => ({ name, ...v })).sort((x, y) => y.events - x.events || y.companies - x.companies);
  const dom = provinces.filter(p => p.name !== '海外'), domEv = dom.reduce((s, p) => s + p.events, 0);
  const staged = STAGES.map(s => ({ n: s.name, v: stageTotals[s.key] })).sort((x, y) => y.v - x.v), stagedSum = staged.reduce((s, x) => s + x.v, 0);
  const label = chainLabel(chain);
  const insight = fs.length < 5 ? [`${label}目前公开融资事件太少，不做结论。`] : [
    domEv ? `${label}样本里，${Math.round(dom.slice(0, 3).reduce((s, p) => s + p.events, 0) / domEv * 100)}% 的国内融资事件发生在${dom.slice(0, 3).map(p => p.name).join('、')}。` : '',
    stagedSum ? `轮次集中在${staged.slice(0, 2).map(s => s.n).join('、')}，合计占 ${Math.round((staged[0].v + staged[1].v) / stagedSum * 100)}%。` : '',
    topInvestors.length >= 3 ? `出手最多的是${topInvestors.slice(0, 3).map(t => t.name).join('、')}。` : '',
  ].filter(Boolean);
  const cut36 = `${nowY - 3}`;
  const ch = CHAINS.find(c => c.key === chain);
  const stages = ch?.stages.map(s => ({ name: s.name, nodes: s.nodes.map(n => {
    const nc = cs.filter(c => c.chains.some(x => x.chain === chain && x.node === n.key));
    const nf = nc.flatMap(c => b.finBy.get(c.id) || []);
    return { key: n.key, name: n.name, companies: nc.length, events: nf.length, recent: nf.filter(f => (f.date || '') >= cut36).length, funded: nc.filter(c => b.finBy.has(c.id)).length, jobs: nc.reduce((s, c) => s + (b.jobs.get(c.id)?.open || 0), 0) };
  }) })) || [];
  const recent = fs.filter(f => f.date).sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 10).map(f => ({ id: f.company_id, name: b.byId.get(f.company_id)!.name, round: f.round, stage: f.stage, date: f.date, amount: f.amount, investors: f.investors.slice(0, 3) }));
  const hiring = cs.map(c => ({ c, j: b.jobs.get(c.id) })).filter(x => x.j?.open).sort((x, y) => y.j!.open - x.j!.open).slice(0, 8).map(x => ({ id: x.c.id, name: x.c.name, open: x.j!.open, d30: x.j!.d30, funded: b.finBy.has(x.c.id) }));
  return { label, kpi: { companies: cs.length, funded: cs.filter(c => b.finBy.has(c.id)).length, events: fs.length, investors: invEvents.size, listed: cs.filter(c => c.stock_code || c.company_type === 'public').length, unfunded: cs.filter(c => !b.finBy.has(c.id) && !c.stock_code && c.company_type !== 'public').length, recent: fs.filter(f => (f.date || '') >= cut3).length, jobs: cs.reduce((s, c) => s + (b.jobs.get(c.id)?.open || 0), 0) }, years, stageTotals, provinces, topInvestors, insight, stages, recent, hiring, chains: b.chains };
}

export async function companies(q: { chain: string; node?: string; place?: string; investor?: string; tab?: string; q?: string; sort?: string; page: number }) {
  const b = await base();
  let list = b.cos.filter(c => inChain(c, q.chain, q.node));
  if (q.place) list = list.filter(c => placeOf(c) === q.place);
  if (q.investor) { const ids = new Set(b.fins.filter(f => f.investors.includes(q.investor!)).map(f => f.company_id)); list = list.filter(c => ids.has(c.id)); }
  if (q.tab === 'listed') list = list.filter(c => c.stock_code || c.company_type === 'public');
  if (q.tab === 'funded') list = list.filter(c => b.finBy.has(c.id) && !c.stock_code && c.company_type !== 'public');
  if (q.tab === 'unfunded') list = list.filter(c => !b.finBy.has(c.id) && !c.stock_code && c.company_type !== 'public');
  if (q.q) { const k = q.q.toLowerCase(); list = list.filter(c => `${c.name} ${c.sub_industry || ''} ${c.industry || ''}`.toLowerCase().includes(k)); }
  const lastDate = (c: Co) => b.finBy.get(c.id)?.[0]?.date || '';
  if (q.sort === 'jobs') list.sort((x, y) => (b.jobs.get(y.id)?.open || 0) - (b.jobs.get(x.id)?.open || 0));
  else if (q.sort === 'founded') list.sort((x, y) => (y.info_founding_year || 0) - (x.info_founding_year || 0));
  else list.sort((x, y) => lastDate(y).localeCompare(lastDate(x)) || (b.finBy.get(y.id)?.length || 0) - (b.finBy.get(x.id)?.length || 0));
  const size = 20;
  return { total: list.length, page: q.page, size, rows: list.slice((q.page - 1) * size, q.page * size).map(c => row(c, b)) };
}

export async function investor(name: string) {
  const b = await base();
  const fs = b.fins.filter(f => f.investors.includes(name));
  const stages = emptyStages(); for (const f of fs) stages[f.stage]++;
  const ids = [...new Set(fs.map(f => f.company_id))];
  const co = new Map<string, Set<number>>();
  for (const f of fs) for (const n of f.investors) if (n !== name) co.set(n, (co.get(n) || new Set()).add(f.company_id));
  const peers = [...co.entries()].map(([n, s]) => ({ name: n, shared: s.size, companies: [...s].slice(0, 4).map(i => b.byId.get(i)!.name) })).sort((x, y) => y.shared - x.shared).slice(0, 12);
  const nowY = new Date().getFullYear(), years = Array.from({ length: nowY - 2014 }, (_, i) => { const st = emptyStages(); let total = 0; for (const f of fs) if (f.year === 2015 + i) { st[f.stage]++; total++; } return { y: 2015 + i, total, stages: st }; });
  const cs = ids.map(i => b.byId.get(i)!);
  const portfolio = ids.map(i => { const c = b.byId.get(i)!; const f = fs.filter(x => x.company_id === i).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))[0]; return { ...row(c, b), myRound: f.round, myDate: f.date }; }).sort((x, y) => String(y.myDate || '').localeCompare(String(x.myDate || '')));
  return { name, events: fs.length, companies: ids.length, stages, years, peers, portfolio: portfolio.slice(0, 40), sectors: tally(cs.flatMap(c => c.chains.map(x => chainLabel(x.chain)))).slice(0, 6), places: tally(cs.map(c => placeOf(c)).filter(Boolean) as string[]).slice(0, 6) };
}

export async function company(id: number) {
  const b = await base();
  const c = b.byId.get(id); if (!c) return null;
  const [{ data: full }, { data: ex }, { data: pr }, { data: nw }] = await Promise.all([
    db.from('companies').select('official_website, introduction, growth_signals, tech_advantage, profile_source, external_id').eq('id', id).single(),
    db.from('company_executives').select('name, title, source_url').eq('company_id', id).not('if_delete', 'is', true).limit(8),
    db.from('company_products').select('name, source_url').eq('company_id', id).not('if_delete', 'is', true).limit(8),
    db.from('company_news').select('description, publish_date, source_url').eq('company_id', id).not('if_delete', 'is', true).order('publish_date', { ascending: false, nullsFirst: false }).limit(6),
  ]);
  return { ...row(c, b), chains: c.chains.map(x => chainLabel(x.chain)), capital: c.registered_capital, site: full?.official_website, intro: c.one_sentence || full?.introduction, growth: full?.growth_signals, tech: full?.tech_advantage, sources: full?.profile_source, finances: (b.finBy.get(id) || []).map(f => ({ round: f.round, stage: f.stage, date: f.date, amount: f.amount, investors: f.investors, source: f.source_url })), execs: ex || [], products: pr || [], news: nw || [] };
}

/** 给 AI 助理用的几个查询 */
export async function findCompany(q: { id?: number; name?: string }) {
  const b = await base();
  if (q.id && b.byId.has(q.id)) return { id: q.id, candidates: [] as { id: number; name: string }[] };
  const k = String(q.name || '').trim().toLowerCase(); if (!k) return { id: null, candidates: [] };
  const exact = b.cos.find(c => c.name.toLowerCase() === k); if (exact) return { id: exact.id, candidates: [] };
  const hits = b.cos.filter(c => c.name.toLowerCase().includes(k)).slice(0, 8);
  return hits.length === 1 ? { id: hits[0].id, candidates: [] } : { id: null, candidates: hits.map(c => ({ id: c.id, name: c.name })) };
}
export async function companyNames(ids: number[]) { const b = await base(); return new Map(ids.map(i => [i, b.byId.get(i)?.name || ''])); }
export async function searchInvestors(q: { q?: string; chain?: string; limit?: number }) {
  const b = await base(), ids = q.chain && q.chain !== 'all' ? new Set(b.cos.filter(c => inChain(c, q.chain!)).map(c => c.id)) : null, k = String(q.q || '').toLowerCase();
  const m = new Map<string, Set<number>>(), ev = new Map<string, number>();
  for (const f of b.fins) { if (ids && !ids.has(f.company_id)) continue; for (const n of f.investors) { if (k && !n.toLowerCase().includes(k)) continue; m.set(n, (m.get(n) || new Set()).add(f.company_id)); ev.set(n, (ev.get(n) || 0) + 1); } }
  return [...m.entries()].map(([name, s]) => ({ name, events: ev.get(name)!, companies: s.size })).sort((x, y) => y.events - x.events).slice(0, q.limit || 20);
}
export async function searchFinancings(q: { chain?: string; company?: string; investor?: string; stage?: string; year?: number; q?: string; limit?: number }) {
  const b = await base(), k = String(q.company || '').toLowerCase(), kw = String(q.q || '').toLowerCase();
  const list = b.fins.filter(f => { const c = b.byId.get(f.company_id)!; return inChain(c, q.chain || 'all') && (!k || c.name.toLowerCase().includes(k)) && (!q.investor || f.investors.some(n => n.includes(q.investor!))) && (!q.stage || f.stage === q.stage) && (!q.year || f.year === q.year) && (!kw || `${c.name} ${c.sub_industry || ''} ${f.round}`.toLowerCase().includes(kw)); }).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
  return { total: list.length, rows: list.slice(0, q.limit || 30).map(f => ({ company_id: f.company_id, company: b.byId.get(f.company_id)!.name, round: f.round, stage: f.stage, date: f.date, amount: f.amount, investors: f.investors.slice(0, 8), source: f.source_url })) };
}

