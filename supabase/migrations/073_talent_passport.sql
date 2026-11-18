-- 人才护照 · 一人一本（2026-11-17）
-- /passport/me 从「全站一本演示护照」升级成「每个管理员账号一本自己的护照」。
-- 只新增：4 张表（passport_items 同时放本人自述和演示签章库里盖进来的演示签章）+ 1 个函数 + 1 个私有存储桶，不改动、不删除任何已有的表、数据、桶。可重复执行。
--
-- 访问方式：所有表开 RLS 且不建任何策略 = anon / authenticated 一律读写不到，
-- 只有服务端（service role，src/lib/supabase.ts 的 supabaseAdmin）经 /api/passport/* 接口读写。
-- 头像桶是私有桶，也不建 storage.objects 策略：服务端上传，按需发短时签名链接给前端显示。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────
-- 1. 护照本身：一个账号一本
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES system_users(id) ON DELETE CASCADE,
  passport_no   TEXT NOT NULL UNIQUE,                 -- TP-XXXX-XXXX
  name          TEXT NOT NULL,                        -- 姓名（建护照时取自账号：system_users 没有姓名列，用邮箱前缀）
  email         TEXT,                                 -- 建护照时的账号邮箱
  nickname      TEXT NOT NULL DEFAULT '',             -- 本人在「我的」里改
  bio           TEXT NOT NULL DEFAULT '',
  visibility    TEXT NOT NULL DEFAULT 'grant'         -- 联系方式可见范围：self 仅自己 | grant 授权后可见 | public 公开
                CHECK (visibility IN ('self', 'grant', 'public')),
  avatar_path   TEXT,                                 -- passport-avatars 桶里的路径；空 = 用默认证件照
  avatar_color  TEXT NOT NULL DEFAULT '#5B4BDB',      -- 证件照底色
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until   DATE NOT NULL DEFAULT ((now() + INTERVAL '10 years')::date),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- 2. 护照里的条目：本人自述（source = self）和从「演示签章库」盖进来的演示签章（source = demo）
--    本人自述：kind / title / org / date_text / link / status 是本人填的，盖在「本人填写」页。
--    演示签章：只存 demo_key（指向代码里 src/app/passport/demo-lib.ts 的预设 claim）和它落在哪一页；
--    签发方、分数、证据等内容由那份预设渲染，护照和抽屉里明确标「演示」，和本人自述、真实签发分开。
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passport_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  claim_no      TEXT NOT NULL UNIQUE,                 -- claim 编号，如 TP-CL-UM3K9QZ
  source        TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'demo')),
  page          TEXT NOT NULL DEFAULT 'self'          -- 落在哪一页
                CHECK (page IN ('self', 'verify', 'ata', 'exp', 'work', 'strength', 'entries')),
  demo_key      TEXT,                                 -- source = demo 时：演示签章库里的哪一个
  kind          TEXT CHECK (kind IN ('exp', 'work', 'cert')),   -- source = self 时：经历 / 作品 / 证书
  title         TEXT NOT NULL DEFAULT '',
  org           TEXT NOT NULL DEFAULT '',
  date_text     TEXT NOT NULL DEFAULT '',             -- 本人写的时间，如 2025.06 或 2024–2025
  link          TEXT,
  status        TEXT NOT NULL DEFAULT 'self'          -- self 本人自述 · 待核验 | review 已申请核验（演示签章恒为 self）
                CHECK (status IN ('self', 'review')),
  verify_requested_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT passport_items_source_shape CHECK (
    (source = 'self' AND kind IS NOT NULL AND page = 'self') OR
    (source = 'demo' AND demo_key IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS passport_items_passport_idx ON passport_items (passport_id, created_at);
-- 同一个演示签章在一本护照里只盖一次
CREATE UNIQUE INDEX IF NOT EXISTS passport_items_demo_once ON passport_items (passport_id, demo_key) WHERE source = 'demo';

-- ────────────────────────────────────────────
-- 3. 分享授权：一条分享链接 = 一行；链接 /passport/s/<token>
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passport_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE CHECK (char_length(token) >= 24),   -- 随机、够长，链接本身就是凭证
  to_name       TEXT NOT NULL DEFAULT '',             -- 给谁
  purpose       TEXT NOT NULL DEFAULT '',
  pages         TEXT[] NOT NULL DEFAULT '{id}',       -- 授权的页：id / self / verify / ata / exp / work / strength / entries
  days          INT NOT NULL CHECK (days BETWEEN 1 AND 365),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  views         INT NOT NULL DEFAULT 0,
  last_view_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_grants_passport_idx ON passport_grants (passport_id, created_at DESC);

-- ────────────────────────────────────────────
-- 4. 去认证的预约（可选）
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passport_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   UUID NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  dest          TEXT NOT NULL,                        -- 去哪儿：ata-exam / ata-ai / baiye / zhenhuo
  slot          TEXT NOT NULL,
  booking_no    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passport_bookings_passport_idx ON passport_bookings (passport_id, created_at DESC);

-- 只走服务端：开 RLS、不建策略
ALTER TABLE passports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_grants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_bookings ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────
-- 5. 分享页打开一次：有效（没撤回、没过期）就查看次数 +1、记最后查看时间，返回这一行；无效什么也不改
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION passport_grant_touch(p_token TEXT)
RETURNS SETOF passport_grants
LANGUAGE sql
AS $$
  UPDATE passport_grants
     SET views = views + 1, last_view_at = now()
   WHERE token = p_token AND revoked_at IS NULL AND expires_at > now()
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION passport_grant_touch(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION passport_grant_touch(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION passport_grant_touch(TEXT) TO service_role;

-- ────────────────────────────────────────────
-- 6. 头像桶：私有，单张 ≤ 2MB，只收 jpg / png / webp
-- ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('passport-avatars', 'passport-avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
