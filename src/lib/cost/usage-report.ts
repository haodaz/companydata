/**
 * 用量报表（服务端，两个产品的后台共用）：明细分页 + 全量统计（按模型 / 功能 / 功能 | 环节 / 流程环节 / 空间）。
 * 从 /api/admin/token-usage 抽出来（2026-10-12），百业后台 /api/lab/admin/cost 和数据工厂后台各调一次，只是 tools 不同。
 */
import { selectAll } from '@/lib/supabase-all';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export interface UsageQuery { tools: string[]; days?: number; model?: string; page?: number; pageSize?: number }

export async function usageReport({ tools, days = 0, model = '', page = 1, pageSize = 50 }: UsageQuery) {
  const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : '';
  let query = supabase.from('token_usage_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (model) query = query.eq('model_id', model);
  if (tools.length) query = query.in('tool_name', tools);
  if (since) query = query.gte('created_at', since);
  const from = (page - 1) * pageSize;
  const { data: logs, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw error;

  // 明细按 batch_id 合并
  const groupedLogs: any[] = [];
  const batchMap = new Map<number, any>();
  for (const log of logs || []) {
    if (!log.batch_id) { groupedLogs.push(log); continue; }
    const parent = batchMap.get(log.batch_id);
    if (!parent) { const g = { ...log, records: [log], task_name: `[Batch] ${log.task_name}` }; batchMap.set(log.batch_id, g); groupedLogs.push(g); continue; }
    parent.total_input_tokens += log.total_input_tokens || 0; parent.total_output_tokens += log.total_output_tokens || 0;
    parent.total_tokens += log.total_tokens || 0; parent.total_cost_usd += log.total_cost_usd || 0; parent.api_cost_cny += log.api_cost_cny || 0;
    parent.records.push(log);
  }

  // 统计要全量：PostgREST 单次最多 1000 行，翻页读完
  const statsBuild = (cols: string) => () => {
    let q = supabase.from('token_usage_logs').select(cols).order('id');
    if (model) q = q.eq('model_id', model);
    if (tools.length) q = q.in('tool_name', tools);
    if (since) q = q.gte('created_at', since);
    return q;
  };
  const { data: rows } = await selectAll<any>(statsBuild('total_input_tokens, total_output_tokens, total_tokens, total_cost_usd, api_cost_cny, model_id, tool_name, task_name'));
  const { data: searchRows, error: searchErr } = await selectAll<any>(statsBuild('search_calls, search_cost_usd'));   // 迁移 014 之后才有
  if (searchErr) searchRows.length = 0;
  const { data: attrRows, error: attrErr } = await selectAll<any>(statsBuild('space_id, stage, units, total_cost_usd'));   // 迁移 021 之后才有
  if (attrErr) attrRows.length = 0;

  const f = (v: any) => parseFloat(v) || 0;
  let inTok = 0, outTok = 0, allTok = 0, costUsd = 0, apiCny = 0;
  const modelStats: Record<string, { count: number; tokens: number; cost: number }> = {};
  const toolStats: Record<string, { count: number; tokens: number; cost_usd: number; cost_cny: number }> = {};
  const taskStats: Record<string, { count: number; tokens: number; cost: number }> = {};
  for (const r of rows) {
    inTok += r.total_input_tokens || 0; outTok += r.total_output_tokens || 0; allTok += r.total_tokens || 0; costUsd += f(r.total_cost_usd); apiCny += f(r.api_cost_cny);
    const m = (modelStats[r.model_id || 'unknown'] ||= { count: 0, tokens: 0, cost: 0 }); m.count++; m.tokens += r.total_tokens || 0; m.cost += f(r.total_cost_usd);
    const t = (toolStats[r.tool_name || 'unknown'] ||= { count: 0, tokens: 0, cost_usd: 0, cost_cny: 0 }); t.count++; t.tokens += r.total_tokens || 0; t.cost_usd += f(r.total_cost_usd); t.cost_cny += f(r.api_cost_cny);
    const k = `${r.tool_name || 'unknown'} | ${String(r.task_name || '').replace(/^\[Batch\] /, '')}`;
    const s = (taskStats[k] ||= { count: 0, tokens: 0, cost: 0 }); s.count++; s.tokens += r.total_tokens || 0; s.cost += f(r.total_cost_usd);
  }
  // 按流程环节（创造 / 使用 / 学习 / 评审 / 美术与 3D）和按空间
  const stageStats: Record<string, { count: number; cost: number; units: number }> = {};
  const spaceAgg = new Map<string, { cost: number; count: number; byStage: Record<string, number> }>();
  for (const r of attrRows) {
    const st = r.stage || '（未归类）', c = f(r.total_cost_usd);
    const a = (stageStats[st] ||= { count: 0, cost: 0, units: 0 }); a.count++; a.cost += c; a.units += +r.units || 0;
    if (!r.space_id) continue;
    const sp = spaceAgg.get(r.space_id) || { cost: 0, count: 0, byStage: {} };
    sp.cost += c; sp.count++; sp.byStage[st] = (sp.byStage[st] || 0) + c; spaceAgg.set(r.space_id, sp);
  }
  const top = [...spaceAgg.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 30);
  const { data: titles } = top.length ? await supabase.from('skill_tasks').select('id, title').in('id', top.map(([id]) => id)) : { data: [] as any[] };
  const titleOf = new Map((titles || []).map((t: any) => [t.id, t.title]));

  return {
    logs: groupedLogs, total: count || 0, page, pageSize,
    stats: {
      total_tasks: rows.length,
      total_input_tokens: inTok, total_output_tokens: outTok, total_tokens: allTok,
      total_cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
      total_api_cost_cny: Math.round(apiCny * 100) / 100,
      total_search_calls: searchRows.reduce((a: number, r: any) => a + (r.search_calls || 0), 0),
      total_search_cost_usd: Math.round(searchRows.reduce((a: number, r: any) => a + f(r.search_cost_usd), 0) * 10000) / 10000,
      model_stats: modelStats, tool_stats: toolStats,
      task_stats: Object.entries(taskStats).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cost - a.cost),
      stage_stats: stageStats,
      space_stats: top.map(([id, v]) => ({ space_id: id, title: titleOf.get(id) || id.slice(0, 8), ...v })),
      attribution_ready: !attrErr,
    },
  };
}
