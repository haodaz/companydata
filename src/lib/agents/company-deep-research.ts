/**
 * 企业深度尽调（投资维度）：八个专题各一次联网检索，结果按专题落 company_deep_research（迁移 008），
 * 并把能回填的部分写回实体库：管线 → 核心产品表（品类写阶段）、股权 → 高管持股比例、财务 → 营收 / 利润（只填空）。
 * 每个值都要求带 source；找不到写 null，不推测。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { searchJson } from '@/lib/agents/search-llm';
import { productKey } from '@/lib/company-merge';

export const DEEP_TOPICS: { key: string; label: string; desc: string }[] = [
  { key: 'listing', label: '上市与市值', desc: '交易所 / 代码 / 上市日 / 发行价 / 募资、市值、股价、总股本、控股股东' },
  { key: 'financials', label: '财务', desc: '近三年 + 最新中期：收入、产品销售、净利润、研发、现金、毛利率、员工' },
  { key: 'shareholding', label: '股权结构', desc: '创始人 / 管理层 / 机构 / 创始人家族持股，实际控制人' },
  { key: 'pipeline', label: '产品与管线', desc: '已获批产品 + 每条管线的靶点、适应症、阶段、地区、合作方、里程碑' },
  { key: 'deals', label: 'BD 交易', desc: '授权引进 / 对外授权 / 共同开发 / 商业化合作：对方、资产、首付、里程碑' },
  { key: 'team', label: '团队', desc: '创始人、核心管理层、科学顾问：头衔、履历、持股' },
  { key: 'risks', label: '风险与事件', desc: '近 24 个月监管、临床、交易、诉讼、处罚、高管变动、减持、分析师观点' },
  { key: 'campus', label: '校招', desc: '入口、岗位方向、地点、福利、面经' },
];
/** 投资机构版（2026-09-28）：基金 / 策略 / 案例与退出 / 合伙人 / 生态 / 事件 —— 上市、财务、管线、BD 那套对 VC 不适用 */
export const DEEP_TOPICS_VC: { key: string; label: string; desc: string }[] = [
  { key: 'fund', label: '基金与规模', desc: '成立、总部、GP 主体、在管规模、各期基金（名称 / 年份 / 规模 / 币种 / 策略）、LP 类型、基金业协会备案' },
  { key: 'strategy', label: '投资策略', desc: '阶段、赛道、单笔金额、地域、近 24 个月出手节奏、机构自述的投资主题' },
  { key: 'portfolio', label: '代表案例与退出', desc: '代表被投企业（轮次 / 年份 / 金额 / 是否领投 / 现状）、IPO 与并购退出、披露的回报' },
  { key: 'partners', label: '合伙人团队', desc: '创始 / 管理合伙人、合伙人、核心投资人：头衔、分管赛道、履历、代表项目' },
  { key: 'network', label: '生态与关联', desc: '母公司 / 产业方、关联基金与平台、常见联合投资方、高校 / 校友背景、政府合作' },
  { key: 'firm_risks', label: '近 24 个月事件', desc: '新基金关账、募资困难、合伙人变动 / 分家、监管处罚、诉讼、LP 纠纷、重大退出或减值、被投上市公司减持' },
];
export const isInvestmentFirm = (c: { name?: string | null; industry?: string | null; kind?: string | null } | null | undefined) =>
  !!c && (c.industry === '投资机构' || /资本|创投|基金|投资(集团|公司|管理)?$|Ventures|Capital|Partners|Fund\b/i.test(String(c.name || '')));
export const topicsFor = (c: Parameters<typeof isInvestmentFirm>[0]) => (isInvestmentFirm(c) ? DEEP_TOPICS_VC : DEEP_TOPICS);
export const DEEP_TOPIC_KEYS = [...DEEP_TOPICS, ...DEEP_TOPICS_VC].map(t => t.key);

const RULES = `
Rules: Only report values you actually found in public sources (official site, exchange filings, annual & interim reports, press releases, reputable financial media). Use null when not found; never guess. Chinese text for narrative fields; keep proper nouns / codes / product names as-is. For every non-null item give "source" (URL). Return ONLY a JSON object.`;

export function buildDeepPrompt(name: string, key: string): string {
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
    firm_risks: `Investment firm: ${name}. Find notable events and risks in the past 24 months: new fund closings, fundraising difficulties, partner departures or splits, regulatory penalties, litigation, LP disputes, major exits or write-downs, and selling of listed portfolio stakes. Return { "events": [ { "date", "kind", "summary", "impact", "source" } ], "summary", "notes" }.`,
  };
  const body = P[key] || V[key];
  if (!body) throw new Error(`未知专题: ${key}`);
  return body + RULES;
}

export interface DeepTopicResult { data: any; queries: string[]; seconds: number }

/** 跑一个专题：联网检索 → JSON */
export async function runDeepTopic(company: { id: number; name: string }, key: string, modelId: string): Promise<DeepTopicResult> {
  const t0 = Date.now();
  const { parsed, searchQueries } = await searchJson(buildDeepPrompt(company.name, key), modelId, { tool_name: 'company-deep-research', task_name: `Deep · ${key}`, institution: company.name });
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
      return { company_id: companyId, name, category: `临床管线 · ${stageCn(p.stage)}`, tech_keywords: p.target ? [String(p.target)] : null, kind: 'other', status: 'unknown', is_flagship: false, description: [p.milestone, p.partner ? `合作方：${p.partner}` : '', p.region ? `地区：${p.region}` : ''].filter(Boolean).join('；'), source_url: typeof p.source === 'string' ? p.source : null, dedupe_key: dk, human_review_status: 'pending' };
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
  return out;
}
