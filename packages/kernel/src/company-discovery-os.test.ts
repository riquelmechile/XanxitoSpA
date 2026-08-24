import { describe, expect, it } from "vitest";
import type { DiscoveryRevision } from "../../contracts/src/index.js";
import { planCompanyOperatingModel } from "./company-os.js";

const companyId = "11111111-1111-4111-8111-111111111111";

function revision(): DiscoveryRevision {
  return {
    schemaVersion: 1,
    companyId,
    revisionId: "22222222-2222-4222-8222-222222222222",
    parentRevisionId: null,
    sequence: 1,
    createdAt: "2026-08-24T20:00:00.000Z",
    sourceRefs: ["ev-1"],
    evidence: [],
    facts: [],
    unknowns: [{ id: "u1", question: "Who owns CRM quality?", category: "organization", priority: "high", status: "open" }],
    capabilities: [{ id: "cap-1", name: "crm.read", description: "Read CRM", criticality: "important", confidence: 0.9, factRefs: [], evidenceRefs: [], preferredDepartmentHint: "revenue-team" }],
    fingerprint: "b".repeat(64),
  };
}

describe("Company OS discovery integration", () => {
  it("feeds discovered capabilities into the existing planner while preserving observed departments", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "existing",
        purpose: "Adopt existing business",
        businessModel: "Services",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Grow revenue"],
        observedDepartments: [
          { id: "revenue-team", name: "Revenue Team", functions: ["commercial-revenue"], responsibilities: ["Sell"], kpis: ["revenue"], evidenceRefs: ["org:1"] },
        ],
        observedProcesses: [],
      },
      discovery: revision(),
      existingAssets: [],
      catalog: [],
      existingInstallations: [],
    });

    expect(plan.departments.find((department) => department.id === "revenue-team")?.disposition).toBe("preserve");
    expect(plan.requiredCapabilities).toContain("crm.read");
    expect(plan.skillPlan.gaps.find((gap) => gap.capability === "crm.read")?.department).toBe("revenue-team");
    expect(plan.readinessGaps.some((gap) => gap.includes("Who owns CRM quality?"))).toBe(true);
  });
});
