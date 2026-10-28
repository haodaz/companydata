-- 数据部门 10-28：
-- #55 企业 flora_external_id / slug 一旦定下来就不再改（数据部门按它做唯一标识抽数，改了会抽两遍）。
--     以前触发器在每次更新时都会重算：拼音档的企业补上官网会被「升级」成域名档，改了官网 / 国家也会跟着变。
--     现在只有新建、或编号还空着 / 还是 012 的 o9y 旧随机串时才算；已有编号的更新一律保留原值。
-- #56 典型任务 typical_tasks、行业标准 industry_standards 加 flora_external_id（列名 external_id，同其他子实体）：
--     24 位小写字母 + 数字随机码、不重复；新行由默认值生成，存量一次补齐（两张表都小）。

CREATE OR REPLACE FUNCTION fill_company_flora_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cc text; dom text; cand text; fin text; k int := 1;
BEGIN
  -- 已定下来的编号不动（#55）
  IF TG_OP = 'UPDATE' AND OLD.external_id IS NOT NULL AND OLD.external_id !~ '^o9y[a-z0-9]{12}$' THEN
    NEW.external_id := OLD.external_id;
  ELSIF NOT NEW.flora_id_locked AND (NEW.external_id IS NULL OR NEW.external_id ~ '^o9y[a-z0-9]{12}$') THEN
    cc := country_iso2(NEW.country, NEW.name);
    dom := main_domain(NEW.official_website);
    IF cc IS NOT NULL AND dom IS NOT NULL THEN
      cand := cc || '.' || dom; fin := cand;
      IF EXISTS (SELECT 1 FROM companies WHERE external_id = fin AND id <> NEW.id) AND site_host(NEW.official_website) IS DISTINCT FROM dom
         AND site_host(NEW.official_website) ~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
        cand := cc || '.' || site_host(NEW.official_website); fin := cand;
      END IF;
      WHILE EXISTS (SELECT 1 FROM companies WHERE external_id = fin AND id <> NEW.id) LOOP k := k + 1; fin := cand || '-' || k; END LOOP;
      NEW.external_id := fin;
    END IF;
  END IF;
  NEW.applysquare_id := NEW.external_id;
  NEW.slug := NEW.external_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gen_rand_id(n int) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
  FROM generate_series(1, n);
$$;

ALTER TABLE typical_tasks ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT gen_rand_id(24);
UPDATE typical_tasks SET external_id = gen_rand_id(24) WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_typical_tasks_external_id ON typical_tasks(external_id);
COMMENT ON COLUMN typical_tasks.external_id IS 'flora_external_id：24 位小写字母 + 数字随机码（数据部门 10-28 #56）';

ALTER TABLE industry_standards ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT gen_rand_id(24);
UPDATE industry_standards SET external_id = gen_rand_id(24) WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_industry_standards_external_id ON industry_standards(external_id);
COMMENT ON COLUMN industry_standards.external_id IS 'flora_external_id：24 位小写字母 + 数字随机码（数据部门 10-28 #56）';

NOTIFY pgrst, 'reload schema';
