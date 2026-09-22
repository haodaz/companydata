/**
 * Structurer Agent（企业版）：把抓到的招聘页面 Markdown 结构化为岗位列表。
 * 字段 schema 由 src/lib/job-fields.ts 生成，改字段只改那里。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { jobSchemaForPrompt, JOB_FIELDS } from '@/lib/job-fields';

export interface StructuredJobsResult {
  ai_summary: string;
  jobs: Record<string, any>[];
}

export async function structureJobData(markdown: string, company: string, hint: string, modelId: string = 'gemini-3.8-flash', batchId?: number, scope: 'campus' | 'all' = 'campus'): Promise<StructuredJobsResult | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `
      You are an expert recruiting-data extraction AI.
      Your task is to read raw markdown scraped from a company's official recruiting pages and extract EVERY job opening into structured JSON.

      Company: ${company || 'Unknown (infer from the page)'}
      ${hint ? `Focus hint from the user (team / role / location of interest): ${hint}` : ''}
      Today's date: ${today}

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

      Raw Markdown Data:
      ${markdown.substring(0, 500000)}

      Return ONLY a valid JSON object matching this schema exactly:
      {
        "ai_summary": <string>, // 中文综述：这批页面上有多少个岗位、主要是哪些职能 / 地区 / 类型（社招、校招、实习），以及值得注意的共性要求（学历、签证担保、届别等）。
        "jobs": [
          {
${jobSchemaForPrompt()}
          }
        ]
      }
    `;

    const result = await generateContent(prompt, modelId, { jsonMode: true });

    await logTokenUsage({ tool_name: 'structurer-job', task_name: `Extract Jobs${hint ? ` · ${hint}` : ''}`, institution: company, model_id: modelId, usageMetadata: result.usageMetadata, success: true, batch_id: batchId })
      .catch(e => console.error('Token logging failed', e));

    const parsed = parseJsonLoose(result.text);
    return {
      ai_summary: typeof parsed.ai_summary === 'string' ? parsed.ai_summary : '',
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs.filter((j: any) => j && typeof j === 'object') : [],
    };
  } catch (error: any) {
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
