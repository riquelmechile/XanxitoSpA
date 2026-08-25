BEGIN;

CREATE TABLE IF NOT EXISTS xspa.signal_source_cursors (
  company_id uuid NOT NULL REFERENCES xspa.companies(id),
  source_id text NOT NULL,
  position text,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, source_id)
);

ALTER TABLE xspa.signal_source_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.signal_source_cursors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_source_cursors_company_isolation ON xspa.signal_source_cursors;
CREATE POLICY signal_source_cursors_company_isolation ON xspa.signal_source_cursors
  USING (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('xspa.company_id', true), '')::uuid);

COMMIT;
