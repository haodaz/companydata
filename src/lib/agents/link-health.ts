/**
 * 招聘链接还活着吗：渲染一次（moka / 飞书这类 SPA 要渲染才看得出来），看标题和开头有没有「页面不存在 / 已关停」。
 * 联网搜索常搜到往年的招聘项目页，项目结束后 moka 会显示「当前网页已关停」——这种不能填进企业的招聘入口。
 * 拿不到页面（超时、被拦）算 unknown，不当成失效，免得误删。
 */
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { loginVerdict } from '@/lib/agents/login-wall';
import { linkLanding } from '@/lib/agents/link-landing';

const DEAD = /您访问的页面不存在|当前网页已关停|网页已关停|页面已关闭|该页面不存在|页面不存在|链接已失效|该职位已下线|职位已关闭|招聘已结束|项目已结束|page not found|404 not found|this page (?:does not|doesn't) exist|job (?:is )?no longer available|do not have permission to operate/i;

/** fixedUrl：https 打不开、http 能开时换成的地址（存库时用它） */
export type LinkHealth = { status: 'alive' | 'dead' | 'unknown'; title: string; reason?: string; loginRequired?: boolean; loginReason?: string; fixedUrl?: string };

export async function recruitLinkHealth(url: string): Promise<LinkHealth> {
  // 先直接请求一次看落在哪：跳回网站首页的（大疆 careers.dji.com/campus → /zh-CN）等于没有这个页面
  const land = await linkLanding(url).catch(() => null);
  if (land?.homeRedirect) return { status: 'dead', title: '', reason: `跳回网站首页（${land.finalUrl}）` };
  const fixedUrl = land?.httpFallback;
  if (fixedUrl) url = fixedUrl;
  const md = await fetchJinaUrl(url).catch(() => null);
  if (!md) return { status: fixedUrl ? 'alive' : 'unknown', title: '', fixedUrl, reason: fixedUrl ? 'https 打不开，http 能开' : undefined };
  const title = md.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || '';
  const body = md.split(/Markdown Content:/)[1] || md;
  const head = `${title}\n${body.slice(0, 600)}`;
  const hit = head.match(DEAD)?.[0];
  if (hit) return { status: 'dead', title, reason: hit };
  const lw = loginVerdict({ finalUrl: md.match(/^URL Source:\s*(\S+)/m)?.[1], api: body, page: md });
  return { status: 'alive', title, loginRequired: lw.login, loginReason: lw.reason, fixedUrl };
}
