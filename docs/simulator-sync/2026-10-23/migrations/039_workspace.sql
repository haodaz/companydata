-- 037 Baiye enterprise workspace (2026-10-20)
-- Two layers: platform content ops (our admin: lab factory, work task generator, any company) vs enterprise workspace
-- (a business user bound to ONE company; the AI may only generate content about that company).
-- ws_orgs: the enterprise; ws_members: who can enter it; ws_threads: AI conversations (Anthropic message format + title).
-- work_tasks.org_id / skill_tasks.org_id: content created inside a workspace (NULL = platform content).

CREATE TABLE IF NOT EXISTS ws_orgs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  company_id   BIGINT,
  company_name TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ws_orgs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ws_members (
  org_id     UUID NOT NULL REFERENCES ws_orgs(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_ws_members_email ON ws_members(email);
ALTER TABLE ws_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ws_threads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES ws_orgs(id) ON DELETE CASCADE,
  created_by TEXT,
  title      TEXT NOT NULL DEFAULT '',
  messages   JSONB NOT NULL DEFAULT '[]',
  artifacts  JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_threads_org ON ws_threads(org_id, updated_at DESC);
ALTER TABLE ws_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE work_tasks  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES ws_orgs(id) ON DELETE SET NULL;
ALTER TABLE skill_tasks ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES ws_orgs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_tasks_org ON work_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_skill_tasks_org ON skill_tasks(org_id);
