/**
 * Company Profile Agent — 企业画像补全：官网 / 招聘入口 / 行业 / 类型 / 总部 / 规模 / 简介等。
 * 联网搜索，只返回搜到的值；是否写入由调用方决定（默认只填空字段）。
 */
import { searchJson } from '@/lib/agents/search-llm';
import { COMPANY_TYPE_LABELS, SEGMENT_LABELS, PROFILE_FIELDS, KIND_LABELS, CONTINENT_LABELS } from '@/lib/company-fields';

export interface CompanyProfile {
  segment: string | null;
  jv_partners: string | null;
  campus_overview: string | null;
  name_en: string | null;
  brief_name: string | null;
  official_website: string | null;
  careers_url: string | null;
  campus_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  sub_industry: string | null;
  company_type: string | null;
  stock_code: string | null;
  kind: string | null;
  info_founding_year: number | null;
  company_scale: string | null;
  operating_revenue: string | null;
  continent: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  registration_address: string | null;
  chairman: string | null;
  ceo_general_manager: string | null;
  legal_representative: string | null;
  registered_capital: string | null;
  unified_social_credit_code: string | null;
  company_specialties: string | null;
  product_area: string | null;
  one_sentence: string | null;
  address: string | null;
  introduction: string | null;
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
    2. "official_website": OFFICIAL main homepage (root domain). "brief_name": the common short name (e.g. 腾讯 for 腾讯控股有限公司), null if same as name.
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
    10. "info_founding_year": integer.
    11. "company_scale": headcount as text with the year if known (e.g. "约 164,000（2024）").
    12. "operating_revenue": latest annual revenue as text with currency and fiscal year.
    13. "continent": one of asia | europe | america | south_america | africa | oceania. "country" (中文国家 / 地区名), "province" (中文省份，仅中国大陆企业), "city" (original-language city name), "address" (headquarters postal address), "registration_address" (registered address if different, else null).
    14. "introduction": 3–5 sentence company overview in Chinese (中文): what it does, main products / businesses, market position. "one_sentence": a one-sentence Chinese description (≤ 30 字). "company_specialties": core business areas in Chinese. "product_area": main products / services in Chinese.
    16. "kind": legal form, one of limited_liability_company | joint_stock_company | foreign_invested_enterprise | state_owned_enterprise | sole_proprietorship | limited_partnership | general_partnership | other. "chairman", "ceo_general_manager", "legal_representative": names if found. "registered_capital" (text with currency), "unified_social_credit_code" (中国企业统一社会信用代码，18 位；找不到为 null).
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
    brief_name: str(parsed.brief_name),
    official_website: url(parsed.official_website),
    careers_url: url(parsed.careers_url),
    campus_url: url(parsed.campus_url),
    linkedin_url: url(parsed.linkedin_url),
    industry: str(parsed.industry),
    sub_industry: str(parsed.sub_industry),
    company_type: str(parsed.company_type) && parsed.company_type in COMPANY_TYPE_LABELS ? parsed.company_type : null,
    stock_code: str(parsed.stock_code),
    kind: str(parsed.kind) && parsed.kind in KIND_LABELS ? parsed.kind : null,
    info_founding_year: int(parsed.info_founding_year),
    company_scale: str(parsed.company_scale) ?? (typeof parsed.company_scale === 'number' ? String(parsed.company_scale) : null),
    operating_revenue: str(parsed.operating_revenue),
    continent: str(parsed.continent) && parsed.continent in CONTINENT_LABELS ? parsed.continent : null,
    country: str(parsed.country),
    province: str(parsed.province),
    city: str(parsed.city),
    registration_address: str(parsed.registration_address),
    chairman: str(parsed.chairman),
    ceo_general_manager: str(parsed.ceo_general_manager),
    legal_representative: str(parsed.legal_representative),
    registered_capital: str(parsed.registered_capital),
    unified_social_credit_code: str(parsed.unified_social_credit_code),
    company_specialties: str(parsed.company_specialties),
    product_area: str(parsed.product_area),
    one_sentence: str(parsed.one_sentence),
    address: str(parsed.address),
    introduction: str(parsed.introduction),
    fortune_global_rank: int(parsed.fortune_global_rank),
    ranking_year: int(parsed.ranking_year),
    sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
  };
}
