import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type {
  LoadedSkill,
  SkillDefinition,
  SkillDefinitionStatus,
  SkillDomain,
  SkillIndexEntry,
  SkillMatch,
  SkillRegistryHealth,
  SkillRegistryIssue,
  SkillSearchInput,
} from "../../contracts/src/index.js";

const STATUS = new Set<SkillDefinitionStatus>(["active", "deprecated"]);
const DOMAIN = new Set<SkillDomain>(["company", "harness"]);
const RISK = new Set(["low", "medium", "high", "critical"]);
const PROVENANCE = new Set(["project", "kast", "human", "imported", "company"]);
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REF_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, field: string, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`invalid skill definition ${field}`);
  return value.trim();
}
function textArray(value: unknown, field: string, maxItems = 48): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`invalid skill definition ${field}`);
  return [...new Set(value.map((item) => text(item, field, 240)))];
}
function optionalText(value: unknown, field: string): string | undefined { return value === undefined ? undefined : text(value, field, 500); }
function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9._:+/-]+/g, " ").trim().replace(/\s+/g, " ");
}
function tokens(value: string): Set<string> { return new Set(normalize(value).split(" ").filter((item) => item.length >= 2)); }
function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0; for (const item of a) if (b.has(item)) common += 1;
  return common / Math.max(a.size, b.size);
}
function parseVersion(version: string): [number, number, number, string] {
  const [core = "0.0.0", suffix = ""] = version.split("-", 2);
  const p = core.split(".").map((v) => Number.parseInt(v, 10));
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, suffix];
}
function compareVersionDesc(a: string, b: string): number {
  const av = parseVersion(a), bv = parseVersion(b);
  for (let i = 0; i < 3; i += 1) if (av[i] !== bv[i]) return (bv[i] as number) - (av[i] as number);
  if (av[3] === bv[3]) return 0; if (!av[3]) return -1; if (!bv[3]) return 1;
  return String(av[3]).localeCompare(String(bv[3]));
}
export function skillDefinitionRef(skill: Pick<SkillIndexEntry, "id" | "version">): string { return `skill://${skill.id}@${skill.version}`; }

function validateContentRef(value: unknown): string {
  const ref = text(value, "contentRef", 800);
  if (!REF_SCHEME_RE.test(ref)) throw new Error("invalid skill definition contentRef scheme");
  if (ref.startsWith("file:")) {
    const path = ref.slice(5);
    if (!path || path.startsWith("/") || path.split(/[\\/]+/).includes("..")) throw new Error("invalid file skill contentRef");
  }
  return ref;
}

export function validateSkillDefinition(value: unknown): SkillDefinition {
  if (!isRecord(value)) throw new Error("invalid skill definition");
  if (value.schemaVersion !== 1) throw new Error("invalid skill definition schemaVersion");
  const id = text(value.id, "id", 80); if (!ID_RE.test(id)) throw new Error("invalid skill definition id");
  const version = text(value.version, "version", 80); if (!VERSION_RE.test(version)) throw new Error("invalid skill definition version");
  const status = text(value.status, "status", 20) as SkillDefinitionStatus; if (!STATUS.has(status)) throw new Error("invalid skill definition status");
  const domain = text(value.domain, "domain", 20) as SkillDomain; if (!DOMAIN.has(domain)) throw new Error("invalid skill definition domain");
  const risk = text(value.risk, "risk", 20); if (!RISK.has(risk)) throw new Error("invalid skill definition risk");
  const provenance = text(value.provenance, "provenance", 20); if (!PROVENANCE.has(provenance)) throw new Error("invalid skill definition provenance");
  const result: SkillDefinition = {
    schemaVersion: 1, id, name: text(value.name, "name", 160), version, domain, status,
    description: text(value.description, "description", 1200), triggers: textArray(value.triggers, "triggers"), scopes: textArray(value.scopes, "scopes", 32),
    capabilities: textArray(value.capabilities, "capabilities", 32), defaultDepartments: textArray(value.defaultDepartments, "defaultDepartments", 24),
    contentRef: validateContentRef(value.contentRef), risk: risk as SkillDefinition["risk"], provenance: provenance as SkillDefinition["provenance"],
  };
  const ownerCompanyId = optionalText(value.ownerCompanyId, "ownerCompanyId");
  const supersedes = optionalText(value.supersedes, "supersedes");
  const tags = value.tags === undefined ? [] : textArray(value.tags, "tags", 32);
  if (ownerCompanyId) result.ownerCompanyId = ownerCompanyId;
  if (supersedes) result.supersedes = supersedes;
  if (tags.length) result.tags = tags;
  if (result.provenance === "company" && !result.ownerCompanyId) throw new Error("company skill definition requires ownerCompanyId");
  if (result.ownerCompanyId && result.domain !== "company") throw new Error("company-owned skill must use company domain");
  return result;
}

