BEGIN;
CREATE TABLE IF NOT EXISTS xspa.oauth_clients (
 company_id uuid NOT NULL REFERENCES xspa.companies(id),
 client_id text NOT NULL,
 name text NOT NULL,
 redirect_uris jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,client_id)
);
CREATE TABLE IF NOT EXISTS xspa.oauth_grants (
 company_id uuid NOT NULL REFERENCES xspa.companies(id),
 token_hash text NOT NULL,
 grant_type text NOT NULL CHECK(grant_type IN ('authorization_code','refresh_token')),
 client_id text NOT NULL,
 owner_subject text NOT NULL,
 scope text NOT NULL,
 resource text NOT NULL,
 redirect_uri text NOT NULL,
 challenge text NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(company_id,token_hash),
 FOREIGN KEY(company_id,client_id) REFERENCES xspa.oauth_clients(company_id,client_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS oauth_grants_expiry ON xspa.oauth_grants(company_id,expires_at);
ALTER TABLE xspa.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.oauth_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE xspa.oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE xspa.oauth_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_tenant ON xspa.oauth_clients
 USING(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
CREATE POLICY grants_tenant ON xspa.oauth_grants
 USING(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid)
 WITH CHECK(company_id=NULLIF(current_setting('xspa.company_id',true),'')::uuid);
COMMIT;