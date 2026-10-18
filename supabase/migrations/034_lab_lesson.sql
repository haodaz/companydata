-- 034 跟我学（2026-10-18）：每一章一份「教案」——每一步先看什么、老手为什么这么做、每个选项对在哪错在哪、工位上一步一步怎么做（引用老手轨迹 / 技能卡 / 标准依据）。
-- 用户：现在「我教你」只是把选择题预填了，「考考你」又手忙脚乱，没有静下来一步一步学的办法。教案由 lib/lab-lesson.ts 生成，存这里；没跑迁移时每次现算不缓存。可重复执行。
ALTER TABLE lab_chapters ADD COLUMN IF NOT EXISTS lesson JSONB;
ALTER TABLE lab_chapters ADD COLUMN IF NOT EXISTS lesson_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
