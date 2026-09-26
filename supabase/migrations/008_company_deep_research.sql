-- ────────────────────────────────────────────
-- 008 · 企业深度尽调（投资维度）
-- 一家企业按专题各存一份联网检索结果：上市与市值 / 财务 / 股权 / 管线 / BD 交易 / 团队 / 风险 / 校招。
-- 每个专题一行，重跑覆盖；结果原样保留（每个值带来源 URL），页面按专题渲染。
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_deep_research (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,                  -- listing / financials / shareholding / pipeline / deals / team / risks / campus
  data JSONB NOT NULL DEFAULT '{}',     -- 该专题的结构化结果（含 source）
  queries TEXT[] DEFAULT '{}',          -- 模型实际用过的检索词
  model_id TEXT,
  seconds INTEGER,
  cost_usd NUMERIC(12, 6) DEFAULT 0,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_company_deep_research_company ON company_deep_research(company_id);
