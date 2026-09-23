/**
 * 企业画像流水线 Agent（服务端）
 *   locateCompanyPages  — 联网找官网与「关于 / 投资者关系 / 新闻 / 管理团队 / 文化福利」官方页面
 *   fetchCompanyPages   — Jina 抓取这些页面的 Markdown（raw 原文整页保留）
 *   extractFromPages    — 从官方页面原文提取画像字段 + 管理团队 + 动态（不联网）
 *   searchCompanyTopic  — 按主题联网检索（基础工商 / 融资 / 动态舆情 / 管理团队 / 行业 / 校招口碑）
 * 每一步都只返回「找到的值」，写库与合并交给 company-merge / company-store。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose, searchJson } from '@/lib/agents/search-llm';
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { PROFILE_TOPICS, SEGMENT_LABELS, COMPANY_TYPE_LABELS, KIND_LABELS, FINANCE_ROUND_LABELS, EDUCATION_LABELS, NEWS_KIND_LABELS, TYPE_LABEL_LABELS } from '@/lib/company-fields';
import { str, url } from '@/lib/company-merge';

const TOOL = 'company-pipeline' as const;

export interface LocatedPage { subtype: 'homepage' | 'about' | 'ir' | 'news' | 'team' | 'culture'; url: string; title: string | null }
export interface FetchedPage extends LocatedPage { ok: boolean; len: number; markdown: string }

const PAGE_SUBTYPE_LABEL: Record<LocatedPage['subtype'], string> = { homepage: '官网首页', about: '关于我们', ir: '投资者关系', news: '新闻中心', team: '管理团队', culture: '文化与福利' };
export { PAGE_SUBTYPE_LABEL };

function companyLine(c: { name: string; name_en?: string | null; brief_name?: string | null; country?: string | null; official_website?: string | null; industry?: string | null }) {
  return [c.name, c.name_en && c.name_en !== c.name ? `(${c.name_en})` : '', c.brief_name && c.brief_name !== c.name ? `简称 ${c.brief_name}` : '', c.country ? `· ${c.country}` : '', c.industry ? `· ${c.industry}` : '', c.official_website ? `· 官网 ${c.official_website}` : ''].filter(Boolean).join(' ');
}

const RULES = `
Rules:
- Only report values you actually found. Use null for anything not found. Never guess or fabricate.
- Search in both Chinese and English when the company is Chinese; prefer official sources (official site, annual reports, stock exchange filings, 国家企业信用信息公示系统, official WeChat / press releases), then reputable media.
- Text fields are in Chinese (中文) unless the value is a proper noun / URL / code.
- "sources": map each non-null field name to the URL you got it from.
`;

// ────────────────────────────────────────────
// 1. 定位官方页面
// ────────────────────────────────────────────
export async function locateCompanyPages(company: { name: string; name_en?: string | null; official_website?: string | null; country?: string | null }, modelId: string, batchId: number) {
  const prompt = `
You are a corporate research assistant. Use web search to find the OFFICIAL web pages of this company.

Company: ${companyLine(company)}

Find (all must be on the company's own official domain or its official investor-relations site; never third-party aggregators like 天眼查 / 企查查 / Wikipedia / LinkedIn):
1. "official_website": root homepage URL (e.g. https://www.example.com/).
2. "name_en": official English name; "brief_name": common Chinese short name; "name_cn": official Chinese name if the given name is English.
3. "pages": array of official sub-pages, each { "subtype", "url", "title" } with subtype one of:
   - "about"   关于我们 / 公司简介 / Company overview
   - "ir"      投资者关系 / Investor relations (listed companies only)
   - "news"    新闻中心 / 媒体报道 / Press releases / Newsroom
   - "team"    管理团队 / 领导层 / Leadership / Board of directors
   - "culture" 企业文化 / 员工福利 / Life at company / 社会责任
   At most one page per subtype; skip a subtype if not found. Prefer Chinese-language pages for Chinese companies.
${RULES}
Return ONLY a JSON object: { "official_website", "name_en", "name_cn", "brief_name", "pages": [...], "sources": {} }
`;
  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: TOOL, task_name: 'Locate Official Pages', institution: company.name, batch_id: batchId });
  const pages: LocatedPage[] = [];
  const seen = new Set<string>();
  const site = url(parsed.official_website);
  if (site) { pages.push({ subtype: 'homepage', url: site, title: '官网首页' }); seen.add(site.replace(/\/$/, '')); }
  for (const p of Array.isArray(parsed.pages) ? parsed.pages : []) {
    const u = url(p?.url); const t = str(p?.subtype);
    if (!u || !t || !(t in PAGE_SUBTYPE_LABEL) || t === 'homepage') continue;
    const k = u.replace(/\/$/, '');
    if (seen.has(k)) continue;
    seen.add(k);
    pages.push({ subtype: t as LocatedPage['subtype'], url: u, title: str(p?.title) });
  }
  return { official_website: site, name_en: str(parsed.name_en), name_cn: str(parsed.name_cn), brief_name: str(parsed.brief_name), pages, searchQueries, raw: parsed };
}

// ────────────────────────────────────────────
// 2. 抓取官方页面
// ────────────────────────────────────────────
const PAGE_CAP = 40000;
export async function fetchCompanyPages(pages: LocatedPage[], concurrency = 3): Promise<FetchedPage[]> {
  const out: FetchedPage[] = [];
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async p => {
      const md = await fetchJinaUrl(p.url);
      const text = (md || '').trim();
      return { ...p, ok: text.length > 200, len: text.length, markdown: text.slice(0, PAGE_CAP) };
    }));
    out.push(...results);
  }
  return out;
}

/** 把抓到的页面拼成一份 raw markdown（带来源头，和院校版一致） */
export function joinPagesMarkdown(pages: FetchedPage[]): string {
  return pages.filter(p => p.ok).map(p => `### Source: [${PAGE_SUBTYPE_LABEL[p.subtype]}](${p.url})\n\n${p.markdown}`).join('\n\n---\n\n');
}

