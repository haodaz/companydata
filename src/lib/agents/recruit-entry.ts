/**
 * 招聘入口：给一家企业找到校招 / 社招 / 实习的官方入口。
 *
 * 数据部门反馈（2026-10-08）：查了 1000 家企业，大部分只有行业、地区、管理团队，「没有相关链接」。
 * 画像流水线里的「校招视角」主题会让模型顺手报链接，但 972 家里校招官网只填上了 8%——
 * 模型知道这家公司有校招，却给不出能用的网址。这里换成「先爬官网、再搜」：
 *  1. 官网首页（66% 的企业有）上找「加入我们 / 人才招聘 / 校园招聘 / 社会招聘 / 实习」和招聘平台链接，
 *     只找到总入口时再进去挖一层。不调大模型，只花一两次页面渲染。
 *  2. 一个都没找到，再退回现有的联网搜索（findCampusUrls）。
 */
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { findCampusUrls } from '@/lib/agents/finder-pipeline';

export type RecruitKind = 'campus' | 'intern' | 'social' | 'careers';
export interface RecruitLink { kind: RecruitKind; url: string; text: string }
export interface RecruitEntry { campus: string | null; intern: string | null; social: string | null; careers: string | null; links: RecruitLink[]; via: 'homepage' | 'search' | 'none' }

/** 招聘平台：企业自己的招聘板块常托管在这些域名上 */
const ATS = /(hotjob\.cn|mokahr\.com|zhiye\.com|beisen\.com|jobs\.feishu\.cn|dingtalkcloud\.com|myworkdayjobs\.com|greenhouse\.io|lever\.co|smartrecruiters\.com|successfactors|taleo\.net|avature\.net|icims\.com|51job\.com\/(?!\w*\.php)|wintalent\.cn|zhaopin\.cn\/\w+|hirede\.com|jobs\.\w+\.com)/i;
/** 第三方招聘网站，不算官方入口 */
const AGGREGATOR = /(zhipin\.com|liepin\.com|lagou\.com|zhaopin\.com|nowcoder\.com|shixiseng\.com|yingjiesheng\.com|gaoxiaojob\.com|haitou\.cc|linkedin\.com|indeed\.|glassdoor\.|kanzhun\.com|maimai\.cn|zhihu\.com|weibo\.com|baike\.)/i;

/** 只是某个网站的首页根路径——搜索常把企业官网首页当成「招聘总入口」报上来，这不算入口 */
function bareHomepage(url: string): boolean {
  try {
    const u = new URL(url);
    if (ATS.test(url)) return false;
    if (/(^|\.)(hr|job|jobs|career|careers|zhaopin|campus|join|talent|recruit)\./i.test(u.hostname)) return false;
    return u.pathname === '/' || u.pathname === '' || /^\/(index|default|home)(\.\w+)?$/i.test(u.pathname);
  } catch { return true; }
}

const KIND_RULES: [RecruitKind, RegExp][] = [
  ['intern', /实习|intern/i],
  ['campus', /校园招聘|校招|应届|毕业生|campus|graduate|students?\b|school\.html|校园/i],
  ['social', /社会招聘|社招|social\.html|experienced|社会人才|lateral/i],
  ['careers', /加入我们|人才招聘|招贤纳士|招聘|人才发展|careers?|jobs?\b|join[-_ ]?us|hiring|recruit/i],
];

function linksOf(markdown: string, base: string): { text: string; url: string }[] {
  const re = /\[([^\]]{0,80})\]\(([^)\s]+)[^)]*\)/g;
  const out = new Map<string, string>();
  let m;
  while ((m = re.exec(markdown))) {
    try {
      const u = new URL(m[2], base);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (!/^#!?\//.test(u.hash)) u.hash = '';
      if (!out.has(u.href)) out.set(u.href, m[1].replace(/!\[[^\]]*\]/g, '').trim());
    } catch { /* 忽略坏链接 */ }
  }
  return [...out].map(([url, text]) => ({ url, text }));
}

function classify(links: { text: string; url: string }[]): RecruitLink[] {
  const out: RecruitLink[] = [];
  for (const l of links) {
    if (AGGREGATOR.test(l.url) || bareHomepage(l.url)) continue;
    const hay = `${l.text} ${decodeURIComponent(l.url)}`;
    const kind = KIND_RULES.find(([, re]) => re.test(hay))?.[0] || (ATS.test(l.url) ? 'careers' : null);
    if (!kind) continue;
    // 新闻稿标题里提一句「招聘」的不算入口
    if (kind === 'careers' && !ATS.test(l.url) && l.text.length > 16) continue;
    out.push({ kind, url: l.url, text: l.text });
  }
  return out;
}

const pick = (links: RecruitLink[], kind: RecruitKind) => {
  const c = links.filter(l => l.kind === kind);
  // 托管在招聘平台上的、文字短的（就是导航按钮）优先
  c.sort((a, b) => (Number(ATS.test(b.url)) - Number(ATS.test(a.url))) || (a.text.length - b.text.length));
  return c[0]?.url || null;
};

export async function discoverRecruitEntry(name: string, officialWebsite: string | null | undefined, modelId?: string): Promise<RecruitEntry> {
  let links: RecruitLink[] = [];
  if (officialWebsite) {
    const home = await fetchJinaUrl(officialWebsite);
    if (home) links = classify(linksOf(home, officialWebsite));
    // 首页只有一个「招聘 / 加入我们」总入口：进去再挖一层，校招 / 社招 / 实习常在下一层
    const hasSpecific = links.some(l => l.kind !== 'careers');
    const landing = pick(links, 'careers');
    if (!hasSpecific && landing) {
      const md = await fetchJinaUrl(landing);
      if (md) links = [...links, ...classify(linksOf(md, landing))];
    }
  }
  const dedup = (ls: RecruitLink[]) => { const s = new Set<string>(); return ls.filter(l => !s.has(l.url) && s.add(l.url)); };
  links = dedup(links);
  if (links.length) {
    return { campus: pick(links, 'campus'), intern: pick(links, 'intern'), social: pick(links, 'social'), careers: pick(links, 'careers') || pick(links, 'social'), links, via: 'homepage' };
  }

  // 官网上一个都没找到：退回联网搜索
  try {
    const r = await findCampusUrls(name, '', modelId);
    const mapped: RecruitLink[] = (r.urls || []).map((u: any) => ({
      kind: (u.type === 'careers' ? 'careers' : u.subtype === 'intern' || u.subtype === 'remote_intern' ? 'intern' : u.type === 'campus' ? 'campus' : 'careers') as RecruitKind,
      url: u.url, text: u.title || '',
    })).filter((l: RecruitLink) => !AGGREGATOR.test(l.url) && !bareHomepage(l.url));
    if (mapped.length) return { campus: pick(mapped, 'campus'), intern: pick(mapped, 'intern'), social: null, careers: pick(mapped, 'careers'), links: dedup(mapped), via: 'search' };
  } catch (e: any) { console.error('[recruit-entry] search', e?.message || e); }
  return { campus: null, intern: null, social: null, careers: null, links: [], via: 'none' };
}