function toIndex(definition: SkillDefinition): SkillIndexEntry {
  const entry: SkillIndexEntry = {
    id: definition.id, name: definition.name, version: definition.version, domain: definition.domain, status: definition.status, description: definition.description,
    triggers: [...definition.triggers], scopes: [...definition.scopes], capabilities: [...definition.capabilities], defaultDepartments: [...definition.defaultDepartments],
    contentRef: definition.contentRef, risk: definition.risk, provenance: definition.provenance, tags: [...(definition.tags ?? [])],
  };
  if (definition.ownerCompanyId) entry.ownerCompanyId = definition.ownerCompanyId;
  return entry;
}
function scopeOverlap(a: string[], b: string[]): boolean {
  if (a.includes("*") || b.includes("*")) return true;
  const left = new Set(a.map(normalize)); return b.some((v) => left.has(normalize(v)));
}
function registryIssues(entries: SkillIndexEntry[]): SkillRegistryIssue[] {
  const issues: SkillRegistryIssue[] = [];
  const byRef = new Map<string, SkillIndexEntry[]>(), byId = new Map<string, SkillIndexEntry[]>();
  for (const item of entries) {
    const ref = skillDefinitionRef(item); byRef.set(ref, [...(byRef.get(ref) ?? []), item]); byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
  }
  for (const [ref, group] of byRef) if (group.length > 1) issues.push({ kind: "duplicate-version", severity: "error", skillRefs: [ref], detail: `duplicate skill version: ${ref}` });
  for (const [id, group] of byId) {
    const active = group.filter((item) => item.status === "active");
    if (active.length > 1) issues.push({ kind: "multiple-active-versions", severity: "error", skillRefs: active.map(skillDefinitionRef).sort(), detail: `multiple active versions for skill: ${id}` });
  }
  const active = entries.filter((item) => item.status === "active");
  for (let i = 0; i < active.length; i += 1) {
    const left = active[i]; if (!left) continue;
    for (let j = i + 1; j < active.length; j += 1) {
      const right = active[j]; if (!right || left.id === right.id || left.domain !== right.domain || !scopeOverlap(left.scopes, right.scopes)) continue;
      if (left.ownerCompanyId !== right.ownerCompanyId) continue;
      const rightTriggers = new Set(right.triggers.map(normalize));
      const overlap = left.triggers.map(normalize).filter((trigger) => trigger && rightTriggers.has(trigger));
      if (overlap.length) issues.push({ kind: "trigger-conflict", severity: "warning", skillRefs: [skillDefinitionRef(left), skillDefinitionRef(right)].sort(), detail: `overlapping active trigger(s): ${[...new Set(overlap)].sort().join(", ")}` });
    }
  }
  return issues;
}
function eligible(item: SkillIndexEntry, input: SkillSearchInput): boolean {
  if (!input.includeDeprecated && item.status !== "active") return false;
  if (input.domain && item.domain !== input.domain) return false;
  if (item.ownerCompanyId && item.ownerCompanyId !== input.companyId) return false;
  return true;
}
function score(item: SkillIndexEntry, input: SkillSearchInput): SkillMatch {
  const reasons: string[] = []; let scoreValue = 0;
  const query = normalize(input.query), qtokens = tokens(input.query), name = normalize(`${item.id} ${item.name}`);
  if (query && name.includes(query)) { scoreValue += 24; reasons.push("name"); }
  let triggerScore = 0;
  for (const trigger of item.triggers) {
    const t = normalize(trigger); if (!query || !t) continue;
    if (query.includes(t) || t.includes(query)) triggerScore = Math.max(triggerScore, 60);
    else triggerScore = Math.max(triggerScore, Math.round(overlapScore(qtokens, tokens(trigger)) * 40));
  }
  if (triggerScore) { scoreValue += triggerScore; reasons.push("trigger"); }
  const desc = Math.round(overlapScore(qtokens, tokens(item.description)) * 14); if (desc) { scoreValue += desc; reasons.push("description"); }
  if (input.scope) {
    const wanted = normalize(input.scope); if (item.scopes.some((v) => normalize(v) === wanted)) { scoreValue += 28; reasons.push("scope"); } else if (item.scopes.includes("*")) { scoreValue += 12; reasons.push("scope:*"); }
  }
  if (input.department) {
    const dept = normalize(input.department); if (item.defaultDepartments.some((v) => normalize(v) === dept)) { scoreValue += 24; reasons.push("department"); }
  }
  if (input.capabilities?.length) {
    const available = new Set(item.capabilities.map(normalize)); const matched = input.capabilities.filter((cap) => available.has(normalize(cap)));
    if (matched.length) { scoreValue += matched.length * 20; reasons.push(`capability:${matched.length}`); }
  }
  if (item.ownerCompanyId) { scoreValue += 2; reasons.push("company-local"); }
  return { skill: structuredClone(item), score: scoreValue, reasons };
}
function assertLimit(limit: number | undefined): number { const value = limit ?? 8; if (!Number.isInteger(value) || value < 1 || value > 50) throw new Error("skill search limit must be 1..50"); return value; }

