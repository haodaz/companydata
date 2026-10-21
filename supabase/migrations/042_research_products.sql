-- 科研仪器 / 试剂耗材（数据部门 10-21 #21）：
--   企业上记「仪器类目」——后台「科研仪器厂商」就是企业实体库按这列筛出来的视图（用户 10-21 定）
--   产品单独一张表，字段按数据部门《CRMProduct_仪器耗材试剂_字段》：brand / description（不含图视频的 html）/ external_id / labels（「；」）/
--   name / price / specification / status（notShelf | onShelf，默认 onShelf）/ supplier_id（关联企业）/ type（instruments_and_equipment | reagents_and_consumables）
--   external_id = 前缀 + 16 位小写字母数字：科研仪器设备 kyyq_ / 科研耗材 kyhc_ / 科研试剂 kysj_（所以另存 kind 区分耗材和试剂）
-- 可重复执行。

ALTER TABLE companies ADD COLUMN IF NOT EXISTS supplier_categories TEXT[] DEFAULT '{}';   -- 仪器类目（15 类科研仪器 + 7 类试剂耗材的 key）
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supplier_exhibitions TEXT[] DEFAULT '{}';  -- 参加的展会（analytica / ACHEMA / Pittcon / MEDICA / CES / BCEIA …）
CREATE INDEX IF NOT EXISTS idx_companies_supplier_categories ON companies USING GIN (supplier_categories);

CREATE TABLE IF NOT EXISTS research_products (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,                    -- kyyq_ / kyhc_ / kysj_ + 16 位随机码
  name TEXT NOT NULL,                         -- 名称（必填）
  brand TEXT,                                 -- 品牌
  description TEXT,                           -- 简介：不含图、视频的 html 富文本
  labels TEXT,                                -- 标签：中文分号隔开（3–5 个，每个 ≤ 8 字）
  price TEXT,                                 -- 价格（原文写法，如「询价」「¥ 12,800」）
  specification TEXT,                         -- 规格 / 型号
  status TEXT DEFAULT 'onShelf',              -- notShelf 未上架 | onShelf 已上架
  supplier_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,   -- 供应商（关联企业）
  type TEXT NOT NULL,                         -- instruments_and_equipment | reagents_and_consumables
  -- 我们自己的字段
  kind TEXT,                                  -- instrument | consumable | reagent（决定 external_id 前缀）
  category TEXT,                              -- 22 类里的哪一类（key）
  source_url TEXT,                            -- 产品页
  ai_sources JSONB DEFAULT '{}',
  dedupe_key TEXT UNIQUE,                     -- 供应商 + 名称 + 规格
  human_review_status TEXT DEFAULT 'review',
  human_locked_fields TEXT[] DEFAULT '{}',
  if_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE research_products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_research_products_supplier ON research_products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_research_products_category ON research_products (category);
