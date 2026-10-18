-- 用量页统计交给数据库汇总（2026-10-18）：以前每次打开 Token 用量页都把四万多条记账记录分三遍拉回来自己加，
-- 二十多秒、线上一慢就超时，卡片和分析全空。这里按 模型 × 功能 × 环节名 × 流程环节 × 空间 分组求和，只回几百行。
CREATE OR REPLACE FUNCTION token_usage_agg(p_tools TEXT[] DEFAULT NULL, p_since TIMESTAMPTZ DEFAULT NULL, p_model TEXT DEFAULT NULL)
RETURNS TABLE (
  model_id TEXT, tool_name TEXT, task_name TEXT, stage TEXT, space_id UUID,
  n BIGINT, in_tok BIGINT, out_tok BIGINT, tok BIGINT, cost_usd NUMERIC, api_cny NUMERIC,
  search_calls BIGINT, search_cost_usd NUMERIC, units NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT l.model_id, l.tool_name, regexp_replace(COALESCE(l.task_name, ''), '^\[Batch\] ', ''), l.stage, l.space_id,
         COUNT(*), COALESCE(SUM(l.total_input_tokens), 0), COALESCE(SUM(l.total_output_tokens), 0), COALESCE(SUM(l.total_tokens), 0),
         COALESCE(SUM(l.total_cost_usd), 0), COALESCE(SUM(l.api_cost_cny), 0),
         COALESCE(SUM(l.search_calls), 0), COALESCE(SUM(l.search_cost_usd), 0), COALESCE(SUM(l.units), 0)
  FROM token_usage_logs l
  WHERE (p_tools IS NULL OR l.tool_name = ANY(p_tools))
    AND (p_since IS NULL OR l.created_at >= p_since)
    AND (p_model IS NULL OR p_model = '' OR l.model_id = p_model)
  GROUP BY 1, 2, 3, 4, 5;
$$;

-- 只给后台服务端（service_role）用
REVOKE ALL ON FUNCTION token_usage_agg(TEXT[], TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION token_usage_agg(TEXT[], TIMESTAMPTZ, TEXT) TO service_role;

CREATE INDEX IF NOT EXISTS token_usage_logs_created_idx ON token_usage_logs (created_at DESC);
