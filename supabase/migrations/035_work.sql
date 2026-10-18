-- 真活台（2026-10-18）：拿一家企业的真实业务问题出题 → 任务 + 材料包 + 带依赖的 rubric + AI 基线 → 参与链接 → 作答与报告。
-- 独立于 /lab（不碰 skill_tasks / lab_chapters），表前缀 work_。核心是生成器，考核空间消费它的产物。
CREATE TABLE IF NOT EXISTS work_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token  TEXT UNIQUE NOT NULL,                 -- 参与链接 /work/<token>
  status       TEXT NOT NULL DEFAULT 'draft',        -- draft 生成中 / ready 已出题 / published 已发布（链接可用）/ archived
  company_id   BIGINT,
  company_name TEXT,
  role         TEXT,                                 -- 岗位 / 职业名（出题的 context）
  context      JSONB,                                -- 出题用到的材料摘要：企业画像 / 岗位 / 职业典型任务 / 行业规范（带来源）
  problem      JSONB,                                -- { statement, why_now, evidence[] }
  task         JSONB,                                -- { title, role, brief, deliverables[], time_minutes, rules[] }
  materials    JSONB,                                -- [{ id, title, kind, content, source, basis }]
  rubric       JSONB,                                -- [{ id, title, desc, weight, depends_on[], basis, levels{L1..L4} }]
  baseline     JSONB,                                -- { model, answer, result{ total, items[] } }  最强模型先做一遍
  model        TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_tasks_token_idx ON work_tasks (share_token);
CREATE INDEX IF NOT EXISTS work_tasks_created_idx ON work_tasks (created_at DESC);

CREATE TABLE IF NOT EXISTS work_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID REFERENCES work_tasks(id) ON DELETE CASCADE,
  participant  JSONB,                                -- { name, contact }
  started_at   TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deliverable  TEXT,                                 -- 交付物（文本）
  events       JSONB DEFAULT '[]'::jsonb,            -- 过程事件流 [{ t, type, ... }]
  ai_chat      JSONB DEFAULT '[]'::jsonb,            -- 工作台里和 AI 的对话 [{ t, q, a }]
  report       JSONB,                                -- { result, process, baseline }
  score        NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_sessions_task_idx ON work_sessions (task_id, created_at DESC);

ALTER TABLE work_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
