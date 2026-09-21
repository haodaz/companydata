/**
 * Company Profile Agent — 企业画像补全：官网 / 招聘入口 / 行业 / 类型 / 总部 / 规模 / 简介等。
 * 联网搜索，只返回搜到的值；是否写入由调用方决定（默认只填空字段）。
 */
import { searchJson } from '@/lib/agents/search-llm';
import { COMPANY_TYPE_LABELS, SEGMENT_LABELS, PROFILE_FIELDS } from '@/lib/company-fields';

export interface CompanyProfile {
  segment: string | null;
  jv_partners: string | null;
  campus_overview: string | null;
  name_en: string | null;
  website: string | null;
  careers_url: string | null;
  campus_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  sub_industry: string | null;
  company_type: string | null;
  stock_code: string | null;
  founded_year: number | null;
  employee_count: string | null;
  revenue: string | null;
  hq_country: string | null;
  hq_city: string | null;
  address: string | null;
  description: string | null;
  fortune_global_rank: number | null;
  ranking_year: number | null;
  sources: Record<string, string>;
}

export async function findCompanyProfile(name: string, nameEn: string, country: string, modelId: string = 'gemini-3.8-flash'): Promise<CompanyProfile> {
  const prompt = `
    You are a corporate research assistant. Look up basic facts about this company using web search.

    Company: ${name}${nameEn && nameEn !== name ? ` (${nameEn})` : ''}${country ? `, ${country}` : ''}

    Find:
    1. "name_en": official English name.
    2. "website": OFFICIAL main homepage (root domain).
    3. "campus_url": official CAMPUS recruitment / early-careers / graduate & internship portal (for Chinese companies the 校园招聘官网, e.g. campus.xxx.com / join.xxx.com/campus). This is the most important link.
    4. "careers_url": the general careers portal landing page.
    4b. "campus_overview": 3–6 sentences in Chinese (中文) on how this company recruits students: autumn / spring campus seasons and usual timing, internship programmes (incl. remote internships if any), management-trainee or special talent programmes, target degrees / majors, and whether overseas-university students (留学生) are explicitly welcomed.
    4c. "segment": classify the company as one of "china" (headquartered in mainland China / Hong Kong / Macau / Taiwan and Chinese-controlled), "joint_venture" (a Sino-foreign joint venture operating in China, e.g. SAIC Volkswagen, 华晨宝马), "overseas_top" (a leading multinational headquartered outside China — Fortune Global 500 / top of its industry), or "other".
    4d. "jv_partners": for joint ventures only — the Chinese and foreign shareholders, e.g. "上汽集团 × Volkswagen AG"; otherwise null.
    5. "linkedin_url": official LinkedIn company page.
    6. "industry": industry in Chinese (中文), e.g. 互联网 / 半导体 / 投资银行 / 管理咨询 / 汽车 / 生物医药 / 快消.
    7. "sub_industry": finer segment in Chinese, e.g. 电商 / 云计算 / 新能源汽车.
    8. "company_type": one of "public" | "private" | "state_owned" | "joint_venture" | "foreign" | "startup" | "nonprofit" | "government" (from a mainland-China perspective: "foreign" = multinational headquartered outside mainland China; "joint_venture" = Sino-foreign JV).
    9. "stock_code": primary listing, format "EXCHANGE: TICKER" (e.g. "NASDAQ: AAPL", "HKEX: 0700"); null if not listed.
    10. "founded_year": integer.
    11. "employee_count": headcount as text with the year if known (e.g. "约 164,000（2024）").
    12. "revenue": latest annual revenue as text with currency and fiscal year.
    13. "hq_country" (中文国家 / 地区名), "hq_city" (original-language city name), "address" (headquarters postal address).
    14. "description": 3–5 sentence company overview in Chinese (中文): what it does, main products / businesses, market position.
    15. "fortune_global_rank": latest Fortune Global 500 rank (integer) or null; "ranking_year": the edition year of that ranking.

    Rules:
    - Only report values you actually found in search results. Use null when not found. Do NOT guess.
    - "sources": map each non-null field name to the URL where you found it.

    Return ONLY a JSON object with exactly these keys:
    { ${PROFILE_FIELDS.map(f => `"${f}"`).join(', ')}, "sources" }
  `;

  const { parsed } = await searchJson(prompt, modelId, { tool_name: 'company-profile', task_name: 'Company Profile', institution: name });

  const int = (v: any) => {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const url = (v: any) => { const s = str(v); return s && /^https?:\/\//i.test(s) ? s : null; };

  return {
    name_en: str(parsed.name_en),
    segment: str(parsed.segment) && parsed.segment in SEGMENT_LABELS ? parsed.segment : null,
    jv_partners: str(parsed.jv_partners),
    campus_overview: str(parsed.campus_overview),
    website: url(parsed.website),
    careers_url: url(parsed.careers_url),
    campus_url: url(parsed.campus_url),
    linkedin_url: url(parsed.linkedin_url),
    industry: str(parsed.industry),
    sub_industry: str(parsed.sub_industry),
    company_type: str(parsed.company_type) && parsed.company_type in COMPANY_TYPE_LABELS ? parsed.company_type : null,
    stock_code: str(parsed.stock_code),
    founded_year: int(parsed.founded_year),
    employee_count: str(parsed.employee_count) ?? (typeof parsed.employee_count === 'number' ? String(parsed.employee_count) : null),
    revenue: str(parsed.revenue),
    hq_country: str(parsed.hq_country),
    hq_city: str(parsed.hq_city),
    address: str(parsed.address),
    description: str(parsed.description),
    fortune_global_rank: int(parsed.fortune_global_rank),
    ranking_year: int(parsed.ranking_year),
    sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
  };
}
