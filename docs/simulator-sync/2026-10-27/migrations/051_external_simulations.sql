-- 外部模拟参照（10-26）：Forage 等平台的公开职业模拟，只存外层——谁家、什么岗位、干什么活、练什么技能、评价、任务结构；不存题目正文
CREATE TABLE IF NOT EXISTS work_external_simulations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL DEFAULT 'forage',
  external_id    TEXT NOT NULL,            -- 平台上的编号
  url            TEXT,
  company_name   TEXT,
  company_slug   TEXT,
  company_id     BIGINT,                   -- 对上企业库的就挂上
  title          TEXT NOT NULL,
  tagline        TEXT,
  career_areas   TEXT[],                   -- 职业方向（Law / Finance …）
  target_majors  TEXT[],
  role_summary   TEXT,                     -- 你扮演谁、干什么活
  goal_summary   TEXT,                     -- 做完能得到什么
  skills         TEXT[],
  difficulty     TEXT,
  time_guidance  TEXT,
  rating         NUMERIC(3,1),
  review_samples JSONB NOT NULL DEFAULT '[]',   -- 最多 3 条评价摘要 + 学校
  task_structure JSONB NOT NULL DEFAULT '[]',   -- [{position, title, tagline, type, steps}]，只要标题和一句话
  achievements   TEXT[],                   -- 证书 / CV 片段 / 面试提示
  company_type   TEXT,
  launch_date    TIMESTAMPTZ,
  meta           JSONB NOT NULL DEFAULT '{}',
  fetched_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_wes_company ON work_external_simulations(company_id);
ALTER TABLE work_external_simulations ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
