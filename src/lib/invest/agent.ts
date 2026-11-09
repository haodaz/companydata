/**
 * /invest 的 AI 助理：企业、融资、投资机构、产业链、人、岗位、动态、产品、职业和标准都能查。
 * 每个工具背后都是库里的真实数据；回答里的企业和机构写成链接，点开在对话右边的应用区看详情。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import type { AgentKit } from '@/lib/ws/agent';
import { CHAINS, STAGES } from './taxonomy';
import { companies, company, companyNames, findCompany, investor, overview, searchFinancings, searchInvestors } from './data';

const chainHelp = `产业链 key：${CHAINS.map(c => `${c.key}=${c.name}`).join('、')}，不限产业传 all`;
const str = { type: 'string' } as const, num = { type: 'number' } as const;
const tool = (name: string, description: string, properties: Record<string, any>, required: string[] = []): Anthropic.Tool => ({ name, description, input_schema: { type: 'object', properties, required } });
const clip = (v: any, n = 600) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v);
const lim = (v: any, d = 20, m = 40) => Math.min(m, Math.max(1, Number(v) || d));

export const INVEST_TOOLS: Anthropic.Tool[] = [
  tool('industry_overview', `一个产业（或全库）的全景：企业数、融资事件、投资机构、上市公司、在招岗位，融资的地区分布、阶段分布、逐年趋势、最活跃机构、最新融资。${chainHelp}`, { chain: str }),
  tool('chain_map', `一条产业链的结构：每一环有多少企业、多少融资、近三年多少融资、多少在招岗位。回答「哪些环节热 / 还能投」用它。${chainHelp}`, { chain: str }, ['chain']),
  tool('search_companies', '按条件筛企业。tab：listed 上市 / funded 已融资未上市 / unfunded 未见融资；sort：latest 最新融资 / jobs 在招岗位 / founded 最新成立；place 是省级地区简称（上海、广东）或「海外」；node 是 chain_map 返回的环节 key。', { chain: str, node: str, place: str, investor: str, tab: str, sort: str, q: { ...str, description: '企业名或细分行业关键词' }, page: num }),
  tool('company_profile', '一家企业的完整资料：简介、融资历程、投资方、管理团队、增长信号、技术优势、近期动态、在招岗位。给 id 或 name，名字对不上多家时返回候选。', { id: num, name: str }),
  tool('search_investors', '找投资机构，按参与事件数排序。可按关键词和产业筛。', { q: str, chain: str, limit: num }),
  tool('investor_profile', '一家投资机构的画像：事件数、组合企业、阶段偏好、逐年节奏、偏好的产业和地区、常一起投的机构（可用于找共同投资人和搭线路径）。', { name: str }, ['name']),
  tool('search_financings', `查融资事件。stage 取值：${STAGES.map(s => `${s.key}=${s.name}`).join('、')}。可按产业、企业名、投资方、年份筛。`, { chain: str, company: str, investor: str, stage: str, year: num, q: str, limit: num }),
  tool('search_people', '在企业管理团队里查人：按姓名或职务关键词，返回人、职务、所在企业。同名不等于同一个人，要提醒。', { name: str, title: str, limit: num }),
  tool('search_jobs', '查在招岗位：按岗位名、企业名、地点关键词。', { q: str, company: str, location: str, limit: num }),
  tool('search_news', '查企业动态和新闻：按关键词，或限定某家企业（company_id）。', { q: str, company_id: num, limit: num }),
  tool('search_products', '查产品：企业主营产品和科研产品库（仪器、试剂、耗材等）。', { q: str, limit: num }, ['q']),
  tool('search_knowledge', '查职业库和行业标准。', { q: str, limit: num }, ['q']),
  tool('open_panel', '在对话右边的应用区打开内容。用户说「打开 / 给我看 / 放到旁边」时用。kind：company（要 id）、investor（要 name）、chain（要 chain）、overview（可给 chain）、projects（可给 chain / node / place / investor）。', { kind: str, id: num, name: str, chain: str, node: str, place: str, investor: str }, ['kind']),
];

export const INVEST_SYSTEM = `你是平方「产业投资地图」的研究助理，帮投资人查产业、项目、机构和人。用简体中文，直接给结论，短句，少套话。

做事方式：
- 所有事实只来自工具结果。工具没给的就说库里没有，不猜、不用自己的记忆补数字。
- 一个问题需要几个工具就连着调，不要先问用户要不要查。真有歧义（名字对上多家）时才问一句。
- 数字说清口径：这是库内企业和公开披露的融资事件，用来看结构和相对强弱，不等于全市场；金额常缺失，不要自己加总金额。近年收录更全，跨年比较要提醒。
- 产业链归类是规则归类，「待发掘」「热门」都只是库内信号，不是投资建议。不要给买卖建议或估值判断，可以列事实、对比和值得追问的点。
- 提到库里的企业一律写成链接 [企业名](/invest/c/企业id)，投资机构写成 [机构名](/invest/i/机构名)，方便点开。id 必须来自工具结果。
- 多条对比用表格。融资、新闻这类事实，有来源链接时附上。
- 同名的人不能当成同一个人；搭线路径只能基于共同投资、同一企业任职这些库里有的关系，说清是什么关系。
- 用户要看某家企业、机构、产业链的详情时，用 open_panel 打开，不用在对话里把详情再抄一遍。`;

async function run(name: string, i: any): Promise<{ result: any; ui?: any; label: string }> {
  if (name === 'industry_overview') {
    const d = await overview(i.chain || 'all');
    return { label: `看了${d.label}全景`, result: { label: d.label, kpi: d.kpi, insight: d.insight, provinces: d.provinces.slice(0, 12), stage_totals: d.stageTotals, years: d.years.map(y => [y.y, y.total]), top_investors: d.topInvestors.map(t => ({ name: t.name, total: t.total })), recent: d.recent, top_hiring: d.hiring } };
  }
  if (name === 'chain_map') {
    const d = await overview(i.chain);
    if (!d.stages.length) return { label: '没有这条产业链', result: { error: chainHelp } };
    return { label: `看了${d.label}产业链`, result: { label: d.label, stages: d.stages, total: d.kpi } };
  }
  if (name === 'search_companies') {
    const d = await companies({ chain: i.chain || 'all', node: i.node, place: i.place, investor: i.investor, tab: i.tab, q: i.q, sort: i.sort, page: Math.max(1, Number(i.page) || 1) });
    return { label: `筛出 ${d.total} 家企业`, result: d };
  }
  if (name === 'company_profile') {
    const f = await findCompany(i);
    if (!f.id) return { label: f.candidates.length ? '名字对上了多家' : '库里没找到', result: f.candidates.length ? { ambiguous: f.candidates } : { not_found: true } };
    const d: any = await company(f.id);
    return { label: `看了${d.name}`, result: { ...d, intro: clip(d.intro), growth: clip(d.growth), tech: clip(d.tech), sources: undefined, news: d.news.map((n: any) => ({ ...n, description: clip(n.description, 160) })) } };
  }
  if (name === 'search_investors') { const r = await searchInvestors({ q: i.q, chain: i.chain, limit: lim(i.limit) }); return { label: `找到 ${r.length} 家机构`, result: r }; }
  if (name === 'investor_profile') { const d = await investor(String(i.name)); return d.events ? { label: `看了${d.name}`, result: { ...d, portfolio: d.portfolio.slice(0, 25) } } : { label: '库里没有这家机构的记录', result: { not_found: true, hint: '先用 search_investors 找准名字' } }; }
  if (name === 'search_financings') { const d = await searchFinancings({ ...i, limit: lim(i.limit, 30) }); return { label: `查到 ${d.total} 起融资`, result: d }; }
  if (name === 'search_people') {
    let q = db.from('company_executives').select('name, title, company_id, source_url').not('if_delete', 'is', true).limit(lim(i.limit));
    if (i.name) q = q.ilike('name', `%${i.name}%`); if (i.title) q = q.ilike('title', `%${i.title}%`);
    const { data, error } = await q; if (error) throw error;
    const m = await companyNames((data || []).map((x: any) => x.company_id));
    return { label: `查到 ${data?.length || 0} 人`, result: (data || []).map((x: any) => ({ ...x, company: m.get(x.company_id) })) };
  }
  if (name === 'search_jobs') {
    let q = db.from('jobs').select('name, institute_or_company_name, company_id, location, job_type, link, source_url, application_end_date_str').eq('status', 'open').not('if_delete', 'is', true).limit(lim(i.limit));
    if (i.q) q = q.ilike('name', `%${i.q}%`); if (i.company) q = q.ilike('institute_or_company_name', `%${i.company}%`); if (i.location) q = q.ilike('location', `%${i.location}%`);
    const { data, error } = await q; if (error) throw error;
    return { label: `查到 ${data?.length || 0} 个岗位`, result: data };
  }
  if (name === 'search_news') {
    let q = db.from('company_news').select('company_id, description, publish_date, source_url').not('if_delete', 'is', true).order('publish_date', { ascending: false, nullsFirst: false }).limit(lim(i.limit));
    if (i.q) q = q.ilike('description', `%${i.q}%`); if (i.company_id) q = q.eq('company_id', i.company_id);
    const { data, error } = await q; if (error) throw error;
    const m = await companyNames((data || []).map((x: any) => x.company_id));
    return { label: `查到 ${data?.length || 0} 条动态`, result: (data || []).map((x: any) => ({ ...x, company: m.get(x.company_id), description: clip(x.description, 240) })) };
  }
  if (name === 'search_products') {
    const n = lim(i.limit, 15, 30);
    const [{ data: a }, { data: b }] = await Promise.all([db.from('company_products').select('name, category, company_id, source_url').not('if_delete', 'is', true).ilike('name', `%${i.q}%`).limit(n), db.from('research_products').select('name, kind, category, supplier_id, source_url').eq('if_delete', false).ilike('name', `%${i.q}%`).limit(n)]);
    const m = await companyNames([...(a || []).map((x: any) => x.company_id), ...(b || []).map((x: any) => x.supplier_id)]);
    return { label: `查到 ${(a?.length || 0) + (b?.length || 0)} 个产品`, result: { company_products: (a || []).map((x: any) => ({ ...x, company: m.get(x.company_id) })), research_products: (b || []).map((x: any) => ({ ...x, company_id: x.supplier_id, company: m.get(x.supplier_id) })) } };
  }
  if (name === 'search_knowledge') {
    const n = lim(i.limit, 10, 20);
    const [{ data: a }, { data: b }] = await Promise.all([db.from('occupations').select('name, career_category, intro').not('if_delete', 'is', true).ilike('name', `%${i.q}%`).limit(n), db.from('industry_standards').select('code, title, issuer, status, official_url').ilike('title', `%${i.q}%`).limit(n)]);
    return { label: `查到 ${(a?.length || 0) + (b?.length || 0)} 条`, result: { occupations: (a || []).map((x: any) => ({ ...x, intro: clip(x.intro, 200) })), standards: b } };
  }
  if (name === 'open_panel') {
    const chainName = CHAINS.find(c => c.key === i.chain)?.name;
    if (i.kind === 'company') { const f = await findCompany(i); if (!f.id) return { label: '没打开', result: { error: '找不到这家企业', candidates: f.candidates } }; const d: any = await company(f.id); return { label: `打开了${d.name}`, result: { ok: true }, ui: { kind: 'invest', panel: 'company', id: f.id, title: d.name } }; }
    if (i.kind === 'investor') return { label: `打开了${i.name}`, result: { ok: true }, ui: { kind: 'invest', panel: 'investor', name: i.name, title: i.name } };
    if (i.kind === 'chain') return { label: '打开了产业链', result: { ok: true }, ui: { kind: 'invest', panel: 'chain', chain: i.chain, title: `${chainName || i.chain}产业链` } };
    if (i.kind === 'overview') return { label: '打开了全景', result: { ok: true }, ui: { kind: 'invest', panel: 'overview', chain: i.chain || 'all', title: `${chainName || '全部产业'}全景` } };
    if (i.kind === 'projects') return { label: '打开了企业列表', result: { ok: true }, ui: { kind: 'invest', panel: 'projects', params: { chain: i.chain || 'all', node: i.node, place: i.place, investor: i.investor }, title: [chainName, i.place, i.investor, '企业列表'].filter(Boolean).join(' · ') } };
    return { label: '没打开', result: { error: '未知 kind' } };
  }
  return { label: name, result: { error: '未知工具' } };
}

export const investKit = (): AgentKit => ({ system: INVEST_SYSTEM, tools: INVEST_TOOLS, run: (n, i) => run(n, i) as any, org: '产业投资地图', task: '产业投资地图 · 对话' });
