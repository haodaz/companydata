/**
 * Structurer Agent（企业版）：把抓到的招聘页面 Markdown 结构化为岗位列表。
 * 字段 schema 由 src/lib/job-fields.ts 生成，改字段只改那里。
 */
import { generateCheap, generateContent, cheapModel } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { jobSchemaForPrompt, JOB_FIELDS } from '@/lib/job-fields';

export interface StructuredJobsResult {
  ai_summary: string;
  jobs: Record<string, any>[];
}

/**
 * 结构化岗位。正文不长就一次调用；长了按「### Source」切成几批并行再合并。
 *
 * 以前不论多长都一次丢给模型：一个站上百个岗位（华泰校招 105 个、蓝箭校招 76 个）时，
 * 输出的 JSON 太长会被截断，后半截岗位整批丢失。现在每批不超过约 2.4 万字，
 * 每批都带上入口页开头作为共享上下文（校招项目、届别、截止时间这些共有信息在那里）。
 */
export async function structureJobData(markdown: string, company: string, hint: string, modelId: string = 'gemini-3.8-flash', batchId?: number, scope: 'campus' | 'all' = 'campus'): Promise<StructuredJobsResult | null> {
  // 千问写长 JSON 慢：一批 2.4 万字（8–10 个岗位）三分钟写不完会超时，千问改成小批、多并发
  const qwen = cheapModel().startsWith('qwen');
  const SINGLE = qwen ? 12000 : 30000, CHUNK = qwen ? 9000 : 24000, PAR = qwen ? 10 : 3;
  // 慢的不是读，是写：一张列表页 6 千字就有 30 个岗位，每个 66 个字段一次写完要十几分钟（雀巢 moka）。
  // 先花几秒列出岗位清单（只要名称 / 链接 / 城市），岗位多就按 3 个一组、多组并发去补字段（雀巢 30 个岗位：超时 → 84 秒）
  const roster = await listOpenings(markdown, company, hint, scope, modelId, batchId);
  if (roster && roster.length > GROUP) return structureByRoster(markdown, roster, company, hint, modelId, batchId, scope, PAR);
  if (markdown.length <= SINGLE) {
    const r = await structureChunk(markdown, company, hint, modelId, batchId, scope);
    if (r) { const note = pagingNote(markdown, r.jobs.length); if (note) r.ai_summary = [r.ai_summary, note].filter(Boolean).join('\n'); }
    return r;
  }
  const sections = markdown.split(/\n(?=### Source: )/);
  const head = sections[0].slice(0, 6000);
  const chunks: string[] = [];
  let cur = '';
  for (const sec of sections.slice(1)) {
    if (cur && cur.length + sec.length > CHUNK) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + sec.slice(0, CHUNK);
  }
  if (cur) chunks.push(cur);
  if (!chunks.length) return structureChunk(markdown.slice(0, 500000), company, hint, modelId, batchId, scope);
  const shared = `### Source: [入口页（共享上下文：校招项目、届别、截止时间等共有信息看这里；这里列出的岗位只在下面也出现时才输出）]\n\n${head}\n\n`;
  const results: (StructuredJobsResult | null)[] = [];
  for (let i = 0; i < chunks.length; i += PAR) {
    results.push(...await Promise.all(chunks.slice(i, i + PAR).map(c => structureChunk(shared + c, company, hint, modelId, batchId, scope))));
  }
  return mergeResults(results, markdown);
}

function mergeResults(results: (StructuredJobsResult | null)[], markdown: string): StructuredJobsResult | null {
  const ok = results.filter((r): r is StructuredJobsResult => !!r);
  if (!ok.length) return null;
  const seen = new Set<string>(), jobs: Record<string, any>[] = [];
  // 好几个岗位共用的链接（列表页，vivo 119 个岗位都是 hr.vivo.com/jobs）不能拿来去重，不然合并成 1 个
  const all = ok.flatMap(r => r.jobs);
  const linkCount = new Map<string, number>();
  for (const j of all) { const l = String(j.link || '').trim(); if (l) linkCount.set(l, (linkCount.get(l) || 0) + 1); }
  for (const j of all) {
    const l = String(j.link || '').trim();
    const k = l && (linkCount.get(l) || 0) === 1 ? l : `${j.name}|${j.location}|${j.job_req_id || ''}`;
    if (seen.has(k)) continue;
    seen.add(k); jobs.push(j);
  }
  return { ai_summary: [ok.map(r => r.ai_summary).filter(Boolean).join('\n'), pagingNote(markdown, jobs.length)].filter(Boolean).join('\n'), jobs };
}

const GROUP = 3;
type Opening = { name: string; link: string | null; location: string | null };
const normUrl = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');

/** 第一步：只列岗位清单（名称 / 链接 / 城市），输出很短，几秒出结果。失败返回 null，退回老办法 */
async function listOpenings(markdown: string, company: string, hint: string, scope: 'campus' | 'all', modelId: string, batchId?: number): Promise<Opening[] | null> {
  try {
    const prompt = `
      List EVERY distinct ${scope === 'campus' ? 'campus / new-grad / internship / trainee-programme' : ''} job opening in the recruiting pages below${scope === 'campus' ? ' (skip experienced-hire 社招 roles)' : ''}.
      The same job on a list page and on its own detail page counts ONCE. Do not invent anything; "link" must appear literally in the markdown (or null).
      Return ONLY JSON: {"jobs":[{"name":"<title as written>","link":"<url or null>","location":"<city or null>"}]}

      Company: ${company || 'Unknown'}
      ${hint ? `Hint: ${hint}` : ''}

      ${markdown.substring(0, 200000)}
    `;
    // 列清单是简单活，千问时用更快的 flash
    const r = cheapModel().startsWith('qwen') ? await generateContent(prompt, 'qwen-flash', { jsonMode: true }).catch(() => generateCheap(prompt, modelId, { jsonMode: true, fast: true })) : await generateCheap(prompt, modelId, { jsonMode: true, fast: true });
    await logTokenUsage({ tool_name: 'structurer-job', task_name: 'List Openings', institution: company, model_id: r.model || modelId, usageMetadata: r.usageMetadata, success: true, batch_id: batchId }).catch(() => {});
    const jobs = parseJsonLoose(r.text)?.jobs;
    if (!Array.isArray(jobs)) return null;
    return jobs.filter((j: any) => j && typeof j.name === 'string' && j.name.trim())
      .map((j: any) => ({ name: j.name.trim(), link: typeof j.link === 'string' && /^https?:/i.test(j.link) ? j.link.trim() : null, location: typeof j.location === 'string' ? j.location : null }));
  } catch (e) {
    console.error('[structurer] 列岗位清单失败，退回整页提炼', e);
    return null;
  }
}

/** 第二步：按清单 3 个一组、多组并发补字段。每组带入口页（共有信息）+ 这几个岗位自己的详情页 */
async function structureByRoster(markdown: string, roster: Opening[], company: string, hint: string, modelId: string, batchId: number | undefined, scope: 'campus' | 'all', par: number): Promise<StructuredJobsResult | null> {
  const sections = markdown.split(/\n(?=### Source: )/);
  // 入口页每组都要带一遍，太长就是成倍的输入：只带开头（项目 / 届别 / 截止时间这些共有信息在前面），这几个岗位的列表行单独附上
  const head = sections[0].slice(0, 3000);
  const rowsOf = (g: Opening[]) => g.map(o => { const i = sections[0].indexOf(o.name); return i < 0 ? '' : sections[0].slice(Math.max(0, i - 200), i + 600); }).filter(Boolean).join('\n…\n');
  const bySource = new Map<string, string>();
  for (const s of sections.slice(1)) { const u = s.match(/^### Source: \[[^\]]*\]\(([^)\s]+)/)?.[1]; if (u) bySource.set(normUrl(u), s.slice(0, 8000)); }
  const groups: Opening[][] = [];
  for (let i = 0; i < roster.length; i += GROUP) groups.push(roster.slice(i, i + GROUP));
  const results: (StructuredJobsResult | null)[] = [];
  for (let i = 0; i < groups.length; i += par) {
    results.push(...await Promise.all(groups.slice(i, i + par).map(g => {
      const details = g.map(o => (o.link && bySource.get(normUrl(o.link))) || '').filter(Boolean).join('\n');
      return structureChunk(`${head}\n\n${rowsOf(g)}\n\n${details}`, company, hint, modelId, batchId, scope, g);
    })));
  }
  return mergeResults(results, markdown);
}

async function structureChunk(markdown: string, company: string, hint: string, modelId: string, batchId: number | undefined, scope: 'campus' | 'all', focus?: Opening[]): Promise<StructuredJobsResult | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // 提示词顺序为「上下文缓存」优化：固定指令与 schema 前置，变量（公司 / 提示 / 日期 / 正文）后置。
    // SCOPE 只有两种取值，留在前缀里不影响同类任务的命中。
    const prompt = `
      You are an expert recruiting-data extraction AI.
      Your task is to read raw markdown scraped from a company's official recruiting pages and extract EVERY job opening into structured JSON.

      The markdown is a concatenation of several pages, each starting with a "### Source: [...](url)" header:
      the main page first, then sub-pages (usually individual job postings or further list pages).

      SCOPE: ${scope === 'campus'
        ? 'ONLY roles for students and fresh graduates — campus / new-grad roles (job_type "graduate"), internships incl. remote ones ("intern"), and management-trainee / rotational / special talent PROGRAMMES ("program"). SKIP experienced-hire (社招) roles entirely.'
        : 'All openings, including experienced-hire roles (job_type "full_time").'}

      Campus recruiting specifics:
      - A campus page often describes a whole PROGRAMME or SEASON (e.g. "2027届秋季校园招聘", "暑期实习生计划", "Graduate Programme") with shared facts: target graduation window, application start / deadline, process, locations, whether overseas-university students may apply. Copy these shared facts onto EVERY role that belongs to that programme ("program_name", "recruit_season", "graduation_year", "application_start", "deadline", "recruit_process", "accepts_overseas_students", "overseas_description", "target_students").
      - If a programme page does NOT list individual roles, output the programme itself as ONE entry with job_type "program" (or "intern" for an internship programme) and title = the programme name.
      - If it lists role categories (e.g. 技术类 / 产品类 / 职能类) rather than individual roles, output one entry per category.

      Instructions:
      1. Extract EVERY distinct in-scope opening you can find — both from detailed job posting pages and from list pages (a list row with only title + location still counts; leave unknown fields null).
      2. If the same job appears on a list page AND on its own detail page, output it ONCE, merging the information (detail page wins).
      3. NEVER invent data. If a field is not stated, use null (or [] for arrays). Do not guess salaries, dates or URLs.
      4. "link" must be a URL that literally appears in the markdown (the link of that job, or the "### Source" URL of its detail page).
      5. Follow the language rule given for each field: fields marked 中文 must be written in Chinese; "原文" fields keep the page's language; proper nouns stay in their original language.
      6. Ignore navigation, marketing copy, talent-community sign-ups and expired-posting notices.
      7. If the pages contain NO concrete job opening, return "jobs": [] and explain why in "ai_summary".
      8. Keep the output short: OMIT any field whose value would be null or an empty array (missing keys are read as null).

      Return ONLY a valid JSON object matching this schema exactly:
      {
        "ai_summary": <string>, // 中文综述：这批页面上有多少个岗位、主要是哪些职能 / 地区 / 类型（社招、校招、实习），以及值得注意的共性要求（学历、签证担保、届别等）。
        "jobs": [
          {
${jobSchemaForPrompt()}
          }
        ]
      }

      ──────────────────────────────────────
      Company: ${company || 'Unknown (infer from the page)'}
      ${hint ? `Focus hint from the user (team / role / location of interest): ${hint}` : ''}
      Today's date: ${today}

      ${focus ? `ONLY output these ${focus.length} openings (the other openings on the page are handled separately), one entry each ("name" = the title exactly as written on the page, never add the city):\n${focus.map(o => JSON.stringify({ name: o.name, location: o.location, link: o.link })).join("\n")}\n` : ""}
      Raw Markdown Data:
      ${markdown.substring(0, 500000)}
    `;

    const result = await generateCheap(prompt, modelId, { jsonMode: true, fast: true });

    await logTokenUsage({ tool_name: 'structurer-job', task_name: `Extract Jobs${hint ? ` · ${hint}` : ''}`, institution: company, model_id: result.model || modelId, usageMetadata: result.usageMetadata, success: true, batch_id: batchId })
      .catch(e => console.error('Token logging failed', e));

    const parsed = parseJsonLoose(result.text);
    return {
      ai_summary: typeof parsed.ai_summary === 'string' ? parsed.ai_summary : '',
      // 模型省略的空字段补回 null / []（入库那边按 !== null 判断，undefined 会被当成有值）
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs.filter((j: any) => j && typeof j === 'object').map((j: any) => { for (const f of JOB_FIELDS) if (!(f.key in j)) j[f.key] = f.kind === 'string[]' ? [] : null; return j; }) : [],
    };
  } catch (error: any) {
    // 模型欠费 / 额度用完往外抛，别被当成「这一页没岗位」
    if (/402|Payment Required|credits are depleted|insufficient_quota|exceeded your current quota/i.test(error?.message || '')) throw error;
    console.error('Structurer Agent Error:', error);
    return null;
  }
}

/** 求职最关键的字段：这些还缺时，触发联网检索补全 */
export const JOB_SEARCH_TRIGGER_FIELDS = ['responsibilities', 'overview', 'application_end_date_str', 'location', 'education_requirement', 'graduation_year', 'link', 'program_name', 'job_type'];

/**
 * 联网检索补全岗位字段：知道企业 + 岗位名，去官方渠道找这条岗位的信息，只返回找到的字段，并附来源链接。
 */
export async function searchJobFields(job: { name: string; company: string; program_name?: string | null; location?: string | null; source_url?: string | null }, missing: string[], modelId: string = 'gemini-3.8-flash'): Promise<{ fields: Record<string, any>; sources: Record<string, string> }> {
  const { searchJson } = await import('@/lib/agents/search-llm');
  const wanted = JOB_FIELDS.filter(f => missing.includes(f.key));
  const prompt = `
    You are a recruiting-data researcher. Use web search to find the OFFICIAL posting of this job and fill in the missing fields.

    Company: ${job.company}
    Job title: ${job.name}
    ${job.program_name ? `Programme: ${job.program_name}` : ''}${job.location ? `\nLocation hint: ${job.location}` : ''}${job.source_url ? `\nThe job was found on: ${job.source_url}` : ''}
    Today's date: ${new Date().toISOString().slice(0, 10)}

    Search the company's own careers / campus site, its official WeChat articles or official announcements. Third-party boards (BOSS直聘, 智联, 牛客, 实习僧, LinkedIn...) may be used ONLY to locate the official page, never as the source of facts.
    Only report values you actually found for THIS job (same company, same title / programme). Use null when not found. Never invent deadlines, salaries or URLs.

    Fields to fill (key // meaning. instruction):
${wanted.map(f => `      "${f.key}": <${f.kind === 'number' ? 'number' : f.kind === 'boolean' ? 'boolean' : f.kind === 'string[]' ? 'string[]' : 'string'} | null> // ${f.label}. ${f.hint}`).join('\n')}

    Return ONLY a JSON object:
    { "fields": { <key>: <value> ... }, "sources": { "<key>": "<url where you found it>" }, "official_url": "<the official job / programme page if found, else null>" }
  `;
  const { parsed } = await searchJson(prompt, modelId, { tool_name: 'structurer-job', task_name: `Search Job Fields · ${job.name}`, institution: job.company });
  const fields = parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
  if (parsed?.official_url && typeof parsed.official_url === 'string' && /^https?:\/\//i.test(parsed.official_url) && !fields.link) fields.link = parsed.official_url;
  const sources = parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {};
  return { fields, sources };
}


/**
 * 页面上写着「共 119 条」，结果只提取到十几条：多半是站点分页在浏览器里翻、渲染只看到第一页（vivo 就是这样）。
 * 在综述里提醒一句，数据部门在日志里能看到哪些站点需要单独适配。接口适配（hotjob / 北森 / vivo …）拿全了的不会触发。
 */
export function pagingNote(markdown: string, got: number): string {
  const nums = [...markdown.matchAll(/共\s*(\d{2,5})\s*(?:条|个职位|个岗位|个结果)/g)].map(m => parseInt(m[1]));
  const declared = nums.length ? Math.max(...nums) : 0;
  if (!declared || got >= declared * 0.8 || declared - got < 5) return '';
  return `⚠ 页面写着共 ${declared} 条，只提取到 ${got} 条：这个站点要翻页，渲染只拿到了前几页，需要单独适配（把站点告诉技术）。`;
}
