-- ============================================
-- 024: 数据部门 10-13 反馈 + 职业实体库（2026-10-13）
--   ① companies.registered_name 工商企业名称（企业库列表在「企业」旁加一列）
--   ② jobs.source 已在 003 建过（内容来源），这次开始按招聘渠道写值，加索引供「来源」筛选；发布日期筛选用 official_publish_date
--   ③ 职业实体库 occupations + 子实体职业薪资 occupation_salaries：字段 key 按数据部门《职业库_字段.xlsx》（CRMOccupation_template），
--      是 /lab 百业的数据底色——空间里的职人、工位、证书都应能指回一条职业。
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表都开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS registered_name TEXT;     -- 工商企业名称（工商登记的完整法定名称）
CREATE INDEX IF NOT EXISTS idx_companies_registered_name ON companies(registered_name);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT;                   -- 内容来源（003 已有，这里只为可重复执行）
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_official_publish_date ON jobs(official_publish_date);

-- 字段定义与 src/lib/occupation-fields.ts 保持一致
CREATE TABLE IF NOT EXISTS occupations (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,                  -- 外部指定标识（导出表头 flora_external_id），默认 = key
  key TEXT,                                 -- Key（英文 snake_case）
  name TEXT NOT NULL,                       -- 职业名称
  name_lang_cn TEXT,                        -- 职业名称 (Cn)
  name_lang_en TEXT,                        -- 职业名称 (En)
  career_category TEXT,                     -- 职业大类（枚举值，如 computer_and_mathematical）
  career_mid_category TEXT,                 -- 职业小类（枚举值，如 computer_occupations）
  hot_career INTEGER,                       -- 热门职业（列表排序）
  intro TEXT,                               -- 简介
  responsibility TEXT,                      -- 工作内容
  position_requirement TEXT,                -- 职业要求
  recent_year_monthly_salary INTEGER,       -- 全国平均月薪（元）
  relevant_celebrities TEXT,                -- 达人
  relevant_certificates TEXT,               -- 证书
  relevant_fos_ids TEXT[] DEFAULT '{}',     -- 相关专业（fos 的 key；导入时「a|b|c」拆开）
  if_delete BOOLEAN NOT NULL DEFAULT FALSE, -- 是否删除（软删）

  -- 我们的扩展
  aliases TEXT[] DEFAULT '{}',              -- 别名 / 招聘里常见的叫法（对岗位库、百业空间用）
  source TEXT,                              -- 数据来源：import（数据部门表）/ ai（AI 生成）/ manual
  ai_sources JSONB DEFAULT '{}',            -- { 字段: 来源链接 }
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_review_note TEXT,
  human_locked_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_occupations_name ON occupations(name) WHERE NOT if_delete;
CREATE INDEX IF NOT EXISTS idx_occupations_category ON occupations(career_category);
CREATE INDEX IF NOT EXISTS idx_occupations_mid_category ON occupations(career_mid_category);
CREATE INDEX IF NOT EXISTS idx_occupations_aliases ON occupations USING GIN(aliases);
ALTER TABLE occupations ENABLE ROW LEVEL SECURITY;

-- 子实体：职业薪资（职业百科 occupation_id.external_id / 薪资 salary 月薪元 / 时间 year 工作年限档）
CREATE TABLE IF NOT EXISTS occupation_salaries (
  id SERIAL PRIMARY KEY,
  occupation_id INTEGER NOT NULL REFERENCES occupations(id) ON DELETE CASCADE,
  year TEXT NOT NULL,                       -- year_0_2 1年以内 / year_2_4 1-3年 / year_4_6 3-5年 / year_6_8 5-10年 / year_8_10 10年以上
  salary INTEGER,                           -- 月薪（元）
  source_url TEXT,                          -- AI 检索到的出处
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_status VARCHAR(20) DEFAULT 'review',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (occupation_id, year)
);
ALTER TABLE occupation_salaries ENABLE ROW LEVEL SECURITY;
