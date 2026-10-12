import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/supabase-all';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const modelFilter = searchParams.get('model') || '';
    const daysFilter = parseInt(searchParams.get('days') || '0');
    // 按功能筛：tool=skill-lab,lab-art,lab-3d 就是「只看百业」（学公司 simulator 的做法）
    const toolFilter = (searchParams.get('tool') || '').split(',').map(t => t.trim()).filter(Boolean);

    let query = supabase
      .from('token_usage_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (modelFilter) {
      query = query.eq('model_id', modelFilter);
    }
    if (toolFilter.length) query = query.in('tool_name', toolFilter);

    if (daysFilter > 0) {
      const since = new Date(Date.now() - daysFilter * 86400000).toISOString();
      query = query.gte('created_at', since);
    }

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data: logs, count, error } = await query;
    if (error) {
      console.error('[TokenUsage] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group logs by batch_id
    const groupedLogs: any[] = [];
    const batchMap = new Map();
    
    for (const log of (logs || [])) {
       if (log.batch_id) {
          if (!batchMap.has(log.batch_id)) {
             const grouped = { ...log, records: [log] };
             // Use the first log's task name, or generalize it
             grouped.task_name = `[Batch] ${log.task_name}`;
             batchMap.set(log.batch_id, grouped);
             groupedLogs.push(grouped);
          } else {
             const parent = batchMap.get(log.batch_id);
             parent.total_input_tokens += (log.total_input_tokens || 0);
             parent.total_output_tokens += (log.total_output_tokens || 0);
             parent.total_tokens += (log.total_tokens || 0);
             parent.total_cost_usd += (log.total_cost_usd || 0);
             parent.api_cost_cny += (log.api_cost_cny || 0);
             parent.records.push(log);
          }
       } else {
          groupedLogs.push(log);
       }
    }

    // 统计要全量：PostgREST 单次最多 1000 行，翻页读完（以前只统计了最近 1000 条）
    const since = daysFilter > 0 ? new Date(Date.now() - daysFilter * 86400000).toISOString() : '';
    const statsBuild = (cols: string) => () => {
      let q = supabase.from('token_usage_logs').select(cols).order('id');
      if (modelFilter) q = q.eq('model_id', modelFilter);
      if (toolFilter.length) q = q.in('tool_name', toolFilter);
      if (since) q = q.gte('created_at', since);
      return q;
    };
    const { data: allForStats } = await selectAll<any>(statsBuild('total_input_tokens, total_output_tokens, total_tokens, total_cost_usd, api_cost_cny, model_id, tool_name, task_name, created_at'));
    // 成本归属（迁移 021 之后才有这几列；没有就不出「按空间 / 按环节」）
    const { data: attrRows, error: attrErr } = await selectAll<any>(statsBuild('space_id, stage, units, unit, total_cost_usd'));
    if (attrErr) attrRows.length = 0;
    // 联网搜索次数 / 费用（迁移 014 之后才有这两列；没有就当 0）
    const { data: searchByRow, error: searchErr } = await selectAll<any>(statsBuild('search_calls, search_cost_usd'));
    if (searchErr) searchByRow.length = 0;
    const totalSearchCalls = searchByRow.reduce((a: number, r: any) => a + (r.search_calls || 0), 0);
    const totalSearchCost = searchByRow.reduce((a: number, r: any) => a + (parseFloat(String(r.search_cost_usd)) || 0), 0);

    let totalInputTokens = 0, totalOutputTokens = 0, totalTokens = 0, totalCostUsd = 0, totalApiCostCny = 0;
    const modelStats: Record<string, { count: number; tokens: number; cost: number }> = {};
    const toolStats: Record<string, { count: number; tokens: number; cost_usd: number; cost_cny: number }> = {};

    for (const row of (allForStats || [])) {
      totalInputTokens += row.total_input_tokens || 0;
      totalOutputTokens += row.total_output_tokens || 0;
      totalTokens += row.total_tokens || 0;
      totalCostUsd += parseFloat(row.total_cost_usd) || 0;
      totalApiCostCny += parseFloat(row.api_cost_cny) || 0;

      const model = row.model_id || 'unknown';
      if (!modelStats[model]) modelStats[model] = { count: 0, tokens: 0, cost: 0 };
      modelStats[model].count++;
      modelStats[model].tokens += row.total_tokens || 0;
      modelStats[model].cost += parseFloat(row.total_cost_usd) || 0;

      const tool = row.tool_name || 'unknown';
      if (!toolStats[tool]) toolStats[tool] = { count: 0, tokens: 0, cost_usd: 0, cost_cny: 0 };
      toolStats[tool].count++;
      toolStats[tool].tokens += row.total_tokens || 0;
      toolStats[tool].cost_usd += parseFloat(row.total_cost_usd) || 0;
      toolStats[tool].cost_cny += parseFloat(row.api_cost_cny) || 0;
    }

    // 按「功能 | 环节」：钱花在生成、章节、评分还是出图（学 simulator）
    const taskStats: Record<string, { count: number; tokens: number; cost: number }> = {};
    for (const row of allForStats || []) {
      const k = `${row.tool_name || 'unknown'} | ${String(row.task_name || '').replace(/^\[Batch\] /, '')}`;
      const t = (taskStats[k] ||= { count: 0, tokens: 0, cost: 0 });
      t.count++; t.tokens += row.total_tokens || 0; t.cost += parseFloat(row.total_cost_usd) || 0;
    }
    // 按流程环节（创造 / 使用 / 学习 / 评审 / 美术与 3D）和按空间
    const stageStats: Record<string, { count: number; cost: number; units: number }> = {};
    const spaceAgg = new Map<string, { cost: number; count: number; byStage: Record<string, number> }>();
    for (const r of attrRows) {
      const st = r.stage || '（未归类）', c = parseFloat(r.total_cost_usd) || 0;
      const a = (stageStats[st] ||= { count: 0, cost: 0, units: 0 }); a.count++; a.cost += c; a.units += +r.units || 0;
      if (!r.space_id) continue;
      const sp = spaceAgg.get(r.space_id) || { cost: 0, count: 0, byStage: {} };
      sp.cost += c; sp.count++; sp.byStage[st] = (sp.byStage[st] || 0) + c; spaceAgg.set(r.space_id, sp);
    }
    const topSpaces = [...spaceAgg.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 30);
    const { data: titles } = topSpaces.length ? await supabase.from('skill_tasks').select('id, title').in('id', topSpaces.map(([id]) => id)) : { data: [] as any[] };
    const titleOf = new Map((titles || []).map((t: any) => [t.id, t.title]));
    const spaceStats = topSpaces.map(([id, v]) => ({ space_id: id, title: titleOf.get(id) || id.slice(0, 8), ...v }));

    return NextResponse.json({
      ok: true,
      logs: groupedLogs,
      total: count || 0,
      page,
      pageSize,
      stats: {
        total_tasks: allForStats?.length || 0,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalTokens,
        total_cost_usd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
        total_api_cost_cny: Math.round(totalApiCostCny * 100) / 100,
        total_search_calls: totalSearchCalls,
        total_search_cost_usd: Math.round(totalSearchCost * 10000) / 10000,
        model_stats: modelStats,
        tool_stats: toolStats,
        task_stats: Object.entries(taskStats).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.cost - a.cost),
        stage_stats: stageStats,
        space_stats: spaceStats,
        attribution_ready: !attrErr,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
