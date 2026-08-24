import { randomUUID } from "node:crypto";
import type { AuthorityGrant, CapabilityPlaneRequest, CapabilityPlaneResult, CapabilityRequest, CapabilityResult, ProviderAdapterDescriptor, ProviderDescriptor, SemanticCapabilityDescriptor } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { CapabilityPlane, ProviderAdapterError, ProviderAdapterRegistry, SemanticCapabilityRegistry, type ProviderAdapter, type ProviderAdapterExecutionContext } from "../../providers/src/adapters.js";
import { EnvironmentSecretResolver } from "../../providers/src/environment-secrets.js";

export interface PlaneIssuePort {
  setState(projectId: string, issueId: string, stateName: string): Promise<void>;
  getState(projectId: string, issueId: string): Promise<string>;
}

export interface PlaneArmResult {
  mode: "direct" | "xanxitospa";
  completed: boolean;
  finalState: string;
  writeCount: number;
  duplicateSideEffects: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  integrityPreserved: boolean;
  safeHalt: boolean;
  staleSettlementAccepted: boolean;
  auditEvents: string[];
}

export class HttpPlaneIssuePort implements PlaneIssuePort {
  private readonly stateIds = new Map<string, Map<string, string>>();
  constructor(private readonly config: { baseUrl: string; apiKey: string; workspaceSlug: string }) {}

  private async json(path: string, init: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-api-key": this.config.apiKey, ...(init.headers as Record<string, string> | undefined) };
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/v1/workspaces/${encodeURIComponent(this.config.workspaceSlug)}${path}`, { ...init, headers });
    const text = await response.text();
    let body: any; try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`Plane HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
    return body;
  }

  private async states(projectId: string): Promise<Map<string, string>> {
    const cached = this.stateIds.get(projectId); if (cached) return cached;
    const body = await this.json(`/projects/${projectId}/states/`);
    const map = new Map<string, string>();
    for (const state of body?.results ?? []) map.set(String(state?.name ?? ""), String(state?.id ?? ""));
    this.stateIds.set(projectId, map);
    return map;
  }

  async setState(projectId: string, issueId: string, stateName: string): Promise<void> {
    const stateId = (await this.states(projectId)).get(stateName);
    if (!stateId) throw new Error(`Plane state not found: ${stateName}`);
    await this.json(`/projects/${projectId}/issues/${issueId}/`, { method: "PATCH", body: JSON.stringify({ state: stateId }) });
  }

  async getState(projectId: string, issueId: string): Promise<string> {
    const issue = await this.json(`/projects/${projectId}/issues/${issueId}/`);
    const stateId = String(issue?.state ?? "");
    const states = await this.states(projectId);
    for (const [name, id] of states.entries()) if (id === stateId) return name;
    return stateId;
  }
}

const CAPABILITY = "benchmark.plane.issue.state.set";
function grant(companyId: string): AuthorityGrant { return { id: randomUUID(), companyId, principal: "benchmark-worker", actions: [CAPABILITY], scopes: ["benchmark.plane"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" }; }
function semantic(): SemanticCapabilityDescriptor { return { name: CAPABILITY, description: "Set one benchmark Plane issue state", risk: "medium", sideEffectClass: "external", credentialRequired: false, maxSensitivity: "internal", inputFormats: ["json"], outputFormats: ["json"] }; }
function provider(companyId: string): ProviderDescriptor { return { id: "tac-plane", companyId, capabilities: [CAPABILITY], regions: ["local"], inputFormats: ["json"], outputFormats: ["json"], estimatedCost: 0, latencyP50Ms: 10, latencyP95Ms: 50, reliability: 1, quality: 1, privacyScore: 1, maxSensitivity: "internal", health: "healthy", metadata: { benchmark: "TheAgentCompany" } }; }

class BasicPlaneAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor; sideEffects = 0;
  constructor(companyId: string, protected readonly port: PlaneIssuePort) { this.descriptor = { companyId, providerId: "tac-plane", capabilities: [CAPABILITY], credentialNames: [] }; }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { projectId?: unknown; issueId?: unknown; targetState?: unknown };
    if (typeof payload.projectId !== "string" || typeof payload.issueId !== "string" || typeof payload.targetState !== "string") throw new ProviderAdapterError("invalid Plane benchmark payload", false);
    try { await this.port.setState(payload.projectId, payload.issueId, payload.targetState); }
    catch (error) { throw new ProviderAdapterError(error instanceof Error ? error.message : "Plane write failed", false); }
    this.sideEffects += 1;
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["plane:issue-state"], cost: 0 };
  }
}

