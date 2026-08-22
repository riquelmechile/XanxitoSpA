import { createHash, randomUUID } from "node:crypto";
import type {
  CompanyAsset,
  CompanySkillBootstrapInput,
  CompanySkillBootstrapPlan,
  CompanySkillCreationCandidate,
  CompanySkillInstallation,
  CorporateGene,
  SkillDefinition,
  SkillIndexEntry,
  SkillMatch,
} from "../../contracts/src/index.js";
import { SkillRegistry, skillDefinitionRef, validateSkillDefinition, type SkillContentPort } from "./skill-registry.js";

const ACTIVE_GENE = new Set<CorporateGene["status"]>(["candidate", "challenger", "champion"]);
const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;

function cleanArray(values: string[]): string[] { return [...new Set(values.map((v) => v.trim()).filter(Boolean))]; }
function slug(value: string): string { return value.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "company-skill"; }
function indexToDefinition(item: SkillIndexEntry): SkillDefinition {
  const result: SkillDefinition = {
    schemaVersion: 1, id: item.id, name: item.name, version: item.version, domain: item.domain, status: item.status, description: item.description,
    triggers: [...item.triggers], scopes: [...item.scopes], capabilities: [...item.capabilities], defaultDepartments: [...item.defaultDepartments],
    contentRef: item.contentRef, risk: item.risk, provenance: item.provenance, tags: [...item.tags],
  };
  if (item.ownerCompanyId) result.ownerCompanyId = item.ownerCompanyId;
  return result;
}
function definitions(items: Array<SkillIndexEntry | SkillDefinition>): SkillDefinition[] { return items.map((item) => "schemaVersion" in item ? validateSkillDefinition(item) : indexToDefinition(item)); }
function departmentForCapability(capability: string, departments: string[]): string {
  const c = capability.toLowerCase();
  const preferred = c.startsWith("crm.") || c.startsWith("sales.") || c.startsWith("marketing.") || c === "email.send" ? "commercial"
    : c.startsWith("inventory.") || c.startsWith("supplier.") || c.startsWith("logistics.") || c.startsWith("shipping.") ? "operations"
    : c.startsWith("finance.") || c.startsWith("billing.") || c.startsWith("accounting.") ? "finance"
    : c.startsWith("people.") || c.startsWith("hr.") ? "people"
    : "";
  return (preferred && departments.includes(preferred)) ? preferred : (departments[0] ?? "general");
}
function gapCandidate(capability: string, department: string): CompanySkillCreationCandidate {
  const name = capability.split(/[._:-]+/g).filter(Boolean).map((v) => v[0]?.toUpperCase() + v.slice(1)).join(" ") || capability;
  return { id: slug(capability), name, department, description: `Create a company skill that provides ${capability} in ${department}.`, triggers: [capability.replace(/[._:-]+/g, " ")], scopes: [`${department}.*`], capabilities: [capability], evidenceRefs: [], source: "gap" };
}
class NoopContent implements SkillContentPort { async exists(): Promise<boolean> { return true; } async read(): Promise<string> { return ""; } }

export function planCompanySkillBootstrap(input: CompanySkillBootstrapInput): CompanySkillBootstrapPlan {
  const catalog = definitions(input.catalog).filter((skill) => skill.domain === "company" && skill.status === "active" && (!skill.ownerCompanyId || skill.ownerCompanyId === input.companyId));
  const registry = new SkillRegistry(catalog, new NoopContent());
  for (const installation of input.existingInstallations) if (installation.companyId !== input.companyId) throw new Error("company mismatch in existing skill installation");
  const installed = new Set(input.existingInstallations.filter((i) => i.status === "active").map((i) => i.skillRef));
  const install = [] as CompanySkillBootstrapPlan["install"], reuse = [] as CompanySkillBootstrapPlan["reuse"], gaps = [] as CompanySkillBootstrapPlan["gaps"], createCandidates = [] as CompanySkillBootstrapPlan["createCandidates"];
  const coveredCapabilities = new Set<string>();

  if (input.mode === "existing") {
    for (const process of input.observedProcesses) {
      const query = [process.name, process.description, ...process.triggers].join(" ");
      const matches = registry.search({ query, department: process.department, capabilities: process.capabilities, domain: "company", companyId: input.companyId, limit: 5 });
      const best = matches.find((match) => match.score >= 35 && process.capabilities.some((cap) => match.skill.capabilities.includes(cap)));
      if (best) {
        const ref = skillDefinitionRef(best.skill);
        reuse.push({ observedProcessId: process.id, skillRef: ref, department: process.department, evidenceRefs: cleanArray(process.evidenceRefs), reason: `mapped existing process to reusable skill (${best.reasons.join(",")})` });
        for (const cap of process.capabilities) if (best.skill.capabilities.includes(cap)) coveredCapabilities.add(cap);
        if (!installed.has(ref)) install.push({ skillRef: ref, department: process.department, reason: `adopt existing process mapping: ${process.name}`, source: "existing" });
      } else {
        createCandidates.push({ id: slug(process.name), name: process.name, department: process.department, description: process.description, triggers: cleanArray(process.triggers.length ? process.triggers : [process.name]), scopes: [`${process.department}.*`], capabilities: cleanArray(process.capabilities), evidenceRefs: cleanArray(process.evidenceRefs), source: "observed-process" });
        for (const cap of process.capabilities) coveredCapabilities.add(cap);
      }
    }
  }

  for (const capability of cleanArray(input.requiredCapabilities)) {
    if (coveredCapabilities.has(capability)) continue;
    const department = departmentForCapability(capability, input.departments);
    const matches = registry.search({ query: `${input.purpose} ${capability}`, department, capabilities: [capability], domain: "company", companyId: input.companyId, limit: 4 });
    const best = matches.find((match) => match.skill.capabilities.includes(capability));
    if (best) {
      const ref = skillDefinitionRef(best.skill);
      coveredCapabilities.add(capability);
      if (!installed.has(ref) && !install.some((item) => item.skillRef === ref && item.department === department)) install.push({ skillRef: ref, department, reason: `required capability: ${capability}`, source: "catalog" });
    } else {
      gaps.push({ capability, department, reason: `no active reusable company skill covers ${capability}` });
      createCandidates.push(gapCandidate(capability, department));
    }
  }

  return { companyId: input.companyId, mode: input.mode, install, reuse, gaps, createCandidates };
}

