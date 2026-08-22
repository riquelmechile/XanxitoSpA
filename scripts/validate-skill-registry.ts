import { createFileSystemSkillRegistry } from "../packages/kernel/src/skill-registry.js";
import { UNIVERSAL_SEMANTIC_CAPABILITIES } from "../packages/providers/src/semantic-catalog.js";

const registry = await createFileSystemSkillRegistry(process.cwd());
const health = await registry.health();
if (!health.ok) {
  for (const issue of health.issues) console.error(`${issue.severity.toUpperCase()} ${issue.kind}: ${issue.detail}`);
  throw new Error(`Skill Registry unhealthy: ${health.issues.filter((issue) => issue.severity === "error").length} blocking issue(s)`);
}
const allowedCapabilities = new Set([
  ...UNIVERSAL_SEMANTIC_CAPABILITIES.map((capability) => capability.name),
  "company.discover", "skill.registry.search", "skill.install", "skill.define", "learning.outcome",
  "kast.reflect", "engram.memory", "workflow.verify",
]);
for (const skill of registry.list({ includeDeprecated: true })) {
  if (!skill.contentRef.startsWith("file:")) throw new Error(`Filesystem registry contains unsupported contentRef: ${skill.id} -> ${skill.contentRef}`);
  const unknown = skill.capabilities.filter((capability) => !allowedCapabilities.has(capability));
  if (unknown.length > 0) throw new Error(`Skill ${skill.id} declares unregistered capabilities: ${unknown.join(", ")}`);
}

const companyBootstrap = registry.search({ query: "create company from scratch", domain: "company", department: "executive", limit: 3 })[0];
const existingBootstrap = registry.search({ query: "adopt existing company", domain: "company", department: "operations", limit: 3 })[0];
if (companyBootstrap?.skill.id !== "company-bootstrap" || existingBootstrap?.skill.id !== "company-bootstrap") throw new Error("Company Bootstrap skill is not the top bootstrap/adoption match");
const kast = registry.search({ query: "harness self improvement", domain: "harness", limit: 3 })[0];
if (kast?.skill.id !== "kast") throw new Error("KAST is not the canonical harness self-improvement match");
console.log(`PASS Skill Registry: ${health.indexed} indexed · ${health.active} active · ${health.companySkills} company · ${health.harnessSkills} harness · 0 blocking issues`);
