-- ============================================
-- 001: 智能企业数据工厂 初始化
-- ============================================
-- 个体 = 企业（companies），采集对象 = 企业信息 + 校招项目 / 实习岗位（jobs）；社招暂不作为重点。
-- 目标企业：中国企业、中外合资企业、海外百强（companies.segment）。
-- 在 Supabase SQL Editor 中整段粘贴执行即可，可重复执行。
--
-- 所有表只通过服务端 SUPABASE_SERVICE_ROLE_KEY 读写（service role 绕过 RLS）；
-- 统一开启 RLS 且不建任何 policy，anon / authenticated key 无法访问任何数据。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────
-- 1. 系统账号（自建 JWT 登录；第一个注册的账号自动成为管理员）
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',      -- admin | user
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- 2. 企业实体库
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,              -- 对接外部主数据（如 Flora）时的 ID，可空
  name TEXT NOT NULL,                   -- 常用名（中文优先，没有中文名就用英文名）
  name_en TEXT,                         -- 英文名
  aliases TEXT[] DEFAULT '{}',          -- 别名 / 简称 / 曾用名，用于名称匹配
  logo_url TEXT,

  industry TEXT,                        -- 行业（中文，如 互联网 / 半导体 / 投资银行）
  sub_industry TEXT,                    -- 细分行业
  segment TEXT,                         -- 目标企业分类：china 中国企业 | joint_venture 中外合资 | overseas_top 海外百强 | other 其他
  company_type TEXT,                    -- public 上市 | private 民营 | state_owned 国企 | joint_venture 中外合资 | foreign 外企 | startup 初创 | nonprofit 非营利 | government 政府/事业单位
  jv_partners TEXT,                     -- 合资企业的中外股东（如 上汽集团 × Volkswagen）
  stock_code TEXT,                      -- 股票代码（如 NASDAQ: AAPL / 0700.HK）
  founded_year INTEGER,
  employee_count TEXT,                  -- 员工规模（区间文本，如 10,000+）
  revenue TEXT,                         -- 营收（带币种与年份的文本）

  hq_country TEXT,
  hq_city TEXT,
  address TEXT,

  website TEXT,                         -- 官网
  campus_url TEXT,                      -- 校招 / 实习门户（重点）
  careers_url TEXT,                     -- 招聘总入口 / 社招门户
  campus_overview TEXT,                 -- 校招概况（中文）：招聘季节奏、主要项目、面向人群、是否招海外留学生
  linkedin_url TEXT,

  description TEXT,                     -- 企业简介（中文）
  tags TEXT[] DEFAULT '{}',             -- 自定义标签（如 世界500强 / 四大 / 大厂）
  fortune_global_rank INTEGER,          -- 《财富》世界 500 强排名
  ranking_year INTEGER,

  profile_source JSONB,                 -- AI 补全的来源链接 {field: url}
  profile_updated_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_unique ON companies(lower(name));
CREATE INDEX IF NOT EXISTS idx_companies_name_en ON companies(lower(name_en));
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);
CREATE INDEX IF NOT EXISTS idx_companies_segment ON companies(segment);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(hq_country);

