import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStore } from "../../database/src/index.js";
import type { CompanyConstitution, WakeAccumulatorState } from "../../contracts/src/index.js";
import { ManifestBusinessSystemConnector, type BusinessSystemConnector } from "./business-system-connector.js";
import { BusinessSystemConnectorRegistry, GovernedObservedSignalDaemon } from "./business-system-registry.js";
import { GovernedObservedSignalScheduler } from "./observed-signal-scheduler.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const constitution = {
  companyId,
  objectives: [], authorityPolicies: [], reservedActions: [], escalationRules: [], signalSources: [], subscriptions: [],
  grantsAuthority: false, grantsBudget: false, grantsCapabilities: false,
} as unknown as CompanyConstitution;

function connector(id: string, eventId: string, seen: Array<string | null>): BusinessSystemConnector {
  return new ManifestBusinessSystemConnector({
    id, label: id, kind: "test", confidence: 1,
    signalCapabilities: [{ name: "ops.event", description: "Ops event", criticality: "important", confidence: 1 }],
  }, {
    poll: async (cursor) => {
      seen.push(cursor.position);
      return {
        events: cursor.position ? [] : [{
          id: eventId, companyId, type: "ops.event", occurredAt: "2026-08-25T20:00:00.000Z",
          actorPrincipal: id, correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", idempotencyKey: `raw:${id}:${eventId}`,
          payload: {}, sensitivity: "internal", evidenceRefs: [], signalTopic: "ops.event", signalCapability: "ops.event",
        }],
        cursor: { sourceId: id, position: "1" },
      };
    },
  });
}

function scheduler(store: InMemoryRuntimeStore): GovernedObservedSignalScheduler {
  return new GovernedObservedSignalScheduler({
    store,
    loadConstitution: async () => constitution,
    loadWakeState: async () => ({ state: [] as WakeAccumulatorState[], version: 0 }),
    persistWakeResult: async () => undefined,
  });
}

describe("BusinessSystemConnectorRegistry + observed daemon", () => {
  it("rejects duplicate ids and supports explicit disable/remove", () => {
    const registry = new BusinessSystemConnectorRegistry();
    const seen: Array<string | null> = [];
    registry.register(connector("system:a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seen));
    expect(() => registry.register(connector("system:a", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", seen))).toThrow(/DUPLICATE/);
    registry.setEnabled("system:a", false);
    expect(registry.listEnabled()).toHaveLength(0);
    registry.setEnabled("system:a", true);
    expect(registry.listEnabled()).toHaveLength(1);
    expect(registry.remove("system:a")).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("keeps opaque cursors isolated per connector and survives daemon restart", async () => {
    const store = new InMemoryRuntimeStore();
    const seenA: Array<string | null> = [];
    const seenB: Array<string | null> = [];
    const registry = new BusinessSystemConnectorRegistry();
    registry.register(connector("system:a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seenA));
    registry.register(connector("system:b", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", seenB));
    const daemon = new GovernedObservedSignalDaemon(registry, scheduler(store));
    const first = await daemon.runOnce({ companyId, workerId: "daemon", now: new Date("2026-08-25T20:01:00.000Z"), leaseMs: 86_400_000 });
    expect(first.results.map((item) => item.status)).toEqual(["processed", "processed"]);
    expect(seenA).toEqual([null]);
    expect(seenB).toEqual([null]);
    expect((await store.getSignalCursor(companyId, "system:a")).position).toBe("1");
    expect((await store.getSignalCursor(companyId, "system:b")).position).toBe("1");

    const restartedRegistry = new BusinessSystemConnectorRegistry();
    restartedRegistry.register(connector("system:a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seenA));
    restartedRegistry.register(connector("system:b", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", seenB));
    const restarted = new GovernedObservedSignalDaemon(restartedRegistry, scheduler(store));
    const second = await restarted.runOnce({ companyId, workerId: "daemon-restarted", now: new Date("2026-08-25T20:02:00.000Z"), leaseMs: 86_400_000 });
    expect(second.results.map((item) => item.status)).toEqual(["processed", "processed"]);
    expect(seenA).toEqual([null, "1"]);
    expect(seenB).toEqual([null, "1"]);
  });

  it("does not poll disabled connectors and isolates one connector failure", async () => {
    const store = new InMemoryRuntimeStore();
    const registry = new BusinessSystemConnectorRegistry();
    const seen: Array<string | null> = [];
    registry.register(connector("system:disabled", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seen), { enabled: false });
    registry.register(new ManifestBusinessSystemConnector({ id: "system:broken", label: "broken", kind: "test", confidence: 1, signalCapabilities: [] }, { poll: async () => { throw new Error("connector-down"); } }));
    registry.register(connector("system:healthy", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", seen));
    const result = await new GovernedObservedSignalDaemon(registry, scheduler(store)).runOnce({ companyId, workerId: "daemon", now: new Date("2026-08-25T20:03:00.000Z"), leaseMs: 86_400_000 });
    expect(result.connectorCount).toBe(2);
    expect(result.results.find((item) => item.connectorId === "system:broken")?.status).toBe("failed");
    expect(result.results.find((item) => item.connectorId === "system:healthy")?.status).toBe("processed");
    expect(seen).toEqual([null]);
  });
});
