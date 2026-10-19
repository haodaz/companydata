-- 数据部门 10-19《AI工具反馈》岗位字段存法（#13 / #16）：
--   skill_labels：数组 → 中文分号「；」隔开的文本
--   fos_ids / related_career_ids：数组 → 英文 key 用「|」隔开的文本（页面显示中文名）
-- country / province / city 改存选项集编码（#14）不改列类型，由脚本回刷值。
-- 可重复执行：已经是文本的列跳过。

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'skill_labels') = 'ARRAY' THEN
    ALTER TABLE jobs ALTER COLUMN skill_labels DROP DEFAULT;
    ALTER TABLE jobs ALTER COLUMN skill_labels TYPE TEXT USING NULLIF(array_to_string(skill_labels, '；'), '');
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'fos_ids') = 'ARRAY' THEN
    ALTER TABLE jobs ALTER COLUMN fos_ids DROP DEFAULT;
    ALTER TABLE jobs ALTER COLUMN fos_ids TYPE TEXT USING NULLIF(array_to_string(fos_ids, '|'), '');
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'related_career_ids') = 'ARRAY' THEN
    ALTER TABLE jobs ALTER COLUMN related_career_ids DROP DEFAULT;
    ALTER TABLE jobs ALTER COLUMN related_career_ids TYPE TEXT USING NULLIF(array_to_string(related_career_ids, '|'), '');
  END IF;
END $$;
