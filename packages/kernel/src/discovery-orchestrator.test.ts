import { describe, expect, it } from "vitest";
import { ManifestBusinessSystemConnector } from "./business-system-connector.js";
import { GenericDiscoveryOrchestrator, evaluateDiscoveryReadiness } from "./discovery-orchestrator.js";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("GenericDiscoveryOrchestrator", () => {
  it("asks universal high-value questions when an existing company has no systems yet", async () => {
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [] }, new Date("2026-08-24T21:00:00.000Z"));
    expect(result.discoveryComplete).toBe(false);
    expect(result.questions.map((q) => q.category)).toEqual(expect.arrayContaining(["commercial", "finance", "operations", "governance", "organization"]));
    expect(result.questions.some((q) => q.question.toLowerCase().includes("mercadolibre"))).toBe(false);
    expect(result.questions.find((q) => q.category === "governance")?.resolutionRequirement).toBe("constitutional-mandate");
    expect(result.grantsAuthority).toBe(false);
    expect(result.executesWork).toBe(false);
  });

  it("uses system existence as candidate evidence but does not elide truth/authority questions", async () => {
    const customer = new ManifestBusinessSystemConnector({
      id: "system:customer", label: "Customer system", kind: "customer-system", confidence: 0.95,
      signalCapabilities: [
        { name: "sales.pipeline", description: "Pipeline state", criticality: "critical", confidence: 0.95 },
        { name: "customer.support", description: "Customer support state", criticality: "important", confidence: 0.9 },
      ],
    });
    const finance = new ManifestBusinessSystemConnector({
      id: "system:ledger", label: "Financial ledger", kind: "finance-system", confidence: 0.9,
      signalCapabilities: [{ name: "accounting.ledger", description: "Ledger exists", criticality: "critical", confidence: 0.9 }],
    });
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [finance, customer] }, new Date("2026-08-24T21:01:00.000Z"));
    expect(result.revision.capabilities.map((c) => c.name).sort()).toEqual(["accounting.ledger", "customer.support", "sales.pipeline"]);
    const financeQuestion = result.questions.find((q) => q.category === "finance");
    const commercialQuestion = result.questions.find((q) => q.category === "commercial");
    expect(financeQuestion?.priority).toBe("normal");
    expect(financeQuestion?.question).toContain("trusted and current source of truth");
    expect(financeQuestion?.candidateEvidenceRefs.length).toBeGreaterThan(0);
    expect(financeQuestion?.resolutionRequirement).toBe("owner-confirmation");
    expect(commercialQuestion?.priority).toBe("normal");
    expect(result.questions.some((q) => q.category === "governance")).toBe(true);
    expect(result.questions.some((q) => q.category === "operations")).toBe(true);
  });

  it("resolves evidence-only observability while keeping independent scopes blocked", async () => {
    const finance = new ManifestBusinessSystemConnector({
      id: "system:ledger", label: "Financial ledger", kind: "finance-system", confidence: 0.9,
      signalCapabilities: [{ name: "accounting.ledger", description: "Ledger exists", criticality: "critical", confidence: 0.9 }],
    });
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [finance] }, new Date("2026-08-24T21:01:30.000Z"));
    const observability = result.revision.unknowns.find((u) => u.id === "unknown:system-observability");
    expect(observability?.status).toBe("resolved");
    expect(observability?.resolutionRequirement).toBe("evidence");
    const readiness = evaluateDiscoveryReadiness(result.revision, ["finance", "commercial", "governance"]);
    expect(readiness.find((r) => r.scope === "finance")?.sufficient).toBe(false);
    expect(readiness.find((r) => r.scope === "commercial")?.sufficient).toBe(false);
    expect(readiness.find((r) => r.scope === "governance")?.sufficient).toBe(false);
  });

  it("does not reopen resolved or dismissed prior unknowns and advances revision lineage", async () => {
    const first = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [] }, new Date("2026-08-24T21:02:00.000Z"));
    const resolvedPrior = structuredClone(first.revision);
    const governance = resolvedPrior.unknowns.find((u) => u.category === "governance");
    const finance = resolvedPrior.unknowns.find((u) => u.category === "finance");
    expect(governance).toBeDefined();
    expect(finance).toBeDefined();
    governance!.status = "resolved";
    governance!.resolutionRef = "mandate:governance";
    finance!.status = "dismissed";
    const second = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [], prior: resolvedPrior }, new Date("2026-08-24T21:03:00.000Z"));
    expect(second.revision.parentRevisionId).toBe(resolvedPrior.revisionId);
    expect(second.revision.sequence).toBe(resolvedPrior.sequence + 1);
    expect(second.revision.unknowns.find((u) => u.id === governance!.id)?.status).toBe("resolved");
    expect(second.revision.unknowns.find((u) => u.id === finance!.id)?.status).toBe("dismissed");
    expect(second.questions.some((q) => q.unknownId === governance!.id || q.unknownId === finance!.id)).toBe(false);
  });
  it("updates an existing open question when new candidate evidence arrives without auto-resolving it", async () => {
    const first = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [] }, new Date("2026-08-24T21:04:00.000Z"));
    const ledger = new ManifestBusinessSystemConnector({
      id: "system:ledger", label: "Ledger", kind: "finance-system", confidence: 0.9,
      signalCapabilities: [{ name: "accounting.ledger", description: "Ledger exists", criticality: "important", confidence: 0.9 }],
    });
    const second = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [ledger], prior: first.revision }, new Date("2026-08-24T21:05:00.000Z"));
    const financialTruth = second.revision.unknowns.find((u) => u.id === "unknown:financial-truth");
    expect(financialTruth?.status).toBe("open");
    expect(financialTruth?.priority).toBe("normal");
    expect(financialTruth?.question).toContain("trusted and current source of truth");
  });

});
