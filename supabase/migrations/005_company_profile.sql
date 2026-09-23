-- ============================================
-- 005: 企业画像独立流水线
--   任务 / 每家企业一条爬取日志（raw + 结构化 + 成本）
--   子实体：融资 company_financings / 近期动态 company_news / 管理团队 company_executives（字段名与平方基础设施对齐）
--   companies 补充：完整度、画像抓取时间、舆情 / 求职者口碑摘要
-- ============================================
-- 在 Supabase SQL Editor 中整段执行，可重复执行。

-- ────────────────────────────────────────────
-- 1. companies 补充列
-- ────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS completeness_score INTEGER,          -- 画像完整度 0-100（规则见 src/lib/company-fields.ts）
  ADD COLUMN IF NOT EXISTS profile_crawled_at TIMESTAMPTZ,      -- 最近一次完整画像流水线跑完的时间
  ADD COLUMN IF NOT EXISTS profile_log_id INTEGER,              -- 最近一次画像日志 id（company_crawl_logs）
  ADD COLUMN IF NOT EXISTS public_sentiment TEXT,               -- 舆情与风险摘要（近 12 个月负面新闻 / 裁员 / 处罚 / 诉讼，标注来源）
  ADD COLUMN IF NOT EXISTS candidate_reputation TEXT;           -- 求职者口碑摘要（公开可搜到的面经 / 笔试 / 薪资爆料 / 工作体验，标注为观点）

CREATE INDEX IF NOT EXISTS idx_companies_completeness ON companies(completeness_score);

