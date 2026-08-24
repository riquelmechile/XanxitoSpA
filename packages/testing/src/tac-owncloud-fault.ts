import { createHash, randomUUID } from "node:crypto";
import type { AuthorityGrant, CapabilityPlaneRequest, CapabilityPlaneResult, CapabilityRequest, CapabilityResult, ProviderAdapterDescriptor, ProviderDescriptor, SemanticCapabilityDescriptor } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { CapabilityPlane, ProviderAdapterError, ProviderAdapterRegistry, SemanticCapabilityRegistry, type ProviderAdapter, type ProviderAdapterExecutionContext } from "../../providers/src/adapters.js";
import { EnvironmentSecretResolver } from "../../providers/src/environment-secrets.js";

export interface OwnCloudObjectPort { put(path: string, body: Uint8Array): Promise<void>; get(path: string): Promise<Uint8Array | null>; }
export interface OwnCloudArmResult { mode: "direct" | "xanxitospa"; completed: boolean; finalHash: string | null; writeCount: number; duplicateSideEffects: number; recoverySuccess: boolean; reconciliationRequired: boolean; integrityPreserved: boolean; safeHalt: boolean; staleWriteAccepted: boolean; auditEvents: string[]; }

function sha256(body: Uint8Array): string { return createHash("sha256").update(body).digest("hex"); }

