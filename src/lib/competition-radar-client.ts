/**
 * 赛事雷达（浏览器端编排）：一条检索 = 联网检索候选 → 逐条抓官方页提取 → 写入赛事库。
 * 任务详情页逐条调用；单条视图实时看流水。
 */
import { REWARD_LABELS } from '@/lib/competition-fields';

export interface PipelineEvent { key: string; title: string; status: 'loading' | 'success' | 'error'; color?: string }
export interface RadarRow { key: string; candidate: any; fields: Record<string, any> | null; sources: Record<string, string>; summary: string | null; page: any; mode?: string; state: 'pending' | 'running' | 'done' | 'failed'; error?: string }
export interface RadarItem { id: number; query: string; company: string | null; company_id?: number | null; kinds: string[]; region: string; rewards: string[]; only_open: boolean; count: number; enrich: boolean }
export interface RadarCallbacks {
  onEvents: (events: PipelineEvent[]) => void;
  onRows: (rows: RadarRow[]) => void;
  onSummary: (s: string) => void;
  waitIfPaused: () => Promise<boolean>;
}
export type RadarResult = { status: 'success'; saved: any; found: number } | { status: 'failed'; error: string } | { status: 'aborted' };

const post = async (url: string, body: any) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) throw new Error('未登录或登录已过期，请重新登录后再跑');
  return res.json().catch(() => ({}));
};
export const patchSearch = (body: any) => fetch('/api/admin/competition-searches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({}));

export const finalRows = (rows: RadarRow[]) => rows.map(r => ({ ...(r.fields || r.candidate), reward_types: r.fields?.reward_types?.length ? r.fields.reward_types : r.candidate.reward_types }));
export const sourcesMap = (rows: RadarRow[]) => Object.fromEntries(rows.map(r => [r.fields?.name || r.candidate.name, r.sources || {}]));

export async function runCompetitionSearch(item: RadarItem, model: string, cb: RadarCallbacks): Promise<RadarResult> {
  const events: PipelineEvent[] = [];
  const emit = (e: PipelineEvent) => { events.push(e); cb.onEvents([...events]); };
  const done = (u: Partial<PipelineEvent>) => { Object.assign(events[events.length - 1], u); cb.onEvents([...events]); };
  let rows: RadarRow[] = [];
  const setRows = (next: RadarRow[]) => { rows = next; cb.onRows([...rows]); };
  const updateRow = (key: string, u: Partial<RadarRow>) => setRows(rows.map(r => r.key === key ? { ...r, ...u } : r));
  const batchId = Date.now();
  let summary = '';
  const structured = () => ({ competitions: finalRows(rows), ai_summary: [summary, ...rows.filter(r => r.summary).map(r => `【${r.fields?.name || r.candidate.name}】${r.summary}`)].filter(Boolean).join('\n\n'), pipeline_log: events });
  const fail = async (msg: string): Promise<RadarResult> => {
    emit({ key: 'fail', title: `❌ ${msg}`, status: 'error', color: 'red' });
    await patchSearch({ id: item.id, status: 'failed', error_message: msg, raw_pages: rows.map(x => x.page).filter(Boolean), structured_json: structured(), batch_id: batchId });
    return { status: 'failed', error: msg };
  };

  await patchSearch({ id: item.id, status: 'running', error_message: null, model_id: model, batch_id: batchId });
  const label = [item.company, item.query].filter(Boolean).join(' · ');
  emit({ key: 'start', title: `🏆 ${label}${item.rewards?.length ? `（奔着 ${item.rewards.map(r => REWARD_LABELS[r]?.label).filter(Boolean).join(' / ')} 去）` : ''}`, status: 'success', color: 'blue' });

  try {
    emit({ key: 's1', title: '步骤 1: 联网检索候选赛事...', status: 'loading', color: 'blue' });
    const s = await post('/api/agents/competition/search', { query: item.query, company: item.company, kinds: item.kinds, region: item.region, rewards: item.rewards, onlyOpen: item.only_open, count: item.count, model, batchId });
    if (!s.success) return fail(`检索失败: ${s.error}`);
    const cands: any[] = s.candidates || [];
    summary = s.summary || '';
    cb.onSummary(summary);
    setRows(cands.map((c, i) => ({ key: `${i}-${c.name}`, candidate: c, fields: null, sources: {}, summary: null, page: null, state: 'pending' })));
    done({ status: 'success', color: cands.length ? 'green' : 'orange', title: `步骤 1 完成: 找到 ${cands.length} 个候选赛事${s.searchQueries?.length ? `（搜索词 ${s.searchQueries.length} 个）` : ''}` });
    await patchSearch({ id: item.id, search_queries: s.searchQueries || [], raw_candidates: s.raw, candidates_found: cands.length });
    if (!(await cb.waitIfPaused())) return { status: 'aborted' };

    if (item.enrich !== false && cands.length) {
      for (let i = 0; i < cands.length; i++) {
        const key = `${i}-${cands[i].name}`;
        emit({ key: `d${i}`, title: `步骤 2.${i + 1}: 抓取「${cands[i].name}」官方页面并提取完整字段...`, status: 'loading', color: 'blue' });
        updateRow(key, { state: 'running' });
        const d = await post('/api/agents/competition/detail', { candidate: cands[i], model, batchId });
        if (!d.success) { updateRow(key, { state: 'failed', error: d.error }); done({ status: 'error', color: 'red', title: `「${cands[i].name}」提取失败: ${d.error}` }); }
        else {
          updateRow(key, { state: 'done', fields: d.fields, sources: d.sources, summary: d.summary, page: d.page, mode: d.mode });
          const f = d.fields || {};
          done({ status: 'success', color: 'green', title: `「${f.name || cands[i].name}」完成（${d.mismatch ? '搜到的链接指向别的比赛，已改联网补全' : d.mode === 'page' ? `官方页 ${(d.page.len / 1000).toFixed(0)}k 字符` : '官方页抓不到，联网补'}）：截止 ${f.registration_deadline_str || '未知'} · ${(f.reward_types || []).map((r: string) => REWARD_LABELS[r]?.emoji).join('') || '奖励未知'}` });
        }
        if (!(await cb.waitIfPaused())) return { status: 'aborted' };
      }
    }

    emit({ key: 'save', title: '步骤 3: 写入赛事库（待审核；已有的只填空、刷新状态与截止）...', status: 'loading', color: 'blue' });
    const r = await patchSearch({ id: item.id, status: 'success', error_message: null, raw_pages: rows.map(x => x.page).filter(Boolean), structured_json: structured(), save: true, competitions: finalRows(rows), sources: sourcesMap(rows), batch_id: batchId });
    if (!r.ok) return fail(`入库失败: ${r.error}`);
    const sv = r.saved || { inserted: 0, updated: 0, skipped: 0 };
    done({ status: 'success', color: 'green', title: `✅ 完成！新增 ${sv.inserted} 条，更新 ${sv.updated} 条，跳过 ${sv.skipped} 条${r.cost ? ` · ${r.cost.llm_calls} 次调用 · $${Number(r.cost.cost_usd).toFixed(4)}` : ''}` });
    return { status: 'success', saved: sv, found: cands.length };
  } catch (e: any) {
    return fail(e.message || '处理异常');
  }
}
