-- 数据部门 11-10 #87（姜贺）：company_deep_research 加 external_id（flora_external_id）。
-- 规则同 052 / 064：24 位小写字母 + 数字随机码，在本表内不重复；新行由默认值生成，存量一次补齐（表约 530 行）。
ALTER TABLE company_deep_research ADD COLUMN IF NOT EXISTS external_id TEXT DEFAULT gen_rand_id(24);
UPDATE company_deep_research SET external_id = gen_rand_id(24) WHERE external_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_deep_research_external_id ON company_deep_research(external_id);
COMMENT ON COLUMN company_deep_research.external_id IS 'flora_external_id：24 位小写字母 + 数字随机码（数据部门 11-10 #87）';
NOTIFY pgrst, 'reload schema';
