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
    const preview = await operations.companyDiscoveryOrchestrate({ systems: [{ id: "system:ledger", label: "Ledger", kind: "finance-system", confidence: 0.9, signalCapabilities: [{ name: "accounting.ledger", description: "Financial truth", criticality: "critical", confidence: 0.9 }] }] }, context) as { revision: any; questions: Array<{ unknownId: string; category: string }>; discoveryComplete: boolean; readyForOrganizationSynthesis: boolean; grantsAuthority: boolean; executesWork: boolean };
    expect(preview.discoveryComplete).toBe(false);
    expect(preview.readyForOrganizationSynthesis).toBe(false);
    expect(preview.questions.some((question) => question.category === "finance")).toBe(false);
    expect(preview.questions.some((question) => question.category === "governance")).toBe(true);
    expect(preview.grantsAuthority).toBe(false);
    expect(preview.executesWork).toBe(false);
    expect(workStore.works.size).toBe(0);
    expect((await store.listAssets(companyId)).filter((asset) => asset.kind === "company-discovery")).toHaveLength(0);
  });
});
