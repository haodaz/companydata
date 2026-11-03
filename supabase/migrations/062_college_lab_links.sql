-- 百业学院 · 实验室入口（2026-11-03）：每家实验室一条带密钥的链接（/college/lab/<token>），不用注册，
-- 实验室的人进来看 AI 起草的私域材料、确认 / 改成真的、上传自己的文件、删掉不对的（人只做校正）。
-- 材料本身在 college_private_materials（061）；这里只存链接和谁动过。
CREATE TABLE IF NOT EXISTS college_lab_links (
  org_id      UUID PRIMARY KEY,                    -- ws_orgs.id，一家一条
  token       TEXT UNIQUE NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
ALTER TABLE college_lab_links ENABLE ROW LEVEL SECURITY;

-- 材料的修改留痕：谁、什么时候、改前改后（实验室在入口里改的 / 确认的）
ALTER TABLE college_private_materials ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE college_private_materials ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
ALTER TABLE college_private_materials ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
