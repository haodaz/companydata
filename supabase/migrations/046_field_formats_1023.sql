-- 数据部门 10-23 字段格式（周赞灵 #32 #34 #37 #38）：
--   jobs.exp_years            数字 → 文本；0 一律置空（没有经验年限就是空值，不要写 0）
--   jobs.qianli_job_labels    文本 → 数组（岗位库里数组只有 fos_ids / grade / related_career_ids / qianli_job_labels / 特色标签一二级）
--   jobs.name_to_search       数组 → 文本，英文「;」隔开（#37）
--   jobs.source、companies.source  数组 → 文本，中文「；」隔开（#38，示例「潜历一批；潜历二批」）
--   companies.name_to_search  数组 → 文本「;」，触发器跟着改
-- 做法（10-22 直接 ALTER TYPE 撑爆过硬盘）：加新列 → 每张表一条 UPDATE 一次搬完 → 删旧列改名。不整表重写多遍。
-- 先跑 A 段，看一眼硬盘，再跑 B 段；B 段跑完马上推代码。

-- ── A. 加新列 + 搬数据 ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS exp_years_new TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qianli_job_labels_new TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name_to_search_new TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_new TEXT;
UPDATE jobs SET
  exp_years_new = CASE WHEN exp_years IS NULL OR exp_years = 0 THEN NULL ELSE exp_years::text END,
  qianli_job_labels_new = CASE WHEN btrim(COALESCE(qianli_job_labels, '')) = '' THEN NULL ELSE ARRAY[btrim(qianli_job_labels)] END,
  name_to_search_new = NULLIF(array_to_string(name_to_search, ';'), ''),
  source_new = NULLIF(array_to_string(source, '；'), '');

ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_to_search_new TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_new TEXT;
UPDATE companies SET
  name_to_search_new = NULLIF(array_to_string(name_to_search, ';'), ''),
  source_new = NULLIF(array_to_string(source, '；'), '');

-- ── B. 换列（瞬间） ──
-- DROP TRIGGER IF EXISTS trg_companies_name_to_search ON companies;
-- ALTER TABLE jobs DROP COLUMN exp_years;          ALTER TABLE jobs RENAME COLUMN exp_years_new TO exp_years;
-- ALTER TABLE jobs DROP COLUMN qianli_job_labels;  ALTER TABLE jobs RENAME COLUMN qianli_job_labels_new TO qianli_job_labels;
-- ALTER TABLE jobs DROP COLUMN name_to_search;     ALTER TABLE jobs RENAME COLUMN name_to_search_new TO name_to_search;
-- ALTER TABLE jobs DROP COLUMN source;             ALTER TABLE jobs RENAME COLUMN source_new TO source;
-- ALTER TABLE companies DROP COLUMN name_to_search; ALTER TABLE companies RENAME COLUMN name_to_search_new TO name_to_search;
-- ALTER TABLE companies DROP COLUMN source;         ALTER TABLE companies RENAME COLUMN source_new TO source;
-- CREATE OR REPLACE FUNCTION companies_name_to_search() RETURNS trigger AS $$
-- BEGIN
--   IF NOT (COALESCE(to_jsonb(NEW.human_locked_fields), '[]'::jsonb) ? 'name_to_search') THEN
--     NEW.name_to_search := (
--       SELECT string_agg(x, ';' ORDER BY ord) FROM (
--         SELECT DISTINCT ON (lower(regexp_replace(x, '\s', '', 'g'))) x, ord
--         FROM unnest(ARRAY[NEW.name, NEW.brief_name, NEW.registered_name, NEW.name_en, NEW.historical_name] || COALESCE(NEW.aliases, '{}')) WITH ORDINALITY AS t(x, ord)
--         WHERE x IS NOT NULL AND btrim(x) <> '' AND x NOT LIKE '并入#%'
--         ORDER BY lower(regexp_replace(x, '\s', '', 'g')), ord
--       ) d
--     );
--   END IF;
--   RETURN NEW;
-- END $$ LANGUAGE plpgsql;
-- CREATE TRIGGER trg_companies_name_to_search BEFORE INSERT OR UPDATE OF name, brief_name, registered_name, name_en, historical_name, aliases ON companies
--   FOR EACH ROW EXECUTE FUNCTION companies_name_to_search();
-- NOTIFY pgrst, 'reload schema';
