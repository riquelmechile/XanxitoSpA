import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import type {
  BusinessEvent,
  BusinessOutcome,
  BusinessReceipt,
  CompanyAsset,
  CorporateGene,
  FencedLease,
  HeartbeatCursor,
  IdempotencyRecord,
  IdempotencyState,
  MissionGraph,
  ProviderDescriptor,
  ScheduledJob,
  Work,
} from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { CompanyStore } from "./index.js";
import type { RuntimeStore } from "./runtime-store.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertCompanyId(companyId: string): void {
  if (!UUID_RE.test(companyId)) throw new DomainError("invalid company id");
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export class PostgresDatabase {
  readonly pool: Pool;

  constructor(config: string | PoolConfig) {
    this.pool = typeof config === "string" ? new Pool({ connectionString: config }) : new Pool(config);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async withCompanyTransaction<T>(companyId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    assertCompanyId(companyId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('xspa.company_id', $1, true)", [companyId]);
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(migrationsDir = path.resolve(process.cwd(), "packages/database/migrations")): Promise<string[]> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('xspa:migrations'))");
      locked = true;
      await client.query("CREATE SCHEMA IF NOT EXISTS xspa");
      await client.query(`
        CREATE TABLE IF NOT EXISTS xspa.schema_migrations (
          name text PRIMARY KEY,
          checksum text,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query("ALTER TABLE xspa.schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
      const appliedRows = await client.query<{ name: string; checksum: string | null }>("SELECT name,checksum FROM xspa.schema_migrations");
      const applied = new Map(appliedRows.rows.map((row) => [row.name, row.checksum]));
      const files = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
      const executed: string[] = [];
      for (const file of files) {
        const sql = await readFile(path.join(migrationsDir, file), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        if (applied.has(file)) {
          const previous = applied.get(file);
          if (previous === null) {
            await client.query("UPDATE xspa.schema_migrations SET checksum=$2 WHERE name=$1 AND checksum IS NULL", [file, checksum]);
          } else if (previous !== checksum) {
            throw new DomainError(`migration checksum drift detected: ${file}`);
          }
          continue;
        }
        await client.query(sql);
        await client.query("INSERT INTO xspa.schema_migrations(name,checksum) VALUES ($1,$2)", [file, checksum]);
        executed.push(file);
      }
      return executed;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('xspa:migrations'))").catch(() => undefined);
      client.release();
    }
  }

  async ensureCompany(companyId: string, name: string, manifestDigest: string, manifestRevision = 1): Promise<void> {
    await this.withCompanyTransaction(companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.companies(id, name, manifest_revision, manifest_digest)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, manifest_revision=EXCLUDED.manifest_revision, manifest_digest=EXCLUDED.manifest_digest`,
        [companyId, name, manifestRevision, manifestDigest],
      );
    });
  }
}

export class PostgresCompanyStore implements CompanyStore {
  constructor(private readonly db: PostgresDatabase) {}

