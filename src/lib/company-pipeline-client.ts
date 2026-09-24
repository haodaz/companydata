/**
 * 企业画像流水线（浏览器端编排）
 * 一家企业 = 定位官方页面 → 抓取 raw → 官方页面提取 → 各主题联网检索 → 合并 → 落库（日志 + 企业库 + 子实体）
 * 每一步都记流水事件；raw / 结构化 / 摘要都在最后一次 PATCH 里整体写入日志。
 * 单家工具、批处理任务、企业详情页「重新画像」共用。
 */
import { PROFILE_TOPICS, hasValue } from '@/lib/company-fields';
import { mergeBundles, type ProfileBundle } from '@/lib/company-merge';

export interface PipelineEvent { key: string; title: string; status: 'pending' | 'loading' | 'success' | 'error'; color?: string }
export interface RunOptions { model: string; topics?: string[]; skipFilled?: boolean; /** 同一家企业的检索主题并发数（默认 4；批跑可到 7） */ topicConcurrency?: number }
export interface RunSummary { step: string; label: string; text: string }
export interface RunData extends ProfileBundle { summaries: RunSummary[]; ai_summary: string; topics_run: string[]; topics_skipped: string[]; pipeline_log?: PipelineEvent[] }
export interface RunCallbacks {
  onEvents: (events: PipelineEvent[]) => void;
  onMarkdown: (md: string) => void;
  onData: (data: RunData) => void;
  onRawSearches?: (raw: Record<string, any>) => void;
  /** 返回 false 表示已停止 */
  waitIfPaused: () => Promise<boolean>;
}
export type RunResult = { status: 'success'; applied: any } | { status: 'failed'; error: string } | { status: 'aborted' };

const post = async (url: string, body: any) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('未登录或登录已过期，请重新登录后再跑');
  return json;
};
export const patchCompanyLog = (body: Record<string, any>) => fetch('/api/admin/journal-company', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json()).catch(() => ({}));

