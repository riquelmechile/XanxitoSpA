import { describe, expect, it } from "vitest";
import type { AgentSubscription, BusinessEvent, CompanyConstitution, WakeAccumulatorState } from "../../contracts/src/index.js";
import { GovernedWakeEngine } from "./governed-wake.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-24T20:00:00.000Z");

function subscription(overrides: Partial<AgentSubscription> = {}): AgentSubscription {
  return {
    id: "sub:sales",
    signalSourceId: "signal:crm",
    targetDepartment: "commercial",
    targetRole: "commercial-agent",
    capabilityScopes: ["crm.read"],
    objectiveId: "objective:revenue",
    objective: "Protect qualified revenue opportunities",
    match: { topics: ["lead.created"], capabilityScopes: ["crm.read"] },
    urgencyPolicy: {
      opportunityCostWeight: 0.7,
      actionWindowWeight: 0.3,
      defaultOpportunityCost: 0.2,
      defaultActionWindowMinutes: 60,
    },
    threshold: 0.75,
    accumulationWindowSeconds: 3600,
    accumulationCap: 1,
    wakeIntentOnly: true,
    grantsAuthority: false,
    ...overrides,
  };
}

function constitution(sub: AgentSubscription): CompanyConstitution {
  return {
    schemaVersion: 1,
    companyId,
    operatingModelFingerprint: "a".repeat(64),
    discoveryRevisionId: null,
    durableObjectives: [{ id: "objective:revenue", statement: sub.objective, owner: "executive", status: "active" }],
    authorityBoundaries: [],
    reservedActions: [],
    escalationRules: [],
    signalSources: [{ id: "signal:crm", kind: "external", label: "CRM", capabilityScopes: ["crm.read"], topics: ["lead.created"], urgency: "high", dedupeWindowSeconds: 3600, debounceSeconds: 0, grantsAuthority: false }],
    subscriptions: [sub],
    grantsAuthority: false,
    grantsBudget: false,
    grantsCapabilities: false,
    executesWork: false,
    fingerprint: "b".repeat(64),
  };
}

function event(id: string, opportunityCost: number, actionWindowMinutes = 60, ageMinutes = 0): BusinessEvent {
  return {
    id,
    companyId,
    type: "lead.created",
    occurredAt: new Date(now.getTime() - ageMinutes * 60_000).toISOString(),
    actorPrincipal: "crm",
    correlationId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: `lead:${id}`,
    payload: { sourceId: "signal:crm", capability: "crm.read", opportunityCost, actionWindowMinutes, ageMinutes },
    sensitivity: "internal",
    evidenceRefs: [`event:${id}`],
    signal: { provenance: "observed", sourceId: "signal:crm", topic: "lead.created", capability: "crm.read", attestationRef: "connector:signal:crm" },
  };
}

