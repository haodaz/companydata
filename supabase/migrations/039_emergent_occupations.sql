-- 市场新兴职业（2026-10-20 用户口径）：职业大典 / 美国劳工 O*NET 是自上而下的框架，市场会自然长出新职业。
-- 个体信号：岗位打相关职业时，职业库里找不到真正对得上的 → 记一条 occupation_signals
-- 统计信号：按同义名归并，看岗位数 / 企业数 / 城市 / 首次出现 / 近 30 天新增；过门槛的在飞轮看板列出来，人点了才建职业
-- 新建的职业 origin = 'market'，涌现数据存 emergence，画像照常生成。可重复执行。

ALTER TABLE occupations ADD COLUMN IF NOT EXISTS origin TEXT;        -- framework 官方框架（职业大典 / O*NET）| market 市场新兴
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS emergence JSONB;    -- {jobs, companies, cities, first_seen, last_30d, titles[], updated_at}
UPDATE occupations SET origin = 'framework' WHERE origin IS NULL AND source IN ('import', 'official');

CREATE TABLE IF NOT EXISTS occupation_signals (
  id BIGSERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  job_name TEXT,
  company_id INTEGER,
  wanted_name TEXT NOT NULL,                 -- 模型认为该有的职业名
  norm_key TEXT NOT NULL,                    -- 归并后的名字（同义叫法归到一起）
  reason TEXT,
  source TEXT DEFAULT 'tagging',             -- tagging 入库打标签时 | audit 凑数排查
  status TEXT DEFAULT 'open',                -- open | merged 并进已有职业 | created 已建职业 | ignored
  occupation_id INTEGER REFERENCES occupations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (job_id, norm_key)
);
ALTER TABLE occupation_signals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_occupation_signals_norm ON occupation_signals (norm_key, status);
CREATE INDEX IF NOT EXISTS idx_occupation_signals_created ON occupation_signals (created_at DESC);
