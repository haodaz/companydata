-- 外部模拟参照 · 学员作品墙（2026-11-04）：外部平台（先是 Extern）上学员公开挂出来的作品，脱敏后按项目存。
-- 口径（用户）：像美术班外面挂的一百张热带鱼——不要学员是谁，只看这一期教了什么、学员做出了什么、怎么做的。
-- 不存：作品集地址、姓名、邮箱、电话、学校、经历、简历、作品外链网址（只记外链类型）。文字里出现本人名字已换成「学员」。
CREATE TABLE IF NOT EXISTS work_external_works (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL DEFAULT 'extern',
  program_id      TEXT NOT NULL,                       -- 对应 work_external_simulations.external_id（同一 source）
  program_title   TEXT,
  cohort          TEXT,                                -- 期次（如 Aug 2026）
  in_progress     BOOLEAN NOT NULL DEFAULT false,
  top_performer   BOOLEAN NOT NULL DEFAULT false,      -- 企业评的 Top performer
  tags            TEXT[],
  overview        TEXT,                                -- 作品概述
  accomplished    TEXT,                                -- 做成了什么
  breakdown       TEXT,                                -- 分模块做了什么
  artifact_kinds  TEXT[],                              -- 作品外链类型（claude 作品页 / Google 文档 / Canva …），不存网址
  fetched_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wew_program ON work_external_works(source, program_id);
ALTER TABLE work_external_works ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
