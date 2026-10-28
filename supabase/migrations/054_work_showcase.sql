-- 真活任务库（明牌）可以自己长（2026-10-28）：题目资产库里的好题 → 去头（AI 去掉企业名、写展示题面）→ 管理员看过上架。
-- 原来人工整理的 25 道还在 src/lib/work/showcase.json；这张表是新增的，两边合起来就是任务库。
CREATE TABLE IF NOT EXISTS work_showcase (
  id             TEXT PRIMARY KEY,                    -- 短编号（ascii slug）
  source_task_id UUID NOT NULL UNIQUE,                -- 原任务 work_tasks.id（原题直出时回读全文）
  industry       TEXT NOT NULL,
  direction      TEXT,
  role           TEXT,                                -- 要找的人（去头后的说法）
  title          TEXT NOT NULL,
  scenario       TEXT,                                -- 去头后的任务背景
  deliverables   JSONB NOT NULL DEFAULT '[]',         -- [{title, format, module}]
  materials      JSONB NOT NULL DEFAULT '[]',         -- ["材料名（一句话）"]
  time_minutes   INT,
  env            TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',       -- draft 去头了待看 / live 已上架 / hidden 不上
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_showcase_status ON work_showcase(status);
ALTER TABLE work_showcase ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
