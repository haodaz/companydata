-- 045 AI 大学（/college）申请线索（2026-10-21）
-- 两种申请：enroll = 申请模型入学（训练目标、模型接口说明）；hire = 人才培养需求（企业信息、岗位信息）。
-- 提交了就算收集到一个客户线索，平方的同事在 /admin/college-leads 里看、跟进；这里不直接训练。
-- 不用登录就能提交（只为收集客户）；同事登录着提交时 user_id 记上账号。
-- 模型密钥不在这里收：表单只要接口形式和地址，对接时单独联系。

CREATE TABLE IF NOT EXISTS college_applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('enroll', 'hire')),
  user_id     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  email       TEXT,                                  -- 表单里留的邮箱（没填就用登录账号的）
  org         TEXT,                                  -- 机构 / 企业名称
  contact     TEXT,                                  -- 联系人
  phone       TEXT,                                  -- 手机 / 微信
  title       TEXT,                                  -- enroll：模型名称；hire：岗位名称
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 其余表单字段原样存
  source      TEXT,                                  -- 从哪儿点进来的（如 ?from=<毕业生 id>）
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'closed')),
  note        TEXT,                                  -- 跟进备注（内部）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS college_applications_created_idx ON college_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS college_applications_user_idx ON college_applications (user_id);

-- 只走 service role（接口里限频防刷），不给 anon / authenticated 任何直连权限
ALTER TABLE college_applications ENABLE ROW LEVEL SECURITY;
