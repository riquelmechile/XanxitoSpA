BEGIN;

ALTER TABLE xspa.heartbeat_cursors
  ADD COLUMN IF NOT EXISTS fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0);

ALTER TABLE xspa.company_assets
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0 CHECK (version >= 0);

COMMIT;
