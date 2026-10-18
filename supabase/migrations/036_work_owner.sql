-- 真活台 · C 端自助出题（2026-10-18）：老板 / 带队的人不用登录就能出题，用专属管理链接看报告
ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS owner_key TEXT;   -- 管理链接 /work/<token>/owner?k=<owner_key>
ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS owner     JSONB;  -- { name, contact, ip }
CREATE INDEX IF NOT EXISTS work_tasks_owner_idx ON work_tasks (owner_key);
NOTIFY pgrst, 'reload schema';