class LostAckPlaneAdapter extends BasicPlaneAdapter {
  calls = 0;
  async execute(request: CapabilityRequest, context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    this.calls += 1;
    const result = await super.execute(request, context);
    if (this.calls === 1) throw new ProviderAdapterError("injected lost acknowledgement after Plane PATCH commit", true);
    return result;
  }
}

function makeRequest(companyId: string, input: { projectId: string; issueId: string; targetState: string }): CapabilityPlaneRequest {
  return { capabilityRequest: { companyId, principal: "benchmark-worker", action: CAPABILITY, scope: "benchmark.plane", idempotencyKey: `tac-plane:${input.projectId}:${input.issueId}:${input.targetState}`, payload: { ...input } }, selection: { companyId, capability: CAPABILITY, region: "local", inputFormat: "json", outputFormat: "json", sensitivity: "internal", mode: "quality" }, executionOwner: "tac-v4-runtime", allowFallback: false, maxAttempts: 1, staleAfterMs: 1_000 };
}
function createPlane(companyId: string, adapter: ProviderAdapter, runtime: InMemoryRuntimeStore): CapabilityPlane { const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic()); const adapters = new ProviderAdapterRegistry(); adapters.register(adapter); const providers = new ProviderRegistry(); providers.register(provider(companyId)); return new CapabilityPlane(semantics, providers, adapters, new EnvironmentSecretResolver(), runtime); }

export async function runPlaneControlArm(mode: "direct" | "xanxitospa", input: { projectId: string; issueId: string; targetState: string }, port: PlaneIssuePort): Promise<PlaneArmResult> {
  if (mode === "direct") { await port.setState(input.projectId, input.issueId, input.targetState); const finalState = await port.getState(input.projectId, input.issueId); return { mode, completed: finalState === input.targetState, finalState, writeCount: 1, duplicateSideEffects: 0, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: finalState === input.targetState, safeHalt: false, staleSettlementAccepted: false, auditEvents: ["control:direct"] }; }
  const companyId = randomUUID(); const adapter = new BasicPlaneAdapter(companyId, port); const request = makeRequest(companyId, input); const plane = createPlane(companyId, adapter, new InMemoryRuntimeStore());
  const result = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); const finalState = await port.getState(input.projectId, input.issueId);
  return { mode, completed: result.result.ok && finalState === input.targetState, finalState, writeCount: adapter.sideEffects, duplicateSideEffects: Math.max(0, adapter.sideEffects - 1), recoverySuccess: false, reconciliationRequired: result.reconciliationRequired, integrityPreserved: result.result.ok && finalState === input.targetState && adapter.sideEffects === 1, safeHalt: false, staleSettlementAccepted: false, auditEvents: ["control:xspa"] };
}

