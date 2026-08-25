import type {
  BusinessEvent,
  CompanyAsset,
  FencedLease,
  HeartbeatCursor,
  IdempotencyRecord,
  IdempotencyState,
  ProviderDescriptor,
  ScheduledJob,
  SignalCursor,
} from "../../contracts/src/index.js";

export interface RuntimeStore {
  appendEvent(event: BusinessEvent): Promise<boolean>;
  listEventsAfter(companyId: string, cursor: HeartbeatCursor, limit: number): Promise<BusinessEvent[]>;
  getHeartbeatCursor(companyId: string, now: Date): Promise<HeartbeatCursor>;
  saveHeartbeatCursor(lease: FencedLease, event: BusinessEvent | undefined, now: Date): Promise<boolean>;
  claimHeartbeatLease(companyId: string, owner: string, now: Date, leaseMs: number): Promise<FencedLease | null>;
  isHeartbeatLeaseCurrent(lease: FencedLease, now: Date): Promise<boolean>;
  releaseHeartbeatLease(lease: FencedLease, now: Date): Promise<boolean>;
  getSignalCursor(companyId: string, sourceId: string): Promise<SignalCursor>;
  saveSignalCursor(lease: FencedLease, cursor: SignalCursor, now: Date): Promise<boolean>;

  enqueueJob(job: ScheduledJob): Promise<void>;
  getJob(companyId: string, jobId: string): Promise<ScheduledJob | null>;
  listDueJobs(companyId: string, now: Date, limit: number): Promise<ScheduledJob[]>;
  claimJob(companyId: string, jobId: string, owner: string, now: Date, leaseMs: number): Promise<FencedLease | null>;
  settleJob(lease: FencedLease, state: "completed" | "failed" | "cancelled", now: Date, error?: string): Promise<boolean>;

  claimIdempotency(companyId: string, key: string, intent: unknown, owner: string, now: Date): Promise<{ claimed: boolean; record: IdempotencyRecord }>;
  claimStaleIdempotencyForReconciliation(companyId: string, key: string, resolver: string, now: Date, staleAfterMs: number): Promise<IdempotencyRecord | null>;
  markIdempotency(companyId: string, key: string, owner: string, fencingToken: number, state: Exclude<IdempotencyState, "intent">, now: Date, result?: unknown, error?: string): Promise<boolean>;
  getIdempotency(companyId: string, key: string): Promise<IdempotencyRecord | null>;

  saveAsset(asset: CompanyAsset, expectedVersion?: number): Promise<boolean>;
  saveAssetsAtomically(changes: Array<{ asset: CompanyAsset; expectedVersion: number }>): Promise<boolean>;
  listAssets(companyId: string): Promise<CompanyAsset[]>;
  saveProvider(provider: ProviderDescriptor): Promise<void>;
  listProviders(companyId: string): Promise<ProviderDescriptor[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function eventAfter(event: BusinessEvent, cursor: HeartbeatCursor): boolean {
  if (!cursor.lastEventOccurredAt) return true;
  if (event.occurredAt > cursor.lastEventOccurredAt) return true;
  return event.occurredAt === cursor.lastEventOccurredAt && Boolean(cursor.lastEventId) && event.id > (cursor.lastEventId ?? "");
}

export class InMemoryRuntimeStore implements RuntimeStore {
  readonly events = new Map<string, BusinessEvent>();
  readonly cursors = new Map<string, HeartbeatCursor>();
  readonly heartbeatLeases = new Map<string, FencedLease>();
  readonly signalCursors = new Map<string, SignalCursor & { fencingToken: number }>();
  readonly jobs = new Map<string, ScheduledJob>();
  readonly idempotency = new Map<string, IdempotencyRecord>();
  readonly assets = new Map<string, CompanyAsset>();
  readonly providers = new Map<string, ProviderDescriptor>();

  async appendEvent(event: BusinessEvent): Promise<boolean> {
    const key = `${event.companyId}:${event.idempotencyKey}`;
    if (this.events.has(key)) return false;
    this.events.set(key, clone(event));
    return true;
  }

  async listEventsAfter(companyId: string, cursor: HeartbeatCursor, limit: number): Promise<BusinessEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.companyId === companyId && eventAfter(event, cursor))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(clone);
  }

  async getHeartbeatCursor(companyId: string, now: Date): Promise<HeartbeatCursor> {
    return clone(this.cursors.get(companyId) ?? { companyId, updatedAt: now.toISOString() });
  }

