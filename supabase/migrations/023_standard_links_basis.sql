-- 023 依据来源（2026-10-12）：工位的每条规则 / 目标都要说清出处——
--   standard 标准条款（standard_id + clause）| expert 老师傅经验（技能卡里的规则，标准写不出来的手感和判断）| ai AI 推断（要人看）
-- 回挂脚本 scripts/lab-link-standards.mts 写 standard_links；校验器 [S1] / [S2] 按这里查「没有出处」「只有 AI 推断」。可重复执行。
ALTER TABLE standard_links ADD COLUMN IF NOT EXISTS basis TEXT DEFAULT 'standard';
ALTER TABLE standard_links ADD COLUMN IF NOT EXISTS evidence TEXT;   -- 依据原话：标准要点 / 技能卡规则的那一句
CREATE INDEX IF NOT EXISTS idx_standard_links_chapter ON standard_links(chapter_id);
NOTIFY pgrst, 'reload schema';