export async function runPlaneLostAckArm(mode: "direct" | "xanxitospa", input: { projectId: string; issueId: string; targetState: string }, port: PlaneIssuePort): Promise<PlaneArmResult> {
  const companyId = randomUUID(); const adapter = new LostAckPlaneAdapter(companyId, port); const request = makeRequest(companyId, input); const auditEvents: string[] = [];
  if (mode === "direct") {
    const context: ProviderAdapterExecutionContext = { companyId, providerId: "tac-plane", capability: CAPABILITY, withCredential: async (_name, use) => use("unused") };
    let completed = false; try { await adapter.execute(request.capabilityRequest, context); } catch (error) { auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`); completed = (await adapter.execute(request.capabilityRequest, context)).ok; }
    const finalState = await port.getState(input.projectId, input.issueId); return { mode, completed, finalState, writeCount: adapter.sideEffects, duplicateSideEffects: Math.max(0, adapter.sideEffects - 1), recoverySuccess: false, reconciliationRequired: false, integrityPreserved: adapter.sideEffects === 1 && finalState === input.targetState, safeHalt: false, staleSettlementAccepted: false, auditEvents };
  }
  const runtime = new InMemoryRuntimeStore(); const plane = createPlane(companyId, adapter, runtime); const first = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");
  const finalStateBefore = await port.getState(input.projectId, input.issueId); if (finalStateBefore !== input.targetState) throw new Error(`Plane reconciliation observed ${finalStateBefore}`);
  const journalKey = `capability:${CAPABILITY}:${request.capabilityRequest.idempotencyKey}`; const record = await runtime.getIdempotency(companyId, journalKey); if (!record) throw new Error("Plane lost-ACK journal missing");
  const reconciled: CapabilityPlaneResult = { ...first, reconciliationRequired: false, result: { ok: true, sideEffectApplied: true, result: { reconciled: true, state: finalStateBefore }, evidenceRefs: ["plane:reconciliation-probe"], cost: 0 } };
  const settled = await runtime.markIdempotency(companyId, journalKey, "tac-v4-runtime", record.fencingToken, "reconciled", new Date(), reconciled); if (!settled) throw new Error("Plane reconciliation lost fencing");
  const replay = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); const finalState = await port.getState(input.projectId, input.issueId); auditEvents.push("reconciliation:verified-and-replayed-without-new-patch");
  return { mode, completed: replay.result.ok, finalState, writeCount: adapter.sideEffects, duplicateSideEffects: Math.max(0, adapter.sideEffects - 1), recoverySuccess: replay.result.ok && adapter.sideEffects === 1, reconciliationRequired: first.reconciliationRequired, integrityPreserved: adapter.sideEffects === 1 && finalState === input.targetState, safeHalt: false, staleSettlementAccepted: false, auditEvents };
}

export async function runPlaneAuthExpiryArm(mode: "direct" | "xanxitospa", input: { projectId: string; issueId: string; targetState: string }, writePort: PlaneIssuePort, oraclePort: PlaneIssuePort): Promise<PlaneArmResult> {
  const before = await oraclePort.getState(input.projectId, input.issueId); let completed = false; let writeCount = 0; const auditEvents: string[] = [];
  if (mode === "direct") { try { await writePort.setState(input.projectId, input.issueId, input.targetState); writeCount = 1; completed = true; } catch (error) { auditEvents.push(`auth-failure:${error instanceof Error ? error.message : String(error)}`); } }
  else { const companyId = randomUUID(); const adapter = new BasicPlaneAdapter(companyId, writePort); const plane = createPlane(companyId, adapter, new InMemoryRuntimeStore()); const result = await plane.execute(makeRequest(companyId, input), { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); completed = result.result.ok; writeCount = adapter.sideEffects; auditEvents.push(result.result.ok ? "unexpected-success" : "capability-failed-safe"); }
  const finalState = await oraclePort.getState(input.projectId, input.issueId); return { mode, completed, finalState, writeCount, duplicateSideEffects: 0, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: !completed && writeCount === 0 && finalState === before, safeHalt: !completed && writeCount === 0, staleSettlementAccepted: false, auditEvents };
}

export async function runPlaneStaleWriterArm(mode: "direct" | "xanxitospa", input: { projectId: string; issueId: string; targetState: string }, port: PlaneIssuePort): Promise<PlaneArmResult> {
  if (mode === "direct") { await port.setState(input.projectId, input.issueId, input.targetState); await port.setState(input.projectId, input.issueId, input.targetState); const finalState = await port.getState(input.projectId, input.issueId); return { mode, completed: true, finalState, writeCount: 2, duplicateSideEffects: 1, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: false, safeHalt: false, staleSettlementAccepted: true, auditEvents: ["stale-owner:accepted-unfenced"] }; }
  const companyId = randomUUID(); const store = new InMemoryRuntimeStore(); const key = `v4-plane-stale:${input.projectId}:${input.issueId}:${input.targetState}`;
  const first = await store.claimIdempotency(companyId, key, { operation: "plane-state" }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!first.claimed) throw new Error("Plane stale-writer first claim failed");
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("Plane stale-writer takeover failed");
  await port.setState(input.projectId, input.issueId, input.targetState);
  const staleSettled = await store.markIdempotency(companyId, key, "worker-a", first.record.fencingToken, "applied", new Date("2026-08-24T12:00:03.000Z"), { owner: "worker-a" });
  const freshSettled = await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:03.100Z"), { owner: "worker-b" });
  const finalState = await port.getState(input.projectId, input.issueId); return { mode, completed: freshSettled, finalState, writeCount: 1, duplicateSideEffects: 0, recoverySuccess: freshSettled, reconciliationRequired: true, integrityPreserved: !staleSettled && freshSettled && finalState === input.targetState, safeHalt: false, staleSettlementAccepted: staleSettled, auditEvents: [`fence:${first.record.fencingToken}->${takeover.fencingToken}`, staleSettled ? "stale-settlement:accepted" : "stale-settlement:rejected"] };
}
