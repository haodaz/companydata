-- /invest 产业投资地图的 AI 对话（2026-11）：和真活 / 百业的对话分开存，一人一份
CREATE TABLE IF NOT EXISTS invest_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by TEXT NOT NULL,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE invest_threads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invest_threads_owner ON invest_threads (created_by, updated_at DESC);
NOTIFY pgrst, 'reload schema';
