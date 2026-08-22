import { describe, expect, it } from "vitest";
import type { CompanyAsset, SkillDefinition } from "../../contracts/src/index.js";
import { CORE_BUSINESS_FUNCTIONS, createCompanyOperatingModelAsset, fingerprintCompanyOperatingModel, planCompanyOperatingModel } from "./company-os.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-22T08:00:00.000Z");

const financeSkill: SkillDefinition = {
  schemaVersion: 1,
  id: "finance-control",
  name: "Finance Control",
  version: "1.0.0",
  domain: "company",
  status: "active",
  description: "Control company finance and reporting",
  triggers: ["financial control"],
  scopes: ["finance.*"],
  capabilities: ["finance.report"],
  defaultDepartments: ["finance"],
  contentRef: "file:skills/finance-control/SKILL.md",
  risk: "high",
  provenance: "project",
};

function existingEmailAsset(): CompanyAsset {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    companyId,
    kind: "email-account",
    capability: "email.send",
    department: "commercial",
    cost: 0,
    currency: "CLP",
    status: "active",
    grantRefs: [],
    restrictions: [],
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

describe("Generic Company OS operating-model planner", () => {
  it("forms a NEW Company with universal functional coverage while keeping Process, Skill and Capability separate", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "new",
        purpose: "Build and operate a generic B2B service company",
        businessModel: "B2B services",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Reach repeatable revenue"],
        proposedDepartments: [{ id: "technology", name: "Technology", functions: ["technology"], responsibilities: ["Operate digital systems"], kpis: ["availability"] }],
        proposedProcesses: [{ id: "finance-close", name: "Finance Close", department: "finance", objective: "Know real monthly performance", description: "Close verified financial performance", triggers: ["month end"], requiredSkills: ["finance-control"], requiredCapabilities: ["finance.report"], evidenceRefs: [] }],
        requiredCapabilities: ["finance.report"],
        bootstrapRequirements: [],
      },
      existingAssets: [],
      catalog: [financeSkill],
      existingInstallations: [],
    });

    for (const fn of CORE_BUSINESS_FUNCTIONS) expect(plan.departments.some((department) => department.functions.includes(fn))).toBe(true);
    expect(plan.departments.some((department) => department.id === "technology")).toBe(true);
    const process = plan.processes.find((item) => item.id === "finance-close");
    expect(process?.requiredSkills).toEqual(["finance-control"]);
    expect(process?.requiredCapabilities).toEqual(["finance.report"]);
    expect(plan.skillPlan.install[0]?.skillRef).toBe("skill://finance-control@1.0.0");
    expect(plan.requiredCapabilities).toContain("finance.report");
    expect(plan.recommendedWork.owner).toBe("executive");
  });

  it("adopts an EXISTING Company by preserving observed departments/processes before filling uncovered functions", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "existing",
        purpose: "Adopt the current company without breaking working operations",
        businessModel: "Existing mixed-channel business",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Establish a trustworthy baseline"],
        observedDepartments: [
          { id: "founder-office", name: "Founder Office", functions: ["executive-strategy", "finance"], responsibilities: ["Direction", "Cash control"], kpis: ["cash"], evidenceRefs: ["org-map:1"] },
          { id: "revenue-team", name: "Revenue Team", functions: ["commercial-revenue", "customer"], responsibilities: ["Sell", "Support customers"], kpis: ["revenue"], evidenceRefs: ["org-map:2"] },
        ],
        observedProcesses: [
          { id: "manual-sales", name: "Manual Sales Follow-up", department: "revenue-team", description: "Working sales follow-up used today", capabilities: ["crm.read"], triggers: ["new lead"], evidenceRefs: ["process-map:sales"] },
        ],
        proposedDepartments: [],
        proposedProcesses: [],
        requiredCapabilities: ["crm.read"],
        bootstrapRequirements: [],
      },
      existingAssets: [],
      catalog: [],
      existingInstallations: [],
    });

    expect(plan.departments.find((department) => department.id === "founder-office")?.disposition).toBe("preserve");
    expect(plan.departments.some((department) => department.id === "finance")).toBe(false);
    expect(plan.processes.find((process) => process.id === "manual-sales")?.disposition).toBe("preserve");
    expect(plan.skillPlan.createCandidates.some((candidate) => candidate.source === "observed-process" && candidate.name === "Manual Sales Follow-up")).toBe(true);
    expect(plan.readinessGaps.some((gap) => gap.includes("operations"))).toBe(true);
    expect(plan.readinessGaps.some((gap) => gap.includes("administration-risk"))).toBe(true);
  });

  it("reuses existing Company assets and keeps the operating-model fingerprint stable across random bootstrap step ids", () => {
    const input = {
      companyId,
      intake: {
        mode: "new" as const,
        purpose: "Create a company with governed communication",
        businessModel: "Services",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Launch"],
        proposedDepartments: [],
        proposedProcesses: [],
        requiredCapabilities: ["email.send"],
        bootstrapRequirements: [{ id: "commercial-email", capability: "email.send", assetKind: "email-account", department: "commercial", estimatedCost: 0, currency: "CLP", humanBoundary: "none" as const }],
      },
      existingAssets: [existingEmailAsset()],
      catalog: [],
      existingInstallations: [],
    };
    const a = planCompanyOperatingModel(input);
    const b = planCompanyOperatingModel(input);
    expect(a.bootstrapPlan.reusedAssetIds).toEqual([existingEmailAsset().id]);
    expect(a.bootstrapPlan.steps[0]?.action).toBe("reuse");
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("fingerprints semantic bootstrap dependencies instead of random step ids", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "new", purpose: "Create a company with provisioned communication", businessModel: "Services", jurisdiction: "CL", timezone: "America/Santiago", objectives: ["Launch"],
        proposedDepartments: [], proposedProcesses: [], requiredCapabilities: ["email.send"],
        bootstrapRequirements: [{ id: "commercial-email", capability: "email.send", assetKind: "email-account", department: "commercial", estimatedCost: 0, currency: "CLP", humanBoundary: "none" }],
      },
      existingAssets: [], catalog: [], existingInstallations: [],
    });
    const { fingerprint, ...withoutFingerprint } = plan;
    expect(fingerprintCompanyOperatingModel(withoutFingerprint)).toBe(fingerprint);
    const changed = structuredClone(withoutFingerprint);
    const verifyStep = changed.bootstrapPlan.steps.find((step) => step.action === "verify");
    expect(verifyStep?.dependsOn.length).toBe(1);
    verifyStep!.dependsOn = [];
    expect(fingerprintCompanyOperatingModel(changed)).not.toBe(fingerprint);
  });

  it("creates a Company-owned operating-model asset without authority, credentials or grants", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: {
        mode: "new",
        purpose: "Create a governed generic company",
        businessModel: "Services",
        jurisdiction: "CL",
        timezone: "America/Santiago",
        objectives: ["Launch safely"],
        proposedDepartments: [],
        proposedProcesses: [],
        requiredCapabilities: [],
        bootstrapRequirements: [],
      },
      existingAssets: [],
      catalog: [],
      existingInstallations: [],
    });
    const asset = createCompanyOperatingModelAsset({ companyId, formationId: "33333333-3333-4333-8333-333333333333", plan }, now);
    expect(asset.kind).toBe("company-operating-model");
    expect(asset.companyId).toBe(companyId);
    expect(asset.id).not.toBe("33333333-3333-4333-8333-333333333333");
    expect(asset.grantRefs).toEqual([]);
    expect(asset.credentialsRef).toBeUndefined();
    expect(asset.metadata.fingerprint).toBe(plan.fingerprint);
  });
  it("rejects secret-like material before persisting a Company operating model", () => {
    const plan = planCompanyOperatingModel({
      companyId,
      intake: { mode: "new", purpose: "Create a governed company", businessModel: "Services", jurisdiction: "CL", timezone: "America/Santiago", objectives: ["Launch"], proposedDepartments: [], proposedProcesses: [], requiredCapabilities: [], bootstrapRequirements: [] },
      existingAssets: [], catalog: [], existingInstallations: [],
    });
    const unsafe = { ...plan, purpose: "token=secret-material-123456" };
    expect(() => createCompanyOperatingModelAsset({ companyId, formationId: "44444444-4444-4444-8444-444444444444", plan: unsafe }, now)).toThrow(/secret-like/);
  });

});
