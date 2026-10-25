-- 题目资产库（2026-10-25）：每道出过的真活沉淀一条「题骨架」+ 质量信号，归数据工厂（数据资产），不是真活那边的已出题管理。
-- 出题时和训练样本库一起当参照：同企业 / 同行业的高分题优先。对外不讲。
CREATE TABLE IF NOT EXISTS work_question_bank (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID UNIQUE,                 -- 来源真活（work_tasks.id）；同一道题只沉淀一条，重出 / 修订后更新
  company_id    BIGINT,
  company_name  TEXT,
  industry      TEXT,
  role          TEXT,                        -- 出题人原话「要找什么样的人」
  job_function  TEXT,                        -- 归一后的职能（投资 / 投后 / IR / 研究 …）
  title         TEXT NOT NULL,
  skeleton      JSONB NOT NULL DEFAULT '{}', -- 题骨架：problem_type / stages（步骤结构，不含企业事实）/ deliverables 形态 / rubric 依赖 / materials 形态
  params        JSONB NOT NULL DEFAULT '{}', -- 出题参数：env / minutes / steps / difficulty / focus / sample_id / sample_mode / model
  signals       JSONB NOT NULL DEFAULT '{}', -- 质量信号：baseline_total / sessions / score_avg / score_spread（区分度）/ revisions / last_scored_at
  rating        SMALLINT,                    -- 人工星级 1–5（空 = 没评）
  use_as_ref    BOOLEAN NOT NULL DEFAULT true, -- false = 别再参照（人工标）
  note          TEXT,                        -- 人工备注
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wqb_company ON work_question_bank(company_id);
CREATE INDEX IF NOT EXISTS idx_wqb_industry ON work_question_bank(industry);
CREATE INDEX IF NOT EXISTS idx_wqb_updated ON work_question_bank(updated_at DESC);
ALTER TABLE work_question_bank ENABLE ROW LEVEL SECURITY;