export interface SkillContentPort { exists(contentRef: string): Promise<boolean>; read(contentRef: string): Promise<string>; }
export class FileSystemSkillContentPort implements SkillContentPort {
  constructor(private readonly root: string) {}
  private path(contentRef: string): string {
    if (!contentRef.startsWith("file:")) throw new Error(`unsupported file skill content ref: ${contentRef}`);
    const raw = contentRef.slice(5), absolute = resolve(this.root, raw), rel = relative(this.root, absolute);
    if (!rel || rel === "." || rel.startsWith("..") || resolve(this.root, rel) !== absolute) throw new Error("skill contentRef escapes registry root");
    return absolute;
  }
  async exists(contentRef: string): Promise<boolean> { try { return (await stat(this.path(contentRef))).isFile(); } catch { return false; } }
  async read(contentRef: string): Promise<string> { return readFile(this.path(contentRef), "utf8"); }
}

export class SkillRegistry {
  private readonly entries: SkillIndexEntry[]; private readonly issues: SkillRegistryIssue[];
  constructor(definitions: SkillDefinition[], private readonly content: SkillContentPort) {
    this.entries = definitions.map((d) => toIndex(validateSkillDefinition(d))).sort((a,b) => a.id.localeCompare(b.id) || compareVersionDesc(a.version,b.version));
    this.issues = registryIssues(this.entries);
  }
  private assertSafe(): void { const blocking = this.issues.filter((i) => i.severity === "error"); if (blocking.length) throw new Error(`skill registry unsafe: ${blocking.map((i) => i.detail).join("; ")}`); }
  list(options: { domain?: SkillDomain; companyId?: string; includeDeprecated?: boolean } = {}): SkillIndexEntry[] {
    this.assertSafe(); const input: SkillSearchInput = { query: "", ...options }; return this.entries.filter((item) => eligible(item,input)).map((item) => structuredClone(item));
  }
  search(input: SkillSearchInput): SkillMatch[] {
    this.assertSafe(); const limit = assertLimit(input.limit);
    if (!input.query.trim() && !input.scope?.trim() && !input.department?.trim() && !(input.capabilities?.length)) throw new Error("skill search requires query, scope, department or capability");
    return this.entries.filter((item) => eligible(item,input)).map((item) => score(item,input)).filter((m) => m.score > 0).sort((a,b) => b.score-a.score || a.skill.id.localeCompare(b.skill.id) || compareVersionDesc(a.skill.version,b.skill.version)).slice(0,limit);
  }
  resolveRef(ref: string, options: { domain?: SkillDomain; companyId?: string; includeDeprecated?: boolean } = {}): SkillIndexEntry | null {
    this.assertSafe(); const match = this.entries.find((item) => skillDefinitionRef(item) === ref && eligible(item,{ query:"", ...options })); return match ? structuredClone(match) : null;
  }
  async get(id: string, options: { version?: string; domain?: SkillDomain; companyId?: string; includeDeprecated?: boolean } = {}): Promise<LoadedSkill | null> {
    this.assertSafe(); const matches = this.entries.filter((item) => item.id === id && eligible(item,{query:"",...options})).filter((item) => options.version ? item.version === options.version : true).sort((a,b)=>compareVersionDesc(a.version,b.version));
    const selected = matches[0]; if (!selected) return null;
    if (!(await this.content.exists(selected.contentRef))) throw new Error(`skill content missing: ${skillDefinitionRef(selected)}`);
    return { manifest: structuredClone(selected), body: await this.content.read(selected.contentRef) };
  }
  async health(): Promise<SkillRegistryHealth> {
    const issues = this.issues.map((item) => structuredClone(item));
    for (const item of this.entries) if (item.contentRef.startsWith("file:") && !(await this.content.exists(item.contentRef))) issues.push({ kind: "missing-content", severity: "error", skillRefs:[skillDefinitionRef(item)], detail:`skill content missing: ${item.contentRef}` });
    return { ok: !issues.some((i)=>i.severity==="error"), indexed:this.entries.length, active:this.entries.filter((i)=>i.status==="active").length, companySkills:this.entries.filter((i)=>i.domain==="company").length, harnessSkills:this.entries.filter((i)=>i.domain==="harness").length, issues };
  }
}

export async function loadSkillDefinitions(skillRoot: string): Promise<SkillDefinition[]> {
  const dirs = await readdir(skillRoot,{withFileTypes:true}); const definitions: SkillDefinition[]=[];
  for (const dir of dirs.filter((d)=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=resolve(skillRoot,dir.name,"skill.json");
    try { definitions.push(validateSkillDefinition(JSON.parse(await readFile(path,"utf8")) as unknown)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new Error(`invalid skill registry definition ${dir.name}: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
  return definitions;
}
export async function createFileSystemSkillRegistry(repoRoot: string): Promise<SkillRegistry> { return new SkillRegistry(await loadSkillDefinitions(resolve(repoRoot,"skills")), new FileSystemSkillContentPort(repoRoot)); }
