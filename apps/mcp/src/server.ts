import { timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JwtOAuthVerifier, assertMcpDeploymentAuth, hasScope, oauthChallenge, protectedResourceMetadata, type XspaAuthContext, type XspaOAuthConfig } from "./oauth.js";

export interface XspaAppStatus {
  version: string;
  modelLaw: { executive: "gpt-5.6-sol/max"; branches: "gpt-5.6-sol/xhigh"; fallback: false };
  mcp: { ready: boolean; mode: "streamable-http" };
  database: { configured: boolean };
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

function challenge(oauth: XspaOAuthConfig | undefined, scope: string) {
  if (!oauth) return { isError: true, content: [{ type: "text" as const, text: "Authentication required." }] };
  return { isError: true, content: [{ type: "text" as const, text: "Authentication required." }], _meta: { "mcp/www_authenticate": [oauthChallenge(oauth, scope)] } };
}
function requestContext(auth: XspaAuthContext): XspaRequestContext { return { principal: auth.subject || "chatgpt-app-user", scopes: [...auth.scopes] }; }

export function createXspaMcpServer(operations: XspaAppOperations, input: { auth: XspaAuthContext; oauth?: XspaOAuthConfig }): Server {
  const server = new Server({ name: "xanxitospa", version: "1.0.0" }, { capabilities: { tools: {} } });
  const readSchemes = input.oauth ? [{ type: "oauth2", scopes: [input.oauth.readScope] }] : [{ type: "noauth" }];
  const writeSchemes = input.oauth ? [{ type: "oauth2", scopes: [input.oauth.writeScope] }] : [{ type: "noauth" }];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    { name: "xspa_status", title: "XanxitoSpA status", description: "Use this when you need runtime and Model Law readiness. This is public metadata and never returns secrets.", inputSchema: { type: "object", additionalProperties: false }, securitySchemes: [{ type: "noauth" }], _meta: { securitySchemes: [{ type: "noauth" }] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_work_create", title: "Create company Work", description: "Use this to create one Company-scoped Work item before material execution. The deployment owns company identity; creating Work does not grant authority or budget.", inputSchema: { type: "object", properties: { work_id: { type: "string", format: "uuid" }, owner: { type: "string", maxLength: 200 }, objective: { type: "string", maxLength: 4000 }, scope: { type: "string", maxLength: 4000 } }, required: ["work_id", "owner", "objective", "scope"], additionalProperties: false }, securitySchemes: writeSchemes, _meta: { securitySchemes: writeSchemes }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    { name: "xspa_work_get", title: "Get company Work", description: "Use this to read one Work item in the deployment Company scope. It cannot select another Company.", inputSchema: { type: "object", properties: { work_id: { type: "string", format: "uuid" } }, required: ["work_id"], additionalProperties: false }, securitySchemes: readSchemes, _meta: { securitySchemes: readSchemes }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
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

export function createXspaMcpExpressApp(input: { operations: XspaAppOperations; authToken?: string; oauth?: XspaOAuthConfig }) {
  const app = createMcpExpressApp();
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
  const app = createXspaMcpExpressApp(input); const server = createHttpServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(input.port, host, () => resolve()); });
  return server;
}
