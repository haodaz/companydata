/**
 * 企业深度尽调（投资维度）：八个专题各一次联网检索，结果按专题落 company_deep_research（迁移 008），
 * 并把能回填的部分写回实体库：管线 → 核心产品表（品类写阶段）、股权 → 高管持股比例、财务 → 营收 / 利润（只填空）。
 * 每个值都要求带 source；找不到写 null，不推测。
 */
import { randomId } from '@/lib/entity-ids';
import { supabaseAdmin } from '@/lib/supabase';
import { searchJson } from '@/lib/agents/search-llm';
import { productKey, executiveKey } from '@/lib/company-merge';

export { DEEP_TOPICS, DEEP_TOPICS_VC, isInvestmentFirm, topicsFor, DEEP_TOPIC_KEYS } from '@/lib/company-deep-topics';
import { DEEP_TOPICS, DEEP_TOPICS_VC, isInvestmentFirm, topicsFor, DEEP_TOPIC_KEYS } from '@/lib/company-deep-topics';

const RULES = `
Rules: Only report values you actually found in public sources (official site, exchange filings, annual & interim reports, press releases, reputable financial media). Use null when not found; never guess. Chinese text for narrative fields; keep proper nouns / codes / product names as-is. For every non-null item give "source" (URL). Return ONLY a JSON object.`;

/** hint：官网 / 英文名 / 别名，帮检索把同名、同团队的机构分开（如武岳峰资本 vs 鼎峰科创） */
export function buildDeepPrompt(name: string, key: string, hint = ''): string {
  if (hint) name = `${name} (${hint})`;
  const P: Record<string, string> = {
    listing: `Company: ${name}. Find its stock listings and market data. Return { "listings": [ { "exchange", "ticker", "listed_date", "ipo_price": { "value", "currency", "source" }, "ipo_raised": { "value", "currency", "source" }, "board" } ], "market_cap": { "value", "currency", "as_of", "source" }, "share_price": { "value", "currency", "as_of", "source" }, "total_shares": { "value", "source" }, "controlling_shareholder", "sources": {} }`,
    financials: `Company: ${name}. Find annual and latest interim financial results for the last 3 fiscal years and the latest interim period: revenue, product sales, net profit / loss, R&D expense, cash & bank balances, gross margin, employees. Return { "periods": [ { "period", "revenue", "product_sales", "net_profit", "rd_expense", "cash", "gross_margin", "employees", "currency", "source" } ], "notes" }`,
    shareholding: `Company: ${name}. Find the shareholding structure: founders, management, major institutional shareholders, and any disclosed founder-family holdings (IPO prospectus and latest annual report / exchange disclosures). Return { "holders": [ { "name", "role", "ratio", "as_of", "source" } ], "actual_controller", "notes" }`,
    pipeline: `Company: ${name}. Find its products and pipeline: every disclosed approved product and product candidate with target / technology, indication or use, development stage (approved / NDA / phase 3 / phase 2 / phase 1 / preclinical; for non-pharma companies use launched / beta / in development), region, partner if any, and key milestones. Return { "approved_products": [ { "name", "generic_name", "target", "indications": [], "approval_dates": [], "regions": [], "sales_note", "source" } ], "pipeline": [ { "name", "target", "indication", "stage", "region", "partner", "milestone", "source" } ] }`,
    deals: `Company: ${name}. Find business development deals: out-licensing / in-licensing / co-development / commercialization / strategic partnerships, with partner, asset, region, upfront, milestones, date, status. Return { "deals": [ { "date", "partner", "asset", "type", "region", "upfront", "milestones", "status", "source" } ] }`,
    team: `Company: ${name}. Find the founders and key management: name, title, background (education, prior employers), and any disclosed ownership. Also advisory board chair and notable advisors. Return { "founders": [ { "name", "title", "background", "ownership", "source" } ], "management": [ { "name", "title", "background", "source" } ], "advisors": [ { "name", "role", "affiliation", "source" } ] }`,
    risks: `Company: ${name}. Find risks and notable events in the past 24 months: regulatory decisions, clinical or product setbacks, terminated deals, litigation, penalties, executive departures, insider selling, major price moves, and analyst views. Return { "events": [ { "date", "kind", "summary", "impact", "source" } ], "sentiment_summary" }`,
    campus: `Company: ${name}. Find campus recruiting / early-career information: campus recruitment site, typical roles for fresh graduates, internship programs, locations, benefits disclosed, candidate interview experiences from public forums. Return { "campus_url": { "value", "source" }, "roles": [ { "value", "source" } ], "locations": [], "benefits": { "value": [], "source" }, "interview_notes", "sources": {} }`,
  };
  const V: Record<string, string> = {
    fund: `Investment firm: ${name}. Find fund facts: founding year, headquarters, GP legal entities, assets under management, each fund raised (name, vintage year, size, currency, strategy), LP types (government guidance funds, corporates, family offices, fund-of-funds, insurers), and regulator registration (中国证券投资基金业协会 备案 / SEC). Return { "founded": { "value", "source" }, "headquarters": { "value", "source" }, "gp_entities": [ { "value", "source" } ], "aum": { "value", "currency", "as_of", "source" }, "funds": [ { "name", "vintage", "size", "currency", "strategy", "source" } ], "lp_types": [ { "value", "source" } ], "registration": { "value", "source" }, "notes" }.`,
    strategy: `Investment firm: ${name}. Find its investment strategy: stages (angel / early / growth / PE / secondary), sectors, typical ticket size, geography, deal pace in the last 24 months (number of disclosed deals, notable leads), and thesis statements in the firm's own words. Return { "stages": [ { "value", "source" } ], "sectors": [ { "value", "source" } ], "ticket_size": { "value", "currency", "source" }, "geography": { "value", "source" }, "pace_24m": { "deals", "leads", "source" }, "thesis": { "value", "source" }, "notes" }.`,
    portfolio: `Investment firm: ${name}. Find representative portfolio companies and exits: for each company give Chinese name, English name, sector, the round this firm invested in, year, amount, whether it led, current status (private / IPO with exchange and ticker / acquired by whom), and any disclosed return multiple. Up to 30 companies; prioritise unicorns, IPOs and the last 5 years; do not include the firm's own fundraising. Return { "portfolio": [ { "company", "company_en", "sector", "round", "year", "amount", "lead", "status", "source" } ], "exits": [ { "company", "type", "date", "exchange_or_acquirer", "return", "source" } ], "notes" }.`,
    partners: `Investment firm: ${name}. Find the founding partners, managing partners, partners and key investment professionals: name (Chinese and English), title, sectors covered, background (education, prior employers), notable deals, and portfolio board seats. Return { "partners": [ { "name", "name_en", "title", "sectors", "background", "notable_deals", "board_seats", "source" } ], "notes" }.`,
    network: `Investment firm: ${name}. Find its ecosystem: parent group or anchor corporate, affiliated funds / platforms / incubators, frequent co-investors (with example deals), university or alumni affiliation (e.g. Tsinghua-related), and government or industrial partnerships. Return { "parent": { "value", "source" }, "affiliates": [ { "name", "relation", "source" } ], "co_investors": [ { "name", "deals", "source" } ], "affiliations": [ { "value", "source" } ], "partnerships": [ { "value", "source" } ], "notes" }.`,
    hiring: `Investment firm: ${name}. Find its current and recent job postings (liepin 猎聘, zhaopin 智联, BOSS 直聘, LinkedIn, university career sites, its official site and WeChat articles): role title (投资经理 / 投资总监 / 行业研究员 / 投后管理 …), city, salary, required degree and majors, required years and kind of experience, the abilities it asks for (keep close to the original Chinese wording), and the day-to-day duties. Also summarize in Chinese what this firm looks for in investment people. Return { "jobs": [ { "title", "city", "salary", "degree", "major", "experience", "abilities", "duties", "date", "source" } ], "what_they_look_for": { "value", "source" } }.`,
    firm_risks: `Investment firm: ${name}. Find notable events and risks in the past 24 months: new fund closings, fundraising difficulties, partner departures or splits, regulatory penalties, litigation, LP disputes, major exits or write-downs, and selling of listed portfolio stakes. Return { "events": [ { "date", "kind", "summary", "impact", "source" } ], "summary", "notes" }.`,
  };
  const body = P[key] || V[key];
  if (!body) throw new Error(`未知专题: ${key}`);
  return body + RULES;
}

