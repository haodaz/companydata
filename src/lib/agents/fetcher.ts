/**
 * Fetcher Agent（企业版）：抓取招聘页面 Markdown，并让大模型从页面链接里挑出岗位详情页 / 岗位列表页继续抓。
 * 与院校版同一套两段式：fetchBaseAndLinks（主页 + 选子页面）→ fetchAndEvaluateBatch（分批抓取 + 判定是否有用）。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { isAtsHost } from '@/lib/url-types';
import { atsOf, beisenMarkdown, hotjobMarkdown, resolveListUrl } from '@/lib/agents/ats-adapters';

const MAX_CANDIDATES = 15;
/** moka / 飞书这类招聘平台的列表页一页就是几十个岗位，详情页多挑一些 */
const MAX_CANDIDATES_ATS = 40;

/** 招聘页上永远不值得抓的链接 */
const SKIP_LINK = /(login|signin|sign-in|signup|register|account|privacy|cookie|terms|legal|sitemap|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|linkedin\.com|weibo\.com|\.(png|jpe?g|gif|svg|pdf|zip|mp4)(\?|$))/i;

function rootDomain(hostname: string): string {
  const parts = hostname.split('.');
  // co.uk / com.cn / com.hk 这类二级后缀多留一段
  const twoLevelTld = parts.length >= 3 && /^(co|com|net|org|edu|gov|ac)$/.test(parts[parts.length - 2]);
  return parts.slice(-(twoLevelTld ? 3 : 2)).join('.');
}

function extractLinks(markdown: string, baseUrl: string): { text: string; url: string }[] {
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;
  const base = new URL(baseUrl);
  const baseRoot = rootDomain(base.hostname);
  const unique = new Map<string, string>();
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const text = match[1].trim();
    const href = match[2].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (!/^https?:$/.test(resolved.protocol)) continue;
      // 单页招聘站的前端路由（moka 的 #/job/<id>、#!/position/1）是不同的页面，不能当页内锚点删掉——
      // 以前一律删 #，华大九天 13 个岗位的详情链接全塌成同一个首页地址，被当作重复丢了
      if (!/^#!?\//.test(resolved.hash)) resolved.hash = '';
      const url = resolved.href;
      if (SKIP_LINK.test(url) || url === base.href) continue;
      // 站内链接，或企业托管在 ATS 上的招聘站（careers 页经常跳到 greenhouse / workday / moka 等）
      if (resolved.hostname.endsWith(baseRoot) || isAtsHost(resolved.hostname)) {
        if (!unique.has(url)) unique.set(url, text);
      }
    } catch { /* ignore invalid URLs */ }
  }
  return Array.from(unique.entries()).map(([url, text]) => ({ text, url }));
}

export async function fetchJinaUrl(url: string): Promise<string | null> {
  try {
    // 用 POST、网址放在请求体里。GET 的写法（r.jina.ai/<网址>）在请求发出前就把 # 后面丢了，
    // 渲染服务打开的永远是单页应用的首页那一层：华大九天（moka）只拿到四个分类名，
    // 改成 POST 后 13 个岗位、每个岗位的完整职责都拿得到（2026-10-08 数据部门反馈）。
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'text/markdown', 'X-Timeout': '25' };
    // 可选：配了 JINA_API_KEY 就走付费额度（免费额度有频率限制，整批跑上千家企业时容易被限流）
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    // 被限流（429）或渲染服务临时出错（5xx）时等一等再试：批量补跑上千家时一定会碰到，
    // 不重试的话这些企业会被当成「官网上没有招聘链接」，白白掉进更贵的联网搜索
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch('https://r.jina.ai/', {
        method: 'POST', headers, body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(40000), // 招聘站多为 JS 渲染，给足渲染时间
      });
      if (response.ok) return await response.text();
      if (response.status !== 429 && response.status < 500) return null;
      await new Promise(r => setTimeout(r, [4000, 12000, 0][attempt]));
    }
    return null;
  } catch (e) {
    console.error(`Error fetching ${url}:`, e);
    return null;
  }
}

const JOB_INDICATORS = `
        1. 岗位本身 (The role): job title, team / department, location, job type (full-time / intern / graduate).
        2. 岗位职责 (Responsibilities): what the person will do.
        3. 任职要求 (Qualifications): education, major, years of experience, skills, languages, certificates.
        4. 薪酬福利 (Compensation): salary range, bonus, equity, benefits.
        5. 投递信息 (Application): how to apply, deadline, visa sponsorship / work authorization, graduation year for campus roles.`;

export interface InitResult {
  success: boolean;
  base_markdown: string;
  candidate_urls: string[];
  error_message?: string;
}

export interface BatchResult {
  success: boolean;
  useful_markdown: string;
  evaluated_urls: string[];
  useful_urls: string[];
  error_message?: string;
}

export type ExtractScope = 'campus' | 'all';