  async saveHeartbeatCursor(lease: FencedLease, event: BusinessEvent | undefined, now: Date): Promise<boolean> {
    if (!(await this.isHeartbeatLeaseCurrent(lease, now))) return false;
    const companyId = lease.companyId;
    const previous = this.cursors.get(companyId);
    if (event && previous?.lastEventOccurredAt && previous.lastEventId) {
      const before = `${previous.lastEventOccurredAt}\u0000${previous.lastEventId}`;
      const candidate = `${event.occurredAt}\u0000${event.id}`;
      if (candidate < before) return false;
    }
    const next: HeartbeatCursor = { companyId, updatedAt: now.toISOString() };
    if (event) {
      next.lastEventOccurredAt = event.occurredAt;
      next.lastEventId = event.id;
    } else if (previous) {
      if (previous.lastEventOccurredAt) next.lastEventOccurredAt = previous.lastEventOccurredAt;
      if (previous.lastEventId) next.lastEventId = previous.lastEventId;
    }
    this.cursors.set(companyId, next);
    return true;
  }

  async claimHeartbeatLease(companyId: string, owner: string, now: Date, leaseMs: number): Promise<FencedLease | null> {
    const current = this.heartbeatLeases.get(companyId);
    const nowMs = now.getTime();
    if (current && Date.parse(current.leaseUntil) > nowMs) return null;
    const lease: FencedLease = {
      companyId,
      resourceType: "heartbeat",
      resourceId: companyId,
      owner,
      fencingToken: (current?.fencingToken ?? 0) + 1,
      leaseUntil: new Date(nowMs + leaseMs).toISOString(),
    };
    this.heartbeatLeases.set(companyId, lease);
    return clone(lease);
  }

  async isHeartbeatLeaseCurrent(lease: FencedLease, now: Date): Promise<boolean> {
    const current = this.heartbeatLeases.get(lease.companyId);
    return Boolean(current && current.owner === lease.owner && current.fencingToken === lease.fencingToken && Date.parse(current.leaseUntil) > now.getTime());
  }

  async releaseHeartbeatLease(lease: FencedLease, now: Date): Promise<boolean> {
    const current = this.heartbeatLeases.get(lease.companyId);
    if (!current || current.owner !== lease.owner || current.fencingToken !== lease.fencingToken) return false;
    this.heartbeatLeases.set(lease.companyId, { ...current, leaseUntil: now.toISOString() });
    return true;
  }

  async getSignalCursor(companyId: string, sourceId: string): Promise<SignalCursor> {
    const current = this.signalCursors.get(`${companyId}:${sourceId}`);
    return current ? { sourceId: current.sourceId, position: current.position } : { sourceId, position: null };
  }

  async saveSignalCursor(lease: FencedLease, cursor: SignalCursor, now: Date): Promise<boolean> {
    if (cursor.sourceId.trim().length === 0) return false;
    if (!(await this.isHeartbeatLeaseCurrent(lease, now))) return false;
    const key = `${lease.companyId}:${cursor.sourceId}`;
    const current = this.signalCursors.get(key);
    if (current && lease.fencingToken < current.fencingToken) return false;
    this.signalCursors.set(key, { ...clone(cursor), fencingToken: lease.fencingToken });
    return true;
  }

  async enqueueJob(job: ScheduledJob): Promise<void> {
    const key = `${job.companyId}:${job.id}`;
    if (!this.jobs.has(key)) this.jobs.set(key, clone(job));
  }

  async getJob(companyId: string, jobId: string): Promise<ScheduledJob | null> {
    const job = this.jobs.get(`${companyId}:${jobId}`);
    return job ? clone(job) : null;
  }

  async listDueJobs(companyId: string, now: Date, limit: number): Promise<ScheduledJob[]> {
    const nowMs = now.getTime();
    return [...this.jobs.values()]
      .filter((job) => job.companyId === companyId && Date.parse(job.dueAt) <= nowMs && (
        job.state === "pending" || job.state === "failed" || (job.state === "running" && (!job.leaseUntil || Date.parse(job.leaseUntil) <= nowMs))
      ))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(clone);
  }

  async claimJob(companyId: string, jobId: string, owner: string, now: Date, leaseMs: number): Promise<FencedLease | null> {
    const key = `${companyId}:${jobId}`;
    const job = this.jobs.get(key);
    if (!job) return null;
    const nowMs = now.getTime();
    if (job.state === "completed" || job.state === "cancelled") return null;
    if (job.state === "running" && job.leaseUntil && Date.parse(job.leaseUntil) > nowMs) return null;
    job.state = "running";
    job.leaseOwner = owner;
    job.leaseUntil = new Date(nowMs + leaseMs).toISOString();
    job.fencingToken += 1;
    job.attempts += 1;
    job.updatedAt = now.toISOString();
    this.jobs.set(key, job);
    return {
      companyId,
      resourceType: "job",
      resourceId: jobId,
      owner,
      fencingToken: job.fencingToken,
      leaseUntil: job.leaseUntil,
    };
  }