// ────────────────────────────────────────────
// 3. 官方页面提取（不联网）
// ────────────────────────────────────────────
const EXTRACT_CAP = 80000;
const PROFILE_KEYS_FROM_PAGES = [
  'name_en', 'brief_name', 'one_sentence', 'introduction', 'company_specialties', 'product_area', 'industry', 'sub_industry', 'info_founding_year', 'company_scale', 'operating_revenue', 'profit',
  'continent', 'country', 'province', 'city', 'address', 'stock_code', 'chairman', 'ceo_general_manager', 'cto', 'info_email', 'info_phone', 'campus_url', 'careers_url',
  'tech_advantage', 'research_area', 'business_profile', 'company_case', 'industry_position', 'benefits_package', 'growth_signals', 'linkedin_url',
];

export async function extractFromPages(company: { name: string; name_en?: string | null }, markdown: string, modelId: string, batchId: number) {
  const prompt = `
You are a data extraction engine. Below is the Markdown of this company's OFFICIAL web pages (each section starts with "### Source: [page](url)").
Extract company profile facts, the management team and recent news items. Do not use outside knowledge; only what the pages say.

Company: ${companyLine(company)}

Return ONLY a JSON object:
{
  "profile": { ${PROFILE_KEYS_FROM_PAGES.map(k => `"${k}"`).join(', ')} },
  "executives": [ { "name", "title", "description", "education", "gender", "age", "is_founder", "start_date", "source_url" } ],
  "news": [ { "description", "publish_date", "publish_source", "source_url", "kind" } ],
  "sources": { "<profile field>": "<page url it came from>" },
  "summary": "..."
}
Field notes:
- profile: values in Chinese unless proper noun / URL / code; null when the pages do not say. "one_sentence" ≤ 30 字; "introduction" 3–5 sentences; "company_scale" headcount text with year; "stock_code" as "EXCHANGE: TICKER"; "continent" one of asia|europe|america|south_america|africa|oceania; "campus_url" / "careers_url" only if linked on the pages.
- executives: only named people with a leadership role (董事长 / CEO / 总裁 / 创始人 / CFO / CTO / 副总裁 / 董事 / 监事 / 合伙人). "education" one of ${Object.keys(EDUCATION_LABELS).join('|')} or null; "gender" male|female|null; "is_founder" boolean; "start_date" YYYY-MM-DD or YYYY-MM or null; "description" 1–3 sentences in Chinese; "source_url" the page url.
- news: dated items from the news / press pages, newest first, at most 20, each "description" 1–2 sentences in Chinese; "kind" one of ${Object.keys(NEWS_KIND_LABELS).join('|')}; "publish_date" YYYY-MM-DD; "publish_source" e.g. "官网新闻中心"; "source_url" the article url if present else the page url.
- summary: 3–6 sentences in Chinese describing what the pages contained, what was extracted, and what was missing (like a QA note for a data colleague).

Markdown:
${markdown.slice(0, EXTRACT_CAP)}
`;
  const res = await generateContent(prompt, modelId, { jsonMode: true, fast: true });
  await logTokenUsage({ tool_name: TOOL, task_name: 'Extract From Official Pages', institution: company.name, model_id: modelId, usageMetadata: res.usageMetadata, batch_id: batchId }).catch(() => {});
  const parsed = parseJsonLoose(res.text);
  return {
    profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {},
    executives: Array.isArray(parsed.executives) ? parsed.executives : [],
    news: Array.isArray(parsed.news) ? parsed.news : [],
    sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    summary: str(parsed.summary),
    raw: parsed,
  };
}

