-- 040 Workspace org kind (2026-10-20): company | research (universities, institutes, national labs, new R&D institutions).
-- Research orgs hire PhDs / postdocs / researchers / professors; their know-how checklist and "research work tasks" differ.
ALTER TABLE ws_orgs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'company';
