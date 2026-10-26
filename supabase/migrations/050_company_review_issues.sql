-- 画像批次验收（10-26）：人工审核企业时勾选问题类型、记下审核人，按批次统计通过率 / 问题分布
-- 只加空列，不改写整表
ALTER TABLE companies ADD COLUMN IF NOT EXISTS human_review_issues text[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS human_review_by text;
NOTIFY pgrst, 'reload schema';