  async settleJob(lease: FencedLease, state: "completed" | "failed" | "cancelled", now: Date, error?: string): Promise<boolean> {
    const key = `${lease.companyId}:${lease.resourceId}`;
    const job = this.jobs.get(key);
    if (!job || job.leaseOwner !== lease.owner || job.fencingToken !== lease.fencingToken) return false;
    job.state = state;
    job.leaseUntil = now.toISOString();
    job.updatedAt = now.toISOString();
    if (error !== undefined) job.lastError = error;
    else delete job.lastError;
    this.jobs.set(key, job);
    return true;
  }

  async claimIdempotency(companyId: string, key: string, intent: unknown, owner: string, now: Date): Promise<{ claimed: boolean; record: IdempotencyRecord }> {
    const mapKey = `${companyId}:${key}`;
    const existing = this.idempotency.get(mapKey);
    if (existing) return { claimed: false, record: clone(existing) };
    const record: IdempotencyRecord = {
      companyId,
      idempotencyKey: key,
      intent: clone(intent),
      state: "intent",
      owner,
      fencingToken: 1,
      updatedAt: now.toISOString(),
    };
    this.idempotency.set(mapKey, record);
    return { claimed: true, record: clone(record) };
  }

  async claimStaleIdempotencyForReconciliation(companyId: string, key: string, resolver: string, now: Date, staleAfterMs: number): Promise<IdempotencyRecord | null> {
    const mapKey = `${companyId}:${key}`;
    const record = this.idempotency.get(mapKey);
    if (!record || record.state !== "intent") return null;
    if (Date.parse(record.updatedAt) > (now.getTime() - staleAfterMs)) return null;
    record.state = "unknown";
    record.owner = resolver;
    record.fencingToken += 1;
    record.updatedAt = now.toISOString();
    delete record.result;
    delete record.lastError;
    this.idempotency.set(mapKey, record);
    return clone(record);
  }

  async markIdempotency(companyId: string, key: string, owner: string, fencingToken: number, state: Exclude<IdempotencyState, "intent">, now: Date, result?: unknown, error?: string): Promise<boolean> {
    const mapKey = `${companyId}:${key}`;
    const record = this.idempotency.get(mapKey);
    if (!record || record.owner !== owner || record.fencingToken !== fencingToken) return false;
    record.state = state;
    record.updatedAt = now.toISOString();
    if (result !== undefined) record.result = clone(result);
    else delete record.result;
    if (error !== undefined) record.lastError = error;
    else delete record.lastError;
    this.idempotency.set(mapKey, record);
    return true;
  }

  async getIdempotency(companyId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(`${companyId}:${key}`);
    return record ? clone(record) : null;
  }

  async saveAsset(asset: CompanyAsset, expectedVersion?: number): Promise<boolean> {
    const key = `${asset.companyId}:${asset.id}`;
    const current = this.assets.get(key);
    if (expectedVersion === 0 && current) return false;
    if (expectedVersion !== undefined && expectedVersion > 0 && (!current || (current.version ?? 0) !== expectedVersion)) return false;
    const nextVersion = current ? (current.version ?? 0) + 1 : 1;
    this.assets.set(key, clone({ ...asset, version: nextVersion }));
    return true;
  }

  async saveAssetsAtomically(changes: Array<{ asset: CompanyAsset; expectedVersion: number }>): Promise<boolean> {
    if (changes.length === 0) return true;
    const companyId = changes[0]!.asset.companyId;
    if (changes.some(({ asset }) => asset.companyId !== companyId)) return false;
    if (new Set(changes.map(({ asset }) => asset.id)).size !== changes.length) return false;
    for (const { asset, expectedVersion } of changes) {
      const current = this.assets.get(`${asset.companyId}:${asset.id}`);
      if (expectedVersion === 0 && current) return false;
      if (expectedVersion > 0 && (!current || (current.version ?? 0) !== expectedVersion)) return false;
    }
    for (const { asset } of changes) {
      const key = `${asset.companyId}:${asset.id}`;
      const current = this.assets.get(key);
      this.assets.set(key, clone({ ...asset, version: current ? (current.version ?? 0) + 1 : 1 }));
    }
    return true;
  }

  async listAssets(companyId: string): Promise<CompanyAsset[]> {
    return [...this.assets.values()].filter((asset) => asset.companyId === companyId).map(clone);
  }

  async saveProvider(provider: ProviderDescriptor): Promise<void> {
    this.providers.set(`${provider.companyId}:${provider.id}`, clone(provider));
  }

  async listProviders(companyId: string): Promise<ProviderDescriptor[]> {
    return [...this.providers.values()].filter((provider) => provider.companyId === companyId).map(clone);
  }
}
