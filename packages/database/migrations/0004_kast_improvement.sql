BEGIN;

CREATE TABLE IF NOT EXISTS xspa.session_close_receipts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  session_ref text NOT NULL,
  closed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('complete','partial')),
  business_memory_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  engram_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  kast_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_work_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_session_hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  contains_raw_secrets boolean NOT NULL DEFAULT false CHECK (contains_raw_secrets = false),
  contains_raw_conversation boolean NOT NULL DEFAULT false CHECK (contains_raw_conversation = false),
  UNIQUE(company_id, session_ref)
);

CREATE TABLE IF NOT EXISTS xspa.kast_entries (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  fingerprint text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  summary text NOT NULL,
  reproduction jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  session_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL,
  verification_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('candidate','open','accepted','in-progress','verified','rejected','silent')),
  improvement_work_id uuid,
  regression_guard_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE(company_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS kast_entries_triage_idx ON xspa.kast_entries(company_id, status, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS xspa.kast_occurrences (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  kast_entry_id uuid NOT NULL REFERENCES xspa.kast_entries(id),
  session_ref text NOT NULL,
  observed_at timestamptz NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE(company_id, kast_entry_id, session_ref)
);
CREATE INDEX IF NOT EXISTS kast_occurrences_entry_idx ON xspa.kast_occurrences(company_id, kast_entry_id, observed_at DESC);

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['session_close_receipts','kast_entries','kast_occurrences']
  LOOP
    EXECUTE format('ALTER TABLE xspa.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE xspa.%I FORCE ROW LEVEL SECURITY', table_name);
    policy_name := table_name || '_company_isolation';
    EXECUTE format('DROP POLICY IF EXISTS %I ON xspa.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON xspa.%I USING (company_id = NULLIF(current_setting(''xspa.company_id'', true), '''')::uuid) WITH CHECK (company_id = NULLIF(current_setting(''xspa.company_id'', true), '''')::uuid)',
      policy_name,
      table_name
    );
  END LOOP;
END $$;

COMMIT;
