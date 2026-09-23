/**
 * 虚拟工厂 · 前端流水线执行库。
 * 每个函数就是一位 AI 员工的「一次作业」，内部调用平台已有的接口；总任务页按工序串起来，单聊页按动作单独调用。
 * 所有产出都落在正式的库里（企业库 / 信息源库 / 岗位库 / 爬取日志），工厂只是另一种操作界面。
 */

export type Emit = (msg: string) => void;
export interface RunControl { aborted: () => boolean }

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `请求失败（${res.status}）`);
  return json;
}

async function patch(url: string, body: unknown) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

export interface FactoryPlan {
  title: string;
  mode: 'named' | 'list';
  companies: string[];
  list_query: string;
  list_count: number;
  steps: { profile: boolean; source: boolean; extract: boolean };
  urls_per_company: number;
  hint: string;
  scope: 'campus' | 'all';
  briefing: string;
}

export interface FactoryCompany { id: number; name: string; profiled?: boolean }

// ── 厂长：排产 ──
export async function planTask(task: string, model: string): Promise<FactoryPlan> {
  return (await post('/api/office/plan', { task, model })).plan;
}

// ── Scout：建名单 ──
export async function buildCompanyList(query: string, count: number, model: string) {
  const json = await post('/api/agents/finder/company-list', { query, count, model });
  return (json.companies || []) as any[];
}

export async function ensureCompany(c: { name: string } & Record<string, unknown>): Promise<FactoryCompany> {
  return post('/api/office/ensure-company', c);
}

// ── Alice：企业画像 ──
export async function profileCompany(companyId: number, model: string): Promise<{ filled: string[]; profile: Record<string, any> }> {
  const json = await post(`/api/db/companies/${companyId}/profile`, { model });
  if (!json.success) throw new Error(json.error || '画像补全失败');
  return { filled: json.filled || [], profile: json.profile || {} };
}

// ── Jarvis：寻源 + 入库 ──
export async function findAndSaveCampusUrls(company: FactoryCompany, model: string): Promise<any[]> {
  const json = await post('/api/agents/finder/campus-urls', { company: company.name, unit: '', model });
  const urls: any[] = json.urls || [];
  // 个别 URL 入库失败不影响整体；全部失败（如登录过期）则报错，不能假装找到了
  let saved = 0;
  let lastError: Error | null = null;
  await Promise.all(urls.map(u => post('/api/db/save-url', {
    company: company.name, companyId: company.id, unit: u.unit || '', title: u.title, targetUrl: u.url,
    type: u.type, subtype: u.subtype, reasoning: u.reasoning,
  }).then(() => { saved++; }).catch(e => { lastError = e; })));
  if (urls.length && !saved) throw new Error(`信息源入库失败：${(lastError as Error | null)?.message || '未知错误'}`);
  // 报告与 URL 工具单家检索一致：再调一次大模型把 URL 写成检索报告，报告失败不影响流水线
  if (urls.length) {
    const report = await post('/api/agents/finder/report', { company: company.name, unit: '', searchType: 'campus', urls, model }).then(r => r.detailed_report || '').catch((e: Error) => `（报告生成失败：${e.message}）`);
    post('/api/db/save-journal', { company: company.name, companyId: company.id, urls, searchQueries: json.search_queries, searchType: 'campus', model, aiOverview: report }).catch(() => {});
  }
  return urls;
}

