import { timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { BusinessCapability, BusinessEvidence, BusinessFact, BusinessUnknown, CompanyIntakeInput } from "../../../packages/contracts/src/index.js";
import { JwtOAuthVerifier, assertMcpDeploymentAuth, hasScope, oauthChallenge, protectedResourceMetadata, type XspaAuthContext, type XspaOAuthConfig } from "./oauth.js";

export interface XspaAppStatus {
  version: string;
  modelLaw: { executive: "gpt-5.6-sol/max"; branches: "gpt-5.6-sol/xhigh"; fallback: false };
  mcp: { ready: boolean; mode: "streamable-http" };
  database: { configured: boolean };
  companyOs: { ready: boolean; intakeModes: ["new", "existing"]; lifecycleModes: ["bootstrap", "operate", "improve", "grow", "expand", "recover", "exit"] };
  creative: { configured: boolean; renderer: "responses-image-generation"; chatMode: "decision-only"; video: "staged" };
  kast: { configured: boolean; execution: "queued" | "available" | "staged" };
  skills: { configured: boolean; healthy: boolean; indexed: number; activeCompanyCatalog: number };
}

export interface WorkCreateInput {
  workId: string;
  owner: string;
  objective: string;
  scope: string;
}

export interface CreativeSubmitInput {
  missionId: string;
  workId: string;
  briefRef: string;
  evidenceSnapshotRef: string;
  candidateCount: number;
  requiredSuccessfulCandidates: number;
  executiveEscalationRequired: boolean;
}

export interface KastReflectInput {
  reflectionId: string;
  sessionRef: string;
  mode: "noop" | "remember" | "improve";
  category: "bug" | "friction" | "opportunity" | "performance" | "security" | "test-gap" | "repeated-workaround";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  evidenceRefs: string[];
  recurrence: number;
  affectedSurfaces: string[];
  strategyOverlays: string[];
}

export interface SkillSearchRequest {
  query: string;
  scope?: string;
  department?: string;
  capabilities: string[];
  limit: number;
}

export interface SkillGetRequest {
  skillId: string;
  version?: string;
}

export interface SkillInstallInput {
  installationId: string;
  skillRef: string;
  department: string;
  scopes: string[];
}

export interface ObservedProcessRequest {
  id: string;
  name: string;
  department: string;
  description: string;
  capabilities: string[];
  triggers: string[];
  evidenceRefs: string[];
}

export interface CompanySkillPlanInput {
  mode: "new" | "existing";
  purpose: string;
  departments: string[];
  requiredCapabilities: string[];
  observedProcesses: ObservedProcessRequest[];
}

export interface CompanyPlanInput {
  intake: CompanyIntakeInput;
}

export interface CompanyApplyInput extends CompanyPlanInput {
  formationId: string;
  expectedFingerprint?: string;
}

export interface CompanyDiscoveryPlanInput {
  evidence: BusinessEvidence[];
  facts: Omit<BusinessFact, "revisionId">[];
  unknowns: BusinessUnknown[];
  capabilities: BusinessCapability[];
  parentRevisionId?: string;
}

export interface CompanyDiscoveryApplyInput extends CompanyDiscoveryPlanInput {
  discoveryId: string;
  expectedFingerprint?: string;
}

export interface AutoskillProposeInput {
  proposalId: string;
  skillId: string;
  name: string;
  description: string;
  instructions: string;
  department: string;
  triggers: string[];
  scopes: string[];
  capabilities: string[];
  evidenceRefs: string[];
}

export interface GlobalSkillPromotionInput {
  proposalId: string;
  sessionRef: string;
  skillId: string;
  summary: string;
  evidenceRefs: string[];
  severity: "low" | "medium" | "high" | "critical";
}

export interface XspaRequestContext { principal: string; scopes: string[] }
export interface XspaAppOperations {
  status(): Promise<XspaAppStatus>;
  workCreate(input: WorkCreateInput, context: XspaRequestContext): Promise<unknown>;
  workGet(workId: string, context: XspaRequestContext): Promise<unknown>;
  kastStatus(reflectionId: string, context: XspaRequestContext): Promise<unknown>;
  assetGet(assetId: string, context: XspaRequestContext): Promise<unknown>;
  creativeSubmit(input: CreativeSubmitInput, context: XspaRequestContext): Promise<unknown>;
  creativeStatus(missionId: string, context: XspaRequestContext): Promise<unknown>;
  skillsList(context: XspaRequestContext): Promise<unknown>;
  skillsSearch(input: SkillSearchRequest, context: XspaRequestContext): Promise<unknown>;
  skillGet(input: SkillGetRequest, context: XspaRequestContext): Promise<unknown>;
  skillInstall(input: SkillInstallInput, context: XspaRequestContext): Promise<unknown>;
  skillsHealth(context: XspaRequestContext): Promise<unknown>;
  companySkillPlan(input: CompanySkillPlanInput, context: XspaRequestContext): Promise<unknown>;
  companyDiscoveryPlan(input: CompanyDiscoveryPlanInput, context: XspaRequestContext): Promise<unknown>;
  companyDiscoveryApply(input: CompanyDiscoveryApplyInput, context: XspaRequestContext): Promise<unknown>;
  companyDiscoveryStatus(context: XspaRequestContext): Promise<unknown>;
  companyPlan(input: CompanyPlanInput, context: XspaRequestContext): Promise<unknown>;
  companyApply(input: CompanyApplyInput, context: XspaRequestContext): Promise<unknown>;
  companyStatus(context: XspaRequestContext): Promise<unknown>;
  autoskillPropose(input: AutoskillProposeInput, context: XspaRequestContext): Promise<unknown>;
  globalSkillPromotionPropose(input: GlobalSkillPromotionInput, context: XspaRequestContext): Promise<unknown>;
  kastReflect(input: KastReflectInput, context: XspaRequestContext): Promise<unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KAST_SURFACES = new Set(["skill","routing","prompt","process","heuristic","parallelism-policy","adapter","performance","test","ux","memory-strategy","developer-experience","model-law","constitution","authority-root","secret-isolation","kast-law","review-law","memory-law","human-reserved-boundary"]);

function assertId(value: unknown, name: string): string { if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${name} must be a UUID`); return value; }
function assertText(value: unknown, name: string, max = 2000): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} invalid`); return value.trim(); }
function assertStringArray(value: unknown, name: string, maxItems = 16): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 500)) throw new Error(`${name} invalid`);
  return value.map((item) => item.trim()).filter(Boolean);
}
function secureEqual(expected: string, actual: string): boolean { const a = Buffer.from(expected); const b = Buffer.from(actual); return a.length === b.length && timingSafeEqual(a, b); }
function safeToolError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "XanxitoSpA tool failed";
  return raw
    .replace(/bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 300);
}
function toolResult(data: unknown, text: string) { return { content: [{ type: "text" as const, text }], structuredContent: data && typeof data === "object" ? data as Record<string, unknown> : { result: data } }; }

