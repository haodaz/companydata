-- 018 数据部门 2026-10-10 反馈
-- ① 企业 flora_external_id（列名 external_id）改规则：和 slug 一致 = 「国家两位小写代码 . 官网主域名」（中通 → cn.zto.com），
--    没官网 → 「国家代码 . 中文名拼音首字母」。applysquare_id、slug 同值。岗位不变（仍是迁移 012 的 o9y + 12 位）。
--    有官网的由下面的触发器算；拼音那一档数据库算不了，由程序补（src/lib/company-flora-id.ts，新建企业时 + scripts/fix-1010.mts 回溯）。
--    flora_id_locked = true 的企业（比如以后从平台导入的既有编号）触发器不再改。
-- ② 岗位加「投递规则 application_rule」「管培项目 if_develop_management（岗位名含『管培』为是，默认否）」。
-- ③ 岗位的 company_slug 跟着企业 slug 走。
-- 整份可重复执行。

-- ── 企业编号 ──
ALTER TABLE companies ADD COLUMN IF NOT EXISTS flora_id_locked BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION country_iso2(country text, name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(trim(country), '') = '' THEN CASE WHEN name ~ '[一-龥]' THEN 'cn' END
    WHEN lower(trim(country)) ~ '^[a-z]{2}$' THEN lower(trim(country))
    WHEN trim(country) IN ('中国', '中国大陆', '中华人民共和国') OR lower(trim(country)) = 'china' THEN 'cn'
    WHEN trim(country) IN ('中国香港', '香港') THEN 'hk'
    WHEN trim(country) IN ('中国澳门', '澳门') THEN 'mo'
    WHEN trim(country) IN ('中国台湾', '台湾') THEN 'tw'
    WHEN trim(country) = '美国' OR lower(trim(country)) IN ('usa', 'united states') THEN 'us'
    WHEN trim(country) = '英国' OR lower(trim(country)) IN ('uk', 'united kingdom') THEN 'gb'
    WHEN trim(country) = '法国' THEN 'fr' WHEN trim(country) = '德国' THEN 'de' WHEN trim(country) = '日本' THEN 'jp'
    WHEN trim(country) = '韩国' THEN 'kr' WHEN trim(country) = '瑞士' THEN 'ch' WHEN trim(country) = '瑞典' THEN 'se'
    WHEN trim(country) = '荷兰' THEN 'nl' WHEN trim(country) = '比利时' THEN 'be' WHEN trim(country) = '意大利' THEN 'it'
    WHEN trim(country) = '西班牙' THEN 'es' WHEN trim(country) = '丹麦' THEN 'dk' WHEN trim(country) = '挪威' THEN 'no'
    WHEN trim(country) = '芬兰' THEN 'fi' WHEN trim(country) = '爱尔兰' THEN 'ie' WHEN trim(country) = '奥地利' THEN 'at'
    WHEN trim(country) = '卢森堡' THEN 'lu' WHEN trim(country) = '以色列' THEN 'il' WHEN trim(country) = '俄罗斯' THEN 'ru'
    WHEN trim(country) = '加拿大' THEN 'ca' WHEN trim(country) = '澳大利亚' THEN 'au' WHEN trim(country) = '新西兰' THEN 'nz'
    WHEN trim(country) = '新加坡' THEN 'sg' WHEN trim(country) = '马来西亚' THEN 'my' WHEN trim(country) = '印度' THEN 'in'
    WHEN trim(country) = '印度尼西亚' THEN 'id' WHEN trim(country) = '泰国' THEN 'th' WHEN trim(country) = '越南' THEN 'vn'
    WHEN trim(country) = '菲律宾' THEN 'ph' WHEN trim(country) = '沙特阿拉伯' THEN 'sa'
    WHEN trim(country) IN ('阿联酋', '阿拉伯联合酋长国') THEN 'ae' WHEN trim(country) = '卡塔尔' THEN 'qa'
    WHEN trim(country) = '巴西' THEN 'br' WHEN trim(country) = '墨西哥' THEN 'mx' WHEN trim(country) = '南非' THEN 'za'
    WHEN trim(country) = '土耳其' THEN 'tr'
  END;
$$;

-- 官网主域名：www.zto.com / careers.zto.com / https://www.dji.com/cn → zto.com / dji.com；xx.com.cn 这类两段后缀保留三段
CREATE OR REPLACE FUNCTION main_domain(url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE h text; p text[]; n int;
BEGIN
  h := lower(trim(coalesce(url, '')));
  h := regexp_replace(h, '^[a-z]+://', '');
  h := regexp_replace(h, '[/?#:].*$', '');
  h := regexp_replace(h, '\.$', '');
  IF h !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN RETURN NULL; END IF;
  p := string_to_array(h, '.'); n := array_length(p, 1);
  IF n >= 3 AND (p[n-1] || '.' || p[n]) = ANY (ARRAY['com.cn','net.cn','org.cn','gov.cn','edu.cn','ac.cn','com.hk','org.hk','com.tw','com.sg','com.my','com.au','co.uk','org.uk','ac.uk','co.jp','co.kr','co.in','com.br','co.nz','com.mx']) THEN
    RETURN p[n-2] || '.' || p[n-1] || '.' || p[n];
  END IF;
  RETURN p[n-1] || '.' || p[n];
END;
$$;

-- 官网主机名去掉 www（子公司和母公司共用主域名时用它区分：ag.dji.com）
CREATE OR REPLACE FUNCTION site_host(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(url, ''))), '^[a-z]+://', ''), '[/?#:].*$', ''), '^www\.', ''), '');
$$;

