-- 015 AI 百业：章节 + 生成任务（2026-10-09，「工作室」改造第 1 步）
--
-- 以前一个空间的整条故事线塞在 skill_tasks.sim 一个字段里，撑不起「一天」，也没法单独改。
-- 现在拆成：空间（skill_tasks，不动）→ 章节（lab_chapters，一段故事线 = 一章）→ 步骤（章节 sim.steps）。
-- 生成进度从服务进程内存挪进 lab_jobs（多副本 / Pod 重启都不丢）。
-- 老空间：现有 sim 原样变成第 1 章，sim 列保留不动；读的时候「有章节读章节、没有就读 sim」，一个不坏。
-- 整份可重复执行（公司那边 CI 的 sync-db 会整份重跑）。

-- 空间设定（一天的大纲、人物表、地点库、要前后一致的事实），第 3 步分层生成时用
ALTER TABLE skill_tasks ADD COLUMN IF NOT EXISTS bible JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS lab_chapters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES skill_tasks(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL DEFAULT 1,            -- 在一天里的顺序（可拖动重排）
  slot          TEXT,                                  -- 时段，如 08:30；「一周 / 项目周期」类职业可写「周一上午」
  title         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'daily' CHECK (kind IN ('daily', 'incident', 'assessment')),  -- 日常 / 突发 / 考核
  brief         TEXT,                                  -- 这一章要交代的事（给生成和编辑看）
  sim           JSONB NOT NULL DEFAULT '{}',           -- 这一章的故事线（Sim：title / intro / steps / art）
  expert_trace  JSONB,                                 -- 这一章的示范轨迹
  rubric        JSONB,                                 -- 这一章单独的评分标准（空 = 用空间的）
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  locked        BOOLEAN NOT NULL DEFAULT FALSE,        -- 锁定后重新生成不动它
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_chapters_task ON lab_chapters(task_id, seq);

-- 作答记在哪一章（空 = 老数据 / 只有一章的空间）
ALTER TABLE skill_submissions ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES lab_chapters(id) ON DELETE SET NULL;

-- 生成任务：每次生成 / 重写都记一条，替代内存里的进度
CREATE TABLE IF NOT EXISTS lab_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id     TEXT UNIQUE,                            -- 前端轮询用的编号
  task_id      UUID REFERENCES skill_tasks(id) ON DELETE CASCADE,
  chapter_id   UUID REFERENCES lab_chapters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'build_space',    -- build_space | build_chapter | rewrite_step | rebuild_bench …
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  phase        TEXT,
  detail       TEXT,
  error        TEXT,
  cost_usd     NUMERIC DEFAULT 0,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lab_jobs_task ON lab_jobs(task_id, created_at DESC);

-- 老空间：现有故事线原样变成第 1 章（已经有章节的跳过，可重复执行）。
-- 第 1 章不复制示范轨迹：expert_trace 留空 = 跟着空间技能走（老师傅重新校正后立刻生效）
INSERT INTO lab_chapters (task_id, seq, title, sim, status)
SELECT t.id, 1, COALESCE(NULLIF(t.sim->>'title', ''), t.title, '第 1 章'), t.sim, 'published'
FROM skill_tasks t
WHERE jsonb_array_length(COALESCE(t.sim->'steps', '[]'::jsonb)) > 0
  AND NOT EXISTS (SELECT 1 FROM lab_chapters c WHERE c.task_id = t.id);

-- 兜底：各处代码（生成接口、预置示范、重建工位 / 刷新美术脚本）还在直接写 skill_tasks.sim，
-- 新建空间自动生成第 1 章；只有一章、且没锁定时，sim 改了同步到第 1 章。代码不用到处改。
CREATE OR REPLACE FUNCTION lab_sync_first_chapter() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_array_length(COALESCE(NEW.sim->'steps', '[]'::jsonb)) = 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NOT EXISTS (SELECT 1 FROM lab_chapters c WHERE c.task_id = NEW.id) THEN
    INSERT INTO lab_chapters (task_id, seq, title, sim, status)
    SELECT NEW.id, 1, COALESCE(NULLIF(NEW.sim->>'title', ''), NEW.title, '第 1 章'), NEW.sim, 'published'
    WHERE NOT EXISTS (SELECT 1 FROM lab_chapters c WHERE c.task_id = NEW.id);
  ELSIF NEW.sim IS DISTINCT FROM OLD.sim AND (SELECT count(*) FROM lab_chapters c WHERE c.task_id = NEW.id) = 1 THEN
    UPDATE lab_chapters SET sim = NEW.sim, updated_at = now() WHERE task_id = NEW.id AND seq = 1 AND NOT locked;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS skill_tasks_first_chapter ON skill_tasks;
CREATE TRIGGER skill_tasks_first_chapter AFTER INSERT OR UPDATE OF sim ON skill_tasks FOR EACH ROW EXECUTE FUNCTION lab_sync_first_chapter();

ALTER TABLE lab_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_jobs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE lab_chapters IS 'AI 百业章节：一段故事线 = 一章；一个职业可以有多章组成「一天」';
COMMENT ON TABLE lab_jobs IS 'AI 百业生成任务：生成 / 重写的状态、进度、费用（替代进程内存）';

NOTIFY pgrst, 'reload schema';
