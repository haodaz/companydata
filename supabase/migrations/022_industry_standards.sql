-- ============================================
-- 022: 行业标准与操作规程库（2026-10-12）
--   用户：「给数据工厂加一个库 + 获取工具——行业标准与操作库，这样一切才有可解释性」。
--   百业空间里工位的每条规则、每个目标窗口，都应该能指回一条标准 / 规程的条款：平方的数据知识与编织图谱让空间可信。
--
--   industry_standards   标准 / 规程实体（国标、行标、地标、团标、企业规程、国际标准、法规）
--   standard_tasks       获取任务（一批检索配置，历史与成败累积）
--   standard_searches    任务里的每一条检索（配置 + 原始候选 + 官方页原文 + AI 摘要 + 成本）
--   standard_links       标准条款 ↔ 百业空间 / 章节 / 工位规则（可解释性的那根线）
--
-- 版权口径：只存题录（标准号、名称、发布单位、状态、日期、适用范围）和「要点」（AI 转述的操作要求，不抄原文），全文给官方链接。
-- 在 Supabase SQL Editor 中整段执行，可重复执行。所有新表都开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

CREATE TABLE IF NOT EXISTS standard_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',          -- draft | running | completed | failed
  model_id TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS standard_searches (
  id SERIAL PRIMARY KEY,
  task_id UUID REFERENCES standard_tasks(id) ON DELETE CASCADE,
  query TEXT NOT NULL DEFAULT '',       -- 检索主题：职业 / 工序 / 设备 / 场景（如「转炉炼钢 氧枪 安全」）
  profession TEXT,                      -- 面向的职业（如「转炉炼钢操作工」）
  industry TEXT,                        -- 行业（如「冶金」）
  space_id UUID,                        -- 为哪个百业空间找（skill_tasks.id，可空）
  kinds TEXT[] DEFAULT '{}',            -- 限定标准层级（见 standard-fields.ts）
  doc_types TEXT[] DEFAULT '{}',        -- 限定文件类型：standard / procedure / safety_rule / code / guideline / regulation
  count INTEGER DEFAULT 10,
  enrich BOOLEAN DEFAULT TRUE,          -- 逐条抓官方页补题录与要点
  model_id TEXT,
  batch_id BIGINT,
  llm_calls INTEGER DEFAULT 0,
  token_total BIGINT DEFAULT 0,
  cost_usd NUMERIC(12, 6) DEFAULT 0,
  search_queries TEXT[] DEFAULT '{}',
  raw_candidates JSONB DEFAULT '[]',
  raw_pages JSONB DEFAULT '[]',         -- [{ url, ok, len, markdown }]
  structured_json JSONB,                -- { standards: [...], ai_summary, pipeline_log }
  candidates_found INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',        -- pending | running | success | failed
  error_message TEXT,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_standard_searches_task ON standard_searches(task_id);
CREATE INDEX IF NOT EXISTS idx_standard_searches_created ON standard_searches(created_at DESC);

-- 字段定义与 src/lib/standard-fields.ts 保持一致
CREATE TABLE IF NOT EXISTS industry_standards (
  id SERIAL PRIMARY KEY,
  dedupe_key TEXT UNIQUE NOT NULL,      -- 规范化的标准号（如 gbt36276-2023）；没有标准号的规程用 发布单位+名称

  code TEXT,                            -- 标准号（如 GB/T 36276-2023、AQ 2001-2018、JTG F40-2004）
  title TEXT NOT NULL,                  -- 标准 / 规程名称
  title_en TEXT,
  kind TEXT,                            -- national_mandatory 强制性国标 | national 推荐性国标 | industry 行业标准 | local 地方标准 | group 团体标准 | enterprise 企业标准 / 规程 | international 国际 / 国外标准 | regulation 法规规章
  doc_type TEXT,                        -- standard 标准 | procedure 操作规程 / 作业指导 | safety_rule 安全规程 | code 技术规范 / 施工规范 | guideline 指南 / 共识 | regulation 法规
  issuer TEXT,                          -- 发布 / 归口单位
  industry TEXT,                        -- 行业（中文）
  professions TEXT[] DEFAULT '{}',      -- 适用职业 / 岗位
  status TEXT DEFAULT 'unknown',        -- current 现行 | upcoming 即将实施 | revised 被代替 | abolished 废止 | unknown
  publish_date_str TEXT,
  implement_date_str TEXT,
  replaces TEXT,                        -- 代替了哪个旧标准
  replaced_by TEXT,                     -- 被哪个新标准代替

  scope TEXT,                           -- 适用范围（中文 2–3 句）
  key_points JSONB DEFAULT '[]',        -- 操作要点（AI 转述，不抄原文）：[{ clause, kind: step|limit|prohibit|check|ppe|emergency, point }]
  operation_relevance TEXT,             -- 这条标准约束了岗位上的哪些操作（一两句）
  full_text_public BOOLEAN,             -- 官方是否免费公开全文

  official_url TEXT,                    -- 官方题录 / 全文公开页
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',

  ai_sources JSONB DEFAULT '{}',
  search_id INTEGER REFERENCES standard_searches(id) ON DELETE SET NULL,
  completeness_score INTEGER,
  human_review_status VARCHAR(20) DEFAULT 'review',
  human_review_at TIMESTAMPTZ,
  human_review_note TEXT,
  human_locked_fields JSONB DEFAULT '[]',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_industry_standards_kind ON industry_standards(kind);
CREATE INDEX IF NOT EXISTS idx_industry_standards_status ON industry_standards(status);
CREATE INDEX IF NOT EXISTS idx_industry_standards_industry ON industry_standards(industry);
CREATE INDEX IF NOT EXISTS idx_industry_standards_professions ON industry_standards USING GIN(professions);

-- 标准条款 ↔ 百业空间（可解释性）：一条工位规则 / 目标窗口 / 章节，依据哪条标准的哪一款
CREATE TABLE IF NOT EXISTS standard_links (
  id SERIAL PRIMARY KEY,
  standard_id INTEGER REFERENCES industry_standards(id) ON DELETE CASCADE,
  space_id UUID NOT NULL,               -- skill_tasks.id
  chapter_id UUID,                      -- lab_chapters.id（可空：整个空间）
  target TEXT NOT NULL DEFAULT '',      -- 依据的对象：如「工位规则 · 氧枪冷却水报警先提枪」「目标 · 终点碳 0.04–0.08%」
  clause TEXT,                          -- 条款号
  note TEXT,                            -- 为什么这条依据它（AI 或人工写的一句）
  confidence INTEGER,                   -- 0–100
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (standard_id, space_id, chapter_id, target)
);
CREATE INDEX IF NOT EXISTS idx_standard_links_space ON standard_links(space_id);

ALTER TABLE standard_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_links ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