  async saveWork(work: Work): Promise<void> {
    await this.db.withCompanyTransaction(work.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.works(id,company_id,owner,objective,scope,created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET owner=EXCLUDED.owner, objective=EXCLUDED.objective, scope=EXCLUDED.scope`,
        [work.id, work.companyId, work.owner, work.objective, work.scope, work.createdAt],
      );
    });
  }

  async saveEvent(event: BusinessEvent): Promise<void> {
    await this.db.withCompanyTransaction(event.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.business_events(id,company_id,type,occurred_at,actor_principal,correlation_id,causation_id,idempotency_key,payload,sensitivity,evidence_refs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
         ON CONFLICT (company_id,idempotency_key) DO NOTHING`,
        [event.id, event.companyId, event.type, event.occurredAt, event.actorPrincipal, event.correlationId, event.causationId ?? null, event.idempotencyKey, JSON.stringify(event.payload), event.sensitivity, JSON.stringify(event.evidenceRefs)],
      );
    });
  }

  async saveGraph(graph: MissionGraph): Promise<void> {
    await this.db.withCompanyTransaction(graph.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.mission_graphs(id,company_id,revision,graph)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (id,revision) DO UPDATE SET graph=EXCLUDED.graph`,
        [graph.id, graph.companyId, graph.revision, JSON.stringify(graph)],
      );
    });
  }

  async saveOutcome(outcome: BusinessOutcome): Promise<void> {
    await this.db.withCompanyTransaction(outcome.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.business_outcomes(id,company_id,work_id,verified,dimensions,evidence_refs,cost,risk_incidents,occurred_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9)
         ON CONFLICT (id) DO UPDATE SET verified=EXCLUDED.verified, dimensions=EXCLUDED.dimensions, evidence_refs=EXCLUDED.evidence_refs, cost=EXCLUDED.cost, risk_incidents=EXCLUDED.risk_incidents`,
        [outcome.id, outcome.companyId, outcome.workId, outcome.verified, JSON.stringify(outcome.dimensions), JSON.stringify(outcome.evidenceRefs), outcome.cost, JSON.stringify(outcome.riskIncidents), outcome.occurredAt],
      );
    });
  }

  async saveReceipt(receipt: BusinessReceipt): Promise<void> {
    await this.db.withCompanyTransaction(receipt.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.business_receipts(id,company_id,work_id,actor,authority_refs,budget_refs,evidence_refs,outcome_id,cost,created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET evidence_refs=EXCLUDED.evidence_refs, cost=EXCLUDED.cost`,
        [receipt.id, receipt.companyId, receipt.workId, receipt.actor, JSON.stringify(receipt.authorityRefs), JSON.stringify(receipt.budgetRefs), JSON.stringify(receipt.evidenceRefs), receipt.outcomeId, receipt.cost, receipt.createdAt],
      );
    });
  }

  async saveGene(gene: CorporateGene): Promise<void> {
    await this.db.withCompanyTransaction(gene.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.corporate_genes(id,company_id,type,version,parents,context_signature,artifact_ref,status,fitness,negative_result_refs,experience_refs)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)
         ON CONFLICT (company_id,id,version) DO UPDATE SET status=EXCLUDED.status, fitness=EXCLUDED.fitness, negative_result_refs=EXCLUDED.negative_result_refs, experience_refs=EXCLUDED.experience_refs, updated_at=now()`,
        [gene.id, gene.companyId, gene.type, gene.version, JSON.stringify(gene.parents), gene.contextSignature, gene.artifactRef, gene.status, JSON.stringify(gene.fitness), JSON.stringify(gene.negativeResultRefs), JSON.stringify(gene.experienceRefs)],
      );
    });
  }

  async listGenes(companyId: string): Promise<CorporateGene[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>(
        `SELECT id,company_id,type,version,parents,context_signature,artifact_ref,status,fitness,negative_result_refs,experience_refs
         FROM xspa.corporate_genes WHERE company_id=$1 ORDER BY id,version`,
        [companyId],
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        companyId: String(row.company_id),
        type: row.type as CorporateGene["type"],
        version: Number(row.version),
        parents: jsonArray(row.parents),
        contextSignature: String(row.context_signature),
        artifactRef: String(row.artifact_ref),
        status: row.status as CorporateGene["status"],
        fitness: row.fitness as CorporateGene["fitness"],
        negativeResultRefs: jsonArray(row.negative_result_refs),
        experienceRefs: jsonArray(row.experience_refs),
      }));
    });
  }
}

export class PostgresRuntimeStore implements RuntimeStore {
  constructor(private readonly db: PostgresDatabase) {}

  async appendEvent(event: BusinessEvent): Promise<boolean> {
    return this.db.withCompanyTransaction(event.companyId, async (client) => {
      const result = await client.query(
        `INSERT INTO xspa.business_events(id,company_id,type,occurred_at,actor_principal,correlation_id,causation_id,idempotency_key,payload,sensitivity,evidence_refs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)
         ON CONFLICT (company_id,idempotency_key) DO NOTHING RETURNING id`,
        [event.id, event.companyId, event.type, event.occurredAt, event.actorPrincipal, event.correlationId, event.causationId ?? null, event.idempotencyKey, JSON.stringify(event.payload), event.sensitivity, JSON.stringify(event.evidenceRefs)],
      );
      return result.rowCount === 1;
    });
  }

