import type {
  BusinessEvent,
  FencedLease,
  HeartbeatCursor,
  HeartbeatState,
  ScheduledJob,
} from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";

export interface HeartbeatStore {
  listEventsAfter(companyId: string, cursor: HeartbeatCursor, limit: number): Promise<BusinessEvent[]>;
  getHeartbeatCursor(companyId: string, now: Date): Promise<HeartbeatCursor>;
  saveHeartbeatCursor(lease: FencedLease, event: BusinessEvent | undefined, now: Date): Promise<boolean>;
  claimHeartbeatLease(companyId: string, owner: string, now: Date, leaseMs: number): Promise<FencedLease | null>;
  isHeartbeatLeaseCurrent(lease: FencedLease, now: Date): Promise<boolean>;
  releaseHeartbeatLease(lease: FencedLease, now: Date): Promise<boolean>;
  listDueJobs(companyId: string, now: Date, limit: number): Promise<ScheduledJob[]>;
}

export interface MaterialityPolicy {
  eventTypes: string[];
  minimumJobMateriality: "low" | "medium" | "high";
}

export interface HeartbeatWakeInput {
  companyId: string;
  lease: FencedLease;
  events: BusinessEvent[];
  jobs: ScheduledJob[];
  now: Date;
}

export interface HeartbeatTickResult {
  state: HeartbeatState;
  wakeInvoked: boolean;
  materialEventIds: string[];
  dueJobIds: string[];
  fencingToken?: number;
}

const materialityRank = { none: 0, low: 1, medium: 2, high: 3 } as const;

export function isMaterialEvent(event: BusinessEvent, policy: MaterialityPolicy): boolean {
  if (policy.eventTypes.includes(event.type)) return true;
  if (event.payload && typeof event.payload === "object" && "materiality" in event.payload) {
    const value = (event.payload as { materiality?: unknown }).materiality;
    return value === "medium" || value === "high";
  }
  return false;
}

export function isMaterialJob(job: ScheduledJob, policy: MaterialityPolicy): boolean {
  return materialityRank[job.materiality] >= materialityRank[policy.minimumJobMateriality];
}

export class HeartbeatEngine {
  constructor(
    private readonly store: HeartbeatStore,
    private readonly policy: MaterialityPolicy,
    private readonly wake: (input: HeartbeatWakeInput) => Promise<void>,
    private readonly options: { leaseMs?: number; eventLimit?: number; jobLimit?: number; clock?: () => Date } = {},
  ) {}

  async tick(companyId: string, workerId: string, now = (this.options.clock?.() ?? new Date())): Promise<HeartbeatTickResult> {
    const lease = await this.store.claimHeartbeatLease(companyId, workerId, now, this.options.leaseMs ?? 30_000);
    if (!lease) {
      return { state: "contended", wakeInvoked: false, materialEventIds: [], dueJobIds: [] };
    }

    try {
      const cursor = await this.store.getHeartbeatCursor(companyId, now);
      const [events, jobs] = await Promise.all([
        this.store.listEventsAfter(companyId, cursor, this.options.eventLimit ?? 100),
        this.store.listDueJobs(companyId, now, this.options.jobLimit ?? 100),
      ]);
      const materialEvents = events.filter((event) => isMaterialEvent(event, this.policy));
      const materialJobs = jobs.filter((job) => isMaterialJob(job, this.policy));
      const lastEvent = events.at(-1);

      if (materialEvents.length === 0 && materialJobs.length === 0) {
        const persisted = await this.store.saveHeartbeatCursor(lease, lastEvent, now);
        if (!persisted) throw new DomainError("stale heartbeat lease; cursor not advanced");
        return {
          state: "sleep",
          wakeInvoked: false,
          materialEventIds: [],
          dueJobIds: [],
          fencingToken: lease.fencingToken,
        };
      }

      await this.wake({ companyId, lease, events: materialEvents, jobs: materialJobs, now });
      const completionTime = this.options.clock?.() ?? new Date();
      const persisted = await this.store.saveHeartbeatCursor(lease, lastEvent, completionTime);
      if (!persisted) throw new DomainError("stale heartbeat lease after wake; cursor not advanced");
      return {
        state: "wake",
        wakeInvoked: true,
        materialEventIds: materialEvents.map((event) => event.id),
        dueJobIds: materialJobs.map((job) => job.id),
        fencingToken: lease.fencingToken,
      };
    } finally {
      await this.store.releaseHeartbeatLease(lease, this.options.clock?.() ?? new Date());
    }
  }
}
