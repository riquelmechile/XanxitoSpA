import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AgentSubscription, CompanyConstitution, GovernedWakeResult, WakeAccumulatorState } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/index.js";
import { HeartbeatEngine } from "./heartbeat.js";
import { createGovernedHeartbeatWakeHandler } from "./governed-heartbeat.js";

const companyId = "11111111-1111-4111-8111-111111111111";

function constitution(): CompanyConstitution {
  const sub: AgentSubscription = {
    id: "sub:ops",
    signalSourceId: "signal:ops",
    targetDepartment: "operations",
    targetRole: "operations-supervisor",
    capabilityScopes: ["inventory.watch"],
    objectiveId: "objective:ops",
    objective: "Protect operational continuity",
    match: { topics: ["inventory.watch"], capabilityScopes: ["inventory.watch"] },
    urgencyPolicy: { opportunityCostWeight: 0.7, actionWindowWeight: 0.3, defaultOpportunityCost: 0.2, defaultActionWindowMinutes: 60 },
    threshold: 0.6,
    accumulationWindowSeconds: 3600,
    accumulationCap: 1,
    wakeIntentOnly: true,
    grantsAuthority: false,
  };
  return {
    schemaVersion: 1,
    companyId,
    operatingModelFingerprint: "a".repeat(64),
    discoveryRevisionId: null,
    durableObjectives: [{ id: "objective:ops", statement: sub.objective, owner: "executive", status: "active" }],
    authorityBoundaries: [],
    reservedActions: [],
    escalationRules: [],
    signalSources: [{ id: "signal:ops", kind: "internal", label: "Ops", capabilityScopes: ["inventory.watch"], topics: ["inventory.watch"], urgency: "high", dedupeWindowSeconds: 300, debounceSeconds: 0, grantsAuthority: false }],
    subscriptions: [sub],
    grantsAuthority: false,
    grantsBudget: false,
    grantsCapabilities: false,
    executesWork: false,
    fingerprint: "b".repeat(64),
  };
}

describe("governed heartbeat adapter", () => {
  it("reuses the existing fenced heartbeat and delegates only attention evaluation", async () => {
    const store = new InMemoryRuntimeStore();
    let state: WakeAccumulatorState[] = [];
    let saved: GovernedWakeResult | undefined;
    const handler = createGovernedHeartbeatWakeHandler({
      loadConstitution: async () => constitution(),
      loadState: async () => state,
      saveResult: async (_company, result) => { state = result.state; saved = result; },
    });
    const engine = new HeartbeatEngine(store, { eventTypes: ["inventory.watch"], minimumJobMateriality: "medium" }, handler, { clock: () => new Date("2026-08-24T20:00:00.000Z") });
    await store.appendEvent({
      id: randomUUID(),
      companyId,
      type: "inventory.watch",
      occurredAt: "2026-08-24T19:59:00.000Z",
      actorPrincipal: "signal:ops",
      correlationId: randomUUID(),
      idempotencyKey: "inventory:1",
      payload: { sourceId: "signal:ops", capability: "inventory.watch", opportunityCost: 1, actionWindowMinutes: 30, ageMinutes: 30 },
      sensitivity: "internal",
      evidenceRefs: ["inventory:1"],
    });
    const first = await engine.tick(companyId, "daemon-a");
    expect(first.state).toBe("wake");
    expect(saved?.proposals).toHaveLength(1);
    expect(saved?.proposals[0]?.executesWork).toBe(false);
    const second = await engine.tick(companyId, "daemon-a");
    expect(second.state).toBe("sleep");
  });
});
