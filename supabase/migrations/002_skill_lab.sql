-- ============================================
-- 002: 技能实验室（实验性 demo）+ 生产线任务历史
-- ============================================
-- 数字技能空间：每个「公司 × 岗位」一个 workspace（skill_tasks），由 JD 拆解建成。空间里三种用法：
--   新兵检验（skill_submissions）· 专家蒸馏（skills）· 解决问题（skill_invocations.kind = solve）
-- 技能每被调用一次记一笔账（skill_invocations）= 错位时空。
-- 在 Supabase SQL Editor 中整段执行，可重复执行。is_demo = true 的行由「一键灌入演示 case」写入，可一键清除。

-- 1. 数字技能：把有经验的人的做法蒸馏成技能卡，可装配给 AI
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  domain TEXT,                          -- 领域（如 数据分析 · 互联网）
  kind TEXT,                            -- hard 硬技能 | soft 软技能
  summary TEXT,
  expert_name TEXT,
  expert_title TEXT,
  expert_location TEXT,                 -- 蒸馏发生地
  expert_note TEXT,                     -- 专家现状（如「已离开行业」），用于错位时空叙事
  tz_offset NUMERIC,                    -- 蒸馏地 UTC 偏移（小时）
  source TEXT DEFAULT 'interview',      -- interview AI 访谈 | seed 演示
  card JSONB NOT NULL DEFAULT '{}',     -- { scenarios[], steps[], rules[], good_example, bad_example, checklist[] }
  interview JSONB DEFAULT '[]',         -- [{ role: 'ai' | 'expert', content }]
  expert_trace JSONB,                   -- 专家在模拟操作台上的操作轨迹（AI 核心模仿的对象）
  assigned_agent TEXT,                  -- 装配给哪位 AI 员工（展示用）
  distilled_at TIMESTAMPTZ DEFAULT now(),
  is_demo BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 技能空间（workspace）：每份 JD 构建一个虚拟技能空间，核心是一个拥有这份 JD 技能的优秀员工 AI。
--    它等着考验新人、等着向资深从业者学习、等着用自己的能力解决问题。
CREATE TABLE IF NOT EXISTS skill_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  jd_snapshot JSONB DEFAULT '{}',       -- { company, title, job_req_id, location, responsibilities, qualifications, url }
  profile JSONB DEFAULT '{}',           -- 空间核心（拥有这份 JD 技能的优秀员工 AI）的档案：{ codename, tagline, capabilities[], can_solve[] }
  jd_breakdown JSONB DEFAULT '[]',      -- JD 拆解：[{ duty 职责原句, capability 能力项, task_idea 可检验任务, chosen 是否本题 }]
  title TEXT NOT NULL,
  brief TEXT NOT NULL,                  -- 任务说明（情境 + 要求）
  materials TEXT,                       -- 给到的材料（数据表 / 背景）
  deliverable TEXT,                     -- 交付物要求
  time_limit_min INTEGER DEFAULT 45,
  rubric JSONB NOT NULL DEFAULT '[]',   -- [{ key, name, weight, description }]
  sim JSONB,                            -- 模拟操作台脚本（见 src/lib/skill-sim.ts）
  is_demo BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skill_tasks_skill ON skill_tasks(skill_id);

-- 3. 作答与评分：人和 AI 用同一套标准
CREATE TABLE IF NOT EXISTS skill_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES skill_tasks(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_type TEXT DEFAULT 'human',  -- human 新兵 | expert 专家走一遍 | ai
  candidate_note TEXT,                  -- 背景（学校 / 模型）
  candidate_location TEXT,
  with_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,  -- AI 作答时装配的技能
  answer TEXT NOT NULL,                 -- 操作轨迹的文字记录 + 最后的结论
  trace JSONB,                          -- 在模拟操作台上的操作轨迹
  match INTEGER,                        -- 与专家轨迹的吻合度 0-100
  score NUMERIC,                        -- 0-100
  grading JSONB,                        -- { dimensions: [{ key, score, evidence, comment }], summary, gaps[], suggestions[] }
  graded_with_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  graded_by_model TEXT,
  human_score NUMERIC,                  -- 人工改分
  human_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  is_demo BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_skill_submissions_task ON skill_submissions(task_id);

-- 4. 技能流转账本（错位时空）：技能每被调用一次记一笔
CREATE TABLE IF NOT EXISTS skill_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  kind TEXT,                            -- grade 评分 | answer AI 作答 | batch 批量批改 | coach 辅导 | solve 解决问题
  actor TEXT,                           -- 谁在用
  actor_location TEXT,                  -- 在哪用
  tz_offset NUMERIC,
  context TEXT,                         -- 当时的情境
  output_summary TEXT,                  -- 产出了什么（一句话）
  input TEXT,                           -- solve：丢给技能的问题原文
  output TEXT,                          -- solve：技能给出的完整产出
  task_id UUID REFERENCES skill_tasks(id) ON DELETE CASCADE,  -- 发生在哪个技能空间
  volume INTEGER DEFAULT 1,             -- 这一笔处理了多少份
  submission_id UUID REFERENCES skill_submissions(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  is_demo BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_skill_invocations_skill ON skill_invocations(skill_id, occurred_at);

-- 5. 虚拟工厂 · 生产线任务历史（每次总任务留痕：排产、工单、日志、质检简报）
CREATE TABLE IF NOT EXISTS factory_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task TEXT NOT NULL,                   -- 用户下达的总任务原文
  title TEXT,
  status TEXT DEFAULT 'running',        -- running | completed | failed | stopped
  plan JSONB,
  items JSONB DEFAULT '[]',             -- 工单快照
  logs JSONB DEFAULT '[]',              -- 车间日志
  report TEXT,                          -- 质检简报
  companies_count INTEGER DEFAULT 0,
  jobs_saved INTEGER DEFAULT 0,
  model_id TEXT,
  created_by TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_factory_runs_started ON factory_runs(started_at DESC);

ALTER TABLE factory_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_invocations  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
