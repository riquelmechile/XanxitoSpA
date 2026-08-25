import { describe, expect, it } from "vitest";
import { InMemoryCompanyStore, InMemoryRuntimeStore } from "../../../packages/database/src/index.js";
import { buildDiscoveryRevision, createCompanyOperatingModelAsset, createDiscoveryAsset, planCompanyOperatingModel } from "../../../packages/kernel/src/index.js";
import { EnvironmentXspaAppOperations } from "./runtime.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const context = { principal: "test-user", scopes: ["xspa.read", "xspa.write"] };

describe("EnvironmentXspaAppOperations governed wake", () => {
  it("keeps MCP wake evaluation diagnostic-only and replay-safe without creating Work or authority", async () => {
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const operatingModel = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "existing",
        purpose: "Operate an existing company",
        businessModel: "Generic services",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Protect qualified revenue opportunities"],
        observedDepartments: [{ id: "commercial", name: "Commercial", functions: ["commercial-revenue"], responsibilities: ["Revenue"], kpis: ["revenue"], evidenceRefs: [] }],
        observedProcesses: [],
        proposedDepartments: [],
        proposedProcesses: [],
        requiredCapabilities: [],
        bootstrapRequirements: [],
      },
      existingAssets: [],
      catalog: [],
      existingInstallations: [],
    });
    await store.saveAsset(createCompanyOperatingModelAsset({ companyId, formationId: "22222222-2222-4222-8222-222222222222", plan: operatingModel }, new Date("2026-08-24T18:00:00.000Z")));
    const discovery = buildDiscoveryRevision({
      companyId,
      evidence: [{ id: "ev:crm", source: { id: "src:crm", kind: "integration", label: "CRM" }, kind: "integration-observation", observedAt: "2026-08-24T18:01:00.000Z", statement: "CRM emits lead signals", confidenceCeiling: 1 }],
      facts: [{ id: "fact:crm", statement: "CRM is used for revenue operations", status: "observed", confidence: 1, evidenceRefs: ["ev:crm"], provenance: "src:crm" }],
      unknowns: [],
      capabilities: [{ id: "crm", name: "crm.read", description: "Observe CRM opportunities", criticality: "critical", confidence: 1, factRefs: ["fact:crm"], evidenceRefs: ["ev:crm"], preferredDepartmentHint: "commercial" }],
    }, new Date("2026-08-24T18:02:00.000Z"));
    await store.saveAsset(createDiscoveryAsset({ companyId, revision: discovery }, new Date("2026-08-24T18:02:00.000Z")));

    const operations = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false });
    const signalEvent = {
      id: "33333333-3333-4333-8333-333333333333",
      companyId: "00000000-0000-4000-8000-000000000000",
      type: "crm.read",
      occurredAt: "2026-08-24T18:03:00.000Z",
      actorPrincipal: "signal:crm",
      correlationId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "wake:signal:crm:33333333-3333-4333-8333-333333333333",
      payload: { sourceId: "signal:crm", capability: "crm.read", opportunityCost: 1, actionWindowMinutes: 30, ageMinutes: 30 },
      sensitivity: "internal" as const,
      evidenceRefs: ["ev:lead"],
      signal: { provenance: "observed" as const, sourceId: "signal:crm", topic: "crm.read", capability: "crm.read", attestationRef: "connector:signal:crm" },
    };
    const blockingLease = await store.claimHeartbeatLease(companyId, "other-daemon", new Date(), 30_000);
    expect(blockingLease).not.toBeNull();
    const contended = await operations.companyWakeEvaluate({ evaluationId: "44444444-4444-4444-8444-444444444444", events: [signalEvent] }, context) as { status: string };
    expect(contended.status).toBe("contended");
    expect(await store.getIdempotency(companyId, "company:wake:44444444-4444-4444-8444-444444444444")).toBeNull();
    await store.releaseHeartbeatLease(blockingLease!, new Date());

    const first = await operations.companyWakeEvaluate({ evaluationId: "44444444-4444-4444-8444-444444444444", events: [signalEvent] }, context) as { proposals: unknown[]; workCreated: boolean; grantsAuthority: boolean };
    expect(first.proposals).toHaveLength(0);
    expect(first.workCreated).toBe(false);
    expect(first.grantsAuthority).toBe(false);
    expect(workStore.works.size).toBe(0);

    const replayBlockingLease = await store.claimHeartbeatLease(companyId, "other-daemon", new Date(), 30_000);
    expect(replayBlockingLease).not.toBeNull();
    const appliedReplay = await operations.companyWakeEvaluate({ evaluationId: "44444444-4444-4444-8444-444444444444", events: [signalEvent] }, context) as { status: string; proposals: unknown[] };
    expect(appliedReplay.status).toBe("evaluated");
    expect(appliedReplay.proposals).toHaveLength(0);
    await store.releaseHeartbeatLease(replayBlockingLease!, new Date());

    const replay = await operations.companyWakeEvaluate({ evaluationId: "55555555-5555-4555-8555-555555555555", events: [signalEvent] }, context) as { proposals: unknown[]; duplicateEventCount: number };
    expect(replay.proposals).toHaveLength(0);
    expect(replay.duplicateEventCount).toBe(1);
    expect(workStore.works.size).toBe(0);

    const bulkOccurredAt = new Date().toISOString();
    const bulkEvents = Array.from({ length: 300 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${suffix}`;
      return {
        ...signalEvent,
        id,
        correlationId: id,
        occurredAt: bulkOccurredAt,
        idempotencyKey: `wake:signal:crm:${id}`,
        payload: { sourceId: "signal:crm", capability: "crm.read", opportunityCost: 0, actionWindowMinutes: 1_000_000_000 },
        evidenceRefs: [`ev:bulk:${index + 1}`],
      };
    });
    for (let batch = 0; batch < 3; batch += 1) {
      const evaluationId = `66666666-6666-4666-8666-${String(batch + 1).padStart(12, "0")}`;
      const result = await operations.companyWakeEvaluate({ evaluationId, events: bulkEvents.slice(batch * 100, (batch + 1) * 100) }, context) as { proposals: unknown[] };
      expect(Array.isArray(result.proposals)).toBe(true);
    }
    const boundedStatus = await operations.companyWakeStatus(context) as { accumulatorState: Array<{ processedEventKeys: string[] }> };
    expect(boundedStatus.accumulatorState[0]?.processedEventKeys ?? []).toHaveLength(0);
    const oldReplay = await operations.companyWakeEvaluate({ evaluationId: "77777777-7777-4777-8777-777777777777", events: [bulkEvents[0]!] }, context) as { proposals: unknown[]; duplicateEventCount: number };
    expect(oldReplay.proposals).toHaveLength(0);
    expect(oldReplay.duplicateEventCount).toBe(1);

    const status = await operations.companyWakeStatus(context) as { proposals: unknown[]; grantsAuthority: boolean };
    expect(status.proposals).toHaveLength(0);
    expect(status.grantsAuthority).toBe(false);
  });
});
