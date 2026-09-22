-- ============================================
-- 004: 企业人工审核 + 岗位字段来源
-- ============================================
-- 在 Supabase SQL Editor 中整段执行，可重复执行。

-- 1. 企业人工审核（与岗位 / 院校版 programs 同一套状态与保护规则）
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS human_review_status VARCHAR(20),   -- review 待审核 | complete 审核通过 | rejected 不通过 | incomplete 未更新 | hidden 失效/隐藏
  ADD COLUMN IF NOT EXISTS human_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_review_note TEXT,
  ADD COLUMN IF NOT EXISTS human_locked_fields JSONB DEFAULT '[]';   -- 人工改过的字段，AI 补全不覆盖
CREATE INDEX IF NOT EXISTS idx_companies_review ON companies(human_review_status);

-- 2. 岗位 AI 补全的字段来源：{ field: url }
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_sources JSONB DEFAULT '{}';

-- 3. AI 写入的记录默认「待审核」（历史数据回填）
UPDATE jobs SET human_review_status = 'review' WHERE human_review_status IS NULL;
UPDATE companies SET human_review_status = 'review' WHERE human_review_status IS NULL AND profile_updated_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
