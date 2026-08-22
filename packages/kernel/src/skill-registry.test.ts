import { describe, expect, it } from "vitest";
import type { SkillDefinition } from "../../contracts/src/index.js";
import { SkillRegistry, type SkillContentPort } from "./skill-registry.js";

function definition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    schemaVersion: 1,
    id: "sales-followup",
    name: "Sales Follow-up",
    version: "1.0.0",
    domain: "company",
    status: "active",
    description: "Follow up commercial leads and opportunities",
    triggers: ["follow up lead", "sales followup"],
    scopes: ["sales.pipeline"],
    capabilities: ["crm.read", "email.send"],
    defaultDepartments: ["commercial"],
    contentRef: "file:skills/sales-followup/SKILL.md",
    risk: "medium",
    provenance: "project",
    ...overrides,
  };
}

class MemoryContent implements SkillContentPort {
  reads = 0;
  existsCalls = 0;
  constructor(private readonly files: Record<string, string>) {}
  async exists(contentRef: string): Promise<boolean> { this.existsCalls += 1; return Object.hasOwn(this.files, contentRef); }
  async read(contentRef: string): Promise<string> {
    this.reads += 1;
    const value = this.files[contentRef];
    if (value === undefined) throw new Error("missing");
    return value;
  }
}

describe("SkillRegistry company catalog", () => {
  it("keeps catalog search lightweight and loads instructions only after explicit get", async () => {
    const content = new MemoryContent({ "file:skills/sales-followup/SKILL.md": "# Sales Follow-up\nFull instructions" });
    const registry = new SkillRegistry([definition()], content);
    expect(registry.list({ domain: "company" })).toHaveLength(1);
    expect(registry.search({ query: "follow up this lead", department: "commercial", capabilities: ["crm.read"], domain: "company" })[0]?.skill.id).toBe("sales-followup");
    expect(content.reads).toBe(0);
    expect(content.existsCalls).toBe(0);
    const loaded = await registry.get("sales-followup", { domain: "company" });
    expect(loaded?.body).toContain("Full instructions");
    expect(content.reads).toBe(1);
  });

  it("never returns harness-only skills to company matching", () => {
    const registry = new SkillRegistry([
      definition(),
      definition({ id: "kast", name: "KAST", domain: "harness", triggers: ["self improvement"], scopes: ["harness.kast"], capabilities: ["kast.reflect"], defaultDepartments: [] , contentRef: "file:skills/kast/SKILL.md", risk: "critical" }),
    ], new MemoryContent({}));
    const matches = registry.search({ query: "self improvement", domain: "company" });
    expect(matches.some((match) => match.skill.id === "kast")).toBe(false);
  });

  it("reports missing file-backed bodies and duplicate active versions but only warns on trigger overlap", async () => {
    const content = new MemoryContent({ "file:skills/sales-followup/SKILL.md": "ok" });
    const registry = new SkillRegistry([
      definition(),
      definition({ id: "lead-nurture", name: "Lead Nurture", triggers: ["follow up lead"], contentRef: "file:skills/missing/SKILL.md" }),
    ], content);
    const health = await registry.health();
    expect(health.ok).toBe(false);
    expect(health.issues.some((issue) => issue.kind === "trigger-conflict" && issue.severity === "warning")).toBe(true);
    expect(health.issues.some((issue) => issue.kind === "missing-content" && issue.severity === "error")).toBe(true);

    const ambiguous = new SkillRegistry([definition(), definition({ version: "2.0.0", contentRef: "file:skills/sales-followup-v2/SKILL.md" })], content);
    expect(() => ambiguous.search({ query: "sales", domain: "company" })).toThrow(/skill registry unsafe/);
  });
});
