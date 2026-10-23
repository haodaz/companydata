-- 039 Hiring projects (2026-10-20): in the workspace, one hiring = one project (like a Claude project).
-- A project hangs off a role, carries its JD draft and must-haves, and owns its candidates, threads, work tasks and spaces.
-- Candidate stages: new -> screening -> work -> verify -> interview -> offer -> hired | rejected.
-- audit_* = talent verification (Zhichacha 2.0 in datasquare): report id + summary snapshot.

CREATE TABLE IF NOT EXISTS ws_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES ws_orgs(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES ws_roles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  role_title  TEXT,
  headcount   INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'open',
  brief       JSONB NOT NULL DEFAULT '{}',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_projects_org ON ws_projects(org_id, updated_at DESC);
ALTER TABLE ws_projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ws_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES ws_projects(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES ws_orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  contact         TEXT,
  source          TEXT NOT NULL DEFAULT 'upload',
  stage           TEXT NOT NULL DEFAULT 'new',
  resume_text     TEXT,
  resume          JSONB,
  fit             JSONB,
  work_session_id UUID,
  audit_report_id TEXT,
  audit           JSONB,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_candidates_project ON ws_candidates(project_id, stage);
ALTER TABLE ws_candidates ENABLE ROW LEVEL SECURITY;

ALTER TABLE ws_threads  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES ws_projects(id) ON DELETE SET NULL;
ALTER TABLE work_tasks  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES ws_projects(id) ON DELETE SET NULL;
ALTER TABLE skill_tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES ws_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ws_threads_project ON ws_threads(project_id);
