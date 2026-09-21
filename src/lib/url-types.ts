/**
 * 信息源（url_sources）分类定义：type 五大类 + 细分类。
 * 所有页面的标签文案 / 颜色都从这里取，避免各处写死。
 */

export type UrlType = 'homepage' | 'careers' | 'campus' | 'job' | 'about';

export const URL_TYPES: Record<UrlType, { label: string; short: string; color: string; desc: string }> = {
  homepage: { label: '企业官网', short: '官网', color: 'blue', desc: '集团 / 子公司 / 地区站官方主页' },
  campus:   { label: '校招与实习', short: '校招', color: 'orange', desc: '校园招聘官网、应届生 / 实习生 / 管培生项目页、校招职位列表、留学生专场（重点采集）' },
  careers:  { label: '招聘总入口', short: '招聘', color: 'purple', desc: '招聘官网首页、ATS 招聘站（Workday / Greenhouse / Moka / 北森 等）；社招暂不重点采集，作为找校招入口的线索保留' },
  job:      { label: '岗位详情', short: '岗位', color: 'green', desc: '单个岗位的 JD 页面' },
  about:    { label: '企业信息', short: '企业', color: 'cyan', desc: '关于我们、投资者关系、企业文化与福利、新闻中心' },
};

export const URL_TYPE_ORDER: UrlType[] = ['homepage', 'about', 'campus', 'job', 'careers'];

export const URL_TYPE_OPTIONS = URL_TYPE_ORDER.map(t => ({ label: URL_TYPES[t].label, value: t }));

/** 可直接送入「岗位信息提取」工具的类型 */
export const EXTRACTABLE_URL_TYPES: UrlType[] = ['campus', 'job', 'careers'];

export function normalizeUrlType(t?: string | null): UrlType | null {
  if (!t) return null;
  return (t in URL_TYPES) ? (t as UrlType) : null;
}

export function urlTypeMeta(t?: string | null) {
  const n = normalizeUrlType(t);
  return n ? URL_TYPES[n] : { label: '未分类', short: '未分类', color: 'default', desc: '' };
}

/** 细分类（url_sources.subtype），按 type 分组 */
export const URL_SUBTYPES: Record<UrlType, Record<string, string>> = {
  homepage: { group: '集团官网', subsidiary: '子公司 / 品牌', regional: '地区站' },
  careers: { portal: '招聘首页', search: '职位列表', ats: 'ATS 招聘站', team: '团队 / 职能招聘页' },
  campus: { portal: '校招官网', graduate: '应届生', intern: '实习', remote_intern: '远程实习', program: '管培 / 专项计划', overseas: '留学生专场', list: '校招职位列表', events: '宣讲与活动', faq: '校招 FAQ / 流程' },
  job: {},
  about: { about: '关于我们', ir: '投资者关系', culture: '文化与福利', news: '新闻中心', locations: '办公地点' },
};

export function subtypeOptions(type?: string | null) {
  const t = normalizeUrlType(type);
  if (!t) return [];
  return Object.entries(URL_SUBTYPES[t]).map(([value, label]) => ({ value, label }));
}

export function subtypeLabel(type?: string | null, subtype?: string | null): string | null {
  if (!subtype) return null;
  const t = normalizeUrlType(type);
  return (t && URL_SUBTYPES[t][subtype]) || subtype;
}

/** URL 获取工具的检索类型（url_journal.search_type） */
export const SEARCH_TYPES: Record<string, { label: string; color: string }> = {
  campus: { label: '校招 + 实习', color: 'orange' },
  homepage: { label: '企业官网 + 企业信息', color: 'blue' },
};

/** 常见 ATS / 招聘托管域名：企业招聘页经常跳到这些域名，抓取子页面时视为站内 */
export const ATS_DOMAINS = [
  'myworkdayjobs.com', 'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
  'icims.com', 'jobvite.com', 'successfactors.com', 'successfactors.eu', 'taleo.net', 'oraclecloud.com',
  'workable.com', 'bamboohr.com', 'recruitee.com', 'teamtailor.com', 'eightfold.ai', 'phenompeople.com',
  'avature.net', 'brassring.com', 'mokahr.com', 'beisen.com', 'zhiye.com', 'hotjob.cn', 'dayee.com',
];

export function isAtsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ATS_DOMAINS.some(d => h === d || h.endsWith(`.${d}`));
}
