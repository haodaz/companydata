-- 百业学院 · 方法课学分记在学员身上（2026-11-03，用户：科研方向的方法课像专业基础课，跨方向互认）
-- 以前「修过的方法课」记在学籍（学员 × 一门课）的 notebook.methods 里，同一个模型换一个科研方向要重修。
-- 现在记在学员上：{ 方法 key: { name, studied_at, from_enrollment, exams: [{ enrollment, chapter, score, at }] } }。
-- 某门课用得上的方法（按空间对上的），只要学员修过就自动装上。
ALTER TABLE college_students ADD COLUMN IF NOT EXISTS method_credits JSONB NOT NULL DEFAULT '{}'::jsonb;