export function createSkillInstallationAsset(input: { companyId: string; skill: SkillDefinition | SkillIndexEntry; department: string; scopes: string[]; source?: CompanySkillInstallation["source"]; assetId?: string }, now = new Date()): CompanyAsset {
  const skill = "schemaVersion" in input.skill ? validateSkillDefinition(input.skill) : indexToDefinition(input.skill);
  if (skill.domain !== "company") throw new Error("harness skill cannot be installed into Company");
  if (skill.ownerCompanyId && skill.ownerCompanyId !== input.companyId) throw new Error("company mismatch for company-owned skill");
  const id = input.assetId ?? randomUUID(), createdAt = now.toISOString();
  const installation: CompanySkillInstallation = { companyId: input.companyId, assetId: id, skillRef: skillDefinitionRef(toIndex(skill)), department: input.department, scopes: cleanArray(input.scopes), source: input.source ?? (skill.ownerCompanyId ? "company-local" : "catalog"), status: "active" };
  return { id, companyId: input.companyId, kind: "skill-installation", capability: "skill.execute", department: input.department, cost: 0, currency: "CLP", status: "active", grantRefs: [], restrictions: [], metadata: { installation }, createdAt, updatedAt: createdAt };
}

function toIndex(skill: SkillDefinition): SkillIndexEntry {
  const result: SkillIndexEntry = { id: skill.id, name: skill.name, version: skill.version, domain: skill.domain, status: skill.status, description: skill.description, triggers: [...skill.triggers], scopes: [...skill.scopes], capabilities: [...skill.capabilities], defaultDepartments: [...skill.defaultDepartments], contentRef: skill.contentRef, risk: skill.risk, provenance: skill.provenance, tags: [...(skill.tags ?? [])] };
  if (skill.ownerCompanyId) result.ownerCompanyId = skill.ownerCompanyId; return result;
}

export function skillInstallationFromAsset(asset: CompanyAsset): CompanySkillInstallation {
  if (asset.kind !== "skill-installation") throw new Error("asset is not a skill installation");
  const value = asset.metadata.installation; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("skill installation metadata missing");
  const obj = value as Record<string, unknown>;
  const installation: CompanySkillInstallation = { companyId: String(obj.companyId ?? ""), assetId: String(obj.assetId ?? asset.id), skillRef: String(obj.skillRef ?? ""), department: String(obj.department ?? asset.department), scopes: Array.isArray(obj.scopes) ? obj.scopes.map(String) : [], source: String(obj.source ?? "catalog") as CompanySkillInstallation["source"], status: String(obj.status ?? "active") as CompanySkillInstallation["status"] };
  if (!installation.companyId || installation.companyId !== asset.companyId) throw new Error("company mismatch in skill installation asset");
  if (installation.assetId !== asset.id) throw new Error("skill installation asset id mismatch");
  if (!installation.skillRef.startsWith("skill://")) throw new Error("invalid skill installation ref");
  if (!(["catalog","existing","company-local"] as string[]).includes(installation.source)) throw new Error("invalid skill installation source");
  if (!(["active","paused","retired"] as string[]).includes(installation.status)) throw new Error("invalid skill installation status");
  return installation;
}

