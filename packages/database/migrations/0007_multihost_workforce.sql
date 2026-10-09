BEGIN;
CREATE TABLE IF NOT EXISTS xspa.workforce_workers (
 company_id uuid NOT NULL REFERENCES xspa.companies(id),
 worker_id uuid NOT NULL,
 owner_key text NOT NULL,
 host_hint text NOT NULL,
 capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
 registered_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,worker_id)
);
CREATE TABLE IF NOT EXISTS xspa.workforce_delegations (
 company_id uuid NOT NULL REFERENCES xspa.companies(id),
 delegation_id uuid NOT NULL,
 source_worker_id uuid NOT NULL,
 target_worker_id uuid NOT NULL,
 work_id uuid NOT NULL,
 idempotency_key text NOT NULL,
 fingerprint text NOT NULL,
 instruction text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','running','completed','failed')),
 lease_generation bigint NOT NULL DEFAULT 0,
 lease_until timestamptz,
 result_text text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,delegation_id),
 UNIQUE(company_id,source_worker_id,idempotency_key),
 FOREIGN KEY(company_id,source_worker_id) REFERENCES xspa.workforce_workers(company_id,worker_id),
 FOREIGN KEY(company_id,target_worker_id) REFERENCES xspa.workforce_workers(company_id,worker_id)
);
CREATE INDEX IF NOT EXISTS workforce_queue_idx ON xspa.workforce_delegations(company_id,target_worker_id,state,created_at);
ALTER TABLE xspa.workforce_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.workforce_workers FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_workers_isolation ON xspa.workforce_workers
 USING(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
ALTER TABLE xspa.workforce_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.workforce_delegations FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_delegations_isolation ON xspa.workforce_delegations
 USING(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
COMMIT;