export interface DeepTopicResult { data: any; queries: string[]; seconds: number }

/** 跑一个专题：联网检索 → JSON */
export async function runDeepTopic(company: { id: number; name: string; name_en?: string | null; official_website?: string | null; aliases?: string[] | null }, key: string, modelId: string): Promise<DeepTopicResult> {
  const t0 = Date.now();
  const hint = [company.name_en, company.official_website && `official site ${company.official_website}`, company.aliases?.length && `also known as ${company.aliases.join(' / ')}`].filter(Boolean).join('; ');
  const { parsed, searchQueries } = await searchJson(buildDeepPrompt(company.name, key, hint), modelId, { tool_name: 'company-deep-research', task_name: `Deep · ${key}`, institution: company.name });
  return { data: parsed || {}, queries: searchQueries || [], seconds: Math.round((Date.now() - t0) / 1000) };
}

/** 落库：一个专题一行，重跑覆盖 */
export async function saveDeepTopic(companyId: number, key: string, r: DeepTopicResult, modelId: string, createdBy = '') {
  const { error } = await supabaseAdmin.from('company_deep_research').upsert({ company_id: companyId, topic: key, data: r.data, queries: r.queries, model_id: modelId, seconds: r.seconds, created_by: createdBy, updated_at: new Date().toISOString() }, { onConflict: 'company_id,topic' });
  if (error) throw error;
}

