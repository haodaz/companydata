-- 数据部门 10-20《AI工具反馈》#15 #17：潜历标签存 value（页面显示中文名）
--   qianli_job_labels              职能标签，一般只有一个 → 文本（单个 value，如 mgmt_trainee）
--   qianli_job_specialty_labels    特色标签一级，可多个 → 文本，value 用「|」隔开（如 study_abroad|growth）
--   qianli_specialty_labels_reason 特色标签二级，可多个 → 文本，value 用「|」隔开（原来是 TEXT，存的是中文依据，清空重打）
-- 原来存的都是中文名，这里先清空，由 scripts/fix-1020.mts 按数据部门的提示词重新打。可重复执行。

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'qianli_job_labels') = 'ARRAY' THEN
    ALTER TABLE jobs ALTER COLUMN qianli_job_labels DROP DEFAULT;
    ALTER TABLE jobs ALTER COLUMN qianli_job_labels TYPE TEXT USING NULL;
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'qianli_job_specialty_labels') = 'ARRAY' THEN
    ALTER TABLE jobs ALTER COLUMN qianli_job_specialty_labels DROP DEFAULT;
    ALTER TABLE jobs ALTER COLUMN qianli_job_specialty_labels TYPE TEXT USING NULL;
    UPDATE jobs SET qianli_specialty_labels_reason = NULL;
  END IF;
END $$;
