-- ============================================
-- 003: 与平方数据基础设施的字段对齐（企业 companies / 岗位 jobs）
-- ============================================
-- 依据数据同事提供的《岗位及公司字段.xlsx》：
--   1) 我们已有、语义相同但命名不同的字段 → 直接改名（数据保留）
--   2) 对方有、我们没有的字段 → 新增
--   3) 我们有、对方没有的字段 → 保留（AI 带回来的额外信息维度）
-- 在 Supabase SQL Editor 中整段执行，可重复执行。
--
-- 值口径说明（字段名对齐，值的映射留给同步层）：
--   - 对方 city / country / province / county_area 存的是行政区划代码，我们存的是名称（如「深圳」「美国」）
--   - 对方 kind（公司类型）是法律形态（有限责任公司…），我们的 company_type 是所有制 / 分类，两个都保留
--   - 岗位 kind 按对方枚举（campus_fulltime / company_internship / social_position…），由 job_type 自动推导，也可由 AI 直接提取

-- 改名助手：列存在才改
CREATE OR REPLACE FUNCTION _rename_col(t TEXT, old TEXT, new TEXT) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = old)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = new) THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', t, old, new);
  END IF;
END $$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────
-- 1. companies
-- ────────────────────────────────────────────
SELECT _rename_col('companies', 'website',        'official_website');
SELECT _rename_col('companies', 'description',    'introduction');
SELECT _rename_col('companies', 'founded_year',   'info_founding_year');
SELECT _rename_col('companies', 'employee_count', 'company_scale');
SELECT _rename_col('companies', 'revenue',        'operating_revenue');
SELECT _rename_col('companies', 'hq_city',        'city');
SELECT _rename_col('companies', 'hq_country',     'country');

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS brief_name TEXT,                      -- 公司简称
  ADD COLUMN IF NOT EXISTS historical_name TEXT,                 -- 曾用名
  ADD COLUMN IF NOT EXISTS one_sentence TEXT,                    -- 公司一句话描述
  ADD COLUMN IF NOT EXISTS slug TEXT,                            -- Slug
  ADD COLUMN IF NOT EXISTS kind TEXT,                            -- 公司类型（法律形态）：limited_liability_company | joint_stock_company | foreign_invested_enterprise | state_owned_enterprise | ...
  ADD COLUMN IF NOT EXISTS province TEXT,                        -- 省份
  ADD COLUMN IF NOT EXISTS county_area TEXT,                     -- 所属县（区）
  ADD COLUMN IF NOT EXISTS continent TEXT,                       -- 大洲：asia | europe | america | africa | oceania | south_america
  ADD COLUMN IF NOT EXISTS geo_region TEXT,                      -- 地理大区：cn_north_region | cn_east_region | ...
  ADD COLUMN IF NOT EXISTS registration_address TEXT,            -- 注册地址
  ADD COLUMN IF NOT EXISTS unified_social_credit_code TEXT,      -- 统一社会信用代码
  ADD COLUMN IF NOT EXISTS legal_representative TEXT,            -- 法定代表人
  ADD COLUMN IF NOT EXISTS chairman TEXT,                        -- 董事长
  ADD COLUMN IF NOT EXISTS ceo_general_manager TEXT,             -- CEO / 总经理
  ADD COLUMN IF NOT EXISTS cto TEXT,                             -- CTO
  ADD COLUMN IF NOT EXISTS registered_capital TEXT,              -- 注册资本
  ADD COLUMN IF NOT EXISTS paid_in_capital TEXT,                 -- 实缴资本
  ADD COLUMN IF NOT EXISTS company_employees INTEGER,            -- 参保人数
  ADD COLUMN IF NOT EXISTS profit TEXT,                          -- 利润
  ADD COLUMN IF NOT EXISTS info_email TEXT,                      -- 公司邮箱
  ADD COLUMN IF NOT EXISTS info_phone TEXT,                      -- 公司联系电话
  ADD COLUMN IF NOT EXISTS year_report_address TEXT,             -- 年报地址
  ADD COLUMN IF NOT EXISTS business_range TEXT,                  -- 经营范围
  ADD COLUMN IF NOT EXISTS business_profile TEXT,                -- 商业档案
  ADD COLUMN IF NOT EXISTS product_area TEXT,                    -- 产品范围
  ADD COLUMN IF NOT EXISTS company_specialties TEXT,             -- 企业核心业务领域
  ADD COLUMN IF NOT EXISTS company_case TEXT,                    -- 公司案例
  ADD COLUMN IF NOT EXISTS company_evaluate TEXT,                -- 公司评价
  ADD COLUMN IF NOT EXISTS ai_comprehensive_evaluate TEXT,       -- 综合评价-ai
  ADD COLUMN IF NOT EXISTS ai_admission_analysis TEXT,           -- 总体录取分析-ai
  ADD COLUMN IF NOT EXISTS tech_advantage TEXT,                  -- 技术优势
  ADD COLUMN IF NOT EXISTS research_area TEXT,                   -- 研究方向
  ADD COLUMN IF NOT EXISTS growth_signals TEXT,                  -- 增长信号
  ADD COLUMN IF NOT EXISTS industry_position TEXT,               -- 行业位置
  ADD COLUMN IF NOT EXISTS company_team_abroad_signal TEXT,      -- 团队海外背景信号
  ADD COLUMN IF NOT EXISTS school_company_coop_exp TEXT,         -- 校企合作经历
  ADD COLUMN IF NOT EXISTS study_abroad_friendly TEXT,           -- 留学友好
  ADD COLUMN IF NOT EXISTS benefits_package TEXT,                -- 福利待遇
  ADD COLUMN IF NOT EXISTS edu_service_category TEXT[] DEFAULT '{}',        -- 教育服务大类
  ADD COLUMN IF NOT EXISTS qianli_label TEXT[] DEFAULT '{}',                -- 潜历标签
  ADD COLUMN IF NOT EXISTS qianli_label_type TEXT[] DEFAULT '{}',           -- 潜历标签类型
  ADD COLUMN IF NOT EXISTS qianli_label_text TEXT,                          -- 潜历标签备注
  ADD COLUMN IF NOT EXISTS qianli_specialty_labels_reason TEXT[] DEFAULT '{}', -- 潜历特色标签二级
  ADD COLUMN IF NOT EXISTS type_label TEXT[] DEFAULT '{}',                  -- 类型标签：unicorn_company | high_tech_company | ...
  ADD COLUMN IF NOT EXISTS subscription_platform TEXT[] DEFAULT '{}',       -- 订阅平台
  ADD COLUMN IF NOT EXISTS data_collection_channel TEXT[] DEFAULT '{}',     -- 数据收集渠道：inner_collect | outside_support
  ADD COLUMN IF NOT EXISTS company_industry_ids TEXT[] DEFAULT '{}',        -- 所属行业大类（对方 external_id）
  ADD COLUMN IF NOT EXISTS company_industry_list_ids TEXT[] DEFAULT '{}',   -- 所属产业二级目录（对方 external_id）
  ADD COLUMN IF NOT EXISTS data_source_id TEXT,                             -- 所属数据源（对方 external_id）
  ADD COLUMN IF NOT EXISTS org_id TEXT,                                     -- Org（对方 external_id）
  ADD COLUMN IF NOT EXISTS logo_id TEXT,                                    -- logo（对方 external_id）
  ADD COLUMN IF NOT EXISTS source TEXT,                                     -- 数据来源
  ADD COLUMN IF NOT EXISTS info_completeness TEXT,                          -- 状态：archived | complete | draft | hidden | incomplete | review
  ADD COLUMN IF NOT EXISTS if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_entered_vector_database BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS latest_full_sync_task_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug) WHERE slug IS NOT NULL;

