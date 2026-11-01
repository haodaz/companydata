-- 百业「AI 与我的工作」：每个职业的任务分类缓存（2026-11-01）
-- 职业这一层（任务分 AI 接手 / 人机协作 / 人来做、新增任务、基准分、通用的强项与风险）第一次分析时生成并存这里，之后直接读——同一职业的基准分固定、省模型调用。
-- 个人那一层（按简历加减分、个性化强项风险）不缓存。任务清单变了（task_hash 不同）就重算。
CREATE TABLE IF NOT EXISTS lab_ai_change_cache (
  occupation_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  task_hash TEXT NOT NULL,
  task_source TEXT,
  tasks JSONB NOT NULL,          -- [{ name, kind: ai|hybrid|human, how }]
  new_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict TEXT,
  baseline INTEGER NOT NULL,
  model TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lab_ai_change_cache ENABLE ROW LEVEL SECURITY;
