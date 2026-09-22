/**
 * Fetcher Agent（企业版）：抓取招聘页面 Markdown，并让大模型从页面链接里挑出岗位详情页 / 岗位列表页继续抓。
 * 与院校版同一套两段式：fetchBaseAndLinks（主页 + 选子页面）→ fetchAndEvaluateBatch（分批抓取 + 判定是否有用）。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { isAtsHost } from '@/lib/url-types';

const MAX_CANDIDATES = 15;

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
      resolved.hash = '';
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
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/markdown', 'X-Timeout': '20' },
      signal: AbortSignal.timeout(30000), // 招聘站多为 JS 渲染，给足渲染时间
    });
    if (!response.ok) return null;
    return await response.text();
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
    const baseMarkdown = await fetchJinaUrl(url);
    if (!baseMarkdown) {
      return { success: false, base_markdown: '', candidate_urls: [], error_message: `Jina fetch failed for base URL: ${url}` };
    }

    const allLinks = extractLinks(baseMarkdown, url);
    let selected: string[] = [];

    if (allLinks.length > 0) {
      try {
        const result = await generateContent(`
        You are a smart crawler working on a company's recruiting website. Here is the list of links found on one page.
        Select up to ${MAX_CANDIDATES} links that are MOST LIKELY to be:
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
          .slice(0, MAX_CANDIDATES);

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
