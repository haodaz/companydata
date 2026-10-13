-- ============================================
-- 025: 职业发展图谱 + 分国家 / 地区薪资（2026-10-13）
--   用户：「打通实体关联（热门公司、岗位），/lab 构建数字职人时的技能树 / 图谱我们也要，单独一个 tab；
--         要有更资深一级的岗位和提升路径；薪资分几个重要国家、地区，不只是北上广」。
--   occupations.career_map           发展图谱：技能树（分层 + 前置关系）、成长阶梯、晋升 / 转型路径（JSON，结构见 src/lib/occupation-fields.ts CareerGraph）
--   occupation_region_salaries       分国家 / 地区月薪：本币 + 折人民币 + 出处
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

ALTER TABLE occupations ADD COLUMN IF NOT EXISTS career_map JSONB;
ALTER TABLE occupations ADD COLUMN IF NOT EXISTS career_map_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS occupation_region_salaries (
  id SERIAL PRIMARY KEY,
  occupation_id INTEGER NOT NULL REFERENCES occupations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,                      -- country（国家 / 地区整体）| cn_region（中国省份 / 城市）
  code TEXT NOT NULL,                       -- 国家 ISO2（CN / US / GB …）或中国地区代码（beijing / guangdong / sichuan …）
  name TEXT,                                -- 显示名
  currency TEXT,                            -- 本币（CNY / USD / GBP …）
  monthly_local INTEGER,                    -- 月薪（本币，税前中位数 / 平均）
  monthly_cny INTEGER,                      -- 折人民币（按 src/lib/occupation-fields.ts 的固定汇率表折算）
  data_year INTEGER,                        -- 数据年份
  source_url TEXT,
  note TEXT,                                -- 口径说明（中位数 / 平均、年薪折月等）
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (occupation_id, scope, code)
);
CREATE INDEX IF NOT EXISTS idx_occupation_region_salaries_occ ON occupation_region_salaries(occupation_id);
ALTER TABLE occupation_region_salaries ENABLE ROW LEVEL SECURITY;
