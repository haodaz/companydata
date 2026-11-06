-- 百业工厂 · AI 修改提案（2026-11-06）：人指着一处说「怎么改」，AI 出一版，人看改前改后、采纳才生效。
-- 每条提案都留：改哪一处、人的原话、改前、改后、采没采纳——这是平台以后自己生职人最直接的偏好数据（和 lab_edits 一起看）。
-- 慢的（重建工位，1–3 分钟）在后台跑完把提案写这里，工作室轮询拿到再给人看。
CREATE TABLE IF NOT EXISTS lab_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES skill_tasks(id) ON DELETE CASCADE,
  chapter_id  UUID REFERENCES lab_chapters(id) ON DELETE CASCADE,
  target      TEXT NOT NULL,                 -- step:<步骤 id> / opening（标题 + 开场）/ bench:<步骤 id> / cast:<角色 id>
  instruction TEXT,                          -- 人的原话（含点选的维度）
  before      JSONB,
  after       JSONB,
  note        TEXT,                          -- AI 一句话说改了什么
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('running', 'proposed', 'adopted', 'discarded', 'failed')),
  error       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lab_revisions_task ON lab_revisions(task_id, created_at DESC);
ALTER TABLE lab_revisions ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
