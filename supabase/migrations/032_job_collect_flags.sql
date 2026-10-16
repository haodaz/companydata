-- 岗位「采集标记」：我们自己的采集状态，不和数据部门的标签字段混用（2026-10-16，百度精细采集）
-- 取值：仅列表信息 / 重点岗位 / 详情已补 / 支持内推码 …
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS collect_flags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_jobs_collect_flags ON jobs USING GIN (collect_flags);
