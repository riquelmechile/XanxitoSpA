import { createHash } from "node:crypto";
import type { CompanyConstitution, GovernedWakeResult, ObservedBusinessEvent, WakeAccumulatorState } from "../../contracts/src/index.js";
import type { RuntimeStore } from "../../database/src/index.js";
import { GovernedWakeEngine } from "./governed-wake.js";
import { observedSignalIdempotencyKey, pollObservedBusinessSystem, type BusinessSystemConnector } from "./business-system-connector.js";

export interface ObservedSignalSchedulerPersistence {
  store: RuntimeStore;
  loadConstitution(companyId: string): Promise<CompanyConstitution>;
  loadWakeState(companyId: string): Promise<{ state: WakeAccumulatorState[]; version: number }>;
  persistWakeResult(result: GovernedWakeResult, events: ObservedBusinessEvent[], expectedVersion: number, now: Date): Promise<void>;
}

export interface ObservedSignalPollCycleResult {
  status: "contended" | "processed";
  polledEventCount: number;
  newEventCount: number;
  duplicateEventCount: number;
  proposalCount: number;
}

function fingerprintEvent(event: ObservedBusinessEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

export class GovernedObservedSignalScheduler {
  private readonly engine = new GovernedWakeEngine();

  constructor(private readonly persistence: ObservedSignalSchedulerPersistence) {}

  async pollOnce(input: { companyId: string; connector: BusinessSystemConnector; workerId: string; now?: Date; leaseMs?: number }): Promise<ObservedSignalPollCycleResult> {
    const now = input.now ?? new Date();
    const { store } = this.persistence;
    const lease = await store.claimHeartbeatLease(input.companyId, input.workerId, now, input.leaseMs ?? 30_000);
    if (!lease) return { status: "contended", polledEventCount: 0, newEventCount: 0, duplicateEventCount: 0, proposalCount: 0 };

    try {
      const cursor = await store.getHeartbeatCursor(input.companyId, now);
      const polled = await pollObservedBusinessSystem({
        connector: input.connector,
        companyId: input.companyId,
        cursor: { sourceId: input.connector.id, position: cursor.lastEventId ?? null },
      });
      const fresh: Array<{ event: ObservedBusinessEvent; key: string; owner: string; fencingToken: number }> = [];
      let duplicateEventCount = 0;

      for (const event of polled.events) {
        const key = observedSignalIdempotencyKey(event);
        const owner = `${input.workerId}:observed:${event.id}`;
        const eventFingerprint = fingerprintEvent(event);
        const claim = await store.claimIdempotency(input.companyId, key, { eventFingerprint, attestationRef: event.signal.attestationRef }, owner, now);
        if (!claim.claimed) {
          const prior = claim.record.intent as { eventFingerprint?: unknown };
          if (prior.eventFingerprint !== eventFingerprint) throw new Error(`OBSERVED_SIGNAL_IDEMPOTENCY_CONFLICT:${event.id}`);
          if (claim.record.state === "applied") { duplicateEventCount += 1; continue; }
          throw new Error(`OBSERVED_SIGNAL_RECONCILIATION_REQUIRED:${event.id}`);
        }
        fresh.push({ event, key, owner, fencingToken: claim.record.fencingToken });
      }

      if (fresh.length === 0) {
        const lastEvent = polled.events.at(-1);
        const persisted = await store.saveHeartbeatCursor(lease, lastEvent, new Date());
        if (!persisted) throw new Error("OBSERVED_SIGNAL_STALE_LEASE_CURSOR");
        return { status: "processed", polledEventCount: polled.events.length, newEventCount: 0, duplicateEventCount, proposalCount: 0 };
      }

      let wakePersisted = false;
      try {
        const [constitution, priorWake] = await Promise.all([
          this.persistence.loadConstitution(input.companyId),
          this.persistence.loadWakeState(input.companyId),
        ]);
        const events = fresh.map((item) => item.event);
        const wake = this.engine.evaluate({ companyId: input.companyId, constitution, events, priorState: priorWake.state, now });
        if (!(await store.isHeartbeatLeaseCurrent(lease, new Date()))) throw new Error("OBSERVED_SIGNAL_STALE_LEASE_BEFORE_WAKE_PERSIST");
        await this.persistence.persistWakeResult(wake, events, priorWake.version, now);
        wakePersisted = true;
        for (const item of fresh) {
          const settled = await store.markIdempotency(input.companyId, item.key, item.owner, item.fencingToken, "applied", new Date(), { eventId: item.event.id, attestationRef: item.event.signal.attestationRef });
          if (!settled) throw new Error(`OBSERVED_SIGNAL_IDEMPOTENCY_FENCING_LOST:${item.event.id}`);
        }
        const lastEvent = polled.events.at(-1);
        const cursorSaved = await store.saveHeartbeatCursor(lease, lastEvent, new Date());
        if (!cursorSaved) throw new Error("OBSERVED_SIGNAL_STALE_LEASE_CURSOR");
        return { status: "processed", polledEventCount: polled.events.length, newEventCount: fresh.length, duplicateEventCount, proposalCount: wake.proposals.length };
      } catch (error) {
        for (const item of fresh) {
          const current = await store.getIdempotency(input.companyId, item.key);
          if (current?.state !== "intent") continue;
          await store.markIdempotency(input.companyId, item.key, item.owner, item.fencingToken, wakePersisted ? "unknown" : "failed", new Date(), undefined, error instanceof Error ? error.message.slice(0, 240) : "Observed signal scheduler failed");
        }
        throw error;
      }
    } finally {
      await store.releaseHeartbeatLease(lease, new Date());
    }
  }
}