export function createCompanySkillDefinitionAsset(input: { companyId: string; skillId: string; name: string; description: string; instructions: string; triggers: string[]; scopes: string[]; capabilities: string[]; department: string; evidenceRefs: string[] }, now = new Date()): CompanyAsset {
  const textFields = [input.skillId,input.name,input.description,input.instructions,...input.triggers,...input.scopes,...input.capabilities,...input.evidenceRefs];
  if (textFields.some((value) => SECRET_LIKE.test(value))) throw new Error("company skill definition contains secret-like material");
  if (!input.instructions.trim()) throw new Error("company skill instructions required");
  const id = randomUUID(), createdAt = now.toISOString();
  const definition: SkillDefinition = validateSkillDefinition({ schemaVersion:1, id:slug(input.skillId), name:input.name, version:"0.1.0", domain:"company", status:"active", description:input.description, triggers:cleanArray(input.triggers), scopes:cleanArray(input.scopes), capabilities:cleanArray(input.capabilities), defaultDepartments:[input.department], contentRef:`asset-body:${id}`, risk:"medium", provenance:"company", ownerCompanyId:input.companyId, tags:["company-local","autoskill"] });
  return { id, companyId:input.companyId, kind:"company-skill-definition", capability:"skill.define", department:input.department, cost:0, currency:"CLP", status:"active", grantRefs:[], restrictions:["company-internal"], metadata:{ definition, instructions:input.instructions.trim(), evidenceRefs:cleanArray(input.evidenceRefs) }, createdAt, updatedAt:createdAt };
}

export function companySkillDefinitionFromAsset(asset: CompanyAsset): SkillDefinition {
  if (asset.kind !== "company-skill-definition") throw new Error("asset is not a company skill definition");
  const definition = validateSkillDefinition(asset.metadata.definition);
  if (definition.ownerCompanyId !== asset.companyId) throw new Error("company mismatch in company skill definition");
  return definition;
}

export function buildCompanySkillGene(input: { companyId: string; skillId: string; artifactRef: string; department: string; scopes: string[]; capabilities: string[]; evidenceRefs: string[]; version?: number; parents?: string[] }): CorporateGene {
  const signature = createHash("sha256").update(JSON.stringify({ companyId:input.companyId, department:input.department, scopes:cleanArray(input.scopes).sort(), capabilities:cleanArray(input.capabilities).sort() })).digest("hex");
  return { id:`skill:${slug(input.skillId)}`, companyId:input.companyId, type:"skill", version:input.version ?? 1, parents:[...(input.parents ?? [])], contextSignature:signature, artifactRef:input.artifactRef, status:"candidate", fitness:{sampleSize:0,confidence:0,dimensions:{},cost:0,riskIncidents:0}, negativeResultRefs:[], experienceRefs:cleanArray(input.evidenceRefs) };
}

export function resolveCompanySkillMatches(input: { companyId: string; query: string; department?: string; scope?: string; capabilities: string[]; catalog: Array<SkillDefinition | SkillIndexEntry>; installations: CompanyAsset[]; genes: CorporateGene[]; companyDefinitions: SkillDefinition[]; limit?: number }): SkillMatch[] {
  for (const asset of input.installations) if (asset.companyId !== input.companyId) throw new Error("company mismatch in skill installation");
  for (const gene of input.genes) if (gene.companyId !== input.companyId) throw new Error("company mismatch in skill gene");
  for (const definition of input.companyDefinitions) if (definition.ownerCompanyId && definition.ownerCompanyId !== input.companyId) throw new Error("company mismatch in skill definition");
  const allDefinitions = [...definitions(input.catalog), ...input.companyDefinitions.map(validateSkillDefinition)];
  const registry = new SkillRegistry(allDefinitions, new NoopContent());
  const installations = input.installations.map(skillInstallationFromAsset).filter((i) => i.status === "active");
  const installedRefs = new Set(installations.map((i) => i.skillRef));
  const genesByArtifact = new Map<string, CorporateGene[]>();
  for (const gene of input.genes.filter((g) => g.type === "skill")) genesByArtifact.set(gene.artifactRef,[...(genesByArtifact.get(gene.artifactRef) ?? []),gene]);
  const matches = registry.search({ query:input.query, ...(input.department?{department:input.department}:{}), ...(input.scope?{scope:input.scope}:{}), capabilities:input.capabilities, domain:"company", companyId:input.companyId, limit:50 });
  return matches.filter((match) => {
    const ref=skillDefinitionRef(match.skill); if (!installedRefs.has(ref)) return false;
    const geneArtifactRef = match.skill.ownerCompanyId && match.skill.contentRef.startsWith("asset-body:") ? `asset://${match.skill.contentRef.slice("asset-body:".length)}` : ref;
    const genes=genesByArtifact.get(geneArtifactRef) ?? []; if (!genes.length) return true;
    return genes.some((gene)=>ACTIVE_GENE.has(gene.status));
  }).slice(0,input.limit ?? 8);
}