-- 新建 / 修改企业：有官网、且编号还是空的 / 老的 o9y 随机串 / 拼音那一档 → 换成域名那一档。
-- 主域名被别家占了（子公司共用母公司域名）先用完整主机名 cn.ag.dji.com，还重名再加 -2、-3。
-- 编号定下来以后官网再变也不改（编号要稳定）；最后 applysquare_id、slug 和它对齐。
CREATE OR REPLACE FUNCTION fill_company_flora_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cc text; dom text; cand text; fin text; k int := 1;
BEGIN
  IF NOT NEW.flora_id_locked AND (NEW.external_id IS NULL OR NEW.external_id ~ '^o9y[a-z0-9]{12}$' OR NEW.external_id ~ '^[a-z]{2}\.[a-z0-9]+(-[0-9]+)?$') THEN
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

DROP TRIGGER IF EXISTS companies_o9y_ids ON companies;
DROP TRIGGER IF EXISTS companies_flora_id ON companies;
CREATE TRIGGER companies_flora_id BEFORE INSERT OR UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION fill_company_flora_id();

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(source);

COMMENT ON COLUMN companies.external_id IS 'flora_external_id：国家两位代码.官网主域名（如 cn.zto.com），无官网用 国家代码.中文名拼音首字母；与 applysquare_id、slug 同值（触发器 + 程序维护）';
COMMENT ON COLUMN companies.flora_id_locked IS '编号锁定：为 true 时触发器 / 回溯脚本都不改 external_id（平台已分配的编号）';

-- ── 岗位 ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_rule TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS if_develop_management BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN jobs.application_rule IS '投递规则：投递次数限制 + 投递渠道（如「仅限投递一个岗位，只需投递到 xx@xx.com」）';
COMMENT ON COLUMN jobs.if_develop_management IS '管培项目：岗位名含「管培」为是，默认否';

-- 管培、company_slug 由触发器兜底（程序里也会算）
CREATE OR REPLACE FUNCTION fill_job_derived() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.if_develop_management := coalesce(NEW.name, '') ~ '管培';
  IF NEW.company_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.company_slug IS NULL) THEN
    NEW.company_slug := (SELECT slug FROM companies WHERE id = NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jobs_derived ON jobs;
CREATE TRIGGER jobs_derived BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION fill_job_derived();

-- 企业 slug 变了，名下岗位的 company_slug 跟着变（slug 是 BEFORE 触发器改的，不能用 UPDATE OF slug——那只看 SET 里写没写）
CREATE OR REPLACE FUNCTION sync_job_company_slug() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    UPDATE jobs SET company_slug = NEW.slug WHERE company_id = NEW.id AND company_slug IS DISTINCT FROM NEW.slug;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS companies_slug_to_jobs ON companies;
CREATE TRIGGER companies_slug_to_jobs AFTER UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION sync_job_company_slug();

-- 已有岗位：管培回填
UPDATE jobs SET if_develop_management = true WHERE name ~ '管培' AND NOT if_develop_management;

NOTIFY pgrst, 'reload schema';
