BEGIN;
-- Grok Bot receives a pointer-only doorbell. Company Work remains the sole
-- instruction source and worker OAuth remains the execution authority.
CREATE TABLE IF NOT EXISTS xspa.workforce_wake_outbox (
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  delegation_id uuid NOT NULL,
  target_worker_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','sending','accepted','observed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 12),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_http_status integer,
  last_error_category text,
  accepted_at timestamptz,
  observed_at timestamptz,
  picked_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, delegation_id)
);
CREATE INDEX IF NOT EXISTS workforce_wake_due
  ON xspa.workforce_wake_outbox(company_id,next_attempt_at,created_at)
  WHERE state IN ('pending','sending');
ALTER TABLE xspa.workforce_wake_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.workforce_wake_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_wake_tenant ON xspa.workforce_wake_outbox
 USING (company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK (company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
COMMIT;
