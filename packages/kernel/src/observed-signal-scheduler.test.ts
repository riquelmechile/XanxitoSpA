import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStore } from "../../database/src/index.js";
import type { CompanyConstitution, ObservedBusinessEvent, WakeAccumulatorState } from "../../contracts/src/index.js";
import type { BusinessSystemConnector } from "./business-system-connector.js";
import { ManifestBusinessSystemConnector, observedSignalIdempotencyKey, pollObservedBusinessSystem } from "./business-system-connector.js";
import { GovernedObservedSignalScheduler } from "./observed-signal-scheduler.js";

const companyId = "11111111-1111-4111-8111-111111111111";

function connector(): BusinessSystemConnector {
  return new ManifestBusinessSystemConnector({
    id: "system:test",
    label: "Test system",
    kind: "test",
    confidence: 1,
    signalCapabilities: [{ name: "ops.event", description: "Ops event", criticality: "important", confidence: 1 }],
  }, {
    poll: async (cursor) => ({
      events: cursor.position ? [] : [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        companyId,
        type: "ops.event",
        occurredAt: "2026-08-25T20:00:00.000Z",
        actorPrincipal: "system:test",
        correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        idempotencyKey: "raw:ops:event:1",
        payload: {},
        sensitivity: "internal",
        evidenceRefs: [],
        signalTopic: "ops.event",
        signalCapability: "ops.event",
      }],
      cursor: { sourceId: "system:test", position: "1" },
    }),
  });
}

const constitution = {
  companyId,
  objectives: [],
  authorityPolicies: [],
  reservedActions: [],
  escalationRules: [],
  signalSources: [],
  subscriptions: [],
  grantsAuthority: false,
  grantsBudget: false,
  grantsCapabilities: false,
} as unknown as CompanyConstitution;

describe("GovernedObservedSignalScheduler", () => {
  it("attests, durably claims, evaluates once, then advances the fenced cursor", async () => {
    const store = new InMemoryRuntimeStore();
    const evaluated: ObservedBusinessEvent[][] = [];
    const scheduler = new GovernedObservedSignalScheduler({
      store,
      loadConstitution: async () => constitution,
      loadWakeState: async () => ({ state: [] as WakeAccumulatorState[], version: 0 }),
      persistWakeResult: async (_result, events) => { evaluated.push(events); },
    });
    const first = await scheduler.pollOnce({ companyId, connector: connector(), workerId: "worker-a", now: new Date("2026-08-25T20:01:00.000Z"), leaseMs: 86_400_000 });
    expect(first.status).toBe("processed");
    expect(first.newEventCount).toBe(1);
    expect(evaluated).toHaveLength(1);
    const cursor = await store.getSignalCursor(companyId, "system:test");
    expect(cursor.position).toBe("1");
    const replay = await scheduler.pollOnce({ companyId, connector: connector(), workerId: "worker-b", now: new Date("2026-08-25T20:02:00.000Z"), leaseMs: 86_400_000 });
    expect(replay.newEventCount).toBe(0);
    expect(evaluated).toHaveLength(1);
  });

  it("fails closed when another daemon owns the heartbeat lease", async () => {
    const store = new InMemoryRuntimeStore();
    const held = await store.claimHeartbeatLease(companyId, "other", new Date("2026-08-25T20:00:00.000Z"), 60_000);
    expect(held).not.toBeNull();
    const scheduler = new GovernedObservedSignalScheduler({
      store,
      loadConstitution: async () => constitution,
      loadWakeState: async () => ({ state: [], version: 0 }),
      persistWakeResult: async () => undefined,
    });
    const result = await scheduler.pollOnce({ companyId, connector: connector(), workerId: "worker-a", now: new Date("2026-08-25T20:00:10.000Z") });
    expect(result.status).toBe("contended");
  });

  it("does not advance cursor past an event that requires reconciliation", async () => {
    const store = new InMemoryRuntimeStore();
    const firstConnector = connector();
    const observed = await pollObservedBusinessSystem({ connector: firstConnector, companyId, cursor: { sourceId: firstConnector.id, position: null } });
    const event = observed.events[0]!;
    const key = observedSignalIdempotencyKey(event);
    const eventFingerprint = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(event)).digest("hex");
    const claim = await store.claimIdempotency(companyId, key, { eventFingerprint, attestationRef: event.signal.attestationRef }, "old-worker", new Date("2026-08-25T19:00:00.000Z"));
    expect(claim.claimed).toBe(true);
    await store.markIdempotency(companyId, key, "old-worker", claim.record.fencingToken, "unknown", new Date("2026-08-25T19:01:00.000Z"), undefined, "uncertain");
    const scheduler = new GovernedObservedSignalScheduler({
      store,
      loadConstitution: async () => constitution,
      loadWakeState: async () => ({ state: [], version: 0 }),
      persistWakeResult: async () => undefined,
    });
    await expect(scheduler.pollOnce({ companyId, connector: firstConnector, workerId: "worker-a", now: new Date("2026-08-25T20:03:00.000Z"), leaseMs: 86_400_000 })).rejects.toThrow(/OBSERVED_SIGNAL_RECONCILIATION_REQUIRED/);
    const cursor = await store.getSignalCursor(companyId, "system:test");
    expect(cursor.position).toBeNull();
  });
});
