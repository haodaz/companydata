-- ============================================
-- 007: 核心产品子实体 company_products
--   主打产品 / 产品线 / 品牌 / 自有 App / 服务，一条一个，带品类、技术关键词、软硬件、在售 / 停产、是否拳头产品
--   （product_area「产品范围」保留，是品类层面的一段话；这里是可点名的列表）
-- 在 Supabase SQL Editor 中整段执行，可重复执行。
-- ============================================

CREATE TABLE IF NOT EXISTS company_products (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                   -- 产品 / 产品线 / 品牌 / App 名称
  category TEXT,                        -- 品类（中文，如 数码钢琴 / SaaS 平台 / 咨询服务）
  tech_keywords TEXT[] DEFAULT '{}',    -- 技术关键词（AI 打标：如 音频 DSP / 嵌入式 / 计算机视觉 / LLM）
  kind TEXT,                            -- hardware 硬件 | software 软件 | service 服务 | solution 解决方案 | other
  status TEXT DEFAULT 'unknown',        -- active 在售 | discontinued 停产 / 历史 | unknown
  is_flagship BOOLEAN NOT NULL DEFAULT FALSE,   -- 拳头 / 主打产品
  description TEXT,                     -- 一句话说明：给谁用、解决什么
  source_url TEXT,                      -- 来源（官网产品中心 > 年报招股书 > 电商旗舰店 > 新闻）
  -- 与平方对齐的同步字段
  external_id TEXT,
  data_source_id TEXT,
  org_id TEXT,
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  latest_full_sync_task_id BIGINT,
  -- 我们的追溯与审核
  dedupe_key TEXT UNIQUE NOT NULL,      -- 公司 + 名称
  log_id INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_locked_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_products_company ON company_products(company_id);
CREATE INDEX IF NOT EXISTS idx_company_products_kind ON company_products(kind);
ALTER TABLE company_products ENABLE ROW LEVEL SECURITY;

-- 画像日志记录本次写入的产品条数
ALTER TABLE company_crawl_logs ADD COLUMN IF NOT EXISTS products_saved INTEGER DEFAULT 0;

-- 关联计数视图补上产品
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
  count(*) FILTER (WHERE kind = 'executive')                 AS executives_total,
  count(*) FILTER (WHERE kind = 'product')                   AS products_total
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
  UNION ALL
  SELECT company_id, 'product', '' FROM company_products WHERE NOT if_delete
) x
GROUP BY company_id;

NOTIFY pgrst, 'reload schema';
