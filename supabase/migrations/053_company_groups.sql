-- 集团 / 品牌实体（用户 10-28：需要）：库里很多只有中国子公司 / 分支（毕马威华振、高盛（中国）…），
-- 外部数据（Forage 模拟、海外岗位）说的是集团 / 别国分支，硬挂到中国子公司是错的。
-- 集团本身也是 companies 里的一行（entity_level = 'group'），子公司用 parent_company_id 挂上去；编号规则不变（国家代码.主域名）。
-- 只加两个空列，不改写整表。
ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_level TEXT;   -- 'group' = 集团 / 品牌；空 = 普通企业
ALTER TABLE companies ADD COLUMN IF NOT EXISTS parent_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;   -- 所属集团
CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_company_id);
COMMENT ON COLUMN companies.entity_level IS 'group = 集团 / 品牌实体（迁移 053）；空 = 普通企业';
COMMENT ON COLUMN companies.parent_company_id IS '所属集团（companies.id，entity_level = group 的那一行）';
NOTIFY pgrst, 'reload schema';