-- ────────────────────────────────────────────
-- 2. jobs
-- ────────────────────────────────────────────
SELECT _rename_col('jobs', 'title',                 'name');
SELECT _rename_col('jobs', 'company',               'institute_or_company_name');
SELECT _rename_col('jobs', 'qualifications',        'overview');
SELECT _rename_col('jobs', 'benefits',              'welfare');
SELECT _rename_col('jobs', 'job_url',               'link');
SELECT _rename_col('jobs', 'apply_url',             'application_website');
SELECT _rename_col('jobs', 'posted_date',           'official_publish_date');
SELECT _rename_col('jobs', 'application_start',     'application_start_date_str');
SELECT _rename_col('jobs', 'deadline',              'application_end_date_str');
SELECT _rename_col('jobs', 'salary_min',            'internship_salary_min');
SELECT _rename_col('jobs', 'salary_max',            'internship_salary_max');
SELECT _rename_col('jobs', 'salary_period',         'salary_unit');
SELECT _rename_col('jobs', 'experience_years_min',  'exp_years');
SELECT _rename_col('jobs', 'experience_requirement','exp_labels');
SELECT _rename_col('jobs', 'skills',                'skill_labels');
SELECT _rename_col('jobs', 'headcount',             'number_of_recruits');

-- 对方的日期串 / 人数是字符串：DATE → TEXT（保持 YYYY-MM-DD），INTEGER → TEXT
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'application_end_date_str') = 'date' THEN
    ALTER TABLE jobs ALTER COLUMN application_end_date_str TYPE TEXT USING to_char(application_end_date_str, 'YYYY-MM-DD');
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'application_start_date_str') = 'date' THEN
    ALTER TABLE jobs ALTER COLUMN application_start_date_str TYPE TEXT USING to_char(application_start_date_str, 'YYYY-MM-DD');
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'number_of_recruits') = 'integer' THEN
    ALTER TABLE jobs ALTER COLUMN number_of_recruits TYPE TEXT USING number_of_recruits::text;
  END IF;
