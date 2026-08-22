BEGIN;

ALTER TABLE xspa.idempotency_journal ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE xspa.idempotency_journal ADD COLUMN IF NOT EXISTS fencing_token bigint NOT NULL DEFAULT 0;
ALTER TABLE xspa.idempotency_journal ADD COLUMN IF NOT EXISTS last_error text;

CREATE TABLE IF NOT EXISTS xspa.scheduler_jobs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  materiality text NOT NULL CHECK (materiality IN ('none','low','medium','high')),
  due_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','running','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  lease_owner text,
  lease_until timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduler_jobs_due_idx ON xspa.scheduler_jobs(company_id, state, due_at);

CREATE TABLE IF NOT EXISTS xspa.heartbeat_cursors (
  company_id uuid PRIMARY KEY REFERENCES xspa.companies(id),
  last_event_occurred_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xspa.heartbeat_leases (
  company_id uuid PRIMARY KEY REFERENCES xspa.companies(id),
  lease_owner text,
  lease_until timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xspa.company_assets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  kind text NOT NULL,
  provider_id text,
  capability text NOT NULL,
  department text NOT NULL,
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN ('planned','active','degraded','suspended','retired')),
  credentials_ref text,
  grant_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS company_assets_capability_idx ON xspa.company_assets(company_id, capability, status);

CREATE TABLE IF NOT EXISTS xspa.provider_descriptors (
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  id text NOT NULL,
  capabilities jsonb NOT NULL,
  regions jsonb NOT NULL,
  input_formats jsonb NOT NULL,
  output_formats jsonb NOT NULL,
  estimated_cost numeric NOT NULL CHECK (estimated_cost >= 0),
  latency_p50_ms integer NOT NULL CHECK (latency_p50_ms >= 0),
  latency_p95_ms integer NOT NULL CHECK (latency_p95_ms >= latency_p50_ms),
  reliability double precision NOT NULL CHECK (reliability BETWEEN 0 AND 1),
  quality double precision NOT NULL CHECK (quality BETWEEN 0 AND 1),
  privacy_score double precision NOT NULL CHECK (privacy_score BETWEEN 0 AND 1),
  max_sensitivity text NOT NULL CHECK (max_sensitivity IN ('public','internal','restricted')),
  rate_limit_per_minute integer,
  health text NOT NULL CHECK (health IN ('healthy','degraded','unavailable')),
  credentials_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, id)
);
CREATE INDEX IF NOT EXISTS provider_descriptors_capability_idx ON xspa.provider_descriptors USING gin(capabilities);

-- Every tenant-owned table is protected by the same company scope. Runtime roles
-- must set xspa.company_id transaction-locally before reading or writing.
ALTER TABLE xspa.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_company_isolation ON xspa.companies;
CREATE POLICY companies_company_isolation ON xspa.companies
  USING (id = NULLIF(current_setting('xspa.company_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'works','authority_grants','budget_envelopes','business_events','mission_graphs','mission_runs',
    'idempotency_journal','business_outcomes','business_receipts','corporate_genes','evolution_hypotheses',
    'scheduler_jobs','heartbeat_cursors','heartbeat_leases','company_assets','provider_descriptors'
  ]
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

-- Remove policy names from the initial migration now superseded by the canonical table-based names.
DROP POLICY IF EXISTS events_company_isolation ON xspa.business_events;
DROP POLICY IF EXISTS outcomes_company_isolation ON xspa.business_outcomes;
DROP POLICY IF EXISTS genes_company_isolation ON xspa.corporate_genes;

COMMIT;
