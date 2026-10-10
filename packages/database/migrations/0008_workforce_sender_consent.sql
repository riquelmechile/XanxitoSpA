BEGIN;
CREATE TABLE IF NOT EXISTS xspa.workforce_allowed_sources (
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  target_worker_id uuid NOT NULL,
  source_worker_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,target_worker_id,source_worker_id),
  FOREIGN KEY(company_id,target_worker_id) REFERENCES xspa.workforce_workers(company_id,worker_id),
  FOREIGN KEY(company_id,source_worker_id) REFERENCES xspa.workforce_workers(company_id,worker_id)
);
ALTER TABLE xspa.workforce_allowed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.workforce_allowed_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_allowed_sources_isolation ON xspa.workforce_allowed_sources
 USING(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
COMMIT;
