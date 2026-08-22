BEGIN;
CREATE SCHEMA IF NOT EXISTS xspa;

CREATE TABLE IF NOT EXISTS xspa.companies (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  manifest_revision integer NOT NULL DEFAULT 1,
  manifest_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xspa.works (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  owner text NOT NULL,
  objective text NOT NULL,
  scope text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS works_company_state_idx ON xspa.works(company_id, state);

CREATE TABLE IF NOT EXISTS xspa.authority_grants (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  principal text NOT NULL,
  actions jsonb NOT NULL,
  scopes jsonb NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS xspa.budget_envelopes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  department text NOT NULL,
  currency text NOT NULL,
  period_cap numeric NOT NULL CHECK (period_cap >= 0),
  spent numeric NOT NULL DEFAULT 0 CHECK (spent >= 0),
  per_transaction_cap numeric NOT NULL CHECK (per_transaction_cap >= 0),
  policy jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS xspa.business_events (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor_principal text NOT NULL,
  correlation_id uuid NOT NULL,
  causation_id uuid,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  sensitivity text NOT NULL,
  evidence_refs jsonb NOT NULL,
  UNIQUE(company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS business_events_company_time_idx ON xspa.business_events(company_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS xspa.mission_graphs (
  id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  revision integer NOT NULL,
  graph jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id, revision)
);

CREATE TABLE IF NOT EXISTS xspa.mission_runs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  graph_id uuid NOT NULL,
  graph_revision integer NOT NULL,
  state text NOT NULL,
  lease_owner text,
  lease_until timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS xspa.idempotency_journal (
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  idempotency_key text NOT NULL,
  intent jsonb NOT NULL,
  state text NOT NULL,
  result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS xspa.business_outcomes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  work_id uuid NOT NULL REFERENCES xspa.works(id),
  verified boolean NOT NULL,
  dimensions jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  risk_incidents jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS xspa.business_receipts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  work_id uuid NOT NULL REFERENCES xspa.works(id),
  actor text NOT NULL,
  authority_refs jsonb NOT NULL,
  budget_refs jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  outcome_id uuid NOT NULL REFERENCES xspa.business_outcomes(id),
  cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS xspa.corporate_genes (
  id text NOT NULL,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  type text NOT NULL,
  version integer NOT NULL,
  parents jsonb NOT NULL,
  context_signature text NOT NULL,
  artifact_ref text NOT NULL,
  status text NOT NULL,
  fitness jsonb NOT NULL,
  negative_result_refs jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, id, version)
);
CREATE INDEX IF NOT EXISTS corporate_genes_company_status_idx ON xspa.corporate_genes(company_id, status);

CREATE TABLE IF NOT EXISTS xspa.evolution_hypotheses (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  gene_ids jsonb NOT NULL,
  context_signature text NOT NULL,
  hypothesis text NOT NULL,
  state text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

ALTER TABLE xspa.works ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.business_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.corporate_genes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS works_company_isolation ON xspa.works;
CREATE POLICY works_company_isolation ON xspa.works USING (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);
DROP POLICY IF EXISTS events_company_isolation ON xspa.business_events;
CREATE POLICY events_company_isolation ON xspa.business_events USING (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);
DROP POLICY IF EXISTS outcomes_company_isolation ON xspa.business_outcomes;
CREATE POLICY outcomes_company_isolation ON xspa.business_outcomes USING (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);
DROP POLICY IF EXISTS genes_company_isolation ON xspa.corporate_genes;
CREATE POLICY genes_company_isolation ON xspa.corporate_genes USING (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);

COMMIT;