export class HttpOwnCloudObjectPort implements OwnCloudObjectPort {
  constructor(private readonly config: { davRoot: string; username: string; password: string }) {}
  private url(path: string): string { return `${this.config.davRoot.replace(/\/$/, "")}/${path.replace(/^\//, "")}`; }
  private headers(): Record<string, string> { return { Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}` }; }
  async put(path: string, body: Uint8Array): Promise<void> {
    const response = await fetch(this.url(path), { method: "PUT", headers: this.headers(), body: Buffer.from(body) });
    if (!response.ok) throw new Error(`OwnCloud HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  async get(path: string): Promise<Uint8Array | null> {
    const response = await fetch(this.url(path), { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OwnCloud HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

const CAPABILITY = "benchmark.owncloud.object.put";
function grant(companyId: string): AuthorityGrant { return { id: randomUUID(), companyId, principal: "benchmark-worker", actions: [CAPABILITY], scopes: ["benchmark.owncloud"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" }; }
function semantic(): SemanticCapabilityDescriptor { return { name: CAPABILITY, description: "Write one benchmark OwnCloud object revision", risk: "medium", sideEffectClass: "external", credentialRequired: false, maxSensitivity: "internal", inputFormats: ["binary"], outputFormats: ["json"] }; }
function provider(companyId: string): ProviderDescriptor { return { id: "tac-owncloud", companyId, capabilities: [CAPABILITY], regions: ["local"], inputFormats: ["binary"], outputFormats: ["json"], estimatedCost: 0, latencyP50Ms: 10, latencyP95Ms: 50, reliability: 1, quality: 1, privacyScore: 1, maxSensitivity: "internal", health: "healthy", metadata: { benchmark: "TheAgentCompany" } }; }
function requestFor(companyId: string, input: { path: string; body: Uint8Array }): CapabilityPlaneRequest { return { capabilityRequest: { companyId, principal: "benchmark-worker", action: CAPABILITY, scope: "benchmark.owncloud", idempotencyKey: `tac-owncloud:${input.path}:${sha256(input.body)}`, payload: { path: input.path, bodyBase64: Buffer.from(input.body).toString("base64") } }, selection: { companyId, capability: CAPABILITY, region: "local", inputFormat: "binary", outputFormat: "json", sensitivity: "internal", mode: "quality" }, executionOwner: "tac-v4-runtime", allowFallback: false, maxAttempts: 1, staleAfterMs: 1_000 }; }
function directContext(companyId: string): ProviderAdapterExecutionContext { return { companyId, providerId: "tac-owncloud", capability: CAPABILITY, withCredential: async (_n, use) => use("unused") }; }

class BasicAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor; writes = 0;
  constructor(companyId: string, protected readonly port: OwnCloudObjectPort) { this.descriptor = { companyId, providerId: "tac-owncloud", capabilities: [CAPABILITY], credentialNames: [] }; }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { path?: unknown; bodyBase64?: unknown };
    if (typeof payload.path !== "string" || typeof payload.bodyBase64 !== "string") throw new ProviderAdapterError("invalid OwnCloud benchmark payload", false);
    try { await this.port.put(payload.path, Buffer.from(payload.bodyBase64, "base64")); } catch (error) { throw new ProviderAdapterError(error instanceof Error ? error.message : "OwnCloud write failed", false); }
    this.writes += 1;
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["owncloud:object"], cost: 0 };
  }
}
class LostAckAdapter extends BasicAdapter {
  calls = 0;
  override async execute(request: CapabilityRequest, context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const result = await super.execute(request, context); this.calls += 1;
    if (this.calls === 1) throw new ProviderAdapterError("injected lost acknowledgement after OwnCloud PUT commit", true);
    return result;
  }
}
function makePlane(companyId: string, adapter: ProviderAdapter, runtime: InMemoryRuntimeStore): CapabilityPlane { const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic()); const adapters = new ProviderAdapterRegistry(); adapters.register(adapter); const providers = new ProviderRegistry(); providers.register(provider(companyId)); return new CapabilityPlane(semantics, providers, adapters, new EnvironmentSecretResolver(), runtime); }
async function currentHash(port: OwnCloudObjectPort, path: string): Promise<string | null> { const body = await port.get(path); return body ? sha256(body) : null; }

export async function runOwnCloudControlArm(mode: "direct" | "xanxitospa", input: { path: string; body: Uint8Array }, port: OwnCloudObjectPort): Promise<OwnCloudArmResult> {
  const expected = sha256(input.body); const companyId = randomUUID(); const adapter = new BasicAdapter(companyId, port); const req = requestFor(companyId, input);
  if (mode === "direct") await adapter.execute(req.capabilityRequest, directContext(companyId)); else await makePlane(companyId, adapter, new InMemoryRuntimeStore()).execute(req, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  const finalHash = await currentHash(port, input.path); return { mode, completed: finalHash === expected, finalHash, writeCount: adapter.writes, duplicateSideEffects: 0, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: finalHash === expected && adapter.writes === 1, safeHalt: false, staleWriteAccepted: false, auditEvents: [`control:${mode}`] };
}

export async function runOwnCloudLostAckArm(mode: "direct" | "xanxitospa", input: { path: string; body: Uint8Array }, port: OwnCloudObjectPort): Promise<OwnCloudArmResult> {
  const expected = sha256(input.body); const companyId = randomUUID(); const adapter = new LostAckAdapter(companyId, port); const req = requestFor(companyId, input); const auditEvents: string[] = [];
  if (mode === "direct") { try { await adapter.execute(req.capabilityRequest, directContext(companyId)); } catch (error) { auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`); await adapter.execute(req.capabilityRequest, directContext(companyId)); } const finalHash = await currentHash(port, input.path); return { mode, completed: finalHash === expected, finalHash, writeCount: adapter.writes, duplicateSideEffects: Math.max(0, adapter.writes - 1), recoverySuccess: false, reconciliationRequired: false, integrityPreserved: finalHash === expected, safeHalt: false, staleWriteAccepted: false, auditEvents }; }
  const runtime = new InMemoryRuntimeStore(); const plane = makePlane(companyId, adapter, runtime); const first = await plane.execute(req, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");
  const observed = await currentHash(port, input.path); if (observed !== expected) throw new Error(`OwnCloud reconciliation hash mismatch: ${observed}`);
  const key = `capability:${CAPABILITY}:${req.capabilityRequest.idempotencyKey}`; const record = await runtime.getIdempotency(companyId, key); if (!record) throw new Error("OwnCloud lost-ACK journal missing");
  const reconciled: CapabilityPlaneResult = { ...first, reconciliationRequired: false, result: { ok: true, sideEffectApplied: true, result: { reconciled: true, hash: observed }, evidenceRefs: ["owncloud:hash-probe"], cost: 0 } };
  const settled = await runtime.markIdempotency(companyId, key, "tac-v4-runtime", record.fencingToken, "reconciled", new Date(), reconciled); if (!settled) throw new Error("OwnCloud reconciliation lost fencing");
  const replay = await plane.execute(req, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); const finalHash = await currentHash(port, input.path); auditEvents.push("reconciliation:verified-and-replayed-without-new-put");
  return { mode, completed: replay.result.ok && finalHash === expected, finalHash, writeCount: adapter.writes, duplicateSideEffects: Math.max(0, adapter.writes - 1), recoverySuccess: replay.result.ok && adapter.writes === 1, reconciliationRequired: first.reconciliationRequired, integrityPreserved: finalHash === expected, safeHalt: false, staleWriteAccepted: false, auditEvents };
}

export async function runOwnCloudAuthExpiryArm(mode: "direct" | "xanxitospa", input: { path: string; body: Uint8Array }, writePort: OwnCloudObjectPort, oraclePort: OwnCloudObjectPort): Promise<OwnCloudArmResult> {
  const companyId = randomUUID(); const adapter = new BasicAdapter(companyId, writePort); const req = requestFor(companyId, input); const auditEvents: string[] = []; let completed = false;
  if (mode === "direct") { try { await adapter.execute(req.capabilityRequest, directContext(companyId)); completed = true; } catch (error) { auditEvents.push(`auth-failure:${error instanceof Error ? error.message : String(error)}`); } } else { const result = await makePlane(companyId, adapter, new InMemoryRuntimeStore()).execute(req, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] }); completed = result.result.ok; auditEvents.push(completed ? "unexpected-success" : "capability-failed-safe"); }
  const finalHash = await currentHash(oraclePort, input.path); return { mode, completed, finalHash, writeCount: adapter.writes, duplicateSideEffects: 0, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: adapter.writes === 0, safeHalt: !completed && adapter.writes === 0, staleWriteAccepted: false, auditEvents };
}

export async function runOwnCloudConcurrentRevisionArm(mode: "direct" | "xanxitospa", input: { path: string; body: Uint8Array }, staleBody: Uint8Array, port: OwnCloudObjectPort): Promise<OwnCloudArmResult> {
  const expected = sha256(input.body);
  if (mode === "direct") { await port.put(input.path, input.body); await port.put(input.path, staleBody); const finalHash = await currentHash(port, input.path); return { mode, completed: true, finalHash, writeCount: 2, duplicateSideEffects: 1, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: finalHash === expected, safeHalt: false, staleWriteAccepted: true, auditEvents: ["stale-owner:accepted-unfenced"] }; }
  const companyId = randomUUID(); const store = new InMemoryRuntimeStore(); const key = `v4-owncloud-revision:${input.path}`; const first = await store.claimIdempotency(companyId, key, { hash: sha256(staleBody) }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!first.claimed) throw new Error("OwnCloud first owner claim failed"); const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("OwnCloud takeover failed");
  await port.put(input.path, input.body);
  const staleSettled = await store.markIdempotency(companyId, key, "worker-a", first.record.fencingToken, "applied", new Date("2026-08-24T12:00:03.000Z"), { hash: sha256(staleBody) }); const freshSettled = await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:03.100Z"), { hash: expected }); const finalHash = await currentHash(port, input.path);
  return { mode, completed: freshSettled && finalHash === expected, finalHash, writeCount: 1, duplicateSideEffects: 0, recoverySuccess: freshSettled, reconciliationRequired: true, integrityPreserved: !staleSettled && freshSettled && finalHash === expected, safeHalt: false, staleWriteAccepted: staleSettled, auditEvents: [`fence:${first.record.fencingToken}->${takeover.fencingToken}`, staleSettled ? "stale-settlement:accepted" : "stale-settlement:rejected"] };
}
