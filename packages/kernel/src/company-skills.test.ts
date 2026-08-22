import { describe, expect, it } from "vitest";
import type { CompanyAsset, CorporateGene, SkillDefinition } from "../../contracts/src/index.js";
import {
  buildCompanySkillGene,
  createCompanySkillDefinitionAsset,
  createSkillInstallationAsset,
  planCompanySkillBootstrap,
  resolveCompanySkillMatches,
  skillInstallationFromAsset,
} from "./company-skills.js";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "22222222-2222-4222-8222-222222222222";

function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    schemaVersion: 1, id: "sales-followup", name: "Sales Follow-up", version: "1.0.0", domain: "company", status: "active",
    description: "Follow up leads", triggers: ["follow up lead"], scopes: ["sales.pipeline"], capabilities: ["crm.read", "email.send"],
    defaultDepartments: ["commercial"], contentRef: "file:skills/sales-followup/SKILL.md", risk: "medium", provenance: "project", ...overrides,
  };
}

describe("Company Skill OS", () => {
  it("NEW COMPANY installs matching reusable skills and creates candidates only for uncovered capabilities", () => {
    const plan = planCompanySkillBootstrap({
      companyId: companyA, mode: "new", purpose: "Sell industrial supplies online", departments: ["commercial", "operations"],
      requiredCapabilities: ["crm.read", "email.send", "inventory.forecast"], catalog: [skill()], existingInstallations: [], observedProcesses: [],
    });
    expect(plan.install.some((item) => item.skillRef === "skill://sales-followup@1.0.0")).toBe(true);
    expect(plan.gaps.map((gap) => gap.capability)).toContain("inventory.forecast");
    expect(plan.createCandidates.some((candidate) => candidate.capabilities.includes("inventory.forecast"))).toBe(true);
  });

  it("EXISTING COMPANY maps what already works and preserves unmatched observed processes as company-local candidates", () => {
    const plan = planCompanySkillBootstrap({
      companyId: companyA, mode: "existing", purpose: "Existing distributor", departments: ["commercial", "operations"], requiredCapabilities: [],
      catalog: [skill()], existingInstallations: [], observedProcesses: [
        { id: "proc-1", name: "Lead follow-up", department: "commercial", description: "Team follows CRM leads by email", capabilities: ["crm.read", "email.send"], triggers: ["follow up lead"], evidenceRefs: ["process-map:1"] },
        { id: "proc-2", name: "Supplier replenishment ritual", department: "operations", description: "Existing weekly replenishment process", capabilities: ["supplier.order"], triggers: ["weekly replenishment"], evidenceRefs: ["process-map:2"] },
      ],
    });
    expect(plan.reuse.some((item) => item.observedProcessId === "proc-1" && item.skillRef === "skill://sales-followup@1.0.0")).toBe(true);
    expect(plan.createCandidates.some((candidate) => candidate.source === "observed-process" && candidate.evidenceRefs.includes("process-map:2"))).toBe(true);
    expect(plan.gaps).toHaveLength(0);
  });

  it("uses CompanyAsset for installation and CorporateGene type=skill for company learning", () => {
    const installation = createSkillInstallationAsset({ companyId: companyA, skill: skill(), department: "commercial", scopes: ["sales.pipeline"] }, new Date("2026-08-22T06:00:00Z"));
    expect(installation.kind).toBe("skill-installation");
    expect(installation.companyId).toBe(companyA);
    expect(skillInstallationFromAsset(installation).skillRef).toBe("skill://sales-followup@1.0.0");

    const localDefinition = createCompanySkillDefinitionAsset({
      companyId: companyA, skillId: "supplier-replenishment", name: "Supplier Replenishment", description: "Company-specific replenishment workflow",
      instructions: "Use verified supplier demand and current stock before creating replenishment Work.", triggers: ["weekly replenishment"], scopes: ["operations.supply"], capabilities: ["supplier.order"], department: "operations", evidenceRefs: ["process-map:2"],
    }, new Date("2026-08-22T06:00:00Z"));
    const gene = buildCompanySkillGene({ companyId: companyA, skillId: "supplier-replenishment", artifactRef: `asset://${localDefinition.id}`, department: "operations", scopes: ["operations.supply"], capabilities: ["supplier.order"], evidenceRefs: ["process-map:2"] });
    expect(gene.type).toBe("skill");
    expect(gene.status).toBe("candidate");
    expect(gene.companyId).toBe(companyA);
    expect(gene.experienceRefs).toEqual(["process-map:2"]);
  });

  it("matches only skills installed/learned for the requested Company and fails closed on foreign data", () => {
    const installation = createSkillInstallationAsset({ companyId: companyA, skill: skill(), department: "commercial", scopes: ["sales.pipeline"] }, new Date("2026-08-22T06:00:00Z"));
    const gene: CorporateGene = buildCompanySkillGene({ companyId: companyA, skillId: "sales-followup", artifactRef: "skill://sales-followup@1.0.0", department: "commercial", scopes: ["sales.pipeline"], capabilities: ["crm.read", "email.send"], evidenceRefs: [] });
    const matches = resolveCompanySkillMatches({ companyId: companyA, query: "follow up lead", department: "commercial", capabilities: ["crm.read"], catalog: [skill()], installations: [installation], genes: [gene], companyDefinitions: [] });
    expect(matches[0]?.skill.id).toBe("sales-followup");

    const foreignAsset: CompanyAsset = { ...installation, id: "33333333-3333-4333-8333-333333333333", companyId: companyB };
    expect(() => resolveCompanySkillMatches({ companyId: companyA, query: "lead", department: "commercial", capabilities: [], catalog: [skill()], installations: [foreignAsset], genes: [], companyDefinitions: [] })).toThrow(/company mismatch/);
  });

  it("applies SkillGene state to company-local skill assets as well as global skill refs", () => {
    const localAsset = createCompanySkillDefinitionAsset({ companyId: companyA, skillId: "local-ritual", name: "Local Ritual", description: "Private company ritual", instructions: "Execute the local ritual under current grants.", triggers: ["local ritual"], scopes: ["operations.local"], capabilities: ["local.run"], department: "operations", evidenceRefs: ["process:local"] }, new Date("2026-08-22T06:00:00Z"));
    const localDefinition = localAsset.metadata.definition as SkillDefinition;
    const installation = createSkillInstallationAsset({ companyId: companyA, skill: localDefinition, department: "operations", scopes: ["operations.local"], source: "company-local" }, new Date("2026-08-22T06:00:00Z"));
    const gene = { ...buildCompanySkillGene({ companyId: companyA, skillId: "local-ritual", artifactRef: `asset://${localAsset.id}`, department: "operations", scopes: ["operations.local"], capabilities: ["local.run"], evidenceRefs: ["process:local"] }), status: "quarantine" as const };
    const matches = resolveCompanySkillMatches({ companyId: companyA, query: "local ritual", department: "operations", capabilities: ["local.run"], catalog: [], installations: [installation], genes: [gene], companyDefinitions: [localDefinition] });
    expect(matches).toHaveLength(0);
  });

  it("excludes silent/quarantine/retired SkillGenes from normal company matching", () => {
    const installation = createSkillInstallationAsset({ companyId: companyA, skill: skill(), department: "commercial", scopes: ["sales.pipeline"] }, new Date("2026-08-22T06:00:00Z"));
    const base = buildCompanySkillGene({ companyId: companyA, skillId: "sales-followup", artifactRef: "skill://sales-followup@1.0.0", department: "commercial", scopes: ["sales.pipeline"], capabilities: ["crm.read"], evidenceRefs: [] });
    for (const status of ["silent", "quarantine", "retired"] as const) {
      const matches = resolveCompanySkillMatches({ companyId: companyA, query: "follow up lead", department: "commercial", capabilities: ["crm.read"], catalog: [skill()], installations: [installation], genes: [{ ...base, status }], companyDefinitions: [] });
      expect(matches).toHaveLength(0);
    }
  });
});
