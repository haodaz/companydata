-- ============================================
-- 027: 数字职人对话（2026-10-13）
--   用户：「职业 AI 数字人有形象，可以和进入空间的人交流这个职业的背景、发展、在招岗位、操作规范、行业标准、每天的生活……
--          知识库来自平方的职业、行业、公司、岗位、操作手册；AI 角色感要重」。百业工厂和体验百业都要有。
--   occupations.persona   没有百业空间的职业也能聊：生成一次就固定的人设（名字、年资、在哪干、性格、说话方式）
--   persona_chats         每段对话一条：问了什么、答了什么、引用了哪些来源（以后用来训练 / 复盘 / 看大家最关心什么）
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

ALTER TABLE occupations ADD COLUMN IF NOT EXISTS persona JSONB;

CREATE TABLE IF NOT EXISTS persona_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID,                            -- 百业空间（skill_tasks.id），在职业页里聊的为空
  occupation_id INTEGER REFERENCES occupations(id) ON DELETE SET NULL,
  surface TEXT,                             -- 在哪聊的：lab（体验百业）/ studio（百业工厂）/ admin（数据工厂职业页）
  visitor TEXT,                             -- 登录用户邮箱；游客为空
  messages JSONB NOT NULL DEFAULT '[]',     -- [{ role: user|assistant, content, sources?, at }]
  turns INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,                           -- 访客打分（可选）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_persona_chats_space ON persona_chats(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_persona_chats_occ ON persona_chats(occupation_id, created_at DESC);
ALTER TABLE persona_chats ENABLE ROW LEVEL SECURITY;