function parseWorkCreate(args: unknown): WorkCreateInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  return {
    workId: assertId(obj.work_id, "work_id"),
    owner: assertText(obj.owner, "owner", 200),
    objective: assertText(obj.objective, "objective", 4000),
    scope: assertText(obj.scope, "scope", 4000),
  };
}

function parseCreativeSubmit(args: unknown): CreativeSubmitInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const candidateCount = typeof obj.candidate_count === "number" ? obj.candidate_count : 2;
  const required = typeof obj.required_successful_candidates === "number" ? obj.required_successful_candidates : 1;
  if (!Number.isInteger(candidateCount) || candidateCount < 2 || candidateCount > 4) throw new Error("candidate_count must be 2..4");
  if (!Number.isInteger(required) || required < 1 || required > candidateCount) throw new Error("required_successful_candidates invalid");
  return {
    missionId: assertId(obj.mission_id, "mission_id"), workId: assertId(obj.work_id, "work_id"),
    briefRef: assertText(obj.brief_ref, "brief_ref", 500), evidenceSnapshotRef: assertText(obj.evidence_snapshot_ref, "evidence_snapshot_ref", 500),
    candidateCount, requiredSuccessfulCandidates: required, executiveEscalationRequired: obj.executive_escalation_required === true,
  };
}

