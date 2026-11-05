-- 真活知识库（2026-11-05）：出任务的人自己维护的企业资料、岗位（要找什么样的人）。
-- 工作台 /work/ws/kb 的「企业」「岗位」两栏和助理的 kb_save 写这里；出任务时助理先查这里，有就直接用，不再让用户重说一遍。
-- 企业库（companies）是平台的数据资产，普通用户不改它；用户补的介绍存在这里，只给自己用。
-- 任务样本、素材、任务库沿用 work_samples / work_tasks.materials / work_showcase，不进这张表。
CREATE TABLE IF NOT EXISTS work_kb (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  TEXT NOT NULL,                       -- 谁的（只给自己看）
  kind        TEXT NOT NULL,                       -- company 企业资料 / role 岗位
  title       TEXT NOT NULL,                       -- 企业名 / 岗位名（或「要找什么样的人」的一句话）
  company_id  BIGINT,                              -- 企业库里有就挂上；岗位也可以挂所属企业
  company     TEXT,                                -- 岗位所属企业名（库里没有时）
  body        TEXT,                                -- 企业：介绍（做什么、多大、最近在推进什么、为什么招人）；岗位：要找什么样的人、看重什么
  data        JSONB DEFAULT '{}'::jsonb,           -- 其余字段：岗位的经验段 / 常用时长 / 偏好的台子；企业的官网等
  source      TEXT DEFAULT 'manual',               -- manual 自己填 / ai 助理整理（人只校正）
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_kb_owner_idx ON work_kb (created_by, kind, updated_at DESC);
ALTER TABLE work_kb ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