export async function fetchBaseAndLinks(url: string, modelId: string = 'gemini-3.8-flash', batchId?: number, hint: string = '', scope: ExtractScope = 'campus'): Promise<InitResult> {
  try {
    const ats = atsOf(url);
    // hotjob：直接走它的公开接口，所有岗位连同详情一次拿全，不用再挑子页面
    if (ats === 'hotjob') {
      const hj = await hotjobMarkdown(url, scope).catch(e => { console.error('[fetcher] hotjob', e?.message || e); return null; });
      if (hj && hj.count) return { success: true, base_markdown: `### Source: [Main Page](${url})\n\n（hotjob 接口返回 ${hj.count} 个岗位）\n\n${hj.markdown}\n\n`, candidate_urls: [] };
    }
    // 北森：同样走公开接口，带职责 / 要求
    if (ats === 'beisen') {
      const bs = await beisenMarkdown(url, scope).catch(e => { console.error('[fetcher] beisen', e?.message || e); return null; });
      if (bs && bs.count) return { success: true, base_markdown: `### Source: [Main Page](${url})\n\n（北森接口返回 ${bs.count} 个岗位）\n\n${bs.markdown}\n\n`, candidate_urls: [] };
    }
    // 飞书：入口改写成「一次列全」的列表地址
    const baseMarkdown = await fetchJinaUrl(await resolveListUrl(url));
    if (!baseMarkdown) {
      return { success: false, base_markdown: '', candidate_urls: [], error_message: `Jina fetch failed for base URL: ${url}` };
    }

    const allLinks = extractLinks(baseMarkdown, url);
    let selected: string[] = [];

    if (allLinks.length > 0) {
      try {
        const result = await generateContent(`
        You are a smart crawler working on a company's recruiting website. Here is the list of links found on one page.
        Select up to ${ats === 'moka' || ats === 'feishu' ? MAX_CANDIDATES_ATS : MAX_CANDIDATES} links that are MOST LIKELY to be:
          (a) an INDIVIDUAL JOB POSTING page (a single role with its description), or
          (b) a job LIST / search-results page that lists more openings (e.g. "View all jobs", next page, a team's or location's openings).
          (c) a campus-recruitment INFORMATION page: season announcement, programme description (管培 / 专项 / internship programme), timeline / process / FAQ, overseas-student (留学生) session.
        If the current page is already a single job posting, return an empty list.
        ${scope === 'campus'
          ? 'SCOPE: we only collect roles for STUDENTS and FRESH GRADUATES — campus / graduate roles, internships (incl. remote internships), trainee programmes. Do NOT select experienced-hire (社招) postings or lists.'
          : 'SCOPE: all openings, but prefer campus / graduate / internship roles when there are more links than the limit.'}
        ${hint ? `The user is especially interested in: ${hint}. Prefer links matching this.` : ''}

        A useful page would contain:${JOB_INDICATORS}

        Do NOT select: company homepages, about / culture / blog / news pages, benefits marketing pages, login or candidate-profile pages, talent community sign-ups, social media.

        Links:
        ${JSON.stringify(allLinks.slice(0, 200), null, 2)}

        Return a JSON object strictly matching this format:
        { "selected_urls": ["url1", "url2"] }
      `, modelId, { jsonMode: true });

        const known = new Set(allLinks.map(l => l.url));
        selected = (parseJsonLoose(result.text).selected_urls || [])
          .filter((u: unknown): u is string => typeof u === 'string' && known.has(u)) // 只接受页面上真实存在的链接
          .slice(0, ats === 'moka' || ats === 'feishu' ? MAX_CANDIDATES_ATS : MAX_CANDIDATES);

        await logTokenUsage({ tool_name: 'fetcher', task_name: `Sub-page Discovery (${MAX_CANDIDATES} links)`, institution: url, model_id: modelId, usageMetadata: result.usageMetadata, success: true, batch_id: batchId })
          .catch(e => console.error('Token logging failed', e));
      } catch (e) {
        console.error('LLM link selection failed', e);
      }
    }

    return {
      success: true,
      base_markdown: `### Source: [Main Page](${url})\n\n${baseMarkdown}\n\n`,
      candidate_urls: selected,
    };
  } catch (error: any) {
    return { success: false, base_markdown: '', candidate_urls: [], error_message: error.message };
  }
}

export async function fetchAndEvaluateBatch(urls: string[], modelId: string = 'gemini-3.8-flash', batchId?: number): Promise<BatchResult> {
  try {
    const subResults = await Promise.all(urls.map(async subUrl => ({ url: subUrl, markdown: await fetchJinaUrl(subUrl) })));

    let combinedUseful = '';
    const usefulUrls: string[] = [];

    for (const res of subResults) {
      if (!res.markdown) continue;
      const block = `\n\n---\n### Source: [Sub-page](${res.url})\n\n${res.markdown}\n\n`;

      try {
        const evalResult = await generateContent(`
        You are a crawler evaluating a fetched page from a company's recruiting website.
        Does this page contain at least ONE CONCRETE JOB OPENING — a specific role with a title plus some of the following?${JOB_INDICATORS}

        Mark USEFUL if it is a job posting, or a list page that names specific open roles.
        Mark NOT useful if it is a marketing / culture / benefits page, an empty search page ("no results"), a login wall, an error page, or generic navigation.

        Markdown Snippet (first 15000 chars):
        ${res.markdown.substring(0, 15000)}

        Return JSON: { "is_useful": boolean, "reason": "string" }
      `, modelId, { jsonMode: true });

        if (parseJsonLoose(evalResult.text).is_useful) {
          combinedUseful += block;
          usefulUrls.push(res.url);
        }

        await logTokenUsage({ tool_name: 'fetcher', task_name: 'Evaluate Sub-page', institution: res.url, model_id: modelId, usageMetadata: evalResult.usageMetadata, success: true, batch_id: batchId })
          .catch(e => console.error('Token log fail', e));
      } catch {
        // 判定失败时保留页面，宁可多给 Structurer 一些内容也不丢数据
        combinedUseful += block;
        usefulUrls.push(res.url);
      }
    }

    return { success: true, useful_markdown: combinedUseful, evaluated_urls: urls, useful_urls: usefulUrls };
  } catch (error: any) {
    return { success: false, useful_markdown: '', evaluated_urls: urls, useful_urls: [], error_message: error.message };
  }
}