const STAGE_CN: Record<string, string> = { approved: '已获批', nda: 'NDA 申报', 'phase 3': 'III 期', 'phase 2/3': 'II/III 期', 'phase 2': 'II 期', 'phase 1/2': 'I/II 期', 'phase 1': 'I 期', preclinical: '临床前', ind: 'IND', launched: '已上线', beta: '测试中', 'in development': '开发中' };
const stageCn = (s: any) => STAGE_CN[String(s || '').toLowerCase()] || String(s || '未标注');
const normName = (s: string) => String(s || '').replace(/[（(].*?[)）]/g, '').replace(/[A-Za-z .\-]/g, '').trim();
const ratioNum = (s: any) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*%/); return m ? Number(m[1]) : null; };

/** 把专题结果里能回填实体库的部分写回去；返回回填了什么 */
export async function applyDeepTopic(companyId: number, key: string, data: any): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (key === 'pipeline') {
    const pipe = Array.isArray(data?.pipeline) ? data.pipeline : [];
    const { data: existing } = await supabaseAdmin.from('company_products').select('dedupe_key').eq('company_id', companyId);
    const have = new Set((existing || []).map(r => r.dedupe_key));
    const rows = pipe.map((p: any) => {
      const name = [p.name, p.indication].filter(Boolean).join(' · '); if (!name) return null;
      const dk = productKey(companyId, { name } as any); if (have.has(dk)) return null; have.add(dk);
      return { company_id: companyId, name, category: `临床管线 · ${stageCn(p.stage)}`, tech_keywords: p.target ? String(p.target) : null, external_id: randomId(24), kind: 'other', status: 'unknown', is_flagship: false, description: [p.milestone, p.partner ? `合作方：${p.partner}` : '', p.region ? `地区：${p.region}` : ''].filter(Boolean).join('；'), source_url: typeof p.source === 'string' ? p.source : null, dedupe_key: dk, human_review_status: 'pending' };
    }).filter(Boolean);
    if (rows.length) { const { error } = await supabaseAdmin.from('company_products').insert(rows); if (error) throw error; }
    out.products = rows.length;
  }
  if (key === 'shareholding') {
    const { data: execs } = await supabaseAdmin.from('company_executives').select('id, name, share_ratio').eq('company_id', companyId);
    let n = 0;
    for (const h of Array.isArray(data?.holders) ? data.holders : []) {
      const r = ratioNum(h.ratio); if (r === null) continue;
      const hn = normName(h.name);
      const e = (execs || []).find(x => hn && normName(x.name) === hn);
      if (e && e.share_ratio === null) { await supabaseAdmin.from('company_executives').update({ share_ratio: r }).eq('id', e.id); n++; }
    }
    out.executives = n;
  }
  if (key === 'financials') {
    const periods = Array.isArray(data?.periods) ? data.periods : [];
    const annual = periods.filter((p: any) => /年度|FY|年/.test(String(p.period)) && !/六个月|中期|H1|季度/.test(String(p.period))).pop();
    if (annual) {
      const { data: c } = await supabaseAdmin.from('companies').select('operating_revenue, profit').eq('id', companyId).single();
      const patch: Record<string, any> = {};
      const cur = annual.currency || '';
      if (c && !c.operating_revenue && annual.revenue != null) patch.operating_revenue = `${annual.period} ${annual.revenue}（${cur}）`;
      if (c && !c.profit && annual.net_profit != null) patch.profit = `${annual.period} ${annual.net_profit}（${cur}）`;
      if (Object.keys(patch).length) { await supabaseAdmin.from('companies').update(patch).eq('id', companyId); out.fields = Object.keys(patch).length; }
    }
  }
  if (key === 'partners') {
    // 投资机构的合伙人写进高管表（只补缺）：关联企业按共同高管自动算得出来（同一团队的几块牌子能连上）
    const { data: execs } = await supabaseAdmin.from('company_executives').select('name').eq('company_id', companyId).eq('if_delete', false);
    const have = new Set((execs || []).map(e => normName(e.name)));
    const rows = (Array.isArray(data?.partners) ? data.partners : []).map((p: any) => {
      const n = normName(p.name); if (!n || have.has(n)) return null; have.add(n);
      const src = Array.isArray(p.source) ? p.source[0] : p.source;
      const nm = String(p.name).replace(/[（(].*?[)）]/g, '').trim();
      return { company_id: companyId, name: nm, dedupe_key: executiveKey(companyId, { name: nm } as any), human_review_status: 'review', title: p.title ? String(p.title).slice(0, 120) : null,
        description: [p.background, p.sectors && `分管：${Array.isArray(p.sectors) ? p.sectors.join('、') : p.sectors}`, p.notable_deals && `代表项目：${Array.isArray(p.notable_deals) ? p.notable_deals.join('、') : p.notable_deals}`].filter(Boolean).join('；').slice(0, 1000) || null,
        is_founder: /创始/.test(String(p.title || '')), source_url: src ? String(src).slice(0, 500) : null, external_id: randomId(24), if_delete: false };
    }).filter(Boolean);
    if (rows.length) { const { error } = await supabaseAdmin.from('company_executives').insert(rows); if (error) throw error; }
    out.executives = rows.length;
  }
  return out;
}
