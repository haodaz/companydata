-- 021 成本归属（2026-10-12）：用户要看「整个创造、使用过程」花了多少——建一个空间、生一天、出图、出 3D、考试评分、AI 评审各花多少，归到哪个空间。
-- 以前只能按「功能 | 环节」汇总（token_usage_logs 没有空间 / 任务列），出图、视频、3D、全景识别也没记账。
-- 参考了公司 simulator 的做法（出图按张计价、按环节汇总），再往前走一步：每笔记到空间 / 章节 / 任务上。整份可重复执行。

ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS space_id   UUID;   -- 花在哪个空间上（skill_tasks.id）
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS chapter_id UUID;   -- 哪一章（lab_chapters.id）
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS job_id     TEXT;   -- 哪个生成任务（lab_jobs.id 或脚本批次）
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS actor      TEXT;   -- 谁触发的：用户 id / 访客编号 / 脚本名
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS stage      TEXT;   -- 流程环节：create 创造 / use 使用 / review 评审 / media 美术与 3D
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS units      NUMERIC DEFAULT 0;   -- 按件计费的数量（出图张数、视频秒数）
ALTER TABLE token_usage_logs ADD COLUMN IF NOT EXISTS unit       TEXT;   -- image / second
CREATE INDEX IF NOT EXISTS token_usage_logs_space_idx ON token_usage_logs (space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS token_usage_logs_stage_idx ON token_usage_logs (stage, created_at DESC);

-- 价目表：按件计价（出图每张、视频每秒），和 token 单价并列
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS unit       TEXT;

INSERT INTO model_pricing (model_id, provider, currency, input_per_m, output_per_m, search_per_k, unit_price, unit, note) VALUES
  ('wan2.2-t2i-flash', 'Aliyun', 'CNY', 0, 0, 0, 0.14, 'image',  '参考价：通义万相 flash 每张（同公司 simulator）；按百炼账单核对'),
  ('wan2.2-t2i-plus',  'Aliyun', 'CNY', 0, 0, 0, 0.2,  'image',  '参考价：通义万相 plus 每张；按百炼账单核对'),
  ('veo-3.1-fast-generate-preview', 'Google', 'USD', 0, 0, 0, 0.15, 'second', '参考价：Veo 3.1 fast 每秒视频（估），请按 AI Studio 账单核对后在用量页改'),
  ('veo-3.1-generate-preview',      'Google', 'USD', 0, 0, 0, 0.4,  'second', '参考价：Veo 3.1 每秒视频（估），请按账单核对')
ON CONFLICT (model_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