function assertSkillId(value: unknown, name = "skill_id"): string {
  const result = assertText(value, name, 80);
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(result)) throw new Error(`${name} invalid`);
  return result;
}
function parseSkillSearch(args: unknown): SkillSearchRequest {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const limit = obj.limit === undefined ? 8 : obj.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50) throw new Error("limit must be 1..50");
  const scope = obj.scope === undefined ? undefined : assertText(obj.scope, "scope", 240);
  const department = obj.department === undefined ? undefined : assertText(obj.department, "department", 160);
  const result: SkillSearchRequest = { query: typeof obj.query === "string" ? obj.query.trim().slice(0, 1000) : "", capabilities: assertStringArray(obj.capabilities, "capabilities", 16), limit: limit as number };
  if (scope) result.scope = scope;
  if (department) result.department = department;
  if (!result.query && !result.scope && !result.department && result.capabilities.length === 0) throw new Error("skill search requires query, scope, department, or capabilities");
  return result;
}
function parseSkillGet(args: unknown): SkillGetRequest {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const version = obj.version === undefined ? undefined : assertText(obj.version, "version", 80);
  const result: SkillGetRequest = { skillId: assertSkillId(obj.skill_id) };
  if (version) result.version = version;
  return result;
}
function parseSkillInstall(args: unknown): SkillInstallInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const skillRef = assertText(obj.skill_ref, "skill_ref", 200);
  if (!/^skill:\/\/[a-z0-9][a-z0-9._-]{1,79}@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(skillRef)) throw new Error("skill_ref invalid");
  return { installationId: assertId(obj.installation_id, "installation_id"), skillRef, department: assertText(obj.department, "department", 160), scopes: assertStringArray(obj.scopes, "scopes", 32) };
}
function parseObservedProcesses(value: unknown): ObservedProcessRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error("observed_processes invalid");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`observed_processes[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    return { id: assertText(obj.id, `observed_processes[${index}].id`, 120), name: assertText(obj.name, `observed_processes[${index}].name`, 200), department: assertText(obj.department, `observed_processes[${index}].department`, 160), description: assertText(obj.description, `observed_processes[${index}].description`, 2000), capabilities: assertStringArray(obj.capabilities, `observed_processes[${index}].capabilities`, 32), triggers: assertStringArray(obj.triggers, `observed_processes[${index}].triggers`, 32), evidenceRefs: assertStringArray(obj.evidence_refs, `observed_processes[${index}].evidence_refs`, 32) };
  });
}
function parseCompanySkillPlan(args: unknown): CompanySkillPlanInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const mode = assertText(obj.mode, "mode", 20);
  if (mode !== "new" && mode !== "existing") throw new Error("mode must be new or existing");
  const departments = assertStringArray(obj.departments, "departments", 32);
  if (departments.length === 0) throw new Error("departments required");
  return { mode, purpose: assertText(obj.purpose, "purpose", 2000), departments, requiredCapabilities: assertStringArray(obj.required_capabilities, "required_capabilities", 64), observedProcesses: parseObservedProcesses(obj.observed_processes) };
}
function parseObservedDepartments(value: unknown): NonNullable<CompanyIntakeInput["observedDepartments"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("observed_departments invalid");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`observed_departments[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    return { id: assertText(obj.id, `observed_departments[${index}].id`, 120), name: assertText(obj.name, `observed_departments[${index}].name`, 200), functions: assertStringArray(obj.functions, `observed_departments[${index}].functions`, 32), responsibilities: assertStringArray(obj.responsibilities, `observed_departments[${index}].responsibilities`, 64), kpis: assertStringArray(obj.kpis, `observed_departments[${index}].kpis`, 64), evidenceRefs: assertStringArray(obj.evidence_refs, `observed_departments[${index}].evidence_refs`, 64) };
  });
}
function parseProposedDepartments(value: unknown): NonNullable<CompanyIntakeInput["proposedDepartments"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("proposed_departments invalid");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`proposed_departments[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    return { id: assertText(obj.id, `proposed_departments[${index}].id`, 120), name: assertText(obj.name, `proposed_departments[${index}].name`, 200), functions: assertStringArray(obj.functions, `proposed_departments[${index}].functions`, 32), responsibilities: assertStringArray(obj.responsibilities, `proposed_departments[${index}].responsibilities`, 64), kpis: assertStringArray(obj.kpis, `proposed_departments[${index}].kpis`, 64) };
  });
}
function parseProposedProcesses(value: unknown): NonNullable<CompanyIntakeInput["proposedProcesses"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) throw new Error("proposed_processes invalid");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`proposed_processes[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    return { id: assertText(obj.id, `proposed_processes[${index}].id`, 120), name: assertText(obj.name, `proposed_processes[${index}].name`, 200), department: assertText(obj.department, `proposed_processes[${index}].department`, 160), objective: assertText(obj.objective, `proposed_processes[${index}].objective`, 1000), description: assertText(obj.description, `proposed_processes[${index}].description`, 2000), triggers: assertStringArray(obj.triggers, `proposed_processes[${index}].triggers`, 32), requiredSkills: assertStringArray(obj.required_skills, `proposed_processes[${index}].required_skills`, 32), requiredCapabilities: assertStringArray(obj.required_capabilities, `proposed_processes[${index}].required_capabilities`, 64), evidenceRefs: assertStringArray(obj.evidence_refs, `proposed_processes[${index}].evidence_refs`, 64) };
  });
}
function parseBootstrapRequirements(value: unknown): NonNullable<CompanyIntakeInput["bootstrapRequirements"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) throw new Error("bootstrap_requirements invalid");
  const boundaries = new Set(["none", "kyc", "contract", "financial-authority", "identity", "reserved-action"]);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`bootstrap_requirements[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    const estimatedCost = typeof obj.estimated_cost === "number" ? obj.estimated_cost : 0;
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new Error(`bootstrap_requirements[${index}].estimated_cost invalid`);
    const humanBoundary = assertText(obj.human_boundary ?? "none", `bootstrap_requirements[${index}].human_boundary`, 40);
    if (!boundaries.has(humanBoundary)) throw new Error(`bootstrap_requirements[${index}].human_boundary invalid`);
    return { id: assertText(obj.id, `bootstrap_requirements[${index}].id`, 120), capability: assertText(obj.capability, `bootstrap_requirements[${index}].capability`, 160), assetKind: assertText(obj.asset_kind, `bootstrap_requirements[${index}].asset_kind`, 160), department: assertText(obj.department, `bootstrap_requirements[${index}].department`, 160), estimatedCost, currency: assertText(obj.currency, `bootstrap_requirements[${index}].currency`, 16), humanBoundary: humanBoundary as NonNullable<CompanyIntakeInput["bootstrapRequirements"]>[number]["humanBoundary"], preferredProviderIds: assertStringArray(obj.preferred_provider_ids, `bootstrap_requirements[${index}].preferred_provider_ids`, 16) };
  });
}
function parseCompanyIntake(args: unknown): CompanyPlanInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const mode = assertText(obj.mode, "mode", 20);
  if (mode !== "new" && mode !== "existing") throw new Error("mode must be new or existing");
  const objectives = assertStringArray(obj.objectives, "objectives", 64);
  if (objectives.length === 0) throw new Error("objectives required");
  return { intake: { mode, purpose: assertText(obj.purpose, "purpose", 2000), businessModel: assertText(obj.business_model, "business_model", 2000), jurisdiction: assertText(obj.jurisdiction, "jurisdiction", 120), timezone: assertText(obj.timezone, "timezone", 120), objectives, requiredFunctions: assertStringArray(obj.required_functions, "required_functions", 32), observedDepartments: parseObservedDepartments(obj.observed_departments), observedProcesses: parseObservedProcesses(obj.observed_processes), proposedDepartments: parseProposedDepartments(obj.proposed_departments), proposedProcesses: parseProposedProcesses(obj.proposed_processes), requiredCapabilities: assertStringArray(obj.required_capabilities, "required_capabilities", 128), bootstrapRequirements: parseBootstrapRequirements(obj.bootstrap_requirements) } };
}
function parseCompanyApply(args: unknown): CompanyApplyInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const plan = parseCompanyIntake(obj);
  const result: CompanyApplyInput = { formationId: assertId(obj.formation_id, "formation_id"), intake: plan.intake };
  if (obj.expected_fingerprint !== undefined) {
    const fingerprint = assertText(obj.expected_fingerprint, "expected_fingerprint", 64);
    if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error("expected_fingerprint invalid");
    result.expectedFingerprint = fingerprint.toLowerCase();
  }
  return result;
}

function parseAutoskillPropose(args: unknown): AutoskillProposeInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const triggers = assertStringArray(obj.triggers, "triggers", 32);
  const scopes = assertStringArray(obj.scopes, "scopes", 16);
  const capabilities = assertStringArray(obj.capabilities, "capabilities", 32);
  if (triggers.length === 0 || scopes.length === 0 || capabilities.length === 0) throw new Error("autoskill requires triggers, scopes and capabilities");
  return { proposalId: assertId(obj.proposal_id, "proposal_id"), skillId: assertSkillId(obj.skill_id), name: assertText(obj.name, "name", 160), description: assertText(obj.description, "description", 1200), instructions: assertText(obj.instructions, "instructions", 4000), department: assertText(obj.department, "department", 160), triggers, scopes, capabilities, evidenceRefs: assertStringArray(obj.evidence_refs, "evidence_refs", 32) };
}
function parseGlobalSkillPromotion(args: unknown): GlobalSkillPromotionInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const severity = obj.severity === undefined ? "medium" : assertText(obj.severity, "severity", 20);
  if (!["low", "medium", "high", "critical"].includes(severity)) throw new Error("severity invalid");
  return { proposalId: assertId(obj.proposal_id, "proposal_id"), sessionRef: assertText(obj.session_ref, "session_ref", 500), skillId: assertSkillId(obj.skill_id), summary: assertText(obj.summary, "summary", 1200), evidenceRefs: assertStringArray(obj.evidence_refs, "evidence_refs", 32), severity: severity as GlobalSkillPromotionInput["severity"] };
}

function parseKastReflect(args: unknown): KastReflectInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const modes = new Set(["noop", "remember", "improve"]), categories = new Set(["bug", "friction", "opportunity", "performance", "security", "test-gap", "repeated-workaround"]), severities = new Set(["low", "medium", "high", "critical"]);
  const mode = assertText(obj.mode, "mode", 20), category = assertText(obj.category, "category", 40), severity = assertText(obj.severity, "severity", 20);
  const recurrence = typeof obj.recurrence === "number" ? obj.recurrence : 1;
  if (!modes.has(mode) || !categories.has(category) || !severities.has(severity)) throw new Error("KAST enum invalid");
  if (!Number.isInteger(recurrence) || recurrence < 1 || recurrence > 100000) throw new Error("recurrence invalid");
  const affectedSurfaces = assertStringArray(obj.affected_surfaces, "affected_surfaces", 16);
  if (affectedSurfaces.some((surface) => !KAST_SURFACES.has(surface))) throw new Error("affected_surfaces contains unknown KAST surface");
  return {
    reflectionId: assertId(obj.reflection_id, "reflection_id"), sessionRef: assertText(obj.session_ref, "session_ref", 500),
    mode: mode as KastReflectInput["mode"], category: category as KastReflectInput["category"], severity: severity as KastReflectInput["severity"],
    summary: assertText(obj.summary, "summary", 2000), evidenceRefs: assertStringArray(obj.evidence_refs, "evidence_refs", 32), recurrence,
    affectedSurfaces, strategyOverlays: assertStringArray(obj.strategy_overlays, "strategy_overlays", 4),
  };
}


function parseCompanyDiscovery(args: unknown): CompanyDiscoveryPlanInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const evidenceRaw = Array.isArray(obj.evidence) ? obj.evidence : [];
  const factsRaw = Array.isArray(obj.facts) ? obj.facts : [];
  const unknownsRaw = Array.isArray(obj.unknowns) ? obj.unknowns : [];
  const capabilitiesRaw = Array.isArray(obj.capabilities) ? obj.capabilities : [];
  if (evidenceRaw.length > 256 || factsRaw.length > 256 || unknownsRaw.length > 128 || capabilitiesRaw.length > 128) throw new Error("company discovery payload too large");
  const evidence = evidenceRaw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`evidence[${index}] invalid`);
    const item = entry as Record<string, unknown>; const source = item.source as Record<string, unknown> | undefined;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(`evidence[${index}].source invalid`);
    const confidenceCeiling = Number(item.confidence_ceiling ?? item.confidenceCeiling);
    if (!Number.isFinite(confidenceCeiling) || confidenceCeiling < 0 || confidenceCeiling > 1) throw new Error(`evidence[${index}].confidence_ceiling invalid`);
    const sourceKind = assertText(source.kind, `evidence[${index}].source.kind`, 40); if (!new Set(["owner","system","document","interview","integration","observation"]).has(sourceKind)) throw new Error(`evidence[${index}].source.kind invalid`); const result: BusinessEvidence = { id: assertText(item.id, `evidence[${index}].id`, 160), source: { id: assertText(source.id, `evidence[${index}].source.id`, 160), kind: sourceKind as BusinessEvidence["source"]["kind"], label: assertText(source.label, `evidence[${index}].source.label`, 240) }, kind: assertText(item.kind, `evidence[${index}].kind`, 120), observedAt: assertText(item.observed_at ?? item.observedAt, `evidence[${index}].observed_at`, 80), statement: assertText(item.statement, `evidence[${index}].statement`, 4000), confidenceCeiling };
    if (item.content_ref || item.contentRef) result.contentRef = assertText(item.content_ref ?? item.contentRef, `evidence[${index}].content_ref`, 500);
    return result;
  });
  const facts = factsRaw.map((entry, index) => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`facts[${index}] invalid`); const item = entry as Record<string, unknown>; const confidence = Number(item.confidence); if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`facts[${index}].confidence invalid`); const status = assertText(item.status, `facts[${index}].status`, 40); if (!new Set(["observed","inferred","owner-confirmed"]).has(status)) throw new Error(`facts[${index}].status invalid`); return { id: assertText(item.id, `facts[${index}].id`, 160), statement: assertText(item.statement, `facts[${index}].statement`, 4000), status: status as Omit<BusinessFact, "revisionId">["status"], confidence, evidenceRefs: assertStringArray(item.evidence_refs ?? item.evidenceRefs, `facts[${index}].evidence_refs`, 64), provenance: assertText(item.provenance, `facts[${index}].provenance`, 240) }; });
  const unknowns = unknownsRaw.map((entry, index) => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`unknowns[${index}] invalid`); const item = entry as Record<string, unknown>; const priority = assertText(item.priority, `unknowns[${index}].priority`, 20); const status = assertText(item.status ?? "open", `unknowns[${index}].status`, 20); if (!new Set(["low","normal","high","critical"]).has(priority) || !new Set(["open","resolved","dismissed"]).has(status)) throw new Error(`unknowns[${index}] enum invalid`); const result: BusinessUnknown = { id: assertText(item.id, `unknowns[${index}].id`, 160), question: assertText(item.question, `unknowns[${index}].question`, 2000), category: assertText(item.category, `unknowns[${index}].category`, 120), priority: priority as BusinessUnknown["priority"], status: status as BusinessUnknown["status"] }; if (item.resolution_ref || item.resolutionRef) result.resolutionRef = assertText(item.resolution_ref ?? item.resolutionRef, `unknowns[${index}].resolution_ref`, 500); return result; });
  const capabilities = capabilitiesRaw.map((entry, index) => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`capabilities[${index}] invalid`); const item = entry as Record<string, unknown>; const confidence = Number(item.confidence); if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`capabilities[${index}].confidence invalid`); const criticality = assertText(item.criticality, `capabilities[${index}].criticality`, 20); if (!new Set(["supporting","important","critical"]).has(criticality)) throw new Error(`capabilities[${index}].criticality invalid`); const result: BusinessCapability = { id: assertText(item.id, `capabilities[${index}].id`, 160), name: assertText(item.name, `capabilities[${index}].name`, 160), description: assertText(item.description, `capabilities[${index}].description`, 2000), criticality: criticality as BusinessCapability["criticality"], confidence, factRefs: assertStringArray(item.fact_refs ?? item.factRefs, `capabilities[${index}].fact_refs`, 64), evidenceRefs: assertStringArray(item.evidence_refs ?? item.evidenceRefs, `capabilities[${index}].evidence_refs`, 64) }; if (item.preferred_department_hint || item.preferredDepartmentHint) result.preferredDepartmentHint = assertText(item.preferred_department_hint ?? item.preferredDepartmentHint, `capabilities[${index}].preferred_department_hint`, 160); return result; });
  const result: CompanyDiscoveryPlanInput = { evidence, facts, unknowns, capabilities };
  if (obj.parent_revision_id) result.parentRevisionId = assertId(obj.parent_revision_id, "parent_revision_id");
  return result;
}

function parseCompanyDiscoveryApply(args: unknown): CompanyDiscoveryApplyInput {
  const obj = (args && typeof args === "object" && !Array.isArray(args)) ? args as Record<string, unknown> : {};
  const parsed = parseCompanyDiscovery(args);
  const result: CompanyDiscoveryApplyInput = { ...parsed, discoveryId: assertId(obj.discovery_id, "discovery_id") };
  if (obj.expected_fingerprint !== undefined) { const value = assertText(obj.expected_fingerprint, "expected_fingerprint", 64); if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("expected_fingerprint invalid"); result.expectedFingerprint = value; }
  return result;
}

function challenge(oauth: XspaOAuthConfig | undefined, scope: string) {
  if (!oauth) return { isError: true, content: [{ type: "text" as const, text: "Authentication required." }] };
  return { isError: true, content: [{ type: "text" as const, text: "Authentication required." }], _meta: { "mcp/www_authenticate": [oauthChallenge(oauth, scope)] } };
}
function requestContext(auth: XspaAuthContext): XspaRequestContext { return { principal: auth.subject || "chatgpt-app-user", scopes: [...auth.scopes] }; }


const COMPANY_DISCOVERY_SCHEMA_PROPERTIES = {
  parent_revision_id: { type: "string", format: "uuid" },
  evidence: { type: "array", maxItems: 256, items: { type: "object", properties: { id: { type: "string", maxLength: 160 }, source: { type: "object", properties: { id: { type: "string", maxLength: 160 }, kind: { type: "string", enum: ["owner","system","document","interview","integration","observation"] }, label: { type: "string", maxLength: 240 } }, required: ["id","kind","label"], additionalProperties: false }, kind: { type: "string", maxLength: 120 }, observed_at: { type: "string", maxLength: 80 }, statement: { type: "string", maxLength: 4000 }, confidence_ceiling: { type: "number", minimum: 0, maximum: 1 }, content_ref: { type: "string", maxLength: 500 } }, required: ["id","source","kind","observed_at","statement","confidence_ceiling"], additionalProperties: false } },
  facts: { type: "array", maxItems: 256, items: { type: "object", properties: { id: { type: "string", maxLength: 160 }, statement: { type: "string", maxLength: 4000 }, status: { type: "string", enum: ["observed","inferred","owner-confirmed"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 64 }, provenance: { type: "string", maxLength: 240 } }, required: ["id","statement","status","confidence","provenance"], additionalProperties: false } },
  unknowns: { type: "array", maxItems: 128, items: { type: "object", properties: { id: { type: "string", maxLength: 160 }, question: { type: "string", maxLength: 2000 }, category: { type: "string", maxLength: 120 }, priority: { type: "string", enum: ["low","normal","high","critical"] }, status: { type: "string", enum: ["open","resolved","dismissed"] }, resolution_ref: { type: "string", maxLength: 500 } }, required: ["id","question","category","priority"], additionalProperties: false } },
  capabilities: { type: "array", maxItems: 128, items: { type: "object", properties: { id: { type: "string", maxLength: 160 }, name: { type: "string", maxLength: 160 }, description: { type: "string", maxLength: 2000 }, criticality: { type: "string", enum: ["supporting","important","critical"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, fact_refs: { type: "array", items: { type: "string" }, maxItems: 64 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 64 }, preferred_department_hint: { type: "string", maxLength: 160 } }, required: ["id","name","description","criticality","confidence"], additionalProperties: false } },
};
function companyDiscoverySchema(extraProperties: Record<string, unknown> = {}, extraRequired: string[] = []) { return { type: "object" as const, properties: { ...extraProperties, ...COMPANY_DISCOVERY_SCHEMA_PROPERTIES }, required: extraRequired, additionalProperties: false }; }

const COMPANY_INTAKE_SCHEMA_PROPERTIES = {
  mode: { type: "string", enum: ["new", "existing"] },
  purpose: { type: "string", maxLength: 2000 },
  business_model: { type: "string", maxLength: 2000 },
  jurisdiction: { type: "string", maxLength: 120 },
  timezone: { type: "string", maxLength: 120 },
  objectives: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 64 },
  required_functions: { type: "array", items: { type: "string" }, maxItems: 32 },
  observed_departments: { type: "array", maxItems: 64, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, name: { type: "string", maxLength: 200 }, functions: { type: "array", items: { type: "string" }, maxItems: 32 }, responsibilities: { type: "array", items: { type: "string" }, maxItems: 64 }, kpis: { type: "array", items: { type: "string" }, maxItems: 64 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 64 } }, required: ["id", "name"], additionalProperties: false } },
  observed_processes: { type: "array", maxItems: 100, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, name: { type: "string", maxLength: 200 }, department: { type: "string", maxLength: 160 }, description: { type: "string", maxLength: 2000 }, capabilities: { type: "array", items: { type: "string" }, maxItems: 32 }, triggers: { type: "array", items: { type: "string" }, maxItems: 32 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 32 } }, required: ["id", "name", "department", "description"], additionalProperties: false } },
  proposed_departments: { type: "array", maxItems: 64, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, name: { type: "string", maxLength: 200 }, functions: { type: "array", items: { type: "string" }, maxItems: 32 }, responsibilities: { type: "array", items: { type: "string" }, maxItems: 64 }, kpis: { type: "array", items: { type: "string" }, maxItems: 64 } }, required: ["id", "name", "functions"], additionalProperties: false } },
  proposed_processes: { type: "array", maxItems: 128, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, name: { type: "string", maxLength: 200 }, department: { type: "string", maxLength: 160 }, objective: { type: "string", maxLength: 1000 }, description: { type: "string", maxLength: 2000 }, triggers: { type: "array", items: { type: "string" }, maxItems: 32 }, required_skills: { type: "array", items: { type: "string" }, maxItems: 32 }, required_capabilities: { type: "array", items: { type: "string" }, maxItems: 64 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 64 } }, required: ["id", "name", "department", "objective", "description"], additionalProperties: false } },
  required_capabilities: { type: "array", items: { type: "string" }, maxItems: 128 },
  bootstrap_requirements: { type: "array", maxItems: 128, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, capability: { type: "string", maxLength: 160 }, asset_kind: { type: "string", maxLength: 160 }, department: { type: "string", maxLength: 160 }, estimated_cost: { type: "number", minimum: 0 }, currency: { type: "string", maxLength: 16 }, human_boundary: { type: "string", enum: ["none", "kyc", "contract", "financial-authority", "identity", "reserved-action"] }, preferred_provider_ids: { type: "array", items: { type: "string" }, maxItems: 16 } }, required: ["id", "capability", "asset_kind", "department", "currency", "human_boundary"], additionalProperties: false } },
};
const COMPANY_INTAKE_SCHEMA_REQUIRED = ["mode", "purpose", "business_model", "jurisdiction", "timezone", "objectives"];
function companyIntakeSchema(extraProperties: Record<string, unknown> = {}, extraRequired: string[] = []) {
  return { type: "object" as const, properties: { ...extraProperties, ...COMPANY_INTAKE_SCHEMA_PROPERTIES }, required: [...extraRequired, ...COMPANY_INTAKE_SCHEMA_REQUIRED], additionalProperties: false };
}

export function createXspaMcpServer(operations: XspaAppOperations, input: { auth: XspaAuthContext; oauth?: XspaOAuthConfig }): Server {
  const server = new Server({ name: "xanxitospa", version: "1.0.0" }, { capabilities: { tools: {} } });
  const readSchemes = input.oauth ? [{ type: "oauth2", scopes: [input.oauth.readScope] }] : [{ type: "noauth" }];
  const writeSchemes = input.oauth ? [{ type: "oauth2", scopes: [input.oauth.writeScope] }] : [{ type: "noauth" }];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    { name: "xspa_status", title: "XanxitoSpA status", description: "Use this when you need runtime and Model Law readiness. This is public metadata and never returns secrets.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: [{ type: "noauth" }], _meta: { securitySchemes: [{ type: "noauth" }] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_work_create", title: "Create company Work", description: "Use this to create one Company-scoped Work item before material execution. The deployment owns company identity; creating Work does not grant authority or budget.", inputSchema: { type: "object", properties: { work_id: { type: "string", format: "uuid" }, owner: { type: "string", maxLength: 200 }, objective: { type: "string", maxLength: 4000 }, scope: { type: "string", maxLength: 4000 } }, required: ["work_id", "owner", "objective", "scope"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_work_get", title: "Get company Work", description: "Use this to read one Work item in the deployment Company scope. It cannot select another Company.", inputSchema: { type: "object", properties: { work_id: { type: "string", format: "uuid" } }, required: ["work_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_discovery_plan", title: "Plan Company discovery revision", description: "Build an evidence-based Company discovery revision. Read-only and descriptive: it grants no authority, budget, credentials or capabilities.", inputSchema: companyDiscoverySchema(), securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_discovery_apply", title: "Apply Company discovery revision", description: "Persist one evidence-based Company discovery revision with lineage and fingerprint. This cannot create Work or grant authority/budget/capabilities.", inputSchema: companyDiscoverySchema({ discovery_id: { type: "string", format: "uuid" }, expected_fingerprint: { type: "string", pattern: "^[a-fA-F0-9]{64}$" } }, ["discovery_id"]), securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_discovery_status", title: "Get Company discovery revision", description: "Read the latest deployment-scoped Company discovery revision. Discovery is descriptive and cannot authorize execution.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_plan", title: "Plan Company operating model", description: "Primary Generic Company OS intake. Plan a NEW Company or adopt an EXISTING Company into functions, departments, processes, skills and semantic capabilities. Existing departments/processes are preserved first. Read-only: grants no authority, budget or capabilities.", inputSchema: companyIntakeSchema(), securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_apply", title: "Apply Company operating model", description: "Persist one deployment-Company operating-model snapshot after planning. It does not create Work, execute providers, invoke KAST, or grant authority/budget/capabilities. Use expected_fingerprint to fail if the preview drifted.", inputSchema: companyIntakeSchema({ formation_id: { type: "string", format: "uuid" }, expected_fingerprint: { type: "string", pattern: "^[a-fA-F0-9]{64}$" } }, ["formation_id"]), securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_status", title: "Get Company operating model", description: "Read the latest deployment-scoped Company operating-model snapshot. This is the current Company OS model, not harness/KAST state.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_kast_status", title: "KAST reflection status", description: "Use this to inspect one Company-scoped KAST reflection/job state. It returns only sanitized status metadata.", inputSchema: { type: "object", properties: { reflection_id: { type: "string", format: "uuid" } }, required: ["reflection_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_asset_get", title: "Get selected company asset", description: "Use this to read one selected/chat-visible CompanyAsset descriptor. Internal creative candidates and local filesystem paths are never exposed.", inputSchema: { type: "object", properties: { asset_id: { type: "string", format: "uuid" } }, required: ["asset_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_creative_submit", title: "Submit creative mission", description: "Use this when the company should create visual work in the background. It queues a governed Creative Mission; candidates remain internal and ChatGPT receives decision-only metadata.", inputSchema: { type: "object", properties: { mission_id: { type: "string", format: "uuid" }, work_id: { type: "string", format: "uuid" }, brief_ref: { type: "string" }, evidence_snapshot_ref: { type: "string" }, candidate_count: { type: "integer", minimum: 2, maximum: 4, default: 2 }, required_successful_candidates: { type: "integer", minimum: 1, maximum: 4, default: 1 }, executive_escalation_required: { type: "boolean", default: false } }, required: ["mission_id", "work_id", "brief_ref", "evidence_snapshot_ref"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_creative_status", title: "Creative mission status", description: "Use this to read one creative mission state or selected decision receipt. Internal prompts and losing assets are never returned.", inputSchema: { type: "object", properties: { mission_id: { type: "string", format: "uuid" } }, required: ["mission_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skills_list", title: "List Company skills", description: "List reusable Company-domain catalog metadata, Company-local definitions and active installations for this deployment Company. Full skill bodies are not loaded.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skills_search", title: "Search Company skills", description: "Match installed Company skills for execution and return separate reusable catalog suggestions without loading full bodies.", inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 1000, default: "" }, scope: { type: "string", maxLength: 240 }, department: { type: "string", maxLength: 160 }, capabilities: { type: "array", items: { type: "string" }, maxItems: 16 }, limit: { type: "integer", minimum: 1, maximum: 50, default: 8 } }, additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skill_get", title: "Load installed Company skill", description: "Load one installed Company skill body after matching. Uninstalled catalog skills are not executable through this tool.", inputSchema: { type: "object", properties: { skill_id: { type: "string", maxLength: 80 }, version: { type: "string", maxLength: 80 } }, required: ["skill_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skill_install", title: "Install reusable Company skill", description: "Install one active reusable Company-domain skill into the deployment Company. Installation is idempotent and grants no authority, budget, credentials or capabilities.", inputSchema: { type: "object", properties: { installation_id: { type: "string", format: "uuid" }, skill_ref: { type: "string", maxLength: 200 }, department: { type: "string", maxLength: 160 }, scopes: { type: "array", items: { type: "string" }, maxItems: 32 } }, required: ["installation_id", "skill_ref", "department"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skills_health", title: "Skill Registry health", description: "Use this to detect manifest drift, missing bodies, duplicate active versions and trigger conflicts.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_company_skill_plan", title: "Plan Company skills", description: "Plan reusable skill installs, process mappings and company-local skill gaps for either a NEW or EXISTING Company. Existing processes are mapped before replacement.", inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["new", "existing"] }, purpose: { type: "string", maxLength: 2000 }, departments: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 32 }, required_capabilities: { type: "array", items: { type: "string" }, maxItems: 64 }, observed_processes: { type: "array", maxItems: 100, items: { type: "object", properties: { id: { type: "string", maxLength: 120 }, name: { type: "string", maxLength: 200 }, department: { type: "string", maxLength: 160 }, description: { type: "string", maxLength: 2000 }, capabilities: { type: "array", items: { type: "string" }, maxItems: 32 }, triggers: { type: "array", items: { type: "string" }, maxItems: 32 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 32 } }, required: ["id", "name", "department", "description"], additionalProperties: false } } }, required: ["mode", "purpose", "departments"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_autoskill_propose", title: "Create Company AutoSkill candidate", description: "Create a sanitized Company-local skill definition, install it for one department and register a CorporateGene type=skill candidate. This is Business Learning and does not use KAST or write the global catalog.", inputSchema: { type: "object", properties: { proposal_id: { type: "string", format: "uuid" }, skill_id: { type: "string", maxLength: 80 }, name: { type: "string", maxLength: 160 }, description: { type: "string", maxLength: 1200 }, instructions: { type: "string", maxLength: 4000 }, department: { type: "string", maxLength: 160 }, triggers: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 32 }, scopes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 16 }, capabilities: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 32 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 32 } }, required: ["proposal_id", "skill_id", "name", "description", "instructions", "department", "triggers", "scopes", "capabilities"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_skill_global_promotion_propose", title: "Propose global skill promotion", description: "Escalate a proven Company-local champion SkillGene for possible reusable global catalog promotion. This is the KAST-governed system-change boundary and never writes the global catalog directly.", inputSchema: { type: "object", properties: { proposal_id: { type: "string", format: "uuid" }, session_ref: { type: "string", maxLength: 500 }, skill_id: { type: "string", maxLength: 80 }, summary: { type: "string", maxLength: 1200 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 32 }, severity: { type: "string", enum: ["low", "medium", "high", "critical"], default: "medium" } }, required: ["proposal_id", "session_ref", "skill_id", "summary"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_kast_reflect", title: "KAST reflection", description: "Use this when GPT detects a harness bug, friction, test gap, workaround, security issue, or concrete improvement. Constitutional surfaces remain Founder/Board-only.", inputSchema: { type: "object", properties: { reflection_id: { type: "string", format: "uuid" }, session_ref: { type: "string" }, mode: { type: "string", enum: ["noop", "remember", "improve"] }, category: { type: "string", enum: ["bug", "friction", "opportunity", "performance", "security", "test-gap", "repeated-workaround"] }, severity: { type: "string", enum: ["low", "medium", "high", "critical"] }, summary: { type: "string", maxLength: 2000 }, evidence_refs: { type: "array", items: { type: "string" }, maxItems: 32 }, recurrence: { type: "integer", minimum: 1, default: 1 }, affected_surfaces: { type: "array", items: { type: "string", enum: [...KAST_SURFACES] }, maxItems: 16 }, strategy_overlays: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["reflection_id", "session_ref", "mode", "category", "severity", "summary"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  ] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name === "xspa_status") return toolResult(await operations.status(), "XanxitoSpA status loaded.");
      if (request.params.name === "xspa_company_discovery_plan") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.companyDiscoveryPlan(parseCompanyDiscovery(request.params.arguments), requestContext(input.auth)), "Company discovery revision planned.");
      }
      if (request.params.name === "xspa_company_discovery_apply") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.companyDiscoveryApply(parseCompanyDiscoveryApply(request.params.arguments), requestContext(input.auth)), "Company discovery revision applied.");
      }
      if (request.params.name === "xspa_company_discovery_status") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.companyDiscoveryStatus(requestContext(input.auth)), "Company discovery revision loaded.");
      }
      if (request.params.name === "xspa_company_plan") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.companyPlan(parseCompanyIntake(request.params.arguments), requestContext(input.auth)), "Company operating model planned.");
      }
      if (request.params.name === "xspa_company_apply") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.companyApply(parseCompanyApply(request.params.arguments), requestContext(input.auth)), "Company operating model applied.");
      }
      if (request.params.name === "xspa_company_status") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.companyStatus(requestContext(input.auth)), "Company operating model loaded.");
      }
      if (request.params.name === "xspa_work_get") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        const args = request.params.arguments as Record<string, unknown> | undefined;
        return toolResult(await operations.workGet(assertId(args?.work_id, "work_id"), requestContext(input.auth)), "Company Work loaded.");
      }
      if (request.params.name === "xspa_work_create") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.workCreate(parseWorkCreate(request.params.arguments), requestContext(input.auth)), "Company Work accepted by XanxitoSpA.");
      }
      if (request.params.name === "xspa_kast_status") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        const args = request.params.arguments as Record<string, unknown> | undefined;
        return toolResult(await operations.kastStatus(assertId(args?.reflection_id, "reflection_id"), requestContext(input.auth)), "KAST reflection status loaded.");
      }
      if (request.params.name === "xspa_asset_get") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        const args = request.params.arguments as Record<string, unknown> | undefined;
        return toolResult(await operations.assetGet(assertId(args?.asset_id, "asset_id"), requestContext(input.auth)), "Selected CompanyAsset loaded.");
      }
      if (request.params.name === "xspa_creative_status") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        const args = request.params.arguments as Record<string, unknown> | undefined;
        return toolResult(await operations.creativeStatus(assertId(args?.mission_id, "mission_id"), requestContext(input.auth)), "Creative mission status loaded.");
      }
      if (request.params.name === "xspa_creative_submit") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.creativeSubmit(parseCreativeSubmit(request.params.arguments), requestContext(input.auth)), "Creative mission accepted by XanxitoSpA.");
      }
      if (request.params.name === "xspa_skills_list") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.skillsList(requestContext(input.auth)), "Company Skill index loaded.");
      }
      if (request.params.name === "xspa_skills_search") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.skillsSearch(parseSkillSearch(request.params.arguments), requestContext(input.auth)), "Company Skill matches loaded.");
      }
      if (request.params.name === "xspa_skill_get") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.skillGet(parseSkillGet(request.params.arguments), requestContext(input.auth)), "Installed Company Skill body loaded.");
      }
      if (request.params.name === "xspa_skill_install") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.skillInstall(parseSkillInstall(request.params.arguments), requestContext(input.auth)), "Reusable Company Skill installed.");
      }
      if (request.params.name === "xspa_skills_health") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.skillsHealth(requestContext(input.auth)), "Skill Registry health loaded.");
      }
      if (request.params.name === "xspa_company_skill_plan") {
        if (input.oauth && !hasScope(input.auth, input.oauth.readScope)) return challenge(input.oauth, input.oauth.readScope);
        return toolResult(await operations.companySkillPlan(parseCompanySkillPlan(request.params.arguments), requestContext(input.auth)), "Company Skill bootstrap plan loaded.");
      }
      if (request.params.name === "xspa_autoskill_propose") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.autoskillPropose(parseAutoskillPropose(request.params.arguments), requestContext(input.auth)), "Company AutoSkill candidate created.");
      }
      if (request.params.name === "xspa_skill_global_promotion_propose") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.globalSkillPromotionPropose(parseGlobalSkillPromotion(request.params.arguments), requestContext(input.auth)), "Global Skill promotion proposal accepted by KAST.");
      }
      if (request.params.name === "xspa_kast_reflect") {
        if (input.oauth && !hasScope(input.auth, input.oauth.writeScope)) return challenge(input.oauth, input.oauth.writeScope);
        return toolResult(await operations.kastReflect(parseKastReflect(request.params.arguments), requestContext(input.auth)), "KAST reflection accepted.");
      }
      throw new Error(`unknown tool: ${request.params.name}`);
    } catch (error) { return { isError: true, content: [{ type: "text" as const, text: safeToolError(error) }] }; }
  });
  return server;
}

export function createXspaMcpExpressApp(input: { operations: XspaAppOperations; authToken?: string; oauth?: XspaOAuthConfig; host?: string }) {
  const app = createMcpExpressApp({ host: input.host ?? "127.0.0.1" });
  const oauthVerifier = input.oauth ? new JwtOAuthVerifier(input.oauth) : undefined;
  if (input.oauth) app.get("/.well-known/oauth-protected-resource", (_req: any, res: any) => res.json(protectedResourceMetadata(input.oauth!)));
  app.post("/mcp", async (req: any, res: any) => {
    let auth: XspaAuthContext = { authenticated: false, scopes: [] };
    const header = req.header("authorization");
    const internalMatch = Boolean(input.authToken && typeof header === "string" && header.startsWith("Bearer ") && secureEqual(input.authToken, header.slice(7)));
    if (internalMatch) {
      auth = { authenticated: true, subject: "internal-mcp-client", scopes: ["xspa.read", "xspa.write"] };
    } else if (oauthVerifier) {
      auth = await oauthVerifier.authenticate(header);
    } else if (input.authToken) {
      res.status(401).json({ error: "unauthorized" }); return;
    }
    const server = createXspaMcpServer(input.operations, { auth, ...(input.oauth ? { oauth: input.oauth } : {}) });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };
    res.once("close", () => { void cleanup(); });
    res.once("finish", () => { void cleanup(); });
    try {
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      await cleanup();
      throw error;
    }
  });
  app.get("/mcp", (_req: any, res: any) => res.status(405).end());
  app.delete("/mcp", (_req: any, res: any) => res.status(405).end());
  app.get("/health", (_req: any, res: any) => res.json({ ok: true, service: "xanxitospa-mcp", version: "1.0.0" }));
  return app;
}

export async function listenXspaMcp(input: { operations: XspaAppOperations; authToken?: string; oauth?: XspaOAuthConfig; host?: string; port: number }): Promise<HttpServer> {
  const host = input.host ?? "0.0.0.0";
  assertMcpDeploymentAuth({ host, oauth: input.oauth ?? null, ...(input.authToken ? { internalAuthToken: input.authToken } : {}) });
  const app = createXspaMcpExpressApp({ ...input, host }); const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(input.port, host, () => resolve()); });
  return server;
}
