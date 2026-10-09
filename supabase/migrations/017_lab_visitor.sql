-- 017 AI 百业：体验者的访客编号（2026-10-09）
-- 「我的历史 / 证书库」按它找回自己的作答：浏览器第一次来时生成一个随机编号存本地；登录用户用 u:<账号 id>，换设备也在。
-- 整份可重复执行。
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS visitor_id TEXT;
CREATE INDEX IF NOT EXISTS idx_skill_submissions_visitor ON skill_submissions(visitor_id, submitted_at DESC);
COMMENT ON COLUMN skill_submissions.visitor_id IS '体验者访客编号（浏览器随机生成 / 登录用户 u:<id>），用于「我的历史」和证书库';
NOTIFY pgrst, 'reload schema';