-- ────────────────────────────────────────────
-- 2. 画像任务 + 爬取日志
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',          -- draft | running | completed | failed
  topics TEXT[] DEFAULT '{}',           -- 要跑的检索主题（空 = 全部），见 src/lib/company-fields.ts PROFILE_TOPICS
  skip_filled BOOLEAN DEFAULT FALSE,    -- 只跑缺的：目标字段已齐、子实体已有的主题跳过
  model_id TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_crawl_logs (
  id SERIAL PRIMARY KEY,
  task_id UUID REFERENCES company_tasks(id) ON DELETE CASCADE,   -- 单家工具跑出来的日志 task_id 为空
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'pending',        -- pending | running | success | failed
  steps_done TEXT[] DEFAULT '{}',       -- 已完成的工序：locate / fetch / extract / search:<topic> / save

  -- raw 层：官方页面 Markdown 原文 + 每个检索主题的原始返回
  raw_markdown TEXT,
  markdown_len INTEGER DEFAULT 0,
  pages_fetched JSONB DEFAULT '[]',     -- [{ url, subtype, title, len, ok }]
  raw_searches JSONB DEFAULT '{}',      -- { topic: { queries, parsed } }

  -- 终局层：合并后的画像 + 三个子实体 + 摘要 + 流水日志
  structured_json JSONB,                -- { profile, financings, news, executives, sources, summaries, ai_summary, pipeline_log }

  -- 入库结果
  pushed_to_db BOOLEAN DEFAULT FALSE,
  fields_filled TEXT[] DEFAULT '{}',
  financings_saved INTEGER DEFAULT 0,
  news_saved INTEGER DEFAULT 0,
  executives_saved INTEGER DEFAULT 0,
  completeness_before INTEGER,
  completeness_after INTEGER,

  -- 成本（按 batch_id 从 token_usage_logs 汇总）
  llm_calls INTEGER DEFAULT 0,
  token_total BIGINT DEFAULT 0,
  cost_usd NUMERIC(12, 6) DEFAULT 0,

  model_id TEXT,
  batch_id BIGINT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_crawl_logs_task ON company_crawl_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_company_crawl_logs_company ON company_crawl_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_company_crawl_logs_created ON company_crawl_logs(created_at DESC);

-- ────────────────────────────────────────────
-- 3. 子实体（字段名 = 姜贺给的字段表；带 _str 的是原文，便于回溯）
-- ────────────────────────────────────────────

-- 3a. 融资
CREATE TABLE IF NOT EXISTS company_financings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  finance_round TEXT,                   -- seed | angel | pre_a | series_a | pre_b | series_b | series_c | series_d | series_e | series_f | preipo
  finance_round_str TEXT,               -- 轮次原文（如 "战略投资" / "IPO" 这类不在枚举里的）
  finance_amount TEXT,                  -- 融资金额（原文，带币种）
  finance_enterprise TEXT,              -- 投资方（多个用 " / " 连接）
  publish_date DATE,
  publish_date_str TEXT,                -- 日期原文（只有年月时保留）
  -- 与平方对齐的同步字段
  external_id TEXT,
  data_source_id TEXT,
  org_id TEXT,
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  latest_full_sync_task_id BIGINT,
  -- 我们的追溯与审核
  source_url TEXT,
  dedupe_key TEXT UNIQUE NOT NULL,
  log_id INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_financings_company ON company_financings(company_id);

-- 3b. 近期动态
CREATE TABLE IF NOT EXISTS company_news (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,            -- 概要
  publish_date DATE,
  publish_date_str TEXT,
  publish_source TEXT,                  -- 发布来源名称
  source_url TEXT,                      -- 来源链接
  kind TEXT,                            -- 我们的分类：product | financing | partnership | personnel | expansion | award | campus | risk | other
  external_id TEXT,
  data_source_id TEXT,
  org_id TEXT,
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  latest_full_sync_task_id BIGINT,
  dedupe_key TEXT UNIQUE NOT NULL,
  log_id INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_news_company ON company_news(company_id);
CREATE INDEX IF NOT EXISTS idx_company_news_date ON company_news(publish_date DESC);

-- 3c. 管理团队
CREATE TABLE IF NOT EXISTS company_executives (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,                           -- 职务（我们的字段；对方表里没有单独职务列，简介里也会带）
  description TEXT,                     -- 简介
  education TEXT,                       -- college | technical_secondary_school | primary_school | master | high_school | junior_high_school | phd | undergrad
  gender TEXT,                          -- male | female
  age INTEGER,
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  salary TEXT,                          -- 薪酬（元）原文
  share_holding NUMERIC,                -- 持股数（万股）
  share_ratio NUMERIC,                  -- 持股比例（%）
  start_date DATE,
  start_date_str TEXT,
  external_id TEXT,
  data_source_id TEXT,
  org_id TEXT,
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  latest_full_sync_task_id BIGINT,
  source_url TEXT,
  dedupe_key TEXT UNIQUE NOT NULL,
  log_id INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_executives_company ON company_executives(company_id);

-- ────────────────────────────────────────────
-- 4. RLS（与其它表一致：开启、不加策略，只由 service role 访问）
-- ────────────────────────────────────────────
ALTER TABLE company_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_crawl_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_financings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_executives ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────
-- 5. 关联计数视图补上子实体
-- ────────────────────────────────────────────
DROP VIEW IF EXISTS company_relation_counts;
CREATE VIEW company_relation_counts
WITH (security_invoker = true) AS
SELECT
  company_id,
  count(*) FILTER (WHERE kind = 'url')                       AS url_total,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'homepage')  AS url_homepage,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'careers')   AS url_careers,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'campus')    AS url_campus,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'job')       AS url_job,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'about')     AS url_about,
  count(*) FILTER (WHERE kind = 'job')                       AS jobs_total,
  count(*) FILTER (WHERE kind = 'job' AND sub = 'open')      AS jobs_open,
  count(*) FILTER (WHERE kind = 'financing')                 AS financings_total,
  count(*) FILTER (WHERE kind = 'news')                      AS news_total,
  count(*) FILTER (WHERE kind = 'executive')                 AS executives_total
FROM (
  SELECT company_id, 'url' AS kind, type AS sub FROM url_sources WHERE company_id IS NOT NULL
  UNION ALL
  SELECT company_id, 'job', status FROM jobs WHERE company_id IS NOT NULL
  UNION ALL
  SELECT company_id, 'financing', '' FROM company_financings WHERE NOT if_delete
  UNION ALL
  SELECT company_id, 'news', '' FROM company_news WHERE NOT if_delete
  UNION ALL
  SELECT company_id, 'executive', '' FROM company_executives WHERE NOT if_delete
) x
GROUP BY company_id;

NOTIFY pgrst, 'reload schema';
