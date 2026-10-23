-- 真活 · 深度样本库（2026-10-23）：出题人交来的「好题」（案例 / 考题），解析成骨架后进库，出题时当参照
CREATE TABLE IF NOT EXISTS work_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  industry TEXT,
  problem_type TEXT,
  difficulty TEXT,
  skeleton JSONB NOT NULL DEFAULT '{}',   -- SampleSkeleton：stages / exhibits / style_notes
  raw TEXT,                               -- 原文（解析用；不对外）
  source_name TEXT,                       -- 文件名 / 来源说明
  created_by TEXT,                        -- 出题人邮箱
  shared BOOLEAN NOT NULL DEFAULT true,   -- true = 内部训练素材（后台交的，所有出题自动参照）；false = 某个出题人自己交的参考资料（只用于他自己出题）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_samples_created ON work_samples(created_at DESC);
ALTER TABLE work_samples ENABLE ROW LEVEL SECURITY;
