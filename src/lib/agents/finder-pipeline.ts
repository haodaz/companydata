/**
 * Finder Agent（企业版）：输入企业名，联网检索官方信息源 URL。
 *   - findCampusUrls   校招官网 / 应届生 / 实习（含远程）/ 管培专项 / 留学生专场 / 代表性岗位页
 *   - findHomepageUrls 企业官网（集团 / 子公司 / 地区站）+ 企业信息页（关于 / IR / 文化福利 / 新闻）
 *   - findCompanyList  从无到有建名单：按描述列出目标企业（中国企业 / 中外合资 / 海外百强）
 *   - generateFinderReport 汇总成中文报告
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { searchJson, parseJsonLoose } from '@/lib/agents/search-llm';
import { ATS_DOMAINS } from '@/lib/url-types';

export interface FoundUrl {
  title: string;
  url: string;
  type: 'homepage' | 'careers' | 'campus' | 'job' | 'about';
  subtype?: string;
  /** 业务线 / 子公司 / 地区；适用于整个企业时为空 */
  unit?: string;
  reasoning: string;
}

export interface FinderUrlResult {
  search_queries: string[];
  urls: FoundUrl[];
}

export interface FinderReportResult {
  detailed_report: string;
}

const VALID_TYPES = new Set(['homepage', 'careers', 'campus', 'job', 'about']);

function cleanUrls(raw: any, allowed: string[], fallbackType: FoundUrl['type']): FoundUrl[] {
  const seen = new Set<string>();
  const out: FoundUrl[] = [];
  for (const u of Array.isArray(raw) ? raw : []) {
    const url = typeof u?.url === 'string' ? u.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const type = VALID_TYPES.has(u.type) && allowed.includes(u.type) ? u.type : fallbackType;
    out.push({
      title: String(u.title || url).trim(),
      url,
      type,
      subtype: typeof u.subtype === 'string' && u.subtype.trim() ? u.subtype.trim() : undefined,
      unit: typeof u.unit === 'string' && u.unit.trim() && !/^(group|company|全公司|集团)$/i.test(u.unit.trim()) ? u.unit.trim() : undefined,
      reasoning: String(u.reasoning || '').trim(),
    });
  }
  return out;
}

// --- 校招 + 实习（重点；社招暂不采集，只保留招聘总入口作线索）---
export async function findCampusUrls(company: string, unit: string, modelId: string = 'gemini-3.8-flash'): Promise<FinderUrlResult> {
  const prompt = `
    You are an expert campus-recruiting intelligence search assistant.
    Task: Find the OFFICIAL webpages where a company recruits STUDENTS and FRESH GRADUATES: campus recruitment, graduate programmes, internships (including REMOTE / online internships), management-trainee and special talent programmes.
    We do NOT need experienced-hire (社招) job lists.

    Target Company: ${company}
    Target Business Unit / Subsidiary / Region: ${unit ? unit : 'Not specified (whole company). If it is a multinational, cover BOTH its China campus recruitment and its global early-careers site.'}

    Find pages of these types ("type" field) and sub-types ("subtype" field):
    - "campus" (the main target):
        "portal":        the campus / early-careers site landing page (校园招聘官网, e.g. campus.xxx.com, join.xxx.com/campus, careers.xxx.com/students)
        "list":          the page that actually LISTS campus / intern positions (校招职位列表)
        "graduate":      new-grad / 应届生 recruitment pages, incl. the current season's announcement (e.g. "2027届秋季校园招聘")
        "intern":        internship programme pages (暑期实习 / 日常实习)
        "remote_intern": remote / online / virtual internship programmes
        "program":       management trainee / rotational / special talent programmes (管培生、专项人才计划)
        "overseas":      pages aimed at overseas-university students / returnees (留学生专场、海外校招、global campus)
        "events":        campus talks / recruiting calendar (宣讲会行程)
        "faq":           campus recruitment FAQ / process / timeline pages
    - "careers":
        "portal": the general careers site landing page — return at most 2, only as an entry point.
        "ats":    the company's board on an applicant tracking system (${ATS_DOMAINS.slice(0, 6).join(', ')}, mokahr.com, beisen.com, zhiye.com ...) when campus roles are hosted there.
    - "job": at most 5 representative individual INTERN / GRADUATE posting pages (only live ones you actually found; never invent URLs).

    Rules:
    1. OFFICIAL sources only: the company's own domain(s), its own ATS board, or its official WeChat-article / official-account announcement hosted on its own site.
       NEVER return aggregators or third-party boards (LinkedIn, Indeed, Glassdoor, BOSS直聘, 智联招聘, 前程无忧, 猎聘, 拉勾, 牛客, 实习僧, 应届生求职网, 海投网, 知乎, Wikipedia, news sites).
    2. For Chinese companies and Sino-foreign joint ventures, search in Chinese (e.g. "${company} 校园招聘 官网", "${company} 实习生 招聘", "${company} 管培生", "${company} 留学生 校招"). 校招官网 is often a separate domain from 社招官网.
       For multinationals search "students", "graduates", "early careers", "internships", plus their China campus site (e.g. "${company} China campus recruitment").
    3. Prefer pages that list real openings or state concrete timelines over pure marketing pages. Do NOT return the same URL twice.
    4. "unit" = the business unit / subsidiary / region the page belongs to; use "" if it covers the whole company.
    5. "title" = the page's own title, original language.
    6. "reasoning" MUST be in Chinese (中文), one sentence on what the page provides (mention 届别 / season / remote / 留学生 if the page says so).
    7. Aim for 5–20 URLs. Only return URLs you actually saw in search results.

    Return a JSON object STRICTLY matching this format:
    {
       "urls": [
         {
           "title": "2027届校园招聘 - Example 招聘官网",
           "url": "https://...",
           "type": "campus",
           "subtype": "graduate",
           "unit": "",
           "reasoning": "2027 届秋季校园招聘主页，含岗位列表入口、网申时间与招聘流程，明确面向海内外院校毕业生。"
         }
       ]
    }
  `;

  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: 'finder', task_name: 'Campus URLs Search', institution: company });
  return { search_queries: searchQueries, urls: cleanUrls(parsed.urls, ['campus', 'careers', 'job'], 'campus') };
}

