-- simulator 版 024：只取 companydata 024 里的职业实体库两张表（occupations / occupation_salaries）。
-- 企业工商名称、岗位来源两列是数据工厂的，不带。可重复执行。


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
