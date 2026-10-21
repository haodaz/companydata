-- 数据部门 10-21 反馈（可重复执行）：
--   #19 企业核心产品的技术关键词：数组 → 中文分号「；」隔开的文本
--   #20 企业子实体（核心产品 / 融资 / 近期动态 / 管理团队）external_id：24 位小写字母 + 数字随机码，存量回填，各表内唯一
--   职能标签打不了的原因（陈彩瑛 1.1）：jobs.qianli_job_labels_reason（没 JD 也看不出职能 / 匹配度低 / 26 个都对不上 / 仅凭岗位名称判断）

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'company_products' AND column_name = 'tech_keywords') = 'ARRAY' THEN
    ALTER TABLE company_products ALTER COLUMN tech_keywords DROP DEFAULT;
    ALTER TABLE company_products ALTER COLUMN tech_keywords TYPE TEXT USING NULLIF(array_to_string(tech_keywords, '；'), '');
  END IF;
END $$;

-- 24 位随机码：两段 md5 拼起来取前 24 位（0-9a-f，属于小写字母 + 数字）
UPDATE company_products   SET external_id = substr(md5(random()::text || id::text) || md5(random()::text), 1, 24) WHERE external_id IS NULL OR external_id = '';
UPDATE company_financings SET external_id = substr(md5(random()::text || id::text) || md5(random()::text), 1, 24) WHERE external_id IS NULL OR external_id = '';
UPDATE company_news       SET external_id = substr(md5(random()::text || id::text) || md5(random()::text), 1, 24) WHERE external_id IS NULL OR external_id = '';
UPDATE company_executives SET external_id = substr(md5(random()::text || id::text) || md5(random()::text), 1, 24) WHERE external_id IS NULL OR external_id = '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_products_external_id   ON company_products (external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_financings_external_id ON company_financings (external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_news_external_id       ON company_news (external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_executives_external_id ON company_executives (external_id);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qianli_job_labels_reason TEXT;

-- 岗位链接检测（10-21 岗位反馈：投递入口打开后不存在、链接指向第三方新闻稿）：
--   link_status：ok 能打开 / dead 打不开或已下线 / blocked 对方挡机器（真人可能能打开）/ third_party 指向第三方资讯站而不是招聘页
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_status TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_issue TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS link_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_jobs_link_status ON jobs (link_status);