// ────────────────────────────────────────────
// 4. 主题检索（联网）
// ────────────────────────────────────────────
const TOPIC_PROMPTS: Record<string, (c: any, missing: string[]) => string> = {
  basic: (c, missing) => `
Look up basic corporate facts about this company. Fields still missing in our database: ${missing.join(', ') || '(none — verify key facts)'}.

Field definitions:
- name_en / brief_name / historical_name (曾用名); segment: one of ${Object.keys(SEGMENT_LABELS).join('|')} (china = Chinese-controlled HQ in mainland/HK/Macau/TW; joint_venture = Sino-foreign JV operating in China; overseas_top = leading multinational HQ outside China); jv_partners: JV shareholders like "上汽集团 × Volkswagen AG" else null.
- official_website (root), linkedin_url; industry (中文大类, e.g. 互联网 / 半导体 / 汽车 / 快消 / 投资银行); sub_industry (中文细分).
- company_type: ${Object.keys(COMPANY_TYPE_LABELS).join('|')}; kind (legal form): ${Object.keys(KIND_LABELS).join('|')}.
- stock_code "EXCHANGE: TICKER"; info_founding_year integer; company_scale headcount text with year; company_employees integer (参保人数 / employees) ; operating_revenue & profit latest fiscal year text with currency; registered_capital / paid_in_capital text with currency; unified_social_credit_code 18-char code (mainland China entities only).
- continent asia|europe|america|south_america|africa|oceania; country (中文); province (中文, mainland China only); city; county_area (区 / 县); address (HQ postal address); registration_address.
- legal_representative / chairman / ceo_general_manager / cto names; info_email / info_phone (official contact); year_report_address (URL of latest annual report or IR page).
- business_range (经营范围, from business registration); one_sentence (≤ 30 字); introduction (3–5 sentences 中文); company_specialties (核心业务领域); product_area (主要产品 / 服务).
- fortune_global_rank integer + ranking_year; type_label: array from ${Object.keys(TYPE_LABEL_LABELS).join('|')}.`,

  financing: () => `
Find this company's FINANCING HISTORY (融资历史) and listing status.
Return "financings": array of rounds, oldest first, each { "finance_round", "finance_amount", "finance_enterprise", "publish_date", "source_url" }:
- finance_round: one of ${Object.keys(FINANCE_ROUND_LABELS).join('|')}; if the round does not fit (战略投资 / IPO / 定增 / 并购), put the original wording here as-is.
- finance_amount: text with currency as reported (e.g. "数亿元人民币", "US$120M"); finance_enterprise: investors joined by " / "; publish_date YYYY-MM-DD (or YYYY-MM); source_url: where you found it.
Also "fields": { "stock_code": "EXCHANGE: TICKER" or null }.
If the company is a long-established listed company or state-owned enterprise with no venture rounds, return an empty array and say so in the summary.`,

  news: () => `
Find this company's IMPORTANT NEWS in the last 12 months and its public-sentiment / risk picture.
Return:
- "news": up to 15 items, newest first, each { "description" (1–2 sentences 中文), "publish_date" YYYY-MM-DD, "publish_source" (媒体 / 官网名称), "source_url", "kind" one of ${Object.keys(NEWS_KIND_LABELS).join('|')} }. Cover product launches, financing / M&A, partnerships, executive changes, expansion / layoffs, awards, campus-recruiting news, and negative events (kind = risk).
- "fields": {
    "public_sentiment": 舆情与风险摘要 in Chinese, 3–6 sentences: negative news, layoffs, regulatory penalties, lawsuits, business abnormalities in the last 12 months, each with the source name in brackets; say 「未检索到明显负面舆情」 if nothing notable.
    "growth_signals": 增长信号 in Chinese, 2–4 sentences: hiring expansion, new business lines, revenue growth, new markets.
  }`,

  team: () => `
Find this company's MANAGEMENT TEAM (管理团队): chairman, CEO / president, founders, CFO, CTO, key vice presidents, board members (for listed companies use the annual report / IR page).
Return "executives": up to 15 people, each { "name", "title", "description" (1–3 sentences 中文: background, tenure, previous roles), "education" one of ${Object.keys(EDUCATION_LABELS).join('|')} or null, "gender" male|female|null, "age" integer or null, "is_founder" boolean, "salary" (年薪 text, listed companies only) or null, "share_holding" (万股, number) or null, "share_ratio" (%, number) or null, "start_date" YYYY-MM-DD or YYYY-MM or null, "source_url" }.
Also "fields": { "chairman", "ceo_general_manager", "cto" } as names.`,

  industry: () => `
Describe this company's INDUSTRY POSITION and business profile. All text in Chinese.
Return "fields": {
  "industry_position": 行业位置 3–5 sentences: the segment it competes in, market share / ranking if known, main competitors, its differentiation.
  "business_profile": 商业档案 3–5 sentences: business model, main revenue lines, key customers / markets, geographic footprint.
  "tech_advantage": 技术优势 2–4 sentences (R&D spend, patents, core tech, platforms) or null.
  "research_area": 研究方向 (研发 / 研究院重点方向) or null.
  "company_case": 公司案例 2–4 sentences: representative products, projects or clients.
  "growth_signals": 增长信号 2–4 sentences (recent growth, new markets, policy tailwinds e.g. 十五五规划 related sectors).
  "type_label": array from ${Object.keys(TYPE_LABEL_LABELS).join('|')} (only labels you can support with a source).
}`,

  campus: () => `
Research this company from a STUDENT JOB-SEEKER's perspective (校招视角). All text in Chinese.
Return "fields": {
  "campus_url": official campus-recruiting portal (校园招聘官网, e.g. campus.xxx.com / join.xxx.com/campus) or null; "careers_url": general careers portal or null.
  "campus_overview": 3–6 sentences: autumn / spring campus seasons and timing, internship programmes (incl. remote), management-trainee / special programmes, target degrees & majors, whether overseas graduates (留学生) are explicitly welcomed.
  "study_abroad_friendly": 留学友好 2–3 sentences with evidence (留学生专场 / 海外校园招聘 / overseas hires) or null.
  "company_team_abroad_signal": 团队海外背景信号 1–3 sentences (founders / execs with overseas education or careers; overseas offices) or null.
  "school_company_coop_exp": 校企合作经历 1–3 sentences (joint labs, scholarships, university partnerships) or null.
  "benefits_package": 福利待遇 2–4 sentences: salary bands for graduates if publicly reported, housing / meals / stock / insurance / vacation, work rhythm.
  "candidate_reputation": 求职者口碑 3–6 sentences summarising what public discussions (牛客 / 知乎 / 小红书 / 脉脉 / Glassdoor-style reviews) say about the campus process: 笔试 / 面试轮次与难度, offer 时间线, 薪资爆料, 工作强度, 稳定性. Only include points you actually found via search, each with the platform name in brackets; state clearly this is 观点汇总. null if nothing found.
  "company_evaluate": 公司评价 2–4 sentences: consensus strengths and complaints as an employer, labelled as 观点.
  "ai_comprehensive_evaluate": 综合评价 3–5 sentences: a balanced overall take for a student deciding whether to apply (行业前景 / 平台 / 成长 / 风险).
  "ai_admission_analysis": 总体录取分析 2–4 sentences: how competitive campus hiring is, typical target schools / majors / degrees, tips.
}`,
};

