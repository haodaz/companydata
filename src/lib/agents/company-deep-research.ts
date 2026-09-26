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
export const DEEP_TOPIC_KEYS = DEEP_TOPICS.map(t => t.key);

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
  const body = P[key];
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
