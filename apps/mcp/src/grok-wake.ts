import { randomUUID } from "node:crypto";
import type { PostgresDatabase } from "../../../packages/database/src/postgres.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 5_000;

export interface GrokWakeConfig {
  companyId: string;
  workerId: string;
  webhookUrl: string;
  senderKey: string;
  intervalMs: number;
}

export function loadGrokWakeConfig(
  env: NodeJS.ProcessEnv,
  companyId: string | undefined,
  hasDatabase: boolean,
  oauthConfigured: boolean,
): GrokWakeConfig | null {
  if (env.XSPA_GROK_WAKE_ENABLED !== "true") return null;
  const workerId = env.XSPA_GROK_WAKE_WORKER_ID?.trim() ?? "";
  const urlText = env.XSPA_GROK_WAKE_URL?.trim() ?? "";
  // Cursor supplies an opaque Routine sender key or a ready-to-copy
  // Authorization: Bearer header; there is no documented key prefix.
  const secretInput = env.XSPA_GROK_WAKE_SECRET?.trim() ?? "";
  const senderKey = secretInput.replace(/^(?:Authorization:\s*)?Bearer\s+/i, "");
  if (!hasDatabase || !oauthConfigured || !companyId || !UUID.test(companyId) || !UUID.test(workerId))
    throw Error("XSPA_GROK_WAKE_REQUIRES_OAUTH_DATABASE_AND_WORKER");
  let url: URL;
  try { url = new URL(urlText); } catch { throw Error("XSPA_GROK_WAKE_URL_INVALID"); }
  // Endpoint contract previously observed in Xanxittoo: a native Cursor
  // Routine webhook, not an arbitrary user-supplied URL / generic SSRF proxy.
  if (url.protocol !== "https:" || url.hostname !== "api2.cursor.sh" ||
      url.username || url.password || url.hash || url.port || urlText.length > 1800)
    throw Error("XSPA_GROK_WAKE_URL_NOT_TRUSTED_CURSOR_HOST");
  // Cursor does not document an API-key alphabet, minimum length or prefix.
  // Reject only empty/control-bearing input and let Cursor return 401 for bad
  // credentials. This prevents a miscopied but printable key from crashing the
  // entire OAuth MCP service on boot; no secret is echoed or logged.
  if (!senderKey || senderKey.length > 2048 || /[\x00-\x1f\x7f]/.test(senderKey))
    throw Error("XSPA_GROK_WAKE_SECRET_INVALID");
  const intervalMs = Number(env.XSPA_GROK_WAKE_INTERVAL_MS || "4000");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000)
    throw Error("XSPA_GROK_WAKE_INTERVAL_INVALID");
  return { companyId, workerId, webhookUrl: url.toString(), senderKey, intervalMs };
}

export interface GrokWakeClaim {
  delegationId: string;
  targetWorkerId: string;
  attempts: number;
  leaseToken: string;
}

type WakeRow = {
  delegation_id: string;
  target_worker_id: string;
  attempts: number;
  lease_token: string;
};
type WakeStatusRow = {
  state: string;
  attempts: number;
  last_http_status: number | null;
  last_error_category: string | null;
  accepted_at: Date | null;
  observed_at: Date | null;
  picked_up_at: Date | null;
};

export class PostgresGrokWakeOutbox {
  constructor(private readonly db: PostgresDatabase, private readonly companyId: string) {}

  async claim(workerId: string): Promise<GrokWakeClaim | null> {
    const token = randomUUID();
    return this.db.withCompanyTransaction(this.companyId, async c => {
      // One company+target may dispatch one signal at a time even across
      // multiple Railway replicas: serialize the claim on an advisory xact lock.
      const locked=await c.query<{locked:boolean}>(
        "SELECT pg_try_advisory_xact_lock(hashtext($1),hashtext($2)) AS locked",
        [this.companyId,workerId]);
      if(!locked.rows[0]?.locked)return null;
      // A Routine that repeatedly accepted a webhook but never picked up
      // should not block this worker's queue forever.
      await c.query(`
        UPDATE xspa.workforce_wake_outbox
        SET state='failed',last_error_category='signal_unobserved_after_max_attempts',updated_at=now()
        WHERE company_id=$1 AND target_worker_id=$2
          AND state='accepted' AND attempts >= $3 AND next_attempt_at <= now()
      `,[this.companyId,workerId,MAX_ATTEMPTS]);
      const found = await c.query<WakeRow>(`
        WITH candidate AS (
          SELECT o.delegation_id FROM xspa.workforce_wake_outbox o
          JOIN xspa.workforce_delegations d ON d.company_id=o.company_id AND d.delegation_id=o.delegation_id
          WHERE o.company_id=$1 AND o.target_worker_id=$2 AND d.state='pending'
            AND o.attempts < $4 AND o.created_at > now() - interval '24 hours'
            AND ((o.state='pending' AND o.next_attempt_at<=now())
              OR (o.state='sending' AND o.lease_until<now())
              OR (o.state='accepted' AND o.next_attempt_at<=now()))
            AND NOT EXISTS (
              SELECT 1 FROM xspa.workforce_wake_outbox another
              JOIN xspa.workforce_delegations active
                ON active.company_id=another.company_id AND active.delegation_id=another.delegation_id
              WHERE another.company_id=o.company_id AND another.target_worker_id=o.target_worker_id
                AND another.delegation_id<>o.delegation_id
                AND another.state IN ('accepted','sending')
                AND active.state IN ('pending','running')
            )
          ORDER BY o.created_at,o.delegation_id FOR UPDATE OF o SKIP LOCKED LIMIT 1
        )
        UPDATE xspa.workforce_wake_outbox o SET state='sending', attempts=o.attempts+1,
          lease_token=$3::uuid,lease_until=now()+interval '20 seconds',updated_at=now()
        FROM candidate WHERE o.company_id=$1 AND o.delegation_id=candidate.delegation_id
        RETURNING o.delegation_id,o.target_worker_id,o.attempts,o.lease_token
      `, [this.companyId, workerId, token, MAX_ATTEMPTS]);
      const row = found.rows[0];
      return row ? { delegationId: row.delegation_id, targetWorkerId: row.target_worker_id,
        attempts: row.attempts, leaseToken: row.lease_token } : null;
    });
  }