export async function searchCompanyTopic(topic: string, company: { name: string; name_en?: string | null; brief_name?: string | null; country?: string | null; official_website?: string | null; industry?: string | null }, missing: string[], modelId: string, batchId: number) {
  const def = PROFILE_TOPICS.find(t => t.key === topic);
  const build = TOPIC_PROMPTS[topic];
  if (!def || !build) throw new Error(`未知检索主题: ${topic}`);
  const prompt = `
You are a corporate research assistant. Use web search.

Company: ${companyLine(company)}
${build(company, missing)}
${RULES}
Also return "summary": 2–4 sentences in Chinese on what you found, which sources you relied on, and what could not be found.
Return ONLY a JSON object with keys: "fields"${def.entity ? `, "${def.entity}"` : ''}, "sources", "summary".
`;
  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: TOOL, task_name: `Search: ${def.label}`, institution: company.name, batch_id: batchId });
  const fields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
  // 只保留这个主题声明的目标字段（避免模型顺手塞进无关字段）
  const picked: Record<string, any> = {};
  for (const k of def.fields) if (fields[k] !== undefined) picked[k] = fields[k];
  return {
    fields: picked,
    entity: def.entity || null,
    rows: def.entity && Array.isArray(parsed[def.entity]) ? parsed[def.entity] : [],
    sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    summary: str(parsed.summary),
    searchQueries,
    raw: parsed,
  };
}
