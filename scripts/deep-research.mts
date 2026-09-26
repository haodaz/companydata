/**
 * 企业深度检索（投资尽调维度）：管线 / 财务 / 市值 / 股权 / BD 交易 / 研发 / 风险，联网检索逐题跑，结果存 JSON。
 *   npx tsx scripts/deep-research.mts "<企业名>" <输出.json> [model]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { searchJson } = await import('../src/lib/agents/search-llm');
const [name, out, model = 'gpt-5.6-luna'] = process.argv.slice(2);
const RULES = `
Rules: Only report values you actually found in public sources (official site, HKEX / SSE filings, annual & interim reports, press releases, reputable financial media). Use null when not found; never guess. Chinese text for narrative fields; keep proper nouns / codes / product names as-is. For every non-null item give "source" (URL). Return ONLY a JSON object.`;
const TOPICS: Record<string, string> = {
  listing: `Company: ${name}. Find its stock listings and market data. Return { "listings": [ { "exchange", "ticker", "listed_date", "ipo_price", "ipo_raised", "board" } ], "market_cap": { "value", "currency", "as_of", "source" }, "share_price": { "value", "currency", "as_of", "source" }, "total_shares", "controlling_shareholder", "sources": {} }${RULES}`,
  financials: `Company: ${name}. Find annual and latest interim financial results for the last 3 fiscal years and the latest interim period: revenue, product sales, net profit / loss, R&D expense, cash & bank balances, gross margin, employees. Return { "periods": [ { "period", "revenue", "product_sales", "net_profit", "rd_expense", "cash", "gross_margin", "employees", "currency", "source" } ], "notes" }${RULES}`,
  shareholding: `Company: ${name}. Find the shareholding structure: founders, management, major institutional shareholders, and any disclosed founder-family holdings (e.g. from IPO prospectus and latest annual report). Return { "holders": [ { "name", "role", "ratio", "as_of", "source" } ], "actual_controller", "notes" }${RULES}`,
  pipeline: `Company: ${name}. Find its drug pipeline: every disclosed product candidate with molecule / target, indication, development stage (approved / NDA / phase 3 / phase 2 / phase 1 / preclinical), region, partner if any, and key milestones. Return { "approved_products": [ { "name", "generic_name", "target", "indications", "approval_dates", "regions", "sales_note", "source" } ], "pipeline": [ { "name", "target", "indication", "stage", "region", "partner", "milestone", "source" } ] }${RULES}`,
  deals: `Company: ${name}. Find business development deals: out-licensing / in-licensing / co-development / commercialization partnerships, with partner, asset, region, upfront, milestones, date. Return { "deals": [ { "date", "partner", "asset", "type", "region", "upfront", "milestones", "status", "source" } ] }${RULES}`,
  team: `Company: ${name}. Find the founders and key management: name, title, background (education, prior employers), and any disclosed ownership. Also the scientific advisory board chair and notable advisors. Return { "founders": [ { "name", "title", "background", "ownership", "source" } ], "management": [ { "name", "title", "background", "source" } ], "advisors": [ { "name", "role", "affiliation", "source" } ] }${RULES}`,
  risks: `Company: ${name}. Find risks and notable events in the past 24 months: regulatory decisions, clinical setbacks, terminated deals, litigation, penalties, executive departures, insider selling, major price moves, and analyst views. Return { "events": [ { "date", "kind", "summary", "impact", "source" } ], "sentiment_summary" }${RULES}`,
  campus: `Company: ${name}. Find campus recruiting / early-career information: campus recruitment site, typical roles for fresh graduates, internship programs, locations (Beijing / Shanghai / Guangzhou etc.), benefits disclosed, candidate interview experiences from public forums. Return { "campus_url", "roles": [], "locations": [], "benefits", "interview_notes", "sources": {} }${RULES}`,
};
const result: Record<string, any> = { company: name, model, generatedAt: new Date().toISOString(), topics: {} };
for (const [key, prompt] of Object.entries(TOPICS)) {
  const t0 = Date.now();
  try {
    const { parsed, searchQueries } = await searchJson(prompt, model, { tool_name: 'company-deep-research', task_name: `Deep · ${key}`, institution: name });
    result.topics[key] = { data: parsed, queries: searchQueries, seconds: Math.round((Date.now() - t0) / 1000) };
    console.log(`✅ ${key} ${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(parsed).length} chars`);
  } catch (e: any) { result.topics[key] = { error: e?.message || String(e) }; console.log(`❌ ${key} ${e?.message}`); }
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
}
console.log('DONE', out);