export async function runCompanyProfile(log: { id: number; company_id: number; company: string }, opts: RunOptions, cb: RunCallbacks): Promise<RunResult> {
  const events: PipelineEvent[] = [];
  const emit = (e: PipelineEvent) => { events.push(e); cb.onEvents([...events]); };
  const done = (updates: Partial<PipelineEvent>) => { Object.assign(events[events.length - 1], updates); cb.onEvents([...events]); };

  const batchId = Date.now();
  const model = opts.model;
  const topicKeys = (opts.topics?.length ? PROFILE_TOPICS.filter(t => opts.topics!.includes(t.key)) : PROFILE_TOPICS).map(t => t.key);
  const parts: Partial<ProfileBundle>[] = [];
  const summaries: RunSummary[] = [];
  const rawSearches: Record<string, any> = {};
  const stepsDone: string[] = [];
  const topicsRun: string[] = [];
  const topicsSkipped: string[] = [];
  let markdown = '';
  let pagesFetched: any[] = [];

  const snapshot = (): RunData => {
    const merged = mergeBundles(parts);
    return { ...merged, summaries: [...summaries], ai_summary: summaries.map(s => `【${s.label}】${s.text}`).join('\n\n'), topics_run: [...topicsRun], topics_skipped: [...topicsSkipped] };
  };
  const fail = async (msg: string): Promise<RunResult> => {
    emit({ key: 'fail', title: `❌ ${msg}`, status: 'error', color: 'red' });
    await patchCompanyLog({ id: log.id, status: 'failed', error_message: msg, steps_done: stepsDone, raw_markdown: markdown, markdown_len: markdown.length, pages_fetched: pagesFetched, raw_searches: rawSearches, structured_json: { ...snapshot(), pipeline_log: events }, model_id: model, batch_id: batchId });
    return { status: 'failed', error: msg };
  };

  await patchCompanyLog({ id: log.id, status: 'running', error_message: null, model_id: model, batch_id: batchId });
  emit({ key: 'start', title: `🏢 ${log.company} · 开始画像（模型 ${model}）`, status: 'success', color: 'blue' });

  try {
    // ── 工序 1：定位官方页面 ──
    emit({ key: 'locate', title: '工序 1: 联网定位官网与「关于 / 投资者关系 / 新闻 / 管理团队 / 文化福利」页面...', status: 'loading', color: 'blue' });
    const loc = await post('/api/agents/company/locate', { companyId: log.company_id, model, batchId });
    if (!loc.success) return fail(`定位官方页面失败: ${loc.error}`);
    const company: Record<string, any> = loc.company;
    const counts: Record<string, number> = loc.counts || {};
    const pages: any[] = loc.pages || [];
    rawSearches.locate = { queries: loc.searchQueries, parsed: loc.raw };
    cb.onRawSearches?.({ ...rawSearches });
    stepsDone.push('locate');
    done({ status: 'success', color: pages.length ? 'green' : 'orange', title: pages.length ? `工序 1 完成: 找到 ${pages.length} 个官方页面（${pages.map((p: any) => p.subtype).join(' / ')}）` : '工序 1 完成: 未找到官方页面，后面全靠联网检索' });
    if (!(await cb.waitIfPaused())) return { status: 'aborted' };

    // ── 工序 2：抓取 raw ──
    if (pages.length) {
      emit({ key: 'fetch', title: `工序 2: 抓取 ${pages.length} 个官方页面原文...`, status: 'loading', color: 'blue' });
      const f = await post('/api/agents/company/fetch', { pages });
      if (f.success) {
        markdown = f.markdown || '';
        pagesFetched = f.pages || [];
        cb.onMarkdown(markdown);
        const okCount = pagesFetched.filter((p: any) => p.ok).length;
        stepsDone.push('fetch');
        done({ status: 'success', color: okCount ? 'green' : 'orange', title: `工序 2 完成: ${okCount}/${pages.length} 个页面抓取成功，raw 共 ${markdown.length.toLocaleString()} 字符` });
      } else {
        done({ status: 'error', color: 'red', title: `工序 2 失败: ${f.error}（继续联网检索）` });
      }
      if (!(await cb.waitIfPaused())) return { status: 'aborted' };
    }

    // ── 工序 3：官方页面提取 ──
    if (markdown.length > 500) {
      emit({ key: 'extract', title: '工序 3: 从官方页面原文提取画像字段 / 管理团队 / 动态...', status: 'loading', color: 'blue' });
      const ex = await post('/api/agents/company/extract', { company: { name: log.company, name_en: company.name_en }, markdown, model, batchId });
      if (ex.success) {
        parts.push({ profile: ex.profile, executives: ex.executives, news: ex.news, products: ex.products, sources: ex.sources });
        if (ex.summary) summaries.push({ step: 'extract', label: '官方页面', text: ex.summary });
        rawSearches.extract = { parsed: ex.raw };
        cb.onRawSearches?.({ ...rawSearches });
        stepsDone.push('extract');
        const filled = Object.values(ex.profile || {}).filter(hasValue).length;
        done({ status: 'success', color: 'green', title: `工序 3 完成: 画像字段 ${filled} 个、高管 ${ex.executives?.length || 0} 人、动态 ${ex.news?.length || 0} 条、产品 ${ex.products?.length || 0} 项` });
        cb.onData(snapshot());
      } else {
        done({ status: 'error', color: 'red', title: `工序 3 失败: ${ex.error}（继续联网检索）` });
      }
      if (!(await cb.waitIfPaused())) return { status: 'aborted' };
    }

    // ── 工序 4：主题检索（各主题并发；缺失字段按「企业档案 + 官方页提取」判断，合并时先到先得） ──
    const setEvent = (key: string, updates: Partial<PipelineEvent>) => { const ev = events.find(e => e.key === key); if (ev) { Object.assign(ev, updates); cb.onEvents([...events]); } };
    const base = snapshot().profile;
    const have = (k: string) => hasValue(company[k]) || hasValue(base[k]);
    const entityLabelOf = (e?: string | null) => e === 'financings' ? '融资' : e === 'news' ? '动态' : e === 'executives' ? '高管' : e === 'products' ? '产品' : '';
    const runTopic = async (topicKey: string, i: number) => {
      const def = PROFILE_TOPICS.find(t => t.key === topicKey)!;
      const missing = def.fields.filter(k => !have(k));
      const entityHas = def.entity ? (counts[def.entity] || 0) > 0 || (snapshot()[def.entity] || []).length > 0 : true;
      const evKey = `search-${def.key}`;
      if (opts.skipFilled && missing.length === 0 && entityHas) {
        topicsSkipped.push(def.key);
        emit({ key: evKey, title: `工序 4.${i + 1} 跳过「${def.label}」: 目标字段已齐${def.entity ? '、子实体已有记录' : ''}`, status: 'success', color: 'gray' });
        return;
      }
      const entityLabel = entityLabelOf(def.entity);
      emit({ key: evKey, title: `工序 4.${i + 1}: 联网检索「${def.label}」（缺 ${missing.length} 个字段${def.entity ? ` + ${entityLabel}` : ''}）...`, status: 'loading', color: 'blue' });
      const s = await post('/api/agents/company/search', { topic: def.key, company: { name: log.company, name_en: company.name_en, brief_name: company.brief_name, country: company.country, official_website: company.official_website || base.official_website, industry: company.industry || base.industry }, missing, model, batchId });
      if (!s.success) { setEvent(evKey, { status: 'error', color: 'red', title: `「${def.label}」检索失败: ${s.error}` }); return; }
      const part: Partial<ProfileBundle> = { profile: s.fields, sources: s.sources };
      if (s.entity) (part as any)[s.entity] = s.rows;
      parts.push(part);
      if (s.summary) summaries.push({ step: `search:${def.key}`, label: def.label, text: s.summary });
      rawSearches[def.key] = { queries: s.searchQueries, parsed: s.raw };
      cb.onRawSearches?.({ ...rawSearches });
      stepsDone.push(`search:${def.key}`);
      topicsRun.push(def.key);
      const gained = Object.entries(s.fields || {}).filter(([k, v]) => hasValue(v) && !have(k)).length;
      setEvent(evKey, { status: 'success', color: 'green', title: `「${def.label}」完成: 新增字段 ${gained} 个${s.entity ? `，${entityLabel} ${s.rows?.length || 0} 条` : ''}` });
      cb.onData(snapshot());
    };
    const CONC = opts.topicConcurrency ?? 4;
    for (let i = 0; i < topicKeys.length; i += CONC) {
      await Promise.all(topicKeys.slice(i, i + CONC).map((k, j) => runTopic(k, i + j)));
      if (!(await cb.waitIfPaused())) return { status: 'aborted' };
    }

    // ── 工序 5：合并落库 ──
    emit({ key: 'save', title: '工序 5: 合并多来源结果，写入企业库与子实体（只填空，人工锁定 / 定论的不覆盖）...', status: 'loading', color: 'blue' });
    const data = snapshot();
    cb.onData(data);
    const saved = await patchCompanyLog({
      id: log.id, status: 'success', error_message: null, steps_done: [...stepsDone, 'save'],
      raw_markdown: markdown, markdown_len: markdown.length, pages_fetched: pagesFetched, raw_searches: rawSearches,
      structured_json: { ...data, pipeline_log: events.slice(0, -1) }, model_id: model, batch_id: batchId,
    });
    if (!saved.ok) return fail(`写日志失败: ${saved.error || '未知错误'}`);
    if (saved.storeError) { done({ status: 'error', color: 'red', title: `入库失败: ${saved.storeError}` }); return { status: 'failed', error: saved.storeError }; }
    const a = saved.applied || {};
    done({ status: 'success', color: 'green', title: `✅ 完成！${a.frozen ? '（企业审核已定论，画像字段未覆盖）' : `画像新增 ${a.filled?.length || 0} 个字段`}，融资 ${a.financings_saved || 0} / 动态 ${a.news_saved || 0} / 高管 ${a.executives_saved || 0} / 产品 ${a.products_saved || 0} 条，完整度 ${a.completeness_before ?? '-'} → ${a.completeness_after ?? '-'}，${a.llm_calls || 0} 次调用 · $${(a.cost_usd || 0).toFixed(4)}` });
    return { status: 'success', applied: a };
  } catch (e: any) {
    return fail(e.message || '处理异常');
  }
}
