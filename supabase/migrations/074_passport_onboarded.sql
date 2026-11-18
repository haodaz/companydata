-- 人才护照 · 第一次进来的引导（2026-11-17）
-- 领取仪式 → 设置基础信息 → 写进第一页 → 几步引导，只在这本护照第一次被打开时出现。
-- onboarded_at 为空 = 还没走过引导；本人走完（或跳过）后服务端写入时间。「我的」里的「重看引导」不改这一列。
-- 只新增列，不改动、不删除任何已有的表和数据。可重复执行。
ALTER TABLE passports ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
