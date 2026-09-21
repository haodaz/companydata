import { NextResponse } from 'next/server';
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

    let query = supabase
      .from('token_usage_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (modelFilter) {
      query = query.eq('model_id', modelFilter);
    }

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

    let statsQuery = supabase
      .from('token_usage_logs')
      .select('total_input_tokens, total_output_tokens, total_tokens, total_cost_usd, api_cost_cny, model_id, tool_name, created_at');

    if (modelFilter) statsQuery = statsQuery.eq('model_id', modelFilter);
    if (daysFilter > 0) {
      const since = new Date(Date.now() - daysFilter * 86400000).toISOString();
      statsQuery = statsQuery.gte('created_at', since);
    }

    const { data: allForStats } = await statsQuery;

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
        model_stats: modelStats,
        tool_stats: toolStats,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
