-- 真活平台级配置（11-10）：第一项是打分方式 key = 'scale'，value = { "id": "full" | "ai_use" }。
-- 没有这一行 = 全看（现在的模式）。只有服务端读写，不开策略。
CREATE TABLE IF NOT EXISTS work_platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE work_platform_settings ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
