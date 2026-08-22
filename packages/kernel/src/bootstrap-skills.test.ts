import { describe, expect, it } from "vitest";
import type { SkillDefinition } from "../../contracts/src/index.js";
import { planCompanyBootstrap } from "./bootstrap.js";

const skill: SkillDefinition = { schemaVersion:1, id:"sales-followup", name:"Sales Follow-up", version:"1.0.0", domain:"company", status:"active", description:"Follow leads", triggers:["follow up lead"], scopes:["sales.pipeline"], capabilities:["crm.read"], defaultDepartments:["commercial"], contentRef:"file:skills/sales-followup/SKILL.md", risk:"medium", provenance:"project" };

describe("company bootstrap skill plane", () => {
  it("plans skills together with infrastructure without changing the existing asset bootstrap contract", () => {
    const plan = planCompanyBootstrap({
      companyId:"11111111-1111-4111-8111-111111111111", mode:"new", requirements:[], existingAssets:[], autonomousCapabilities:[],
      skillBootstrap:{ purpose:"Sell online", departments:["commercial"], requiredCapabilities:["crm.read"], catalog:[skill], existingInstallations:[], observedProcesses:[] },
    });
    expect(plan.steps).toEqual([]);
    expect(plan.skillPlan?.install[0]?.skillRef).toBe("skill://sales-followup@1.0.0");
    expect(plan.skillPlan?.companyId).toBe(plan.companyId);
    expect(plan.skillPlan?.mode).toBe("new");
  });
});
