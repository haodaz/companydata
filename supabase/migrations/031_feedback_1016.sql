-- 数据部门 2026-10-16 反馈（查企业、岗位反馈-1016.docx）
-- ① 企业库、岗位库的「来源」从单选改多选：TEXT → TEXT[]。
--    原来的组合写法（「潜历二批，ted」）拆成数组；空串当空。
-- ② 岗位库加「查找名称」name_to_search。

DROP INDEX IF EXISTS idx_companies_source;
DROP INDEX IF EXISTS idx_jobs_source;

ALTER TABLE companies ALTER COLUMN source TYPE TEXT[] USING (
  CASE WHEN source IS NULL OR btrim(source) = '' THEN NULL
       ELSE regexp_split_to_array(btrim(source), '\s*[，,、|]\s*') END
);
ALTER TABLE jobs ALTER COLUMN source TYPE TEXT[] USING (
  CASE WHEN source IS NULL OR btrim(source) = '' THEN NULL
       ELSE regexp_split_to_array(btrim(source), '\s*[，,、|]\s*') END
);

CREATE INDEX IF NOT EXISTS idx_companies_source ON companies USING GIN (source);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs USING GIN (source);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name_to_search TEXT;   -- 查找名称（数据部门 10-16 新增）