/** 挑最值得抓的页面：真实列出岗位的列表页 > 应届生 / 实习 / 远程实习 > 专项 / 留学生专场 > 校招首页 > 单个岗位页 */
const SUBTYPE_RANK: Record<string, number> = { list: 0, graduate: 1, intern: 2, remote_intern: 2, program: 3, overseas: 3, portal: 4, faq: 6, events: 7 };
export function pickUrlsToExtract(urls: any[], n: number): any[] {
  const rank = (u: any) => u.type === 'campus' ? (SUBTYPE_RANK[u.subtype] ?? 5) : u.type === 'job' ? 5 : 9;
  return [...urls].filter(u => u.type === 'campus' || u.type === 'job').sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

// ── Kelly + Dr. Thorne：抓取与提炼 ──
export async function createJobTask(name: string, notes: string, scope: string, model: string, createdBy: string): Promise<string> {
  const json = await post('/api/admin/job-tasks', { name, notes, scope, model_id: model, created_by: createdBy });
  return json.task.id;
}

export async function addUrlsToTask(taskId: string, urls: { url: string; company: string; company_id?: number; hint?: string }[]) {
  await post('/api/admin/job-tasks/urls', { taskId, urls });
  const json = await (await fetch('/api/admin/job-tasks')).json();
  const task = (json.tasks || []).find((t: any) => t.id === taskId);
  return (task?.urls || []) as any[];
}

export const setJobTaskStatus = (id: string, status: string) => patch('/api/admin/job-tasks', { id, status });

/** 处理一个 URL：抓主页 → 选子页面 → 分批抓取 → 结构化 → 入库。与「校招岗位提取」工具是同一条链路。 */
export async function extractUrl(log: { id: number; target_url: string; company?: string; hint?: string }, opts: { model: string; scope: string; emit: Emit; ctl?: RunControl }): Promise<{ jobs: number; saved: number }> {
  const { model, scope, emit, ctl } = opts;
  const batchId = Date.now();
  const events: { key: string; title: string; status: string; color: string }[] = [];
  const say = (title: string, ok = true) => { events.push({ key: `e${events.length}`, title, status: ok ? 'success' : 'error', color: ok ? 'green' : 'red' }); emit(title); };
  const failLog = (msg: string, extra: Record<string, unknown> = {}) => patch('/api/admin/journal-job', { id: log.id, fetcher_status: 'failed', structurer_status: 'failed', error_message: msg, ...extra });

  await patch('/api/admin/journal-job', { id: log.id, fetcher_status: 'running', structurer_status: 'pending', error_message: null });
  try {
    say(`Kelly 开始抓取 ${log.target_url}`);
    const init = await post('/api/agents/fetcher/init', { url: log.target_url, model, batchId, hint: log.hint, scope }).catch(e => ({ success: false, error_message: e.message }));
    if (!init.success) throw new Error(`页面抓取失败: ${init.error_message || '未知错误'}`);

    let markdown: string = init.base_markdown;
    const candidates: string[] = init.candidate_urls || [];
    const subPages: string[] = [];
    say(candidates.length ? `主页抓取完成，挑出 ${candidates.length} 个子页面` : '主页抓取完成，没有需要继续抓的子页面');

    for (let i = 0; i < candidates.length; i += 3) {
      if (ctl?.aborted()) throw new Error('已停止');
      const batch = await post('/api/agents/fetcher/batch', { urls: candidates.slice(i, i + 3), model, batchId }).catch(() => null);
      if (batch?.success) {
        markdown += batch.useful_markdown;
        subPages.push(...(batch.useful_urls || []));
        say(`子页面 ${Math.min(i + 3, candidates.length)}/${candidates.length}：${batch.useful_urls?.length || 0} 个有料`);
      }
    }
    if (ctl?.aborted()) throw new Error('已停止');

    say(`Dr. Thorne 开始提炼（原文 ${(markdown.length / 1000).toFixed(0)}k 字符）`);
    const struct = await post('/api/agents/structurer-job', { markdown, company: log.company, hint: log.hint, model, batchId, scope });
    if (!struct.result) {
      await patch('/api/admin/journal-job', { id: log.id, fetcher_status: 'success', structurer_status: 'failed', raw_markdown: markdown.substring(0, 500000), markdown_len: markdown.length, sub_pages_fetched: subPages, error_message: 'Structurer returned no result' });
      throw new Error('大模型未能返回有效的结构化结果');
    }
    const jobs = struct.result.jobs?.length || 0;
    say(`提炼出 ${jobs} 个岗位 / 项目`);

    const saved = await patch('/api/admin/journal-job', {
      id: log.id, raw_markdown: markdown.substring(0, 500000), markdown_len: markdown.length, sub_pages_fetched: subPages,
      fetcher_status: 'success', structurer_status: 'success', model_id: model, batch_id: batchId,
      structured_json: { ...struct.result, pipeline_log: events },
    });
    if (saved.storeError) throw new Error(`岗位入库失败: ${saved.storeError}`);
    say(`${saved.jobsSaved || 0} 个岗位已写入岗位库（待审核）`);
    return { jobs, saved: saved.jobsSaved || 0 };
  } catch (e: any) {
    if (e.message !== '已停止') say(e.message, false);
    await failLog(e.message);
    throw e;
  }
}

// ── Nova：质检 ──
export async function fetchQaStats(companyIds?: number[]) {
  const json = await (await fetch(`/api/office/stats${companyIds?.length ? `?companyIds=${companyIds.join(',')}` : ''}`)).json();
  if (!json.ok) throw new Error(json.error || '质检统计失败');
  return json.stats as Record<string, any>;
}

export function qaBriefing(s: Record<string, any>): string {
  if (!s.jobs) return `共 ${s.companies} 家企业、${s.urls} 条信息源，岗位库里还没有对应的岗位。`;
  const parts = [
    `${s.companies} 家企业 · ${s.urls} 条信息源 · ${s.jobs} 个岗位（校招 ${s.graduate} / 实习 ${s.intern} / 专项 ${s.program}，远程 ${s.remote}，面向留学生 ${s.overseas}）。`,
    `平均完整度 ${s.avg_completeness}%，低于 40% 的有 ${s.low_completeness} 个；待人工审核 ${s.unreviewed} 个。`,
  ];
  if (s.missing_fields?.length) parts.push(`缺得最多的核心字段：${s.missing_fields.slice(0, 4).map((m: any) => `${m.label}（${m.count}）`).join('、')}。`);
  return parts.join('\n');
}