// --- 企业官网 + 企业信息 ---
export async function findHomepageUrls(company: string, unit: string, modelId: string = 'gemini-3.8-flash'): Promise<FinderUrlResult> {
  const prompt = `
    You are an expert corporate-research search assistant.
    Task: Find the OFFICIAL websites of a company and the official pages that describe the company.

    Target Company: ${company}
    Target Business Unit / Subsidiary / Region: ${unit ? unit : 'Not specified (whole company)'}

    Find pages of these types ("type" field) and sub-types ("subtype" field):
    - "homepage":
        "group":      the company's main official website (root domain)
        "subsidiary": official sites of major subsidiaries / brands / business units
        "regional":   official regional / country sites (e.g. the China site of a multinational)
    - "about":
        "about":     About us / company overview / leadership
        "ir":        Investor relations / annual reports
        "culture":   Culture, values, benefits, life-at-company pages
        "news":      Newsroom / press releases
        "locations": Office locations

    Rules:
    1. OFFICIAL pages on the company's own domain(s) only. No Wikipedia, Crunchbase, LinkedIn, 天眼查, 企查查, 百度百科, news articles.
    2. Do NOT return careers / job pages here (another agent collects those).
    3. ${unit ? 'Focus on the target unit; include the group homepage as well.' : 'Return the group homepage first, then up to 10 major subsidiaries / regional sites, then the "about" pages.'}
    4. "unit" = subsidiary / brand / region name the page belongs to; "" for the whole company.
    5. "reasoning" MUST be in Chinese (中文), one sentence. Keep proper nouns in their original language.
    6. Only return URLs you actually saw in search results. Do NOT return the same URL twice.

    Return a JSON object STRICTLY matching this format:
    {
       "urls": [
         { "title": "Example Inc. — Official Site", "url": "https://...", "type": "homepage", "subtype": "group", "unit": "", "reasoning": "集团官方网站首页，提供业务、产品与新闻入口。" }
       ]
    }
  `;

  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: 'finder', task_name: 'Homepage URLs Search', institution: company });
  return { search_queries: searchQueries, urls: cleanUrls(parsed.urls, ['homepage', 'about'], 'homepage') };
}

// --- 从无到有建名单 ---
export interface ListedCompany {
  name: string;
  name_en: string | null;
  segment: 'china' | 'joint_venture' | 'overseas_top' | 'other';
  industry: string | null;
  hq_country: string | null;
  website: string | null;
  jv_partners: string | null;
  reasoning: string;
}

