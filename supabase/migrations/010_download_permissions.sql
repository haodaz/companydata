-- ============================================
-- 010: 数据下载许可 + 下载日志
-- ============================================
-- 管理员（system_users.role = 'admin'）随时可下载，不查本表；
-- 普通用户点下载时向管理员申请，批准后才能下载，管理员可随时收回。
-- 每一次放行的下载都记一条日志：谁、什么时候、下载了什么、筛选条件、服务端导出还是页面生成、IP。
-- 在 Supabase SQL Editor 中整段粘贴执行即可，可重复执行。
--
-- 两张表只通过服务端 SUPABASE_SERVICE_ROLE_KEY 读写（service role 绕过 RLS）；
-- 开启 RLS 且不建策略 = 浏览器端 anon key 无法读写。

-- 下载许可申请：一个用户同一时间最多一条「待审批」或「已批准」的记录；拒绝 / 收回后可重新申请。
CREATE TABLE IF NOT EXISTS download_permissions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  reason        TEXT,                 -- 申请理由
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    UUID REFERENCES system_users(id) ON DELETE SET NULL,
  note          TEXT                  -- 审批备注（拒绝 / 收回理由，申请人能看到）
);

CREATE INDEX IF NOT EXISTS download_permissions_user_idx ON download_permissions (user_id, status);
CREATE INDEX IF NOT EXISTS download_permissions_pending_idx ON download_permissions (status) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS download_permissions_one_open
  ON download_permissions (user_id) WHERE status IN ('pending', 'approved');

ALTER TABLE download_permissions ENABLE ROW LEVEL SECURITY;

-- 下载日志：服务端导出接口 + 浏览器端生成的文件（当前页 CSV、打印）都记
CREATE TABLE IF NOT EXISTS download_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES system_users(id) ON DELETE SET NULL,
  email       TEXT,
  role        TEXT,
  target      TEXT NOT NULL,          -- 下载了什么：接口路径 / 文件名 / 报告
  params      JSONB,                  -- 筛选条件
  via         TEXT NOT NULL DEFAULT 'server' CHECK (via IN ('server', 'client')),
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS download_logs_created_idx ON download_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS download_logs_user_idx ON download_logs (user_id, created_at DESC);

ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE download_permissions IS '数据下载许可：普通用户申请、管理员审批 / 收回；管理员本身不需要许可';
COMMENT ON TABLE download_logs IS '数据下载日志：每一次放行的下载（服务端导出 server / 页面生成 client）';

NOTIFY pgrst, 'reload schema';
