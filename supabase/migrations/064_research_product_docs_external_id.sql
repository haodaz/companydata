-- 数据部门 11-05 #82（姜贺）：research_product_docs 加 external_id（flora_external_id）。
-- 规则同 052 的典型任务 / 行业标准：24 位小写字母 + 数字随机码，在本表内不重复；新行由默认值生成，存量一次补齐（表约 1,200 行）。
ALTER TABLE research_product_docs ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT gen_rand_id(24);
UPDATE research_product_docs SET external_id = gen_rand_id(24) WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_product_docs_external_id ON research_product_docs(external_id);
COMMENT ON COLUMN research_product_docs.external_id IS 'flora_external_id：24 位小写字母 + 数字随机码（数据部门 11-05 #82）';
NOTIFY pgrst, 'reload schema';
