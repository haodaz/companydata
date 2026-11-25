-- 077 企业库名称分中英文（数据部门 11-25）：
--   公司简称 (Cn) brief_name_lang_cn / 公司简称 (En) brief_name_lang_en
--   曾用名 (Cn) historical_name_lang_cn / 曾用名 (En) historical_name_lang_en
--   名称 (Cn) name_lang_cn
-- 都是字符串；多个值用英文「;」隔开。原来的 brief_name / historical_name 保留不动，数据由脚本按中英文拆过来。
-- 只加空列（不重写整表），查找名称触发器把新列也算进去。整份可重复执行。

ALTER TABLE companies ADD COLUMN IF NOT EXISTS brief_name_lang_cn TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brief_name_lang_en TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS historical_name_lang_cn TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS historical_name_lang_en TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_lang_cn TEXT;

COMMENT ON COLUMN companies.brief_name_lang_cn IS '公司简称 (Cn)';
COMMENT ON COLUMN companies.brief_name_lang_en IS '公司简称 (En)';
COMMENT ON COLUMN companies.historical_name_lang_cn IS '曾用名 (Cn)';
COMMENT ON COLUMN companies.historical_name_lang_en IS '曾用名 (En)';
COMMENT ON COLUMN companies.name_lang_cn IS '名称 (Cn)';

CREATE OR REPLACE FUNCTION companies_name_to_search() RETURNS trigger AS $$
BEGIN
  IF NOT (COALESCE(to_jsonb(NEW.human_locked_fields), '[]'::jsonb) ? 'name_to_search') THEN
    NEW.name_to_search := (
      SELECT string_agg(x, ';' ORDER BY ord) FROM (
        SELECT DISTINCT ON (lower(regexp_replace(x, '\s', '', 'g'))) x, ord
        FROM unnest(
          ARRAY[NEW.name, NEW.name_lang_cn, NEW.brief_name, NEW.registered_name, NEW.name_en, NEW.historical_name]
          || string_to_array(COALESCE(NEW.brief_name_lang_cn, ''), ';') || string_to_array(COALESCE(NEW.brief_name_lang_en, ''), ';')
          || string_to_array(COALESCE(NEW.historical_name_lang_cn, ''), ';') || string_to_array(COALESCE(NEW.historical_name_lang_en, ''), ';')
          || COALESCE(NEW.aliases, '{}')
        ) WITH ORDINALITY AS t(x, ord)
        WHERE x IS NOT NULL AND btrim(x) <> '' AND x NOT LIKE '并入#%'
        ORDER BY lower(regexp_replace(x, '\s', '', 'g')), ord
      ) d
    );
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_name_to_search ON companies;
CREATE TRIGGER trg_companies_name_to_search BEFORE INSERT OR UPDATE OF name, brief_name, registered_name, name_en, historical_name, aliases,
  name_lang_cn, brief_name_lang_cn, brief_name_lang_en, historical_name_lang_cn, historical_name_lang_en ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_name_to_search();

NOTIFY pgrst, 'reload schema';
