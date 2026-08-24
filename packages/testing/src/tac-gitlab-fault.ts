import { randomUUID } from "node:crypto";
import type { AuthorityGrant, CapabilityPlaneRequest, CapabilityPlaneResult, CapabilityRequest, CapabilityResult, ProviderAdapterDescriptor, ProviderDescriptor, SemanticCapabilityDescriptor } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { CapabilityPlane, ProviderAdapterError, ProviderAdapterRegistry, SemanticCapabilityRegistry, type ProviderAdapter, type ProviderAdapterExecutionContext } from "../../providers/src/adapters.js";
import { EnvironmentSecretResolver } from "../../providers/src/environment-secrets.js";

export interface GitLabIssuePort {
  createIssue(projectPath: string, title: string, description: string): Promise<void>;
  countIssuesByTitle(projectPath: string, title: string): Promise<number>;
}

export interface GitLabArmResult {
  mode: "direct" | "xanxitospa";
  completed: boolean;
  issueCount: number;
  sideEffects: number;
  duplicateSideEffects: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  integrityPreserved: boolean;
  safeHalt?: boolean;
  auditEvents: string[];
}

export class HttpGitLabIssuePort implements GitLabIssuePort {
  private readonly projectIds = new Map<string, number>();
  constructor(private readonly config: { baseUrl: string; privateToken: string }) {}

  private async json(path: string, init: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "PRIVATE-TOKEN": this.config.privateToken, ...(init.headers as Record<string, string> | undefined) };
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/v4${path}`, { ...init, headers });
    const text = await response.text();
    let body: any; try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`GitLab HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
    return body;
  }

  private async projectId(projectPath: string): Promise<number> {
    const cached = this.projectIds.get(projectPath); if (cached) return cached;
    const body = await this.json(`/projects/${encodeURIComponent(projectPath)}`);
    const id = Number(body?.id); if (!Number.isInteger(id) || id <= 0) throw new Error(`GitLab project id missing: ${projectPath}`);
    this.projectIds.set(projectPath, id); return id;
  }

  async createIssue(projectPath: string, title: string, description: string): Promise<void> {
    const id = await this.projectId(projectPath);
    const body = await this.json(`/projects/${id}/issues`, { method: "POST", body: JSON.stringify({ title, description }) });
    if (!body?.iid) throw new Error("GitLab issue creation did not return iid");
  }

  async countIssuesByTitle(projectPath: string, title: string): Promise<number> {
    const id = await this.projectId(projectPath);
    const body = await this.json(`/projects/${id}/issues?scope=all&state=all&per_page=100&search=${encodeURIComponent(title)}`);
    if (!Array.isArray(body)) throw new Error("GitLab issue search did not return array");
    return body.filter((issue: any) => String(issue?.title ?? "") === title).length;
  }
}

const CAPABILITY = "benchmark.gitlab.issue.create";
function grant(companyId: string): AuthorityGrant { return { id: randomUUID(), companyId, principal: "benchmark-worker", actions: [CAPABILITY], scopes: ["benchmark.gitlab"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" }; }
function semantic(): SemanticCapabilityDescriptor { return { name: CAPABILITY, description: "Create one benchmark GitLab issue", risk: "medium", sideEffectClass: "external", credentialRequired: false, maxSensitivity: "internal", inputFormats: ["json"], outputFormats: ["json"] }; }
function provider(companyId: string): ProviderDescriptor { return { id: "tac-gitlab", companyId, capabilities: [CAPABILITY], regions: ["local"], inputFormats: ["json"], outputFormats: ["json"], estimatedCost: 0, latencyP50Ms: 10, latencyP95Ms: 50, reliability: 1, quality: 1, privacyScore: 1, maxSensitivity: "internal", health: "healthy", metadata: { benchmark: "TheAgentCompany" } }; }

class LostAckGitLabAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor; calls = 0; sideEffects = 0;
  constructor(companyId: string, private readonly port: GitLabIssuePort) { this.descriptor = { companyId, providerId: "tac-gitlab", capabilities: [CAPABILITY], credentialNames: [] }; }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { projectPath?: unknown; title?: unknown; description?: unknown };
    if (typeof payload.projectPath !== "string" || typeof payload.title !== "string" || typeof payload.description !== "string") throw new ProviderAdapterError("invalid GitLab benchmark payload", false);
    this.calls += 1; await this.port.createIssue(payload.projectPath, payload.title, payload.description); this.sideEffects += 1;
    if (this.calls === 1) throw new ProviderAdapterError("injected lost acknowledgement after GitLab issue commit", true);
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["gitlab:issue"], cost: 0 };
  }
}

