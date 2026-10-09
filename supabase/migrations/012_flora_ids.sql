-- 012 Flora 外部 ID 命名规则（数据部门 2026-10-09）
-- flora_external_id（库里列名 external_id）= 「o9y」开头、共 15 位的小写字母 + 数字，且和 applysquare_id 的值一样。
-- 企业、岗位都适用：新建 / 修改时触发器自动生成并对齐，已有记录在下面一次性补上。整份可重复执行。

CREATE OR REPLACE FUNCTION gen_o9y_id() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'o9y' || string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
  FROM generate_series(1, 12);
$$;

-- external_id 合规就用它；否则用合规的 applysquare_id；都不合规就新生成。最后两列对齐。
CREATE OR REPLACE FUNCTION fill_o9y_ids() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.external_id IS NULL OR NEW.external_id !~ '^o9y[a-z0-9]{12}$' THEN
    NEW.external_id := CASE WHEN NEW.applysquare_id ~ '^o9y[a-z0-9]{12}$' THEN NEW.applysquare_id ELSE gen_o9y_id() END;
  END IF;
  NEW.applysquare_id := NEW.external_id;
  RETURN NEW;
END;
$$;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS applysquare_id TEXT;   -- 和 external_id 同值
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applysquare_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id TEXT;

DROP TRIGGER IF EXISTS companies_o9y_ids ON companies;
CREATE TRIGGER companies_o9y_ids BEFORE INSERT OR UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION fill_o9y_ids();
DROP TRIGGER IF EXISTS jobs_o9y_ids ON jobs;
CREATE TRIGGER jobs_o9y_ids BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fill_o9y_ids();

-- 已有记录补齐（触发器会把 applysquare_id 一起对齐）
UPDATE companies SET external_id = gen_o9y_id() WHERE external_id IS NULL OR external_id !~ '^o9y[a-z0-9]{12}$';
UPDATE jobs SET external_id = gen_o9y_id() WHERE external_id IS NULL OR external_id !~ '^o9y[a-z0-9]{12}$';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_applysquare_id ON companies(applysquare_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_external_id ON jobs(external_id);

COMMENT ON COLUMN companies.external_id IS 'flora_external_id：o9y + 12 位小写字母数字，与 applysquare_id 同值（触发器维护）';
COMMENT ON COLUMN jobs.external_id IS 'flora_external_id：o9y + 12 位小写字母数字，与 applysquare_id 同值（触发器维护）';

NOTIFY pgrst, 'reload schema';
