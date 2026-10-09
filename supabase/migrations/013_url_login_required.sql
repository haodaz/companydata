-- 013 信息源「需登录」标记（2026-10-09 试水；院校申请那边以后也要用）
-- 抓取 / 健康检查时发现要登录才能看（跳到登录页、只剩「请登录」、接口回「TOKEN 已过期」），就把这条链接标上。
-- requires_login：null 还没判断 | true 需登录 | false 检查过不需要。依据写在 login_reason。整份可重复执行。

ALTER TABLE url_sources ADD COLUMN IF NOT EXISTS requires_login BOOLEAN;
ALTER TABLE url_sources ADD COLUMN IF NOT EXISTS login_reason TEXT;
ALTER TABLE url_sources ADD COLUMN IF NOT EXISTS login_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_url_sources_requires_login ON url_sources(requires_login) WHERE requires_login;

COMMENT ON COLUMN url_sources.requires_login IS '需登录才能看内容：null 未判断 / true 需登录 / false 不需要';
COMMENT ON COLUMN url_sources.login_reason IS '判断依据：跳到哪个登录地址 / 页面上的哪句提示 / 接口返回';

NOTIFY pgrst, 'reload schema';
