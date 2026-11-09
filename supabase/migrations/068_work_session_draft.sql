-- 真活作答的草稿存到服务器（按交付物分开的内容），刷新、换设备回来都能接着写
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS draft JSONB;
