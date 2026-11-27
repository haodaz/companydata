-- 078 企业库加「是否被抽取过数据」（数据部门 11-27 姜贺）：往平方数据抽数时，首次抽取和再次抽取拉的字段不一样，靠这个区分。
-- 由数据部门的抽取流程自己写（抽完置 true），数据工厂这边不改它。只加一列带默认值，不重写整表。
ALTER TABLE companies ADD COLUMN IF NOT EXISTS if_pulled_data BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN companies.if_pulled_data IS '是否被抽取过数据（数据部门抽取流程维护）';
NOTIFY pgrst, 'reload schema';
