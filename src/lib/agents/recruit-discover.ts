/**
 * 从企业官网找招聘入口：首页 →「加入我们 / 招聘 / careers」→ 招聘平台（北森 zhiye / moka / 飞书 / hotjob …），最多走两层。
 *
 * 联网检索的模型常给出编出来的子域名 / 子路径（创新奇智给 career. / jobs.ainnovation.com，都不存在），
 * 而官网首页一定是真的：创新奇智首页 →「加入我们」/join →「校园招聘」ainnovation.zhiye.com/campus（北森，有现成接口）。
 * 不调大模型，只看链接文字和地址；找到招聘平台的地址优先，其次官网自己的校招 / 招聘页。
 */
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { isAtsHost } from '@/lib/url-types';

const JOIN_TEXT = /加入我们|加入.{0,4}(我们|团队)|人才招聘|招贤纳士|招聘|校园招聘|校招|实习|join\s*us|careers?|jobs|recruit/i;
const CAMPUS = /校园|校招|应届|毕业生|实习|campus|graduate|intern|students?|school/i;

type Link = { text: string; url: string };
function links(md: string, base: string): Link[] {
  const out: Link[] = [];
  for (const m of md.matchAll(/\[([^\]]{0,80})\]\(([^)\s]+)[^)]*\)/g)) {
    try {
      const u = new URL(m[2], base);
      if (/^https?:$/.test(u.protocol)) out.push({ text: m[1].replace(/!\[[^\]]*\]/g, '').trim(), url: u.href });
    } catch { /* 忽略坏链接 */ }
  }
  return out;
}
const score = (l: Link) => (isAtsHost(new URL(l.url).hostname) ? 10 : 0) + (CAMPUS.test(l.text + ' ' + l.url) ? 3 : 0) + (JOIN_TEXT.test(l.text) ? 2 : 0) + (JOIN_TEXT.test(l.url) ? 1 : 0);

/** 返回按优先级排好的招聘入口（招聘平台 > 官网校招页 > 官网招聘页），找不到返回空数组 */
export async function discoverRecruitEntries(homepage: string, max = 3): Promise<{ url: string; text: string; via: string }[]> {
  const home = /^https?:/.test(homepage) ? homepage : `https://${homepage}`;
  const md = await fetchJinaUrl(home).catch(() => null);
  if (!md) return [];
  const homeHost = (() => { try { return new URL(home).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const sameSite = (u: string) => { try { const h = new URL(u).hostname; return h.endsWith(homeHost) || isAtsHost(h); } catch { return false; } };
  const found = new Map<string, { url: string; text: string; via: string; s: number }>();
  const add = (l: Link, via: string) => { const s = score(l); if (s >= 2 && sameSite(l.url) && !found.has(l.url)) found.set(l.url, { ...l, via, s }); };
  const first = links(md, home).filter(l => JOIN_TEXT.test(l.text) || JOIN_TEXT.test(l.url) || isAtsHost(new URL(l.url).hostname));
  first.forEach(l => add(l, '官网首页'));
  // 第二层：首页上的「加入我们 / 招聘」页再打开一次，看里面有没有招聘平台或校招链接
  const hop = first.filter(l => !isAtsHost(new URL(l.url).hostname)).sort((a, b) => score(b) - score(a)).slice(0, 2);
  for (const l of hop) {
    const m2 = await fetchJinaUrl(l.url).catch(() => null);
    if (m2) links(m2, l.url).forEach(x => add(x, `官网「${l.text || '招聘'}」页`));
  }
  return [...found.values()].sort((a, b) => b.s - a.s).slice(0, max).map(({ url, text, via }) => ({ url, text, via }));
}
