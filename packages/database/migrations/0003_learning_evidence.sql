ALTER TABLE xspa.corporate_genes
  ADD COLUMN IF NOT EXISTS experience_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN xspa.corporate_genes.experience_refs IS
  'Sanitized execution-trace/artifact references admitted into institutional learning only after verified outcomes.';
