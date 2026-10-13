-- ============================================
-- 028: 给自家的数字职人起名字（2026-10-13）
--   用户：「希望用户能给自己家的 NOVA 们起名字（仅限用户自己看，这样大家的情感更好）」。
--   一个访客 × 一个空间 = 一个昵称。访客：登录用户 u:<用户 id>；游客 v:<浏览器里的随机编号>（lab-cert 的 visitorIds，证书也用它）。
--   只给本人看：读写都按访客编号来，别人拿不到。「和我聊」里职人也会用这个名字自称。
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

CREATE TABLE IF NOT EXISTS lab_nicknames (
  id SERIAL PRIMARY KEY,
  space_id UUID NOT NULL,                   -- skill_tasks.id
  visitor TEXT NOT NULL,                    -- u:<用户 id> | v:<游客编号>
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (space_id, visitor)
);
CREATE INDEX IF NOT EXISTS idx_lab_nicknames_visitor ON lab_nicknames(visitor);
ALTER TABLE lab_nicknames ENABLE ROW LEVEL SECURITY;
