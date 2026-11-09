-- 数据部门 11-09（周赞灵）：企业库 国家 / 省 / 城市 / 县区 存选项集 value，页面显示中文名。
-- 新建企业的编号（国家码.主域名）由触发器用 country_iso2 算，这里让它同时认 value（156）和老写法（中国），先跑这条再换数据。
-- 只改函数，不动表；已有编号不受影响（迁移 052 已冻结）。
CREATE OR REPLACE FUNCTION country_iso2(country text, name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(trim(country), '') = '' THEN CASE WHEN name ~ '[一-龥]' THEN 'cn' END
    WHEN lower(trim(country)) ~ '^[a-z]{2}$' THEN lower(trim(country))
    WHEN trim(country) IN ('156', '中国', '中国大陆', '中华人民共和国') OR lower(trim(country)) = 'china' THEN 'cn'
    WHEN trim(country) IN ('344', '中国香港', '香港') THEN 'hk'
    WHEN trim(country) IN ('446', '中国澳门', '澳门') THEN 'mo'
    WHEN trim(country) IN ('158', '中国台湾', '台湾') THEN 'tw'
    WHEN trim(country) IN ('840', '美国') OR lower(trim(country)) IN ('usa', 'united states') THEN 'us'
    WHEN trim(country) IN ('826', '英国') OR lower(trim(country)) IN ('uk', 'united kingdom') THEN 'gb'
    WHEN trim(country) IN ('250', '法国') THEN 'fr' WHEN trim(country) IN ('276', '德国') THEN 'de' WHEN trim(country) IN ('392', '日本') THEN 'jp'
    WHEN trim(country) IN ('410', '韩国') THEN 'kr' WHEN trim(country) IN ('756', '瑞士') THEN 'ch' WHEN trim(country) IN ('752', '瑞典') THEN 'se'
    WHEN trim(country) IN ('528', '荷兰') THEN 'nl' WHEN trim(country) IN ('56', '比利时') THEN 'be' WHEN trim(country) IN ('380', '意大利') THEN 'it'
    WHEN trim(country) IN ('724', '西班牙') THEN 'es' WHEN trim(country) IN ('208', '丹麦') THEN 'dk' WHEN trim(country) IN ('578', '挪威') THEN 'no'
    WHEN trim(country) IN ('246', '芬兰') THEN 'fi' WHEN trim(country) IN ('372', '爱尔兰') THEN 'ie' WHEN trim(country) IN ('40', '奥地利') THEN 'at'
    WHEN trim(country) IN ('442', '卢森堡') THEN 'lu' WHEN trim(country) IN ('376', '以色列') THEN 'il' WHEN trim(country) IN ('643', '俄罗斯') THEN 'ru'
    WHEN trim(country) IN ('124', '加拿大') THEN 'ca' WHEN trim(country) IN ('36', '澳大利亚') THEN 'au' WHEN trim(country) IN ('554', '新西兰') THEN 'nz'
    WHEN trim(country) IN ('702', '新加坡') THEN 'sg' WHEN trim(country) IN ('458', '马来西亚') THEN 'my' WHEN trim(country) IN ('356', '印度') THEN 'in'
    WHEN trim(country) IN ('360', '印度尼西亚') THEN 'id' WHEN trim(country) IN ('764', '泰国') THEN 'th' WHEN trim(country) IN ('704', '越南') THEN 'vn'
    WHEN trim(country) IN ('608', '菲律宾') THEN 'ph' WHEN trim(country) IN ('682', '沙特阿拉伯') THEN 'sa'
    WHEN trim(country) IN ('784', '阿联酋', '阿拉伯联合酋长国') THEN 'ae' WHEN trim(country) IN ('634', '卡塔尔') THEN 'qa'
    WHEN trim(country) IN ('76', '巴西') THEN 'br' WHEN trim(country) IN ('484', '墨西哥') THEN 'mx' WHEN trim(country) IN ('710', '南非') THEN 'za'
    WHEN trim(country) IN ('792', '土耳其') THEN 'tr'
    WHEN trim(country) IN ('616', '波兰') THEN 'pl' WHEN trim(country) IN ('428', '拉脱维亚') THEN 'lv' WHEN trim(country) IN ('348', '匈牙利') THEN 'hu'
    WHEN trim(country) IN ('620', '葡萄牙') THEN 'pt' WHEN trim(country) IN ('203', '捷克') THEN 'cz' WHEN trim(country) IN ('100', '保加利亚') THEN 'bg'
    WHEN trim(country) IN ('440', '立陶宛') THEN 'lt' WHEN trim(country) IN ('438', '列支敦士登') THEN 'li' WHEN trim(country) IN ('300', '希腊') THEN 'gr'
    WHEN trim(country) IN ('359', '黑山') THEN 'me'
  END;
$$;

-- 数据部门 11-09（姜贺）：科研仪器厂商按名单刷新 external_id / slug。052 把已定的编号冻结了，脚本改不动；
-- 这里留一个明确的口子：同一次更新同时写了新编号且 flora_id_locked = true（只有按数据部门名单赋值的脚本这么写）才认，其余照旧冻结。
CREATE OR REPLACE FUNCTION fill_company_flora_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cc text; dom text; cand text; fin text; k int := 1;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.external_id IS NOT NULL AND OLD.external_id !~ '^o9y[a-z0-9]{12}$'
     AND NOT (NEW.flora_id_locked AND NEW.external_id IS NOT NULL AND NEW.external_id IS DISTINCT FROM OLD.external_id) THEN
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
