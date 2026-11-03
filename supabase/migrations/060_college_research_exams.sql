-- 百业学院 · 科研能力测评题（2026-11-03）：论文三题（读懂 / 盲测预测 / 埋错审稿）从 scripts/data/research-exams/*.json 搬进库，
-- 给导师一个只看只改的校正入口（/college/review/<review_token>，不用注册）。用户口径：人只做校正，不做起草——
-- 题目由 AI 代导师出完整初稿（status = ai_draft），另一个模型交叉核对；导师改过变 mentor_reviewed，每处改动记进 corrections。
-- scope：public = 平台用公开论文建的公共课；private = 实验室拿自己的数据来的私域课（org = 归属机构）。
CREATE TABLE IF NOT EXISTS college_research_exams (
  id            TEXT PRIMARY KEY,                    -- 论文编号（arXiv id 等）
  title         TEXT NOT NULL,
  url           TEXT,
  license       TEXT,
  field         TEXT,                                -- 方向：AI 研发 · 模型训练 / 电池材料 / ……
  scope         TEXT NOT NULL DEFAULT 'public' CHECK (scope IN ('public', 'private')),
  org           TEXT,                                -- 私域课的归属机构
  status        TEXT NOT NULL DEFAULT 'ai_draft' CHECK (status IN ('ai_draft', 'mentor_reviewed', 'retired')),
  mentor        TEXT,                                -- 出题的（AI 代导师 / 真人导师）
  checker       TEXT,                                -- 交叉核对的模型
  exam          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 题目本体：design_key / method_excerpt / blind_brief / propositions / review_excerpt / planted / check
  corrections   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ by, at, part, item, before, after, note }]
  review_token  TEXT UNIQUE,                         -- 导师校正链接的密钥
  reviewer      JSONB,                               -- { name, org, contact }（导师自己填）
  reviewed_at   TIMESTAMPTZ,
  built_at      TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE college_research_exams ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS college_research_exams_field_idx ON college_research_exams (field, status);