function makeRequest(companyId: string, input: { projectPath: string; title: string; description: string }): CapabilityPlaneRequest {
  return { capabilityRequest: { companyId, principal: "benchmark-worker", action: CAPABILITY, scope: "benchmark.gitlab", idempotencyKey: `tac-gitlab-lost-ack:${input.projectPath}:${input.title}`, payload: { ...input } }, selection: { companyId, capability: CAPABILITY, region: "local", inputFormat: "json", outputFormat: "json", sensitivity: "internal", mode: "quality" }, executionOwner: "tac-v4-runtime", allowFallback: false, maxAttempts: 1, staleAfterMs: 1_000 };
}
function createPlane(companyId: string, adapter: ProviderAdapter, runtime: InMemoryRuntimeStore): CapabilityPlane { const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic()); const adapters = new ProviderAdapterRegistry(); adapters.register(adapter); const providers = new ProviderRegistry(); providers.register(provider(companyId)); return new CapabilityPlane(semantics, providers, adapters, new EnvironmentSecretResolver(), runtime); }

export async function runGitLabLostAckArm(mode: "direct" | "xanxitospa", input: { projectPath: string; title: string; description: string }, port: GitLabIssuePort): Promise<GitLabArmResult> {
  const companyId = randomUUID(); const adapter = new LostAckGitLabAdapter(companyId, port); const request = makeRequest(companyId, input); const auditEvents: string[] = [];
  if (mode === "direct") {
    const context: ProviderAdapterExecutionContext = { companyId, providerId: "tac-gitlab", capability: CAPABILITY, withCredential: async (_name, use) => use("unused") };
    let completed = false;
    try { await adapter.execute(request.capabilityRequest, context); } catch (error) { auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`); completed = (await adapter.execute(request.capabilityRequest, context)).ok; }
    const issueCount = await port.countIssuesByTitle(input.projectPath, input.title); const duplicateSideEffects = Math.max(0, issueCount - 1);
    return { mode, completed, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: duplicateSideEffects === 0, auditEvents };
  }
  const runtime = new InMemoryRuntimeStore(); const plane = createPlane(companyId, adapter, runtime);
  const first = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");
  const observed = await port.countIssuesByTitle(input.projectPath, input.title); if (observed !== 1) throw new Error(`reconciliation probe expected exactly one committed issue, observed=${observed}`);
  const journalKey = `capability:${CAPABILITY}:${request.capabilityRequest.idempotencyKey}`; const record = await runtime.getIdempotency(companyId, journalKey); if (!record) throw new Error("GitLab lost-ACK journal record missing");
  const reconciled: CapabilityPlaneResult = { ...first, reconciliationRequired: false, result: { ok: true, sideEffectApplied: true, result: { reconciled: true, issueCount: observed }, evidenceRefs: ["gitlab:reconciliation-probe"], cost: 0 } };
  const settled = await runtime.markIdempotency(companyId, journalKey, "tac-v4-runtime", record.fencingToken, "reconciled", new Date(), reconciled); if (!settled) throw new Error("GitLab reconciliation lost fencing");
  const replay = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); const issueCount = await port.countIssuesByTitle(input.projectPath, input.title); const duplicateSideEffects = Math.max(0, issueCount - 1); auditEvents.push("reconciliation:verified-and-replayed-without-new-issue");
  return { mode, completed: replay.result.ok, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects, recoverySuccess: replay.result.ok && issueCount === 1, reconciliationRequired: first.reconciliationRequired, integrityPreserved: duplicateSideEffects === 0 && issueCount === 1, auditEvents };
}


class SafeGitLabAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  sideEffects = 0;
  constructor(companyId: string, private readonly port: GitLabIssuePort) {
    this.descriptor = { companyId, providerId: "tac-gitlab", capabilities: [CAPABILITY], credentialNames: [] };
  }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { projectPath?: unknown; title?: unknown; description?: unknown };
    if (typeof payload.projectPath !== "string" || typeof payload.title !== "string" || typeof payload.description !== "string") throw new ProviderAdapterError("invalid GitLab benchmark payload", false);
    try {
      await this.port.createIssue(payload.projectPath, payload.title, payload.description);
      this.sideEffects += 1;
      return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["gitlab:issue"], cost: 0 };
    } catch (error) {
      throw new ProviderAdapterError(error instanceof Error ? error.message : "GitLab write failed", false);
    }
  }
}

class RestartAfterCommitGitLabAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  calls = 0;
  sideEffects = 0;
  constructor(companyId: string, private readonly port: GitLabIssuePort, private readonly restartHook: () => Promise<void>) {
    this.descriptor = { companyId, providerId: "tac-gitlab", capabilities: [CAPABILITY], credentialNames: [] };
  }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { projectPath?: unknown; title?: unknown; description?: unknown };
    if (typeof payload.projectPath !== "string" || typeof payload.title !== "string" || typeof payload.description !== "string") throw new ProviderAdapterError("invalid GitLab benchmark payload", false);
    this.calls += 1;
    await this.port.createIssue(payload.projectPath, payload.title, payload.description);
    this.sideEffects += 1;
    if (this.calls === 1) {
      await this.restartHook();
      throw new ProviderAdapterError("injected GitLab restart after issue commit before observation", true);
    }
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["gitlab:issue"], cost: 0 };
  }
}

function directContext(companyId: string): ProviderAdapterExecutionContext {
  return { companyId, providerId: "tac-gitlab", capability: CAPABILITY, withCredential: async (_name, use) => use("unused") };
}

export async function runGitLabControlArm(mode: "direct" | "xanxitospa", input: { projectPath: string; title: string; description: string }, port: GitLabIssuePort): Promise<GitLabArmResult> {
  const companyId = randomUUID();
  const adapter = new SafeGitLabAdapter(companyId, port);
  const request = makeRequest(companyId, input);
  if (mode === "direct") {
    const result = await adapter.execute(request.capabilityRequest, directContext(companyId));
    const issueCount = await port.countIssuesByTitle(input.projectPath, input.title);
    return { mode, completed: result.ok, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects: Math.max(0, issueCount - 1), recoverySuccess: false, reconciliationRequired: false, integrityPreserved: issueCount === 1, safeHalt: false, auditEvents: ["control:direct"] };
  }
  const runtime = new InMemoryRuntimeStore();
  const plane = createPlane(companyId, adapter, runtime);
  const result = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  const issueCount = await port.countIssuesByTitle(input.projectPath, input.title);
  return { mode, completed: result.result.ok, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects: Math.max(0, issueCount - 1), recoverySuccess: false, reconciliationRequired: result.reconciliationRequired, integrityPreserved: issueCount === 1, safeHalt: false, auditEvents: ["control:xspa"] };
}

export async function runGitLabCredentialExpiryArm(mode: "direct" | "xanxitospa", input: { projectPath: string; title: string; description: string }, writePort: GitLabIssuePort, oraclePort: GitLabIssuePort): Promise<GitLabArmResult> {
  const companyId = randomUUID();
  const adapter = new SafeGitLabAdapter(companyId, writePort);
  const request = makeRequest(companyId, input);
  const auditEvents: string[] = [];
  if (mode === "direct") {
    try { await adapter.execute(request.capabilityRequest, directContext(companyId)); }
    catch (error) { auditEvents.push(`credential-failure:${error instanceof Error ? error.message : String(error)}`); }
  } else {
    const runtime = new InMemoryRuntimeStore();
    const plane = createPlane(companyId, adapter, runtime);
    const result = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
    auditEvents.push(result.result.ok ? "unexpected-success" : "capability-failed-safe");
  }
  const issueCount = await oraclePort.countIssuesByTitle(input.projectPath, input.title);
  return { mode, completed: false, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects: 0, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: issueCount === 0, safeHalt: true, auditEvents };
}

export async function runGitLabServiceRestartArm(mode: "direct" | "xanxitospa", input: { projectPath: string; title: string; description: string }, port: GitLabIssuePort, restartHook: () => Promise<void>): Promise<GitLabArmResult> {
  const companyId = randomUUID();
  const adapter = new RestartAfterCommitGitLabAdapter(companyId, port, restartHook);
  const request = makeRequest(companyId, input);
  const auditEvents: string[] = [];
  if (mode === "direct") {
    let completed = false;
    try { await adapter.execute(request.capabilityRequest, directContext(companyId)); }
    catch (error) {
      auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`);
      completed = (await adapter.execute(request.capabilityRequest, directContext(companyId))).ok;
    }
    const issueCount = await port.countIssuesByTitle(input.projectPath, input.title);
    const duplicateSideEffects = Math.max(0, issueCount - 1);
    return { mode, completed, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: duplicateSideEffects === 0 && issueCount === 1, safeHalt: false, auditEvents };
  }
  const runtime = new InMemoryRuntimeStore();
  const plane = createPlane(companyId, adapter, runtime);
  const first = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");
  const observed = await port.countIssuesByTitle(input.projectPath, input.title);
  if (observed !== 1) throw new Error(`restart reconciliation expected one issue, observed=${observed}`);
  const journalKey = `capability:${CAPABILITY}:${request.capabilityRequest.idempotencyKey}`;
  const record = await runtime.getIdempotency(companyId, journalKey);
  if (!record) throw new Error("GitLab restart journal record missing");
  const reconciled: CapabilityPlaneResult = { ...first, reconciliationRequired: false, result: { ok: true, sideEffectApplied: true, result: { reconciled: true, issueCount: observed }, evidenceRefs: ["gitlab:restart-reconciliation"], cost: 0 } };
  const settled = await runtime.markIdempotency(companyId, journalKey, "tac-v4-runtime", record.fencingToken, "reconciled", new Date(), reconciled);
  if (!settled) throw new Error("GitLab restart reconciliation lost fencing");
  const replay = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  const issueCount = await port.countIssuesByTitle(input.projectPath, input.title);
  auditEvents.push("restart:verified-and-replayed-without-new-issue");
  return { mode, completed: replay.result.ok, issueCount, sideEffects: adapter.sideEffects, duplicateSideEffects: Math.max(0, issueCount - 1), recoverySuccess: replay.result.ok && issueCount === 1, reconciliationRequired: first.reconciliationRequired, integrityPreserved: issueCount === 1, safeHalt: false, auditEvents };
}