describe("GovernedWakeEngine", () => {
  it("uses opportunity-cost plus action-window urgency and emits a no-authority Work proposal above threshold", () => {
    const engine = new GovernedWakeEngine();
    const sub = subscription({ urgencyPolicy: { opportunityCostWeight: 0.7, actionWindowWeight: 0.3, defaultOpportunityCost: 0.9, defaultActionWindowMinutes: 60 } });
    const result = engine.evaluate({ companyId, constitution: constitution(sub), events: [event("33333333-3333-4333-8333-333333333333", 0.1, 1, 30)], priorState: [], now });
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.state).toBe("wake");
    expect(result.decisions[0]?.urgency).toBeCloseTo(0.78, 5);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, objective: "Protect qualified revenue opportunities" });
  });

  it("accumulates below threshold and replay does not increase the score", () => {
    const sub = subscription({ threshold: 0.25 });
    const engine = new GovernedWakeEngine();
    const firstEvent = event("44444444-4444-4444-8444-444444444444", 0.3, 60, 0);
    const first = engine.evaluate({ companyId, constitution: constitution(sub), events: [firstEvent], priorState: [], now });
    expect(first.decisions[0]?.state).toBe("accumulate");
    expect(first.state[0]?.score).toBeCloseTo(0.14, 5);
    const replay = engine.evaluate({ companyId, constitution: constitution(sub), events: [firstEvent], priorState: first.state, now: new Date(now.getTime() + 1_000) });
    expect(replay.decisions[0]?.state).toBe("sleep");
    expect(replay.state[0]?.score).toBeLessThan(0.14);
    const second = engine.evaluate({ companyId, constitution: constitution(sub), events: [event("55555555-5555-4555-8555-555555555555", 0.2, 60, 0)], priorState: replay.state, now: new Date(now.getTime() + 2_000) });
    expect(second.decisions.some((decision) => decision.state === "wake")).toBe(true);
    expect(second.proposals).toHaveLength(1);
    expect(second.proposals[0]?.eventIds).toEqual([firstEvent.id, "55555555-5555-4555-8555-555555555555"]);
  });

  it("retains replay keys beyond the old 256-entry cache", () => {
    const sub = subscription({ threshold: 0.9 });
    const engine = new GovernedWakeEngine();
    const many = Array.from({ length: 300 }, (_, index) => event(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, 0, 60, 0));
    const first = engine.evaluate({ companyId, constitution: constitution(sub), events: many, priorState: [], now });
    expect(first.state[0]?.processedEventKeys).toHaveLength(300);
    expect(first.state[0]?.processedEventKeys.at(-1)).toContain(many.at(-1)!.id);
  });

  it("fails closed on company mismatch", () => {
    const engine = new GovernedWakeEngine();
    const foreign = { ...event("66666666-6666-4666-8666-666666666666", 1), companyId: "77777777-7777-4777-8777-777777777777" };
    expect(() => engine.evaluate({ companyId, constitution: constitution(subscription()), events: [foreign], priorState: [] as WakeAccumulatorState[], now })).toThrow(/company mismatch/i);
  });

  it("does not trust caller payload to claim a source/topic or inflate urgency", () => {
    const engine = new GovernedWakeEngine();
    const spoofed = { ...event("77777777-7777-4777-8777-777777777777", 1, 1, 60), type: "unrelated.event", payload: { sourceId: "signal:crm", topic: "lead.created", capability: "crm.read", opportunityCost: 1, actionWindowMinutes: 1, ageMinutes: 60 }, signal: { provenance: "asserted" as const, sourceId: "signal:crm", topic: "lead.created", capability: "crm.read" } };
    const result = engine.evaluate({ companyId, constitution: constitution(subscription()), events: [spoofed], priorState: [], now });
    expect(result.proposals).toHaveLength(0);
    expect(result.decisions.every((decision) => decision.state === "sleep")).toBe(true);
  });


  it("decays accumulation continuously instead of starving slow signals at a hard window boundary", () => {
    const sub = subscription({ threshold: 0.3, accumulationWindowSeconds: 60, urgencyPolicy: { opportunityCostWeight: 1, actionWindowWeight: 0, defaultOpportunityCost: 0.2, defaultActionWindowMinutes: 60 } });
    const engine = new GovernedWakeEngine();
    const first = engine.evaluate({ companyId, constitution: constitution(sub), events: [event("88888888-8888-4888-8888-888888888888", 0, 1, 0)], priorState: [], now });
    expect(first.state[0]?.score).toBeCloseTo(0.2, 5);
    const laterNow = new Date(now.getTime() + 90_000);
    const secondEvent = { ...event("99999999-9999-4999-8999-999999999999", 0, 1, 0), occurredAt: laterNow.toISOString() };
    const second = engine.evaluate({ companyId, constitution: constitution(sub), events: [secondEvent], priorState: first.state, now: laterNow });
    expect(second.state[0]?.score).toBeGreaterThan(0.2);
    expect(second.state[0]?.score).toBeLessThan(0.4);
  });

});
