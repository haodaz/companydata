-- 职业的 AI 替代性作为职业实体自己的一项数据（2026-11-01，用户：「把 AI 替代性当作职业 / 行业 / 岗位这些实体的一部分」）
-- 056 建的 lab_ai_change_cache 改名为职业子实体 occupation_ai_exposure（和 occupation_salaries 并列）；行级安全随表保留。
-- 一行 = 一个职业：任务三分（AI 接手 / 人机协作 / 人来做）、新增任务、基准分（程序按三分占比算）、通用强项风险、来源（task_source）、模型、生成时间。
ALTER TABLE IF EXISTS lab_ai_change_cache RENAME TO occupation_ai_exposure;
ALTER TABLE occupation_ai_exposure ENABLE ROW LEVEL SECURITY;