  async finish(claim: GrokWakeClaim, responseStatus: number | null, errorCategory: string | null): Promise<boolean> {
    const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
    const permanent = responseStatus !== null && [400,401,403,404,405,410,422].includes(responseStatus);
    const terminal = !ok && (permanent || claim.attempts >= MAX_ATTEMPTS);
    const retryDelayMs = ok ? 15 * 60_000 : Math.min(300_000, 5_000 * 2 ** Math.max(0, claim.attempts-1));
    return this.db.withCompanyTransaction(this.companyId, async c => {
      const result = await c.query(`
        UPDATE xspa.workforce_wake_outbox
        SET state=CASE WHEN $7::boolean AND picked_up_at IS NOT NULL THEN 'observed' ELSE $4 END,
          last_http_status=$5,last_error_category=$6,
          accepted_at=CASE WHEN $7::boolean THEN now() ELSE accepted_at END,
          observed_at=CASE WHEN $7::boolean AND picked_up_at IS NOT NULL
            THEN COALESCE(observed_at,now()) ELSE observed_at END,
          next_attempt_at=now()+($8::int*interval '1 millisecond'),
          lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE company_id=$1 AND delegation_id=$2 AND lease_token=$3::uuid AND state='sending'
      `, [this.companyId,claim.delegationId,claim.leaseToken,
        ok?"accepted":terminal?"failed":"pending",responseStatus,errorCategory,ok,retryDelayMs]);
      return result.rowCount===1;
    });
  }

  async status(delegationId: string): Promise<object> {
    return this.db.withCompanyTransaction(this.companyId, async c => {
      const r = await c.query<WakeStatusRow>(`
        SELECT state,attempts,last_http_status,last_error_category,accepted_at,observed_at,picked_up_at
        FROM xspa.workforce_wake_outbox WHERE company_id=$1 AND delegation_id=$2
      `, [this.companyId,delegationId]);
      const row = r.rows[0];
      return row ? { state:row.state, attempts:row.attempts, lastHttpStatus:row.last_http_status,
        lastErrorCategory:row.last_error_category, signalAcceptedAt:row.accepted_at?.toISOString()??null,
        wakeObservedAt:row.observed_at?.toISOString()??null,
        pickupObservedAt:row.picked_up_at?.toISOString()??null, modelExecutionObserved:false }
        : {state:"not-configured",attempts:0,modelExecutionObserved:false};
    });
  }
}

export type WakePoster = (
  url: string, init: RequestInit,
) => Promise<{ status: number }>;

export async function dispatchGrokWakeOnce(
  config: GrokWakeConfig, outbox: PostgresGrokWakeOutbox,
  post: WakePoster = (url, init) => fetch(url, init),
): Promise<{state:string;delegationId?:string;status?:number}> {
  const claim = await outbox.claim(config.workerId);
  if (!claim) return {state:"idle"};
  const payload = {
    source:"xanxitospa",event:"workforce_task_ready",
    delegation_id:claim.delegationId,project:"XanxitoSpA"
  };
  let status:number|null=null,category:string|null=null;
  try {
    const response = await post(config.webhookUrl,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(TIMEOUT_MS),
      headers:{ "content-type":"application/json","authorization":"Bearer "+config.senderKey },
      body:JSON.stringify(payload),
    });
    status=response.status;
    if (status < 200 || status >= 300)
      category=[400,401,403,404,405,410,422].includes(status)?"routine_rejected":"transient_http";
  } catch {
    category="network_or_timeout"; // never put raw URL, key or response into durable state
  }
  await outbox.finish(claim,status,category);
  return {state: status!==null&&status>=200&&status<300?"signal_accepted":"signal_failed",
    delegationId:claim.delegationId,...(status!==null?{status}:{})};
}

export function startGrokWakeDispatcher(
  config: GrokWakeConfig, outbox: PostgresGrokWakeOutbox,
  poster?: WakePoster,
): () => void {
  let stopped=false,running=false;
  const tick=async()=>{
    if(stopped||running)return;
    running=true;
    try { await dispatchGrokWakeOnce(config,outbox,poster); }
    catch(error){console.error("XSPA_GROK_WAKE_DISPATCH_FAILURE",error instanceof Error?error.name:"unknown");}
    finally{running=false;}
  };
  const interval=setInterval(()=>{void tick();},config.intervalMs);
  interval.unref();
  void tick();
  return ()=>{stopped=true;clearInterval(interval);};
}
