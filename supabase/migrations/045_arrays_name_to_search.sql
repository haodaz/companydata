-- 数据部门 10-22：
--   #22 岗位上原来「|」隔开的多值字段改成数组（text[]）：fos_ids / related_career_ids / qianli_job_specialty_labels / qianli_specialty_labels_reason / name_to_search
--   #24 企业加「查找名称」name_to_search（text[]）：全称 / 简称 / 工商名 / 英文名 / 曾用名 / 别名去重，触发器自动维护
-- 10-22 第一次直接 ALTER COLUMN TYPE：jobs 整表重写 5 次，把 2GB 硬盘写满（PANIC），数据库重启、整体回滚。
-- 改成三步，都不重写表：
--   第一步（本文件 A 段）：加 *_arr 新列 + 企业触发器
--   第二步：scripts/backfill-arrays-1022.mts 每批 500 行搬数据（企业的查找名称一起填）
--   第三步（本文件 B 段）：补搬中途新写的、删旧列、新列改名、建索引；之后马上推代码（代码写数组）

-- ── A. 第一步 ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fos_ids_arr TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS related_career_ids_arr TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qianli_job_specialty_labels_arr TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qianli_specialty_labels_reason_arr TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name_to_search_arr TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_to_search TEXT[];

CREATE OR REPLACE FUNCTION companies_name_to_search() RETURNS trigger AS $$
BEGIN
  -- 人工锁定字段在企业表是 JSON：转成 jsonb 再看（文本数组也能这样判）
  IF NOT (COALESCE(to_jsonb(NEW.human_locked_fields), '[]'::jsonb) ? 'name_to_search') THEN
    NEW.name_to_search := (
      SELECT array_agg(x ORDER BY ord) FROM (
        SELECT DISTINCT ON (lower(regexp_replace(x, '\s', '', 'g'))) x, ord
        FROM unnest(ARRAY[NEW.name, NEW.brief_name, NEW.registered_name, NEW.name_en, NEW.historical_name] || COALESCE(NEW.aliases, '{}')) WITH ORDINALITY AS t(x, ord)
        WHERE x IS NOT NULL AND btrim(x) <> '' AND x NOT LIKE '并入#%'
        ORDER BY lower(regexp_replace(x, '\s', '', 'g')), ord
      ) d
    );
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_companies_name_to_search ON companies;
CREATE TRIGGER trg_companies_name_to_search BEFORE INSERT OR UPDATE OF name, brief_name, registered_name, name_en, historical_name, aliases ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_name_to_search();

-- ── B. 第三步（第二步搬完再跑） ──
-- UPDATE jobs SET fos_ids_arr = array_remove(string_to_array(fos_ids, '|'), '') WHERE fos_ids_arr IS NULL AND btrim(COALESCE(fos_ids, '')) <> '';
-- UPDATE jobs SET related_career_ids_arr = array_remove(string_to_array(related_career_ids, '|'), '') WHERE related_career_ids_arr IS NULL AND btrim(COALESCE(related_career_ids, '')) <> '';
-- UPDATE jobs SET qianli_job_specialty_labels_arr = array_remove(string_to_array(qianli_job_specialty_labels, '|'), '') WHERE qianli_job_specialty_labels_arr IS NULL AND btrim(COALESCE(qianli_job_specialty_labels, '')) <> '';
-- UPDATE jobs SET qianli_specialty_labels_reason_arr = array_remove(string_to_array(qianli_specialty_labels_reason, '|'), '') WHERE qianli_specialty_labels_reason_arr IS NULL AND btrim(COALESCE(qianli_specialty_labels_reason, '')) <> '';
-- UPDATE jobs SET name_to_search_arr = array_remove(string_to_array(name_to_search, '|'), '') WHERE name_to_search_arr IS NULL AND btrim(COALESCE(name_to_search, '')) <> '';
-- ALTER TABLE jobs DROP COLUMN fos_ids;                        ALTER TABLE jobs RENAME COLUMN fos_ids_arr TO fos_ids;
-- ALTER TABLE jobs DROP COLUMN related_career_ids;             ALTER TABLE jobs RENAME COLUMN related_career_ids_arr TO related_career_ids;
-- ALTER TABLE jobs DROP COLUMN qianli_job_specialty_labels;    ALTER TABLE jobs RENAME COLUMN qianli_job_specialty_labels_arr TO qianli_job_specialty_labels;
-- ALTER TABLE jobs DROP COLUMN qianli_specialty_labels_reason; ALTER TABLE jobs RENAME COLUMN qianli_specialty_labels_reason_arr TO qianli_specialty_labels_reason;
-- ALTER TABLE jobs DROP COLUMN name_to_search;                 ALTER TABLE jobs RENAME COLUMN name_to_search_arr TO name_to_search;
-- CREATE INDEX IF NOT EXISTS idx_jobs_related_career_ids ON jobs USING GIN (related_career_ids);
-- CREATE INDEX IF NOT EXISTS idx_jobs_fos_ids ON jobs USING GIN (fos_ids);
-- NOTIFY pgrst, 'reload schema';
