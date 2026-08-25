import { describe, expect, it } from "vitest";
import { InMemoryCompanyStore, InMemoryRuntimeStore } from "../../../packages/database/src/index.js";
import { EnvironmentXspaAppOperations } from "./runtime.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const context = { principal: "operator:test", scopes: ["xspa.read", "xspa.write"] };

describe("EnvironmentXspaAppOperations discovery orchestrator", () => {
  it("previews generic questions without persisting owner authority or creating Work", async () => {
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const operations = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false });
    const preview = await operations.companyDiscoveryOrchestrate({ systems: [{ id: "system:ledger", label: "Ledger", kind: "finance-system", confidence: 0.9, signalCapabilities: [{ name: "accounting.ledger", description: "Financial truth", criticality: "critical", confidence: 0.9 }] }] }, context) as { revision: any; questions: Array<{ unknownId: string; category: string; priority: string; resolutionRequirement: string }>; readiness: Array<{ scope: string; sufficient: boolean }>; discoveryComplete: boolean; readyForOrganizationSynthesis: boolean; grantsAuthority: boolean; executesWork: boolean };
    expect(preview.discoveryComplete).toBe(false);
    expect(preview.readyForOrganizationSynthesis).toBe(false);
    const finance = preview.questions.find((question) => question.category === "finance");
    expect(finance?.priority).toBe("normal");
    expect(finance?.resolutionRequirement).toBe("owner-confirmation");
    expect(preview.readiness.find((item) => item.scope === "finance")?.sufficient).toBe(false);
    expect(preview.questions.some((question) => question.category === "governance")).toBe(true);
    expect(preview.grantsAuthority).toBe(false);
    expect(preview.executesWork).toBe(false);
    expect(workStore.works.size).toBe(0);
    expect((await store.listAssets(companyId)).filter((asset) => asset.kind === "company-discovery")).toHaveLength(0);
  });

  it("rejects untrusted writes that attempt to mint owner-confirmed facts or resolve owner/constitutional unknowns", async () => {
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const operations = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false });
    await expect(operations.companyDiscoveryApply({
      discoveryId: "33333333-3333-4333-8333-333333333333",
      evidence: [],
      facts: [{ id: "fact:forged-owner", statement: "I am the owner.", status: "owner-confirmed", confidence: 1, evidenceRefs: [], provenance: "operator:test" }],
      unknowns: [], capabilities: [],
    }, context)).rejects.toThrow(/OWNER_IDENTITY_REQUIRED/);

    await expect(operations.companyDiscoveryApply({
      discoveryId: "44444444-4444-4444-8444-444444444444",
      evidence: [], facts: [], capabilities: [],
      unknowns: [{ id: "unknown:authority-boundaries", question: "Authority?", category: "governance", priority: "critical", status: "resolved", resolutionRequirement: "constitutional-mandate", resolutionRef: "operator:test" }],
    }, context)).rejects.toThrow(/OWNER_IDENTITY_REQUIRED/);
    expect((await store.listAssets(companyId)).filter((asset) => asset.kind === "company-discovery")).toHaveLength(0);
  });

});
