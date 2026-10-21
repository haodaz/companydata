-- 科研产品库扩到「软件」「服务」（type software / services；软件是产品、软件开发是服务——用户 10-21）+ 推荐要用的字段 + 产品资料（用户 10-21：这部分数据服务于仪器设备服务的评价 + 资源推荐平台；
--   产品手册 / 规格参数 / 操作手册有的一定带回来——百业虚拟工位那边要用真设备的说明书）
--   type 新增 services（检测、维修、校准、定制合成、平台机时…），kind = service，external_id 前缀 kyfw_（我们提议，待数据部门确认）
-- 可重复执行。

-- 1. 产品：推荐用的字段
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS disciplines TEXT;      -- 适用学科，中文分号隔开
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS applications TEXT;     -- 应用场景，中文分号隔开
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}';   -- 规格参数（参数名 → 值，照官网原文）
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS model_no TEXT;         -- 型号
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS brand_origin TEXT;     -- domestic 国产 | imported 进口
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS service_mode TEXT;     -- 只有服务填：送样检测 / 上门 / 远程 / 驻场 / 平台机时…
ALTER TABLE research_products ADD COLUMN IF NOT EXISTS service_region TEXT;   -- 只有服务填：服务地区
CREATE INDEX IF NOT EXISTS idx_research_products_type ON research_products (type);

-- 2. 产品资料：产品手册 / 规格书 / 操作手册 / 应用文献 / 安全数据表…，文件存进存储桶 research-docs，PDF 另抽全文
CREATE TABLE IF NOT EXISTS research_product_docs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES research_products(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL,        -- brochure 产品手册 | datasheet 规格书 | manual 操作 / 用户手册 | app_note 应用文献 | sds 安全数据表 | coa 质检报告 | other
  title TEXT,
  url TEXT NOT NULL,             -- 官网原始链接
  file_type TEXT,                -- pdf / html / docx …
  size_bytes BIGINT,
  lang TEXT,                     -- zh / en / …
  storage_path TEXT,             -- 存储桶里的路径（下载成功才有）
  text_content TEXT,             -- 抽出来的全文（PDF / 网页）
  pages INTEGER,
  fetched_at TIMESTAMPTZ,
  if_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, url)
);
ALTER TABLE research_product_docs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_research_product_docs_product ON research_product_docs (product_id);
CREATE INDEX IF NOT EXISTS idx_research_product_docs_supplier ON research_product_docs (supplier_id);

-- 3. 存储桶（私有，后台用 service key 读写）
INSERT INTO storage.buckets (id, name, public) VALUES ('research-docs', 'research-docs', false) ON CONFLICT (id) DO NOTHING;
