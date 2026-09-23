-- ============================================
-- 006: 企业赛事雷达
--   competitions          赛事实体库（黑客松 / 开发者大赛 / 商业案例赛 / 数据竞赛 / 校园创新赛…）
--   competition_tasks     检索任务（一批检索配置，历史与成败累积）
--   competition_searches  任务里的每一条检索（配置 + 原始候选 + 官方页原文 + AI 摘要 + 成本）
-- 在 Supabase SQL Editor 中整段执行，可重复执行。
-- ============================================

-- 任务：一批检索配置（每条 = 一个主题 / 一家主办企业 + 奖励导向），历史与成败累积
CREATE TABLE IF NOT EXISTS competition_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',          -- draft | running | completed | failed
  model_id TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 任务里的每一条检索（配置 + 运行结果 + raw）
CREATE TABLE IF NOT EXISTS competition_searches (
  id SERIAL PRIMARY KEY,
  task_id UUID REFERENCES competition_tasks(id) ON DELETE CASCADE,
  query TEXT NOT NULL DEFAULT '',       -- 检索主题 / 关键词（可空：只按主办企业查）
  company TEXT,                         -- 指定主办企业（可空）
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  kinds TEXT[] DEFAULT '{}',            -- 限定赛事类型
  region TEXT,                          -- 地域：global | china | overseas
  only_open BOOLEAN DEFAULT TRUE,       -- 只要仍可报名 / 即将开始的
  rewards TEXT[] DEFAULT '{}',          -- 奔着什么奖励去查：hardware 设备 | cash 现金 | internship 实习 | offer 直发 offer | credits 算力 / 云资源
  count INTEGER DEFAULT 12,             -- 候选数上限
  enrich BOOLEAN DEFAULT TRUE,          -- 逐条抓官方页补全详情
  model_id TEXT,
  batch_id BIGINT,
  llm_calls INTEGER DEFAULT 0,
  token_total BIGINT DEFAULT 0,
  cost_usd NUMERIC(12, 6) DEFAULT 0,
  search_queries TEXT[] DEFAULT '{}',   -- 大模型实际用的搜索词
  raw_candidates JSONB DEFAULT '[]',    -- 检索返回的原始候选
  raw_pages JSONB DEFAULT '[]',         -- [{ url, ok, len, markdown }]（官方页原文，raw 层）
  structured_json JSONB,                -- { competitions: [...], ai_summary, pipeline_log }
  candidates_found INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',        -- pending | running | success | failed
  error_message TEXT,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competition_searches_created ON competition_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competition_searches_task ON competition_searches(task_id);

-- 字段定义与 src/lib/competition-fields.ts 保持一致（提示词 schema / 列表 / 详情 / 导出都从那里生成）
CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  dedupe_key TEXT UNIQUE NOT NULL,      -- 官方链接，或 主办方+名称+年份

  name TEXT NOT NULL,                   -- 赛事名称
  name_en TEXT,
  year INTEGER,                         -- 届 / 年份
  organizer TEXT,                       -- 主办企业 / 机构
  organizer_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  co_organizers TEXT,                   -- 联合主办 / 赞助商
  sponsor_tier TEXT,                    -- top_tech 头部大厂 | foreign_top 海外巨头 | unicorn 独角兽 | soe 国企央企 | platform 平台社区 | university 高校主办 | other

  kind TEXT,                            -- hackathon | developer | business_case | data_science | campus_innovation | design | research | other
  level TEXT,                           -- global | national | regional | campus
  format TEXT,                          -- online | offline | hybrid
  region TEXT,                          -- 地域文本（全球 / 中国 / 北美 …）
  location TEXT,                        -- 线下地点
  theme TEXT,                           -- 主题 / 赛道
  tech_stack TEXT[] DEFAULT '{}',       -- 技术栈 / 技能要求
  eligibility TEXT,                     -- 参赛资格（在校生 / 应届 / 不限 / 年级 / 专业）
  student_only BOOLEAN,                 -- 是否仅限学生
  team_size TEXT,                       -- 组队要求

  registration_start_str TEXT,
  registration_deadline DATE,
  registration_deadline_str TEXT,
  event_start_str TEXT,
  event_end_str TEXT,
  status TEXT DEFAULT 'unknown',        -- upcoming 未开放 | open 报名中 | closed 已截止 | ended 已结束 | unknown

  prizes TEXT,                          -- 奖项与奖金（原文摘要）
  prize_total TEXT,                     -- 总奖池
  reward_types TEXT[] DEFAULT '{}',     -- 奖励类型：hardware | cash | internship | offer | credits | other
  hardware_prize BOOLEAN DEFAULT FALSE, -- 有实物硬件奖品（电脑 / GPU / 手机 …）
  hardware_prize_detail TEXT,
  offer_track TEXT,                     -- none | interview_fastpass 面试直通 | internship 实习 | offer 直发 offer | unknown
  offer_track_detail TEXT,
  background_value TEXT,                -- 背提价值（AI 一句话：写简历 / 申研 / 保研的含金量）
  fit_hint TEXT,                        -- 适合谁 / 怎么打（AI 建议）

  official_url TEXT,                    -- 官方页面
  registration_url TEXT,                -- 报名入口
  introduction TEXT,                    -- 赛事简介
  process TEXT,                         -- 赛制 / 流程
  tags TEXT[] DEFAULT '{}',

  ai_sources JSONB DEFAULT '{}',        -- { field: url }
  search_id INTEGER REFERENCES competition_searches(id) ON DELETE SET NULL,
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_review_note TEXT,
  human_locked_fields JSONB DEFAULT '[]',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitions_organizer ON competitions(organizer_company_id);
CREATE INDEX IF NOT EXISTS idx_competitions_deadline ON competitions(registration_deadline);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_kind ON competitions(kind);
CREATE INDEX IF NOT EXISTS idx_competitions_rewards ON competitions USING GIN(reward_types);

ALTER TABLE competition_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
