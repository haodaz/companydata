-- 数据部门姜贺 10-29 #63：岗位的 external_id / applysquare_id 不再由我们按规则生成
-- （我们的 o9y 编号可能和平方原始数据的 applysquare_id 撞上，有错位覆盖风险）。
-- 存量 25,267 条按对方给的对接表赋值（scripts/jobs/assign-applysquare-ids-1029.mts）；以后新岗位这两列留空，由对方抽取时分配。
-- 去掉 012 的岗位触发器（它会把不是「o9y + 12 位小写」的值全部改回随机编号，对方的 14 位编号会被冲掉）。企业那边 018 早已换成 slug 规则，不受影响。
DROP TRIGGER IF EXISTS jobs_o9y_ids ON jobs;
COMMENT ON COLUMN jobs.external_id IS 'flora_external_id：由平方数据分配（10-29 起不再自动生成，与 applysquare_id 同值）';
