-- ============================================
-- 029: 职业问答日志 + 平方问答库（2026-10-13）
--   用户：「这些用户关心的信息会构成检索日志返回职位库……定期补齐并对信息作质检，数据飞轮又转起来了」；
--         「检索日志单独做一个功能，不要分散在每个职业，方便整体质检、排任务、对 ok 的内容转译入库」。
--   kg_questions     「和我聊」里的每一问一行：问题、回答、来源、是不是平方答不上（缺口）、网上查到了什么；质检状态、任务、入库去向
--   occupation_faqs  平方问答库：质检合格、人工改过的问答（中立表述，不带角色口吻），和我聊的资料里以 [F] 编号引用
-- 在 Supabase SQL Editor 中整段执行，可重复执行。新表开 RLS（不加策略：只有服务端 service role 能读写）。
-- ============================================

CREATE TABLE IF NOT EXISTS kg_questions (
  id SERIAL PRIMARY KEY,
  chat_id UUID,                             -- persona_chats.id
  occupation_id INTEGER REFERENCES occupations(id) ON DELETE SET NULL,
  space_id UUID,                            -- 百业空间（skill_tasks.id）
  surface TEXT,                             -- lab 体验百业 / studio 百业工厂 / admin 后台试聊
  visitor TEXT,
  question TEXT NOT NULL,
  reply TEXT,
  sources JSONB DEFAULT '[]',               -- [{ id, type, title, url }]
  gap TEXT,                                 -- 平方资料答不上、去网上查的问题（为空 = 平方库答得上）
  web JSONB DEFAULT '[]',                   -- 网上查到的要点：[{ id, title, url }] + web_points 文本
  web_points TEXT,
  status TEXT NOT NULL DEFAULT 'new',       -- new 待质检 | ok 合格 | bad 不合格 | task 已排补全任务 | ingested 已转译入库
  qc_note TEXT,
  task_part TEXT,                           -- 排了什么补全：profile / career / regions / context / tasks
  task_at TIMESTAMPTZ,
  faq_id INTEGER,                           -- 转译进了哪条问答
  reviewer TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kg_questions_occ ON kg_questions(occupation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kg_questions_status ON kg_questions(status, created_at DESC);
ALTER TABLE kg_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS occupation_faqs (
  id SERIAL PRIMARY KEY,
  occupation_id INTEGER NOT NULL REFERENCES occupations(id) ON DELETE CASCADE,
  question TEXT NOT NULL,                   -- 规范化的问题
  answer TEXT NOT NULL,                     -- 中立、可核对的回答（不带角色口吻）
  sources JSONB DEFAULT '[]',               -- [{ title, url }]：网上来源 / 平方数据
  from_question_ids INTEGER[] DEFAULT '{}', -- 由哪些问答日志转译来
  status TEXT NOT NULL DEFAULT 'ok',        -- ok 生效 | hidden 停用
  reviewer TEXT,
  if_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_occupation_faqs_occ ON occupation_faqs(occupation_id);
ALTER TABLE occupation_faqs ENABLE ROW LEVEL SECURITY;