-- ────────────────────────────────────────────
-- 3. 信息源库（URL）
-- ────────────────────────────────────────────
-- type：homepage 企业官网 | careers 招聘门户 | campus 校招/实习 | job 岗位详情页 | about 企业信息
-- subtype 细分类见 src/lib/url-types.ts
CREATE TABLE IF NOT EXISTS url_sources (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company TEXT NOT NULL,                -- 企业名称（冗余存一份，便于检索与未关联时展示）
  unit TEXT,                            -- 业务线 / 子公司 / 地区
  title TEXT,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'unknown',
  subtype TEXT,
  reasoning TEXT,
  verification_status TEXT DEFAULT 'unchecked',  -- unchecked | passed | failed
  health_status TEXT DEFAULT 'unknown',          -- unknown | alive | redirect | dead
  url_health JSONB,                              -- 最近一次健康检查结果
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_url_sources_unique ON url_sources(company, url);
CREATE INDEX IF NOT EXISTS idx_url_sources_company_id ON url_sources(company_id);
CREATE INDEX IF NOT EXISTS idx_url_sources_type ON url_sources(type);
CREATE INDEX IF NOT EXISTS idx_url_sources_health ON url_sources(health_status);
CREATE INDEX IF NOT EXISTS idx_url_sources_created ON url_sources(created_at DESC);

-- URL 获取工具的运行日志（AI 报告 + 原始结果）
CREATE TABLE IF NOT EXISTS url_journal (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  unit TEXT,
  search_type TEXT,                     -- campus | homepage
  status TEXT DEFAULT 'success',
  ai_overview TEXT,
  raw_data JSONB,
  model_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_url_journal_created ON url_journal(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_journal_company ON url_journal(company);

-- ────────────────────────────────────────────
-- 4. 岗位提取任务 + 爬取日志
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',          -- draft | running | completed | failed
  scope TEXT DEFAULT 'campus',          -- campus 只提取校招 / 实习 / 专项计划（默认）| all 同时提取社招岗位
  model_id TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_crawl_logs (
  id SERIAL PRIMARY KEY,
  task_id UUID REFERENCES job_tasks(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company TEXT DEFAULT '',
  target_url TEXT NOT NULL,
  hint TEXT DEFAULT '',                 -- 提取提示：目标岗位 / 部门 / 地区（辅助提取，可空）

  raw_markdown TEXT,
  markdown_len INTEGER DEFAULT 0,
  sub_pages_fetched TEXT[],
  fetcher_status TEXT DEFAULT 'pending',     -- pending | running | success | failed

  structured_json JSONB,                     -- { ai_summary, jobs: [...], pipeline_log: [...] }
  structurer_status TEXT DEFAULT 'pending',  -- pending | success | failed

  pushed_to_db BOOLEAN DEFAULT FALSE,        -- 是否已写入岗位实体库
  jobs_saved INTEGER DEFAULT 0,

  model_id TEXT,
  batch_id BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_crawl_logs_task ON job_crawl_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_job_crawl_logs_company ON job_crawl_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_job_crawl_logs_created ON job_crawl_logs(created_at DESC);

-- ────────────────────────────────────────────
-- 5. 岗位实体库
-- ────────────────────────────────────────────
-- 字段定义与 src/lib/job-fields.ts 保持一致（提示词 / 详情页 / 导出都从那里生成）
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  -- 去重键：有岗位独立链接用链接，否则「企业 + 岗位编号或名称 + 地点」（规则见 src/lib/job-store.ts）
  dedupe_key TEXT UNIQUE NOT NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  company TEXT DEFAULT '',

  title TEXT NOT NULL,                  -- 岗位名称（原文）
  title_cn TEXT,                        -- 岗位名称（中文）
  job_req_id TEXT,                      -- 企业内部岗位编号
  department TEXT,                      -- 部门 / 团队 / 业务线
  job_function TEXT,                    -- 职能类别（中文，如 研发 / 产品 / 销售）
  job_type TEXT,                        -- graduate 校招 | intern 实习 | program 管培/专项计划 | full_time 社招全职 | part_time | contract
  program_name TEXT,                    -- 所属校招项目（如 2027 届秋季校园招聘 / STEP Internship）
  recruit_season TEXT,                  -- autumn 秋招 | spring 春招 | summer_intern 暑期实习 | winter_intern 寒假实习 | daily_intern 日常实习 | rolling 常年
  seniority TEXT,                       -- intern | entry | mid | senior | lead | manager | director | executive

  location TEXT,                        -- 工作地点（原文，多个用 ; 分隔）
  country TEXT,
  city TEXT,
  remote_type TEXT,                     -- onsite | hybrid | remote

  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT,
  salary_period TEXT,                   -- year | month | day | hour
  salary_description TEXT,

  education_requirement TEXT,           -- none | associate | bachelor | master | phd
  education_description TEXT,
  major_requirement TEXT,
  experience_years_min NUMERIC,
  experience_requirement TEXT,
  skills TEXT[] DEFAULT '{}',
  language_requirement TEXT,
  visa_sponsorship BOOLEAN,             -- 是否提供工作签证担保
  visa_description TEXT,
  graduation_year TEXT,                 -- 校招面向的毕业届别（如 2027 届）
  target_students TEXT,                 -- 面向人群（本科 / 硕士 / 博士、专业范围等）
  accepts_overseas_students BOOLEAN,    -- 是否明确面向海外留学生 / 海归
  overseas_description TEXT,            -- 留学生相关说明（专场、网申通道、海外笔面试安排等）
  intern_duration TEXT,                 -- 实习时长 / 每周到岗要求
  intern_conversion BOOLEAN,            -- 实习是否有转正机会
  recruit_process TEXT,                 -- 招聘流程（网申 → 测评 → 笔试 → 面试 → offer）

  summary_cn TEXT,                      -- 岗位中文摘要
  responsibilities TEXT,
  qualifications TEXT,
  preferred_qualifications TEXT,
  benefits TEXT,
  headcount INTEGER,

  posted_date DATE,
  application_start DATE,               -- 网申开始
  deadline DATE,                        -- 网申截止
  status TEXT DEFAULT 'open',           -- open 在招 | closed 已下线 | unknown

  job_url TEXT,                         -- 岗位详情页
  apply_url TEXT,                       -- 投递入口
  source_url TEXT,                      -- 来源（本次提取的目标 URL）
  source_log_id INTEGER REFERENCES job_crawl_logs(id) ON DELETE SET NULL,

  completeness_score INTEGER,           -- 核心字段完整度 0-100
  human_review_status VARCHAR(20),      -- review | complete | rejected | incomplete | hidden
  human_review_at TIMESTAMPTZ,
  human_review_note TEXT,
  human_locked_fields JSONB DEFAULT '[]',   -- 人工改过的字段，重新提取时不覆盖

  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),   -- 最近一次在来源页上看到该岗位
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(lower(title));
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON jobs(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_review ON jobs(human_review_status);
CREATE INDEX IF NOT EXISTS idx_jobs_source_url ON jobs(source_url);
CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at DESC);

-- ────────────────────────────────────────────
-- 6. Token 用量
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_usage_logs (
  id SERIAL PRIMARY KEY,
  tool_name TEXT,
  task_name TEXT,
  institution TEXT DEFAULT '',          -- 企业名 / 目标 URL（沿用院校版列名，Token 统计页通用）
  model_id TEXT,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  total_cost_usd NUMERIC DEFAULT 0,
  api_cost_cny NUMERIC DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  batch_id BIGINT,
  records JSONB DEFAULT '[]',
  model_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage_logs(model_id);

-- ────────────────────────────────────────────
-- 7. 企业关联实体计数（企业列表用；只包含有关联数据的企业）
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW company_relation_counts
WITH (security_invoker = true) AS
SELECT
  company_id,
  count(*) FILTER (WHERE kind = 'url')                       AS url_total,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'homepage')  AS url_homepage,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'careers')   AS url_careers,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'campus')    AS url_campus,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'job')       AS url_job,
  count(*) FILTER (WHERE kind = 'url' AND sub = 'about')     AS url_about,
  count(*) FILTER (WHERE kind = 'job')                       AS jobs_total,
  count(*) FILTER (WHERE kind = 'job' AND sub = 'open')      AS jobs_open
FROM (
  SELECT company_id, 'url' AS kind, type AS sub FROM url_sources WHERE company_id IS NOT NULL
  UNION ALL
  SELECT company_id, 'job', status FROM jobs WHERE company_id IS NOT NULL
) x
GROUP BY company_id;

-- ────────────────────────────────────────────
-- 8. RLS：全部开启，不建 policy（仅 service role 可访问）
-- ────────────────────────────────────────────
ALTER TABLE system_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_journal       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_crawl_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage_logs  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