END $$;

-- 薪资单位改用对方枚举
UPDATE jobs SET salary_unit = 'per_' || salary_unit WHERE salary_unit IN ('year', 'month', 'day', 'hour');

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS kind TEXT,                            -- 类型：campus_fulltime | company_internship | social_position | research_internship | phd_open_position | ...
  ADD COLUMN IF NOT EXISTS accept_foreign TEXT,                  -- 是否接受外籍：accepted | not_accepted
  ADD COLUMN IF NOT EXISTS form_of_play TEXT,                    -- 开展形式：online | offline | online_and_offline
  ADD COLUMN IF NOT EXISTS is_in_campus BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS address TEXT,                         -- 地址
  ADD COLUMN IF NOT EXISTS province TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS organizer TEXT,                       -- 主办方
  ADD COLUMN IF NOT EXISTS company_slug TEXT,                    -- 主场单位 slug
  ADD COLUMN IF NOT EXISTS applysquare_id TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,                          -- 内容来源
  ADD COLUMN IF NOT EXISTS if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS application_start_time_str TEXT,
  ADD COLUMN IF NOT EXISTS application_end_time_str TEXT,
  ADD COLUMN IF NOT EXISTS application_end_date_time_description TEXT,
  ADD COLUMN IF NOT EXISTS gpa_min_requirement NUMERIC,          -- 最低 GPA
  ADD COLUMN IF NOT EXISTS grad_window_start DATE,               -- 要求毕业开始时间
  ADD COLUMN IF NOT EXISTS grad_window_end DATE,                 -- 要求毕业结束时间
  ADD COLUMN IF NOT EXISTS grade TEXT[] DEFAULT '{}',            -- 年级要求：college_junior | master_student | ...
  ADD COLUMN IF NOT EXISTS minimum_working_days INTEGER,         -- 每周最低实习天数
  ADD COLUMN IF NOT EXISTS skiil_certification TEXT,             -- 专业技能证书（对方字段名原样，含拼写）
  ADD COLUMN IF NOT EXISTS exp_labels_jd TEXT,                   -- 经验标签（JD）
  ADD COLUMN IF NOT EXISTS skill_labels_jd TEXT,                 -- 技能标签（JD）
  ADD COLUMN IF NOT EXISTS qianli_job_labels TEXT[] DEFAULT '{}',            -- 潜历岗位标签
  ADD COLUMN IF NOT EXISTS qianli_job_specialty_labels TEXT[] DEFAULT '{}',  -- 潜历特色标签
  ADD COLUMN IF NOT EXISTS qianli_specialty_labels_reason TEXT,              -- 潜历特色标签核心依据
  ADD COLUMN IF NOT EXISTS fos_ids TEXT[] DEFAULT '{}',                      -- 相关专业（对方 external_id）
  ADD COLUMN IF NOT EXISTS related_career_ids TEXT[] DEFAULT '{}',           -- 相关职业（对方 external_id）
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_name_en TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_fax TEXT,
  ADD COLUMN IF NOT EXISTS contact_qq TEXT,
  ADD COLUMN IF NOT EXISTS contact_wechat TEXT;

-- 从已有字段回填对方枚举
UPDATE jobs SET kind = CASE job_type
  WHEN 'graduate' THEN 'campus_fulltime' WHEN 'program' THEN 'campus_fulltime'
  WHEN 'intern' THEN 'company_internship' WHEN 'part_time' THEN 'company_internship'
  WHEN 'full_time' THEN 'social_position' WHEN 'contract' THEN 'social_position' END
  WHERE kind IS NULL AND job_type IS NOT NULL;
UPDATE jobs SET accept_foreign = CASE visa_sponsorship WHEN TRUE THEN 'accepted' WHEN FALSE THEN 'not_accepted' END WHERE accept_foreign IS NULL AND visa_sponsorship IS NOT NULL;
UPDATE jobs SET form_of_play = CASE remote_type WHEN 'remote' THEN 'online' WHEN 'onsite' THEN 'offline' WHEN 'hybrid' THEN 'online_and_offline' END WHERE form_of_play IS NULL AND remote_type IS NOT NULL;
UPDATE jobs j SET company_slug = c.slug FROM companies c WHERE j.company_id = c.id AND j.company_slug IS NULL AND c.slug IS NOT NULL;

DROP FUNCTION _rename_col(TEXT, TEXT, TEXT);
NOTIFY pgrst, 'reload schema';