export async function findCompanyList(query: string, count: number, modelId: string = 'gemini-3.8-flash'): Promise<{ search_queries: string[]; companies: ListedCompany[] }> {
  const n = Math.min(Math.max(count || 30, 5), 100);
  const prompt = `
    You are a corporate research assistant building a TARGET COMPANY LIST for a campus-recruiting data platform used by Chinese students (including overseas-university students).
    We track three segments:
      - "china":         leading Chinese companies (mainland / HK / Macau / Taiwan headquartered, Chinese-controlled) — 央企国企、互联网大厂、金融机构、制造龙头、新能源、半导体、快消等
      - "joint_venture": Sino-foreign joint ventures operating in China (e.g. 上汽大众, 华晨宝马, 中外合资银行 / 保险 / 基金 / 证券)
      - "overseas_top":  top multinationals headquartered outside China (Fortune Global 500 top ranks, or clear leaders of their industry) — especially those that recruit Chinese students
      - "other": anything else the user explicitly asks for

    User request: ${query}
    Number of companies wanted: about ${n}

    Rules:
    1. Use web search to ground the list in a real, recent ranking or authoritative source when the request implies one (e.g. Fortune Global 500, 中国企业500强, 行业排名). Do NOT invent companies.
    2. "name": the name Chinese students commonly use — Chinese name if one is in common use (腾讯, 宝洁, 上汽大众), otherwise the English name.
    3. "name_en": official English name. "industry": in Chinese (中文). "hq_country": in Chinese (中文).
    4. "website": official homepage root URL if you saw it, else null. "jv_partners": for joint ventures, "中方 × 外方", else null.
    5. "reasoning": one Chinese sentence — why it belongs in the list (rank / position / known campus programme).
    6. No duplicates; list parent brands rather than every subsidiary unless the user asks.

    Return ONLY a JSON object:
    { "companies": [ { "name": "", "name_en": "", "segment": "china", "industry": "", "hq_country": "", "website": null, "jv_partners": null, "reasoning": "" } ] }
  `;

  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: 'finder', task_name: 'Build Company List', institution: query.slice(0, 80) });
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const seen = new Set<string>();
  const companies: ListedCompany[] = [];
  for (const c of Array.isArray(parsed.companies) ? parsed.companies : []) {
    const name = str(c?.name) || str(c?.name_en);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    companies.push({
      name,
      name_en: str(c.name_en),
      segment: ['china', 'joint_venture', 'overseas_top', 'other'].includes(c.segment) ? c.segment : 'other',
      industry: str(c.industry),
      hq_country: str(c.hq_country),
      website: str(c.website) && /^https?:\/\//i.test(c.website) ? c.website.trim() : null,
      jv_partners: str(c.jv_partners),
      reasoning: str(c.reasoning) || '',
    });
  }
  return { search_queries: searchQueries, companies };
}

// --- 汇总报告 ---
export async function generateFinderReport(company: string, unit: string, searchType: 'campus' | 'homepage', urls: FoundUrl[], modelId: string = 'gemini-3.8-flash'): Promise<FinderReportResult> {
  const structure = searchType === 'campus'
    ? `
    ### 1. 校招体系总览
    - 一段话概括这家企业怎么招学生：校招官网是否独立、秋招 / 春招 / 实习节奏、是否有管培或专项计划、是否有远程实习、是否面向海外留学生、是否托管在第三方 ATS。
    ### 2. 校招官网与职位列表
    ### 3. 应届生招聘（按届别 / 招聘季）
    ### 4. 实习项目（暑期 / 日常 / 远程）
    ### 5. 管培与专项计划
    ### 6. 留学生相关（专场、海外网申通道）
    ### 7. 宣讲活动与 FAQ / 流程
    ### 8. 采集建议
    - 哪些 URL 最适合送入「岗位信息提取」（优先真实列出岗位或写明时间线的页面），哪些页面需要翻页或按地区分别采集。
    ### 9. 可能遗漏
    - 怀疑存在但没搜到的入口（子公司独立校招站、海外校招站等）。`
    : `
    ### 1. 企业官网总览
    - 集团官网 + 一段话企业简介（只根据已收集页面的描述，不要编造数据）。
    ### 2. 子公司 / 品牌 / 地区站
    ### 3. 企业信息页（按 关于我们 / 投资者关系 / 文化与福利 / 新闻中心 / 办公地点 分组）
    ### 4. 域名规律
    ### 5. 可能遗漏`;

  const prompt = `
    You are an expert recruiting-intelligence analyst. Generate a DETAILED report from the URLs collected by the search agent.
    DO NOT omit any URL. DO NOT invent URLs or facts that are not in the data.

    Target Company: ${company}
    Target Unit: ${unit || 'Whole company'}

    Data Collected:
    ${JSON.stringify(urls, null, 2)}

    ## REPORT STRUCTURE (use exactly these sections; skip a group only if it has no URLs)
    ${structure}

    ## RULES
    1. Write in Chinese (中文). Keep proper nouns (company, product, team names) in their original language.
    2. EVERY collected URL must appear as a clickable markdown link with a one-sentence description.
    3. Return JSON: { "detailed_report": "markdown string" }
  `;

  const result = await generateContent(prompt, modelId, { jsonMode: true });
  await logTokenUsage({ tool_name: 'finder', task_name: 'Generate Finder Report', institution: company, model_id: modelId, usageMetadata: result.usageMetadata, success: true })
    .catch(e => console.error('Token logging failed', e));

  const parsed = parseJsonLoose(result.text);
  return { detailed_report: parsed.detailed_report || '报告解析失败。' };
}
