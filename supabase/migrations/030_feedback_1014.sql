-- 数据部门 10-14 反馈（查企业、岗位反馈-1014.docx + 行业和产业的选项集.xlsx + 公司来源及slug.xlsx）
-- 可重复执行。没有新表，只加列。

-- ── 企业：所属行业大类 / 所属产业二级目录（对方字段 company_industry_ids / company_industry_list_ids，存选项集的 external_id，多选） ──
-- 两列 003 已经建过（TEXT[]，默认空数组），这里只补按选项筛选用的索引。选项见 src/lib/industry-options.ts
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_industry_ids TEXT[] DEFAULT '{}';       -- major_class_01 … （所属行业大类，97 个）
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_industry_list_ids TEXT[] DEFAULT '{}';  -- ZL_second_1_1 … （所属产业二级目录，38 个）
CREATE INDEX IF NOT EXISTS idx_companies_industry_ids ON companies USING GIN(company_industry_ids);
CREATE INDEX IF NOT EXISTS idx_companies_industry_list_ids ON companies USING GIN(company_industry_list_ids);

-- ── 岗位：「来源」改成企业的名单批次（潜历一批 / 潜历二批 / ted / 其他）；原来按链接推的招聘渠道（北森 / Moka / 官网…）挪到 recruit_channel ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recruit_channel TEXT;
UPDATE jobs SET recruit_channel = source WHERE recruit_channel IS NULL AND source IN ('official', 'beisen', 'hotjob', 'moka', 'feishu', 'dayee', 'workday', 'greenhouse', 'lever', 'other_ats', 'third_party');
CREATE INDEX IF NOT EXISTS idx_jobs_recruit_channel ON jobs(recruit_channel);

-- ── 岗位：中英文字段（对方新增，关联数据，字符串） ──
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS schedule_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS schedule_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS overview_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS overview_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS process_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS process_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS costs_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS costs_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organizer_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organizer_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS responsibilities_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS responsibilities_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS welfare_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS welfare_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_lang_en TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS language_lang_cn TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS language_lang_en TEXT;
