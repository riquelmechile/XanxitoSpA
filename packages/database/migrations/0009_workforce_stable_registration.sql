BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS workforce_workers_registration_idx
ON xspa.workforce_workers(company_id,owner_key,host_hint);
COMMIT;
