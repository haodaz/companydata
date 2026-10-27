-- 深度样本挂到实体图谱上（2026-10-24）：职业 / 行业标准 / 来源分类，出题时先按职业取骨架再挑参照
ALTER TABLE work_samples ADD COLUMN IF NOT EXISTS occupation_id INTEGER;            -- occupations.id（按职业名匹配，脚本回填）
ALTER TABLE work_samples ADD COLUMN IF NOT EXISTS occupation_name TEXT;             -- 匹配时的职业名（便于人看）
ALTER TABLE work_samples ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'case';  -- case 咨询 / 面试案例 · takehome 工程作业 · practical 实操考核
ALTER TABLE work_samples ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'; -- 题型 / 技能标签（增长战略、估值、PLC、数控……）
ALTER TABLE work_samples ADD COLUMN IF NOT EXISTS round TEXT;                       -- 训练轮次：r1 = 10-23 负责人两份；r2 = 10-24 批量收集
CREATE INDEX IF NOT EXISTS idx_work_samples_occupation ON work_samples(occupation_id);
CREATE INDEX IF NOT EXISTS idx_work_samples_kind ON work_samples(kind);
