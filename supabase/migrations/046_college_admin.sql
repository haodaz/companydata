-- 046 百业学院教务（2026-10-23）：申请管理 / 学员管理 / 学员培养 / 毕业生管理 的底表。
--
-- 概念对应（训练不从零开始，课程和考核都是百业现成的东西）：
--   学员   college_students     = 一个模型（平台自己的大模型 / 客户送来的模型或智能体）。一个学员可以上很多门课。
--   课程   skill_tasks          = 百业工厂的一个空间（章节 = 一天的工序、工位、老师傅技能卡、教案），不另建表。
--   学籍   college_enrollments  = 学员 × 课程。入学考（不装技能）→ 拜师实训（装技能、教案）→ 考核（章节考 + 真活）→ 毕业。
--                                 同一个模型上不同的课，就是不同的毕业生。
--   毕业生 = status = graduated 的学籍。
--   分配   college_placements   = 毕业生 → 企业 / 科研院所（工作台机构、企业库企业、人才培养需求单）。一个毕业生可以被派到多家。
--   考试记录不另建：章节考记在 skill_submissions（candidate_type = ai），真活记在 work_sessions，各加一列 enrollment_id 挂到学籍上。
-- 整份可重复执行。

CREATE TABLE IF NOT EXISTS college_students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                              -- 学员名（平台模型 = 模型名；客户模型 = 申请里的模型名称）
  kind            TEXT NOT NULL DEFAULT 'platform' CHECK (kind IN ('platform', 'customer')),   -- 平台大模型 / 客户送来的
  model_id        TEXT,                                       -- 平台模型：MODEL_OPTIONS 里的 id（能直接考）；客户模型接上接口前为空
  api_style       TEXT,                                       -- 客户模型：接口形式（OpenAI 兼容 / Anthropic Messages / 自定义 HTTP / 暂时没有）
  endpoint        TEXT,                                       -- 客户模型：接口地址（不存密钥）
  org             TEXT,                                       -- 送学的机构
  contact         TEXT,
  phone           TEXT,
  email           TEXT,
  application_id  UUID REFERENCES college_applications(id) ON DELETE SET NULL,   -- 从哪份入学申请录取来的
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS college_students_model_idx ON college_students (model_id) WHERE model_id IS NOT NULL AND kind = 'platform';
ALTER TABLE college_students ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS college_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES college_students(id) ON DELETE CASCADE,
  space_id        UUID NOT NULL REFERENCES skill_tasks(id) ON DELETE CASCADE,   -- 课程 = 百业空间
  nova_name       TEXT,                                       -- 毕业后对外的名字（NOVA-xx）
  status          TEXT NOT NULL DEFAULT 'enrolled'
                  CHECK (status IN ('enrolled', 'training', 'examining', 'graduated', 'remedial', 'withdrawn')),
                  -- enrolled 已录取 → training 实训中 → examining 考核中 → graduated 已毕业 / remedial 补训（有一段没过）/ withdrawn 退学
  entrance_score  NUMERIC,                                    -- 入学考（不装技能）最好成绩
  final_score     NUMERIC,                                    -- 毕业考（装技能）各段最好成绩的平均
  graduated_at    TIMESTAMPTZ,
  demand_id       UUID REFERENCES college_applications(id) ON DELETE SET NULL,   -- 定向培养：对应哪份人才培养需求
  notebook        JSONB NOT NULL DEFAULT '{}'::jsonb,         -- 学员这门课的学习笔记：{ lessons: { <章节id>: [要点] }, mistakes: [{ chapter, score, lesson, at }], rules: [规则], work: [{ task, score, lesson }] }
                                                              -- 考试时和老师傅技能卡一起装进去；补训 = 反思进错题本再考。这就是「学习」在这里的实体。
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, space_id)
);
CREATE INDEX IF NOT EXISTS college_enrollments_space_idx ON college_enrollments (space_id);
CREATE INDEX IF NOT EXISTS college_enrollments_status_idx ON college_enrollments (status);
ALTER TABLE college_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS college_placements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES college_enrollments(id) ON DELETE CASCADE,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('ws_org', 'company', 'demand')),   -- 工作台机构（企业版 / 科研版）/ 企业库企业 / 人才培养需求单
  target_id       TEXT NOT NULL,                              -- ws_orgs.id / companies.id / college_applications.id
  target_name     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'offered', 'placed', 'ended')),
                  -- proposed 拟派 → offered 已推荐 → placed 已上岗 / ended 已结束
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS college_placements_enrollment_idx ON college_placements (enrollment_id);
CREATE INDEX IF NOT EXISTS college_placements_target_idx ON college_placements (target_kind, target_id);
ALTER TABLE college_placements ENABLE ROW LEVEL SECURITY;

-- 教务总控对话（AI agent 串起上面所有功能；people with 管理运筹能力 就能用）
CREATE TABLE IF NOT EXISTS college_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  TEXT,
  title       TEXT NOT NULL DEFAULT '',
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS college_threads_updated_idx ON college_threads (updated_at DESC);
ALTER TABLE college_threads ENABLE ROW LEVEL SECURITY;

-- 考试记录挂到学籍上
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES college_enrollments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_skill_submissions_enrollment ON skill_submissions (enrollment_id);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES college_enrollments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_sessions_enrollment ON work_sessions (enrollment_id);

-- 申请单多两个状态：入学申请「已录取」、培养需求「培养中 / 已交付」
ALTER TABLE college_applications DROP CONSTRAINT IF EXISTS college_applications_status_check;
ALTER TABLE college_applications ADD CONSTRAINT college_applications_status_check
  CHECK (status IN ('new', 'contacted', 'won', 'closed', 'admitted', 'training', 'delivered'));

NOTIFY pgrst, 'reload schema';
