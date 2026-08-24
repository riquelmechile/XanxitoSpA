import { describe, expect, it } from "vitest";
import type { CompanyOperatingModelPlan, DiscoveryRevision } from "../../contracts/src/index.js";
import { projectCompanyConstitution } from "./company-constitution.js";

const companyId = "11111111-1111-4111-8111-111111111111";

function model(): CompanyOperatingModelPlan {
  return {
    schemaVersion: 1,
    companyId,
    mode: "existing",
    lifecycleMode: "bootstrap",
    purpose: "Operate an existing company safely",
    businessModel: "Services",
    jurisdiction: "CL",
    timezone: "America/Santiago",
    objectives: ["Protect cash", "Grow repeatable revenue"],
    departments: [
      { id: "executive", name: "Executive", functions: ["executive-strategy"], responsibilities: [], kpis: [], disposition: "preserve", evidenceRefs: [] },
      { id: "revenue-team", name: "Revenue Team", functions: ["commercial-revenue"], responsibilities: [], kpis: [], disposition: "preserve", evidenceRefs: [] },
    ],
    processes: [],
    requiredCapabilities: ["crm.read"],
    requiredSkills: [],
    readinessGaps: [],
    skillPlan: { companyId, mode: "existing", install: [], reuse: [], gaps: [], createCandidates: [] },
    bootstrapPlan: { companyId, mode: "existing", reusedAssetIds: [], requestedCapabilities: [], approvalBoundaries: [], steps: [] },
    fingerprint: "a".repeat(64),
    recommendedWork: { owner: "executive", objective: "Adopt company", scope: `company-bootstrap:existing:${companyId}` },
  };
}

function discovery(): DiscoveryRevision {
  return {
    schemaVersion: 1,
    companyId,
    revisionId: "22222222-2222-4222-8222-222222222222",
    parentRevisionId: null,
    sequence: 1,
    createdAt: "2026-08-24T20:00:00.000Z",
    sourceRefs: ["ev-crm-gap"],
    evidence: [],
    facts: [],
    unknowns: [],
    capabilities: [{ id: "crm-read", name: "crm.read", description: "Read CRM state", criticality: "important", confidence: 0.9, factRefs: [], evidenceRefs: ["ev-crm-gap"], preferredDepartmentHint: "revenue-team" }],
    fingerprint: "b".repeat(64),
  };
}

describe("Company Constitution projection", () => {
  it("projects durable objectives and attention routing without granting execution authority", () => {
    const constitution = projectCompanyConstitution({ companyId, operatingModel: model(), discovery: discovery() });
    expect(constitution.durableObjectives.map((item) => item.statement)).toEqual(["Protect cash", "Grow repeatable revenue"]);
    expect(constitution.signalSources.some((source) => source.capabilityScopes.includes("crm.read"))).toBe(true);
    expect(constitution.subscriptions.some((sub) => sub.targetDepartment === "revenue-team")).toBe(true);
    expect(constitution.grantsAuthority).toBe(false);
    expect(constitution.grantsBudget).toBe(false);
    expect(constitution.grantsCapabilities).toBe(false);
    expect(constitution.executesWork).toBe(false);
  });
});
