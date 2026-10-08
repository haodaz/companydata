/**
 * 招聘链接还活着吗：渲染一次（moka / 飞书这类 SPA 要渲染才看得出来），看标题和开头有没有「页面不存在 / 已关停」。
 * 联网搜索常搜到往年的招聘项目页，项目结束后 moka 会显示「当前网页已关停」——这种不能填进企业的招聘入口。
 * 拿不到页面（超时、被拦）算 unknown，不当成失效，免得误删。
 */
import { fetchJinaUrl } from '@/lib/agents/fetcher';

const DEAD = /您访问的页面不存在|当前网页已关停|网页已关停|页面已关闭|该页面不存在|页面不存在|链接已失效|该职位已下线|职位已关闭|招聘已结束|项目已结束|page not found|404 not found|this page (?:does not|doesn't) exist|job (?:is )?no longer available/i;

export type LinkHealth = { status: 'alive' | 'dead' | 'unknown'; title: string; reason?: string };

export async function recruitLinkHealth(url: string): Promise<LinkHealth> {
  const md = await fetchJinaUrl(url).catch(() => null);
  if (!md) return { status: 'unknown', title: '' };
  const title = md.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || '';
  const body = md.split(/Markdown Content:/)[1] || md;
  const head = `${title}\n${body.slice(0, 600)}`;
  const hit = head.match(DEAD)?.[0];
  if (hit) return { status: 'dead', title, reason: hit };
  return { status: 'alive', title };
}
