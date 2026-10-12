-- 020：人工修改留痕（2026-10-12）。平台以后要自己生职人，人每一次怎么改 AI 生成的东西，就是最直接的偏好数据。
-- 工作室保存章节、脚本改库、agent 改库都往这里记一行：改了哪些字段、改前、改后、谁、从哪改的。
-- 可重复执行。
CREATE TABLE IF NOT EXISTS lab_edits (
  id          bigserial PRIMARY KEY,
  task_id     uuid NOT NULL,
  chapter_id  uuid,
  source      text NOT NULL DEFAULT 'studio',   -- studio 工作室 / script 脚本 / agent 生成 agent
  actor       text,                             -- 用户 id / 脚本名
  fields      text[] NOT NULL DEFAULT '{}',     -- 改了哪些字段
  before      jsonb,
  after       jsonb,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_edits_task_idx ON lab_edits (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lab_edits_chapter_idx ON lab_edits (chapter_id, created_at DESC);
