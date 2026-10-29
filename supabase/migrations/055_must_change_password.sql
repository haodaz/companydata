-- 首次登录强制改密码（2026-10-29）：管理员新建 / 重置密码的账号打上标记，登录后先改密码才能用。
-- 现有账号一律 false（不受影响）；自助注册的账号密码是本人设的，也是 false。
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
