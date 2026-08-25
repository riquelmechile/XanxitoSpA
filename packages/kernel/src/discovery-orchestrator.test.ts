import { describe, expect, it } from "vitest";
import { ManifestBusinessSystemConnector } from "./business-system-connector.js";
import { GenericDiscoveryOrchestrator } from "./discovery-orchestrator.js";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("GenericDiscoveryOrchestrator", () => {
  it("asks universal high-value questions when an existing company has no systems yet", async () => {
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [] }, new Date("2026-08-24T21:00:00.000Z"));
    expect(result.discoveryComplete).toBe(false);
    expect(result.questions.map((q) => q.category)).toEqual(expect.arrayContaining(["commercial", "finance", "operations", "governance", "organization"]));
    expect(result.questions.some((q) => q.question.toLowerCase().includes("mercadolibre"))).toBe(false);
    expect(result.grantsAuthority).toBe(false);
    expect(result.executesWork).toBe(false);
  });

  it("uses unrelated discovered systems to remove answered domains while preserving governance questions", async () => {
    const customer = new ManifestBusinessSystemConnector({
      id: "system:customer", label: "Customer system", kind: "customer-system", confidence: 0.95,
      signalCapabilities: [
        { name: "sales.pipeline", description: "Pipeline state", criticality: "critical", confidence: 0.95 },
        { name: "customer.support", description: "Customer support state", criticality: "important", confidence: 0.9 },
      ],
    });
    const finance = new ManifestBusinessSystemConnector({
      id: "system:ledger", label: "Financial ledger", kind: "finance-system", confidence: 0.9,
      signalCapabilities: [{ name: "accounting.ledger", description: "Ledger truth", criticality: "critical", confidence: 0.9 }],
    });
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [finance, customer] }, new Date("2026-08-24T21:01:00.000Z"));
    expect(result.revision.capabilities.map((c) => c.name).sort()).toEqual(["accounting.ledger", "customer.support", "sales.pipeline"]);
    expect(result.questions.some((q) => q.category === "commercial")).toBe(false);
    expect(result.questions.some((q) => q.category === "finance")).toBe(false);
    expect(result.questions.some((q) => q.category === "governance")).toBe(true);
    expect(result.questions.some((q) => q.category === "operations")).toBe(true);
  });

  it("does not reopen resolved prior unknowns and advances revision lineage", async () => {
    const first = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [] }, new Date("2026-08-24T21:02:00.000Z"));
    const resolvedPrior = structuredClone(first.revision);
    const governance = resolvedPrior.unknowns.find((u) => u.category === "governance");
    expect(governance).toBeDefined();
    governance!.status = "resolved";
    governance!.resolutionRef = "owner:answer:governance";
    const second = await new GenericDiscoveryOrchestrator().run({ companyId, connectors: [], prior: resolvedPrior }, new Date("2026-08-24T21:03:00.000Z"));
    expect(second.revision.parentRevisionId).toBe(resolvedPrior.revisionId);
    expect(second.revision.sequence).toBe(resolvedPrior.sequence + 1);
    expect(second.revision.unknowns.find((u) => u.id === governance!.id)?.status).toBe("resolved");
    expect(second.questions.some((q) => q.unknownId === governance!.id)).toBe(false);
  });
});