  async listEventsAfter(companyId: string, cursor: HeartbeatCursor, limit: number): Promise<BusinessEvent[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const params: unknown[] = [companyId, limit];
      let cursorSql = "";
      if (cursor.lastEventOccurredAt && cursor.lastEventId) {
        params.push(cursor.lastEventOccurredAt, cursor.lastEventId);
        cursorSql = "AND (occurred_at, id) > ($3::timestamptz, $4::uuid)";
      }
      const result = await client.query<QueryResultRow>(
        `SELECT id,company_id,type,occurred_at,actor_principal,correlation_id,causation_id,idempotency_key,payload,sensitivity,evidence_refs
         FROM xspa.business_events WHERE company_id=$1 ${cursorSql}
         ORDER BY occurred_at,id LIMIT $2`,
        params,
      );
      return result.rows.map((row) => {
        const event: BusinessEvent = {
          id: String(row.id), companyId: String(row.company_id), type: String(row.type), occurredAt: iso(row.occurred_at) ?? new Date(0).toISOString(),
          actorPrincipal: String(row.actor_principal), correlationId: String(row.correlation_id), idempotencyKey: String(row.idempotency_key),
          payload: row.payload, sensitivity: row.sensitivity as BusinessEvent["sensitivity"], evidenceRefs: jsonArray(row.evidence_refs),
        };
        if (row.causation_id) event.causationId = String(row.causation_id);
        return event;
      });
    });
  }

  async getHeartbeatCursor(companyId: string, now: Date): Promise<HeartbeatCursor> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.heartbeat_cursors WHERE company_id=$1", [companyId]);
      const row = result.rows[0];
      if (!row) return { companyId, updatedAt: now.toISOString() };
      const cursor: HeartbeatCursor = { companyId, updatedAt: iso(row.updated_at) ?? now.toISOString() };
      const occurredAt = iso(row.last_event_occurred_at);
      if (occurredAt) cursor.lastEventOccurredAt = occurredAt;
      if (row.last_event_id) cursor.lastEventId = String(row.last_event_id);
      return cursor;
    });
  }

  async saveHeartbeatCursor(companyId: string, event: BusinessEvent | undefined, now: Date): Promise<void> {
    await this.db.withCompanyTransaction(companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.heartbeat_cursors(company_id,last_event_occurred_at,last_event_id,updated_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id) DO UPDATE SET
           last_event_occurred_at=COALESCE(EXCLUDED.last_event_occurred_at,xspa.heartbeat_cursors.last_event_occurred_at),
           last_event_id=COALESCE(EXCLUDED.last_event_id,xspa.heartbeat_cursors.last_event_id),
           updated_at=EXCLUDED.updated_at`,
        [companyId, event?.occurredAt ?? null, event?.id ?? null, now.toISOString()],
      );
    });
  }

  async claimHeartbeatLease(companyId: string, owner: string, _now: Date, leaseMs: number): Promise<FencedLease | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      await client.query("INSERT INTO xspa.heartbeat_leases(company_id) VALUES ($1) ON CONFLICT DO NOTHING", [companyId]);
      const result = await client.query<QueryResultRow>(
        `UPDATE xspa.heartbeat_leases
         SET lease_owner=$2,
             lease_until=clock_timestamp() + ($3::double precision * interval '1 millisecond'),
             fencing_token=fencing_token+1,
             updated_at=clock_timestamp()
         WHERE company_id=$1 AND (lease_until IS NULL OR lease_until <= clock_timestamp())
         RETURNING fencing_token,lease_until`,
        [companyId, owner, leaseMs],
      );
      const row = result.rows[0];
      return row ? {
        companyId, resourceType: "heartbeat", resourceId: companyId, owner,
        fencingToken: Number(row.fencing_token), leaseUntil: iso(row.lease_until) ?? new Date(0).toISOString(),
      } : null;
    });
  }

  async isHeartbeatLeaseCurrent(lease: FencedLease, _now: Date): Promise<boolean> {
    return this.db.withCompanyTransaction(lease.companyId, async (client) => {
      const result = await client.query(
        `SELECT 1 FROM xspa.heartbeat_leases
         WHERE company_id=$1 AND lease_owner=$2 AND fencing_token=$3 AND lease_until > clock_timestamp()`,
        [lease.companyId, lease.owner, lease.fencingToken],
      );
      return result.rowCount === 1;
    });
  }

  async releaseHeartbeatLease(lease: FencedLease, _now: Date): Promise<boolean> {
    return this.db.withCompanyTransaction(lease.companyId, async (client) => {
      const result = await client.query(
        `UPDATE xspa.heartbeat_leases SET lease_until=clock_timestamp(),updated_at=clock_timestamp()
         WHERE company_id=$1 AND lease_owner=$2 AND fencing_token=$3`,
        [lease.companyId, lease.owner, lease.fencingToken],
      );
      return result.rowCount === 1;
    });
  }

  async enqueueJob(job: ScheduledJob): Promise<void> {
    await this.db.withCompanyTransaction(job.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.scheduler_jobs(id,company_id,kind,payload,materiality,due_at,state,attempts,max_attempts,lease_owner,lease_until,fencing_token,last_error,created_at,updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
        [job.id, job.companyId, job.kind, JSON.stringify(job.payload), job.materiality, job.dueAt, job.state, job.attempts, job.maxAttempts, job.leaseOwner ?? null, job.leaseUntil ?? null, job.fencingToken, job.lastError ?? null, job.createdAt, job.updatedAt],
      );
    });
  }

  async listDueJobs(companyId: string, _now: Date, limit: number): Promise<ScheduledJob[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>(
        `SELECT * FROM xspa.scheduler_jobs
         WHERE company_id=$1 AND due_at <= clock_timestamp() AND attempts < max_attempts AND (
           state IN ('pending','failed') OR (state='running' AND (lease_until IS NULL OR lease_until <= clock_timestamp()))
         ) ORDER BY due_at,id LIMIT $2`,
        [companyId, limit],
      );
      return result.rows.map(jobFromRow);
    });
  }

  async claimJob(companyId: string, jobId: string, owner: string, _now: Date, leaseMs: number): Promise<FencedLease | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>(
        `UPDATE xspa.scheduler_jobs
         SET state='running',lease_owner=$3,
             lease_until=clock_timestamp() + ($4::double precision * interval '1 millisecond'),
             fencing_token=fencing_token+1,attempts=attempts+1,updated_at=clock_timestamp()
         WHERE company_id=$1 AND id=$2 AND attempts < max_attempts AND (
           state IN ('pending','failed') OR (state='running' AND (lease_until IS NULL OR lease_until <= clock_timestamp()))
         ) RETURNING fencing_token,lease_until`,
        [companyId, jobId, owner, leaseMs],
      );
      const row = result.rows[0];
      return row ? { companyId, resourceType: "job", resourceId: jobId, owner, fencingToken: Number(row.fencing_token), leaseUntil: iso(row.lease_until) ?? new Date(0).toISOString() } : null;
    });
  }

  async settleJob(lease: FencedLease, state: "completed" | "failed" | "cancelled", _now: Date, error?: string): Promise<boolean> {
    return this.db.withCompanyTransaction(lease.companyId, async (client) => {
      const result = await client.query(
        `UPDATE xspa.scheduler_jobs SET state=$4,lease_until=clock_timestamp(),last_error=$5,updated_at=clock_timestamp()
         WHERE company_id=$1 AND id=$2 AND lease_owner=$3 AND fencing_token=$6 AND state='running'`,
        [lease.companyId, lease.resourceId, lease.owner, state, error ?? null, lease.fencingToken],
      );
      return result.rowCount === 1;
    });
  }

  async claimIdempotency(companyId: string, key: string, intent: unknown, owner: string, _now: Date): Promise<{ claimed: boolean; record: IdempotencyRecord }> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const insert = await client.query<QueryResultRow>(
        `INSERT INTO xspa.idempotency_journal(company_id,idempotency_key,intent,state,owner,fencing_token,updated_at)
         VALUES ($1,$2,$3::jsonb,'intent',$4,1,clock_timestamp())
         ON CONFLICT (company_id,idempotency_key) DO NOTHING
         RETURNING *`,
        [companyId, key, JSON.stringify(intent), owner],
      );
      if (insert.rows[0]) return { claimed: true, record: idempotencyFromRow(insert.rows[0]) };
      const existing = await client.query<QueryResultRow>("SELECT * FROM xspa.idempotency_journal WHERE company_id=$1 AND idempotency_key=$2", [companyId, key]);
      const row = existing.rows[0];
      if (!row) throw new DomainError("idempotency conflict without durable record");
      return { claimed: false, record: idempotencyFromRow(row) };
    });
  }

  async claimStaleIdempotencyForReconciliation(companyId: string, key: string, resolver: string, _now: Date, staleAfterMs: number): Promise<IdempotencyRecord | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>(
        `UPDATE xspa.idempotency_journal
         SET state='unknown',owner=$3,fencing_token=fencing_token+1,result=NULL,last_error=NULL,updated_at=clock_timestamp()
         WHERE company_id=$1 AND idempotency_key=$2 AND state='intent'
           AND updated_at <= clock_timestamp() - ($4::double precision * interval '1 millisecond')
         RETURNING *`,
        [companyId, key, resolver, staleAfterMs],
      );
      return result.rows[0] ? idempotencyFromRow(result.rows[0]) : null;
    });
  }

  async markIdempotency(companyId: string, key: string, owner: string, fencingToken: number, state: Exclude<IdempotencyState, "intent">, _now: Date, resultValue?: unknown, error?: string): Promise<boolean> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query(
        `UPDATE xspa.idempotency_journal SET state=$5,result=$6::jsonb,last_error=$7,updated_at=clock_timestamp()
         WHERE company_id=$1 AND idempotency_key=$2 AND owner=$3 AND fencing_token=$4`,
        [companyId, key, owner, fencingToken, state, resultValue === undefined ? null : JSON.stringify(resultValue), error ?? null],
      );
      return result.rowCount === 1;
    });
  }

  async getIdempotency(companyId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.idempotency_journal WHERE company_id=$1 AND idempotency_key=$2", [companyId, key]);
      return result.rows[0] ? idempotencyFromRow(result.rows[0]) : null;
    });
  }

  async saveAsset(asset: CompanyAsset): Promise<void> {
    await this.db.withCompanyTransaction(asset.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.company_assets(id,company_id,kind,provider_id,capability,department,cost,currency,status,credentials_ref,grant_refs,restrictions,metadata,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15)
         ON CONFLICT (id) DO UPDATE SET provider_id=EXCLUDED.provider_id,capability=EXCLUDED.capability,department=EXCLUDED.department,cost=EXCLUDED.cost,currency=EXCLUDED.currency,status=EXCLUDED.status,credentials_ref=EXCLUDED.credentials_ref,grant_refs=EXCLUDED.grant_refs,restrictions=EXCLUDED.restrictions,metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at`,
        [asset.id, asset.companyId, asset.kind, asset.providerId ?? null, asset.capability, asset.department, asset.cost, asset.currency, asset.status, asset.credentialsRef ?? null, JSON.stringify(asset.grantRefs), JSON.stringify(asset.restrictions), JSON.stringify(asset.metadata), asset.createdAt, asset.updatedAt],
      );
    });
  }

  async listAssets(companyId: string): Promise<CompanyAsset[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.company_assets WHERE company_id=$1 ORDER BY created_at,id", [companyId]);
      return result.rows.map(assetFromRow);
    });
  }

  async saveProvider(provider: ProviderDescriptor): Promise<void> {
    await this.db.withCompanyTransaction(provider.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.provider_descriptors(company_id,id,capabilities,regions,input_formats,output_formats,estimated_cost,latency_p50_ms,latency_p95_ms,reliability,quality,privacy_score,max_sensitivity,rate_limit_per_minute,health,credentials_ref,metadata)
         VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
         ON CONFLICT (company_id,id) DO UPDATE SET capabilities=EXCLUDED.capabilities,regions=EXCLUDED.regions,input_formats=EXCLUDED.input_formats,output_formats=EXCLUDED.output_formats,estimated_cost=EXCLUDED.estimated_cost,latency_p50_ms=EXCLUDED.latency_p50_ms,latency_p95_ms=EXCLUDED.latency_p95_ms,reliability=EXCLUDED.reliability,quality=EXCLUDED.quality,privacy_score=EXCLUDED.privacy_score,max_sensitivity=EXCLUDED.max_sensitivity,rate_limit_per_minute=EXCLUDED.rate_limit_per_minute,health=EXCLUDED.health,credentials_ref=EXCLUDED.credentials_ref,metadata=EXCLUDED.metadata,updated_at=now()`,
        [provider.companyId, provider.id, JSON.stringify(provider.capabilities), JSON.stringify(provider.regions), JSON.stringify(provider.inputFormats), JSON.stringify(provider.outputFormats), provider.estimatedCost, provider.latencyP50Ms, provider.latencyP95Ms, provider.reliability, provider.quality, provider.privacyScore, provider.maxSensitivity, provider.rateLimitPerMinute ?? null, provider.health, provider.credentialsRef ?? null, JSON.stringify(provider.metadata)],
      );
    });
  }

  async listProviders(companyId: string): Promise<ProviderDescriptor[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.provider_descriptors WHERE company_id=$1 ORDER BY id", [companyId]);
      return result.rows.map(providerFromRow);
    });
  }
}

function jobFromRow(row: QueryResultRow): ScheduledJob {
  const job: ScheduledJob = {
    id: String(row.id), companyId: String(row.company_id), kind: String(row.kind), payload: row.payload,
    materiality: row.materiality as ScheduledJob["materiality"], dueAt: iso(row.due_at) ?? new Date(0).toISOString(),
    state: row.state as ScheduledJob["state"], attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts),
    fencingToken: Number(row.fencing_token), createdAt: iso(row.created_at) ?? new Date(0).toISOString(), updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
  if (row.lease_owner) job.leaseOwner = String(row.lease_owner);
  const leaseUntil = iso(row.lease_until); if (leaseUntil) job.leaseUntil = leaseUntil;
  if (row.last_error) job.lastError = String(row.last_error);
  return job;
}

function idempotencyFromRow(row: QueryResultRow): IdempotencyRecord {
  const record: IdempotencyRecord = {
    companyId: String(row.company_id), idempotencyKey: String(row.idempotency_key), intent: row.intent,
    state: row.state as IdempotencyState, fencingToken: Number(row.fencing_token), updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
  if (row.owner) record.owner = String(row.owner);
  if (row.result !== null && row.result !== undefined) record.result = row.result;
  if (row.last_error) record.lastError = String(row.last_error);
  return record;
}

function assetFromRow(row: QueryResultRow): CompanyAsset {
  const asset: CompanyAsset = {
    id: String(row.id), companyId: String(row.company_id), kind: String(row.kind), capability: String(row.capability), department: String(row.department),
    cost: Number(row.cost), currency: String(row.currency), status: row.status as CompanyAsset["status"], grantRefs: jsonArray(row.grant_refs),
    restrictions: jsonArray(row.restrictions), metadata: (row.metadata ?? {}) as Record<string, unknown>, createdAt: iso(row.created_at) ?? new Date(0).toISOString(), updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
  if (row.provider_id) asset.providerId = String(row.provider_id);
  if (row.credentials_ref) asset.credentialsRef = String(row.credentials_ref);
  return asset;
}

function providerFromRow(row: QueryResultRow): ProviderDescriptor {
  const provider: ProviderDescriptor = {
    id: String(row.id), companyId: String(row.company_id), capabilities: jsonArray(row.capabilities), regions: jsonArray(row.regions),
    inputFormats: jsonArray(row.input_formats), outputFormats: jsonArray(row.output_formats), estimatedCost: Number(row.estimated_cost),
    latencyP50Ms: Number(row.latency_p50_ms), latencyP95Ms: Number(row.latency_p95_ms), reliability: Number(row.reliability), quality: Number(row.quality),
    privacyScore: Number(row.privacy_score), maxSensitivity: row.max_sensitivity as ProviderDescriptor["maxSensitivity"], health: row.health as ProviderDescriptor["health"],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
  if (row.rate_limit_per_minute !== null && row.rate_limit_per_minute !== undefined) provider.rateLimitPerMinute = Number(row.rate_limit_per_minute);
  if (row.credentials_ref) provider.credentialsRef = String(row.credentials_ref);
  return provider;
}
