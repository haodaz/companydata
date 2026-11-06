-- 百业工厂 · 聊着出空间（2026-11-06，D）：和工厂助理的对话。只看自己的；space_id = 这段对话最后在做的空间（右边面板、最近列表用）。
CREATE TABLE IF NOT EXISTS lab_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  TEXT NOT NULL,
  title       TEXT,
  messages    JSONB NOT NULL DEFAULT '[]',
  space_id    UUID REFERENCES skill_tasks(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_threads_owner ON lab_threads(created_by, updated_at DESC);
ALTER TABLE lab_threads ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
