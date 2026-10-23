-- 038 Workspace setup (2026-10-20): any company can onboard step by step.
-- ws_orgs.context = private context (priorities / team / hiring preferences; stays in the workspace, used as AI context).
-- ws_orgs.setup_step = company | context | roles | done (where the setup wizard resumes).
-- ws_roles = roles the enterprise manages (linked to Pingfang jobs / occupations; private notes per role).
-- ws_contributions = public facts the enterprise edited that differ from Pingfang entities -> review queue (write-back).

ALTER TABLE ws_orgs ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE ws_orgs ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ws_orgs ADD COLUMN IF NOT EXISTS setup_step TEXT NOT NULL DEFAULT 'done';

CREATE TABLE IF NOT EXISTS ws_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES ws_orgs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  job_id        INTEGER,
  occupation_id INTEGER,
  city          TEXT,
  jd_text       TEXT,
  notes         JSONB NOT NULL DEFAULT '{}',
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_roles_org ON ws_roles(org_id);
ALTER TABLE ws_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ws_contributions (
  id          BIGSERIAL PRIMARY KEY,
  org_id      UUID REFERENCES ws_orgs(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ws_contrib_status ON ws_contributions(status, created_at DESC);
ALTER TABLE ws_contributions ENABLE ROW LEVEL SECURITY;
