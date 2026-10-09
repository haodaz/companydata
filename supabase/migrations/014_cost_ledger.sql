-- 014 记账：把联网搜索算进成本，价目表放进库里可改（2026-10-09）
-- 以前只按 token 记费、价格写死在代码里，联网搜索（Gemini Grounding / 阿里云 enable_search / OpenAI web search）完全没算，严重低估。
-- 价格拿不到接口，只能填价目表：先按公开报价填一版（note 标「参考价」），对照真实账单在 Token 用量页上改。整份可重复执行。

ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS search_calls INTEGER DEFAULT 0;      -- 这次调用触发了几次联网搜索
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS search_cost_usd NUMERIC DEFAULT 0;   -- 其中搜索部分的费用（美元）
-- api_cost_cny（001 就有）：总费用折人民币

CREATE TABLE IF NOT EXISTS model_pricing (
  model_id      TEXT PRIMARY KEY,
  provider      TEXT,
  currency      TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY')),
  input_per_m   NUMERIC NOT NULL DEFAULT 0,   -- 每百万输入 token
  output_per_m  NUMERIC NOT NULL DEFAULT 0,   -- 每百万输出 token
  search_per_k  NUMERIC NOT NULL DEFAULT 0,   -- 每千次联网搜索
  note          TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 参考价：已存在的行不覆盖（人改过的保留）
INSERT INTO model_pricing (model_id, provider, currency, input_per_m, output_per_m, search_per_k, note) VALUES
  ('qwen-plus',        'Aliyun', 'CNY', 0.8,   2,    4,  '参考价：百炼公开报价；联网搜索按次计费价请按百炼账单核对'),
  ('qwen-max',         'Aliyun', 'CNY', 2.4,   9.6,  4,  '参考价：百炼公开报价；联网搜索价请按账单核对'),
  ('qwen-turbo',       'Aliyun', 'CNY', 0.3,   0.6,  4,  '参考价：百炼公开报价；联网搜索价请按账单核对'),
  ('gemini-3.8-flash', 'Google', 'USD', 0.75,  3.75, 35, '参考价：Google Search Grounding 按 1000 次 35 美元估；token 单价请按 AI Studio 账单核对'),
  ('gemini-3.6-flash', 'Google', 'USD', 0.75,  3.75, 35, '参考价：同上'),
  ('gemini-3.5-flash', 'Google', 'USD', 0.75,  3.75, 35, '参考价：同上'),
  ('gemini-3.1-pro-preview', 'Google', 'USD', 2, 12, 35, '参考价：同上'),
  ('gpt-5.6-luna',     'OpenAI', 'USD', 0.5,   2,    10, '参考价：web search 工具按 1000 次 10 美元估'),
  ('gpt-5.6-terra',    'OpenAI', 'USD', 2.5,   10,   10, '参考价'),
  ('gpt-6-astra',      'OpenAI', 'USD', 10,    30,   10, '参考价')
ON CONFLICT (model_id) DO NOTHING;

ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE model_pricing IS '模型价目表（记账用）：token 单价 + 每千次联网搜索价；对照真实账单在 Token 用量页修改';

NOTIFY pgrst, 'reload schema';
