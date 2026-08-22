import { randomUUID } from "node:crypto";
import type {
  ApprovalReceipt,
  AuthorityGrant,
  BootstrapRequirement,
  CapabilityPlaneRequest,
  CompanyAsset,
  ProviderDescriptor,
  SemanticCapabilityDescriptor,
} from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { DomainError } from "../../domain/src/index.js";
import { BootstrapExecutor, buildControlCatalog, planCompanyBootstrap } from "../../kernel/src/index.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { CapabilityPlane, ProviderAdapterError, ProviderAdapterRegistry, SemanticCapabilityRegistry } from "../../providers/src/adapters.js";
import { InMemorySecretResolver } from "../../providers/src/secrets.js";
import { UNIVERSAL_SEMANTIC_CAPABILITIES, createUniversalSemanticCapabilityRegistry } from "../../providers/src/semantic-catalog.js";

export interface CapabilityGymCaseResult { name: string; ok: boolean; detail: string }

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runCase(name: string, fn: () => void | Promise<void>): Promise<CapabilityGymCaseResult> {
  try { await fn(); return { name, ok: true, detail: "pass" }; }
  catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}

function semantic(name: string, credentialRequired = true): SemanticCapabilityDescriptor {
  return {
    name,
    risk: "low",
    maxSensitivity: "restricted",
    sideEffectClass: "external",
    inputFormats: ["json"],
    outputFormats: ["json"],
    credentialRequired,
    description: `test ${name}`,
  };
}

function provider(companyId: string, id: string, capability: string, estimatedCost: number): ProviderDescriptor {
  return {
    id,
    companyId,
    capabilities: [capability],
    regions: ["CL"],
    inputFormats: ["json"],
    outputFormats: ["json"],
    estimatedCost,
    latencyP50Ms: 50,
    latencyP95Ms: 100,
    reliability: 0.99,
    quality: 0.9,
    privacyScore: 0.95,
    maxSensitivity: "restricted",
    health: "healthy",
    credentialsRef: `secret://${companyId}/${id}`,
    metadata: { internal: "not-public" },
  };
}

function grant(companyId: string, action: string, scope: string): AuthorityGrant {
  return {
    id: randomUUID(),
    companyId,
    principal: "worker-a",
    actions: [action],
    scopes: [scope],
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
  };
}

function planeRequest(companyId: string, capability: string, idempotencyKey: string): CapabilityPlaneRequest {
  return {
    capabilityRequest: {
      companyId,
      principal: "worker-a",
      action: capability,
      scope: "bootstrap",
      idempotencyKey,
      payload: { message: "hello" },
    },
    selection: {
      companyId,
      capability,
      region: "CL",
      inputFormat: "json",
      outputFormat: "json",
      minQuality: 0.5,
      minReliability: 0.9,
      minPrivacyScore: 0.9,
      sensitivity: "internal",
      requireCredentials: true,
      mode: "balanced",
    },
    executionOwner: "worker-a",
    allowFallback: true,
    maxAttempts: 2,
    staleAfterMs: 60_000,
  };
}

export async function runCapabilityPlaneGym(): Promise<CapabilityGymCaseResult[]> {
  const cases: CapabilityGymCaseResult[] = [];
  const fixedNow = new Date("2026-08-21T12:00:00.000Z");

  cases.push(await runCase("secret handles are company/provider scoped and material stays inside callback", async () => {
    const resolver = new InMemorySecretResolver();
    const companyId = randomUUID();
    const handle = resolver.register({ companyId, providerId: "mail-a", secretName: "api-key", value: "S3CRET-ONLY-IN-CALLBACK" });
    const derived = await resolver.withSecret(handle, async (value) => value.startsWith("S3CRET") ? "authorized" : "bad");
    expect(derived === "authorized", "adapter could not consume scoped credential");
    let crossCompanyDenied = false;
    try { await resolver.withSecret({ ...handle, companyId: randomUUID() }, async () => "bad"); }
    catch (error) { crossCompanyDenied = error instanceof DomainError; }
    expect(crossCompanyDenied, "secret handle accepted another Company scope");
    let leakDenied = false;
    try { resolver.assertSafe({ output: "S3CRET-ONLY-IN-CALLBACK" }); }
    catch (error) { leakDenied = error instanceof DomainError; }
    expect(leakDenied, "secret material was accepted in serializable output");
  }));

  cases.push(await runCase("capability plane falls back only after proven no-side-effect failure and caches result", async () => {
    const companyId = randomUUID();
    const capability = "email.send";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1)); providers.register(provider(companyId, "mail-b", capability, 2));
    const adapters = new ProviderAdapterRegistry();
    let firstCalls = 0; let secondCalls = 0;
    adapters.register({ descriptor: { companyId, providerId: "mail-a", capabilities: [capability], credentialNames: ["api-key"] }, execute: async () => { firstCalls += 1; throw new ProviderAdapterError("safe outage", false); } });
    adapters.register({ descriptor: { companyId, providerId: "mail-b", capabilities: [capability], credentialNames: ["api-key"] }, execute: async (_request, context) => context.withCredential("api-key", async () => { secondCalls += 1; return { ok: true, sideEffectApplied: true, result: { messageId: "m-1" }, evidenceRefs: ["mail:m-1"], cost: 2 }; }) });
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-a", secretName: "api-key", value: "MAIL-A-KEY-1234" }); secrets.register({ companyId, providerId: "mail-b", secretName: "api-key", value: "MAIL-B-KEY-5678" });
    const runtime = new InMemoryRuntimeStore();
    const plane = new CapabilityPlane(semantics, providers, adapters, secrets, runtime, () => fixedNow);
    const request = planeRequest(companyId, capability, "send:1");
    const guard = { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] };
    const result = await plane.execute(request, guard);
    expect(result.result.ok && result.providerId === "mail-b" && result.fallbackUsed, "safe provider fallback did not select second adapter");
    expect(firstCalls === 1 && secondCalls === 1, "unexpected adapter call count before replay");
    const replay = await plane.execute(request, guard);
    expect(replay.result.ok && firstCalls === 1 && secondCalls === 1, "durable capability replay repeated provider side effect");
  }));

  cases.push(await runCase("capability plane blocks fallback when prior provider may have applied effect", async () => {
    const companyId = randomUUID();
    const capability = "email.send";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1)); providers.register(provider(companyId, "mail-b", capability, 2));
    const adapters = new ProviderAdapterRegistry(); let fallbackCalls = 0;
    adapters.register({ descriptor: { companyId, providerId: "mail-a", capabilities: [capability], credentialNames: ["api-key"] }, execute: async () => ({ ok: false, sideEffectApplied: true, result: { state: "unknown" }, evidenceRefs: ["mail:unknown"], cost: 1 }) });
    adapters.register({ descriptor: { companyId, providerId: "mail-b", capabilities: [capability], credentialNames: ["api-key"] }, execute: async () => { fallbackCalls += 1; return { ok: true, sideEffectApplied: true, result: {}, evidenceRefs: [], cost: 1 }; } });
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-a", secretName: "api-key", value: "A-UNKNOWN-KEY" }); secrets.register({ companyId, providerId: "mail-b", secretName: "api-key", value: "B-FALLBACK-KEY" });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, secrets, runtime, () => fixedNow);
    const result = await plane.execute(planeRequest(companyId, capability, "send:unknown"), { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    expect(result.reconciliationRequired && fallbackCalls === 0 && result.attempts.length === 1, "fallback ran after an uncertain/applied effect");
  }));

  cases.push(await runCase("adapter output containing credential is quarantined and never returned", async () => {
    const companyId = randomUUID(); const capability = "email.send"; const leakedValue = "NEVER-RETURN-THIS-KEY";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1));
    const adapters = new ProviderAdapterRegistry();
    adapters.register({ descriptor: { companyId, providerId: "mail-a", capabilities: [capability], credentialNames: ["api-key"] }, execute: async (_request, context) => context.withCredential("api-key", async (value) => ({ ok: true, sideEffectApplied: false, result: { debug: value }, evidenceRefs: [], cost: 0 })) });
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-a", secretName: "api-key", value: leakedValue });
    const plane = new CapabilityPlane(semantics, providers, adapters, secrets, new InMemoryRuntimeStore(), () => fixedNow);
    const result = await plane.execute({ ...planeRequest(companyId, capability, "send:leak"), allowFallback: false, maxAttempts: 1 }, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    expect(result.reconciliationRequired, "credential leak was not treated as unsafe result");
    expect(!JSON.stringify(result).includes(leakedValue), "credential material escaped Capability Plane result");
  }));

  cases.push(await runCase("provider adapter registry never crosses Company boundary", () => {
    const companyA = randomUUID(); const companyB = randomUUID();
    const adapters = new ProviderAdapterRegistry();
    adapters.register({ descriptor: { companyId: companyB, providerId: "mail", capabilities: ["email.send"], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: false, result: {}, evidenceRefs: [], cost: 0 }) });
    let denied = false;
    try { adapters.get(companyA, "mail", "email.send"); } catch (error) { denied = error instanceof DomainError; }
    expect(denied, "Company A resolved Company B provider adapter");
  }));

  cases.push(await runCase("bootstrap executor pauses at human boundary, resumes once, verifies and does not reprovision", async () => {
    const companyId = randomUUID(); const capability = "phone.sms";
    const requirement: BootstrapRequirement = { id: "phone", capability, assetKind: "phone-number", department: "customer", estimatedCost: 0, currency: "USD", humanBoundary: "kyc", preferredProviderIds: ["sms-a"] };
    const plan = planCompanyBootstrap({ companyId, mode: "new", requirements: [requirement], existingAssets: [], autonomousCapabilities: [capability] });
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "sms-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); let provisionCalls = 0;
    adapters.register({ descriptor: { companyId, providerId: "sms-a", capabilities: [capability], credentialNames: [] }, execute: async () => { provisionCalls += 1; return { ok: true, sideEffectApplied: true, result: { number: "+56000000000" }, evidenceRefs: ["phone:allocated"], cost: 1 }; } });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow);
    const executor = new BootstrapExecutor(plane, runtime, { verifyApproval: async (receipt) => receipt.approvedBy === "founder", verifyAsset: async () => ({ ok: true, evidenceRefs: ["phone:verified"] }) }, () => fixedNow);
    const requestFactory = () => ({ ...planeRequest(companyId, capability, "bootstrap:phone"), selection: { ...planeRequest(companyId, capability, "bootstrap:phone").selection, requireCredentials: false } });
    const guard = { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] };
    const paused = await executor.execute({ plan, requirements: [requirement], approvals: [], guard, requestFactory });
    expect(!paused.completed && Boolean(paused.pausedAtStepId) && Number(provisionCalls) === 0, "bootstrap crossed KYC boundary before approval");
    const wrongApproval: ApprovalReceipt = { id: randomUUID(), companyId, requirementId: "phone", planFingerprint: "different-plan", approvedBy: "founder", approvedAt: fixedNow.toISOString() };
    const stillPaused = await executor.execute({ plan, requirements: [requirement], approvals: [wrongApproval], guard, state: paused, requestFactory });
    expect(!stillPaused.completed && Number(provisionCalls) === 0, "approval from another plan unlocked provisioning");
    const forgedApproval: ApprovalReceipt = { id: randomUUID(), companyId, requirementId: "phone", planFingerprint: paused.planFingerprint, approvedBy: "worker-a", approvedAt: fixedNow.toISOString() };
    const forgedPaused = await executor.execute({ plan, requirements: [requirement], approvals: [forgedApproval], guard, state: paused, requestFactory });
    expect(!forgedPaused.completed && Number(provisionCalls) === 0, "unverified approval authority unlocked provisioning");
    const approval: ApprovalReceipt = { id: randomUUID(), companyId, requirementId: "phone", planFingerprint: paused.planFingerprint, approvedBy: "founder", approvedAt: fixedNow.toISOString() };
    const completed = await executor.execute({ plan, requirements: [requirement], approvals: [approval], guard, state: paused, requestFactory });
    expect(completed.completed && Number(provisionCalls) === 1, "approved bootstrap did not complete exactly once");
    const assets = await runtime.listAssets(companyId);
    expect(assets.length === 1 && assets[0]?.status === "active" && assets[0]?.companyId === companyId, "verified bootstrap asset did not become Company-owned active asset");
    const replay = await executor.execute({ plan, requirements: [requirement], approvals: [approval], guard, state: completed, requestFactory });
    expect(replay.completed && Number(provisionCalls) === 1 && (await runtime.listAssets(companyId)).length === 1, "bootstrap replay reprovisioned completed asset");
  }));

  cases.push(await runCase("control catalog exposes capability/provider/asset metadata without credential references", async () => {
    const companyId = randomUUID(); const capability = "email.send";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); const p = provider(companyId, "mail-a", capability, 1); p.credentialsRef = "secret://private/provider-ref"; p.metadata = { privateHint: "sensitive-provider-value" }; providers.register(p);
    const runtime = new InMemoryRuntimeStore(); const now = fixedNow.toISOString();
    const asset: CompanyAsset = { id: randomUUID(), companyId, kind: "mailbox", providerId: "mail-a", capability, department: "commercial", cost: 1, currency: "USD", status: "active", credentialsRef: "secret://private/asset-ref", grantRefs: ["grant:private"], restrictions: [], metadata: { address: "sales@example.test", privateHint: "sensitive-asset-value" }, createdAt: now, updatedAt: now };
    await runtime.saveAsset(asset);
    const catalog = await buildControlCatalog({ companyId, semantics, providers, runtime });
    const serialized = JSON.stringify(catalog);
    expect(!serialized.includes("secret://private") && !serialized.includes("grant:private") && !serialized.includes("sensitive-provider-value") && !serialized.includes("sensitive-asset-value"), "control catalog exposed sensitive provider/asset fields");
    expect(catalog.providers[0]?.credentialConfigured === true && catalog.assets[0]?.credentialConfigured === true, "catalog lost safe credential configuration signal");
  }));


  cases.push(await runCase("missing credential is a safe pre-effect failure and may fall back", async () => {
    const companyId = randomUUID(); const capability = "email.send";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1)); providers.register(provider(companyId, "mail-b", capability, 2));
    const adapters = new ProviderAdapterRegistry(); let fallbackCalls = 0;
    const credentialAdapter = (providerId: string) => ({ descriptor: { companyId, providerId, capabilities: [capability], credentialNames: ["api-key"] }, execute: async (_request: any, context: any) => context.withCredential("api-key", async () => { if (providerId === "mail-b") fallbackCalls += 1; return { ok: true, sideEffectApplied: true, result: { id: providerId }, evidenceRefs: [`mail:${providerId}`], cost: 1 }; }) });
    adapters.register(credentialAdapter("mail-a")); adapters.register(credentialAdapter("mail-b"));
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-b", secretName: "api-key", value: "MAIL-B-ONLY-KEY" });
    const plane = new CapabilityPlane(semantics, providers, adapters, secrets, new InMemoryRuntimeStore(), () => fixedNow);
    const result = await plane.execute(planeRequest(companyId, capability, "send:missing-credential"), { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    expect(result.result.ok && result.providerId === "mail-b" && result.fallbackUsed && fallbackCalls === 1, "missing credential incorrectly blocked safe fallback");
  }));

  cases.push(await runCase("bootstrap execution state cannot be replayed against a different plan", async () => {
    const companyId = randomUUID(); const capability = "phone.sms";
    const requirement: BootstrapRequirement = { id: "phone", capability, assetKind: "phone-number", department: "customer", estimatedCost: 0, currency: "USD", humanBoundary: "kyc", preferredProviderIds: ["sms-a"] };
    const planA = planCompanyBootstrap({ companyId, mode: "new", requirements: [requirement], existingAssets: [], autonomousCapabilities: [capability] });
    const planB = planCompanyBootstrap({ companyId, mode: "new", requirements: [requirement], existingAssets: [], autonomousCapabilities: [capability] });
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "sms-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); adapters.register({ descriptor: { companyId, providerId: "sms-a", capabilities: [capability], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: true, result: {}, evidenceRefs: [], cost: 0 }) });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow); const executor = new BootstrapExecutor(plane, runtime, { verifyApproval: async (receipt) => receipt.approvedBy === "founder", verifyAsset: async () => ({ ok: true, evidenceRefs: ["phone:verified"] }) }, () => fixedNow);
    const requestFactory = () => ({ ...planeRequest(companyId, capability, "bootstrap:plan-mismatch"), selection: { ...planeRequest(companyId, capability, "bootstrap:plan-mismatch").selection, requireCredentials: false } });
    const guard = { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] };
    const paused = await executor.execute({ plan: planA, requirements: [requirement], approvals: [], guard, requestFactory });
    let rejected = false;
    try { await executor.execute({ plan: planB, requirements: [requirement], approvals: [], guard, state: paused, requestFactory }); } catch (error) { rejected = error instanceof DomainError; }
    expect(rejected, "bootstrap state crossed plan fingerprint boundary");
  }));

  cases.push(await runCase("capability plane rejects non-positive stale reconciliation window", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: false, result: {}, evidenceRefs: [], cost: 0 }) });
    const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), new InMemoryRuntimeStore(), () => fixedNow);
    let rejected = false;
    try { await plane.execute({ ...planeRequest(companyId, capability, "query:bad-stale"), selection: { ...planeRequest(companyId, capability, "query:bad-stale").selection, requireCredentials: false }, staleAfterMs: 0 }, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] }); } catch (error) { rejected = error instanceof DomainError; }
    expect(rejected, "zero staleAfterMs was accepted");
  }));

  cases.push(await runCase("secret resolver rejects trivially short secret material", () => {
    const resolver = new InMemorySecretResolver(); let rejected = false;
    try { resolver.register({ companyId: randomUUID(), providerId: "p", secretName: "key", value: "short" }); } catch (error) { rejected = error instanceof DomainError; }
    expect(rejected, "short secret material bypassed minimum entropy proxy");
  }));


  cases.push(await runCase("universal semantic catalog covers core enterprise planes without provider coupling", () => {
    const names = new Set(UNIVERSAL_SEMANTIC_CAPABILITIES.map((entry) => entry.name));
    for (const required of ["email.send", "calendar.create", "data.query", "finance.read", "payment.execute", "creative.image.generate", "creative.video.generate", "creative.model3d.generate", "creative.cad.generate", "identity.user.provision", "domain.dns.update"]) {
      expect(names.has(required), `universal capability missing: ${required}`);
    }
    const serialized = JSON.stringify(UNIVERSAL_SEMANTIC_CAPABILITIES).toLowerCase();
    for (const providerName of ["google", "twilio", "stripe", "runway", "meshy", "openai", "gemini"]) expect(!serialized.includes(providerName), `semantic catalog is coupled to provider ${providerName}`);
    expect(createUniversalSemanticCapabilityRegistry().list().length === UNIVERSAL_SEMANTIC_CAPABILITIES.length, "universal semantic registry lost descriptors");
  }));


  cases.push(await runCase("pre-effect provider routing failure closes durable idempotency intent", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, new ProviderRegistry(), new ProviderAdapterRegistry(), new InMemorySecretResolver(), runtime, () => fixedNow);
    const request = { ...planeRequest(companyId, capability, "route:none"), selection: { ...planeRequest(companyId, capability, "route:none").selection, requireCredentials: false } };
    let denied = false; try { await plane.execute(request, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] }); } catch (error) { denied = error instanceof DomainError; }
    expect(denied, "no-provider routing failure did not surface");
    const record = await runtime.getIdempotency(companyId, `capability:${capability}:route:none`);
    expect(record?.state === "failed" && Boolean(record.lastError), "pre-effect routing failure left idempotency intent open");
  }));

  cases.push(await runCase("authority denial closes capability idempotency without provider call", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); let calls = 0; adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => { calls += 1; return { ok: true, sideEffectApplied: false, result: {}, evidenceRefs: [], cost: 0 }; } });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow);
    const request = { ...planeRequest(companyId, capability, "query:no-grant"), selection: { ...planeRequest(companyId, capability, "query:no-grant").selection, requireCredentials: false } };
    let denied = false; try { await plane.execute(request, { principal: "worker-a", grants: [], budgets: [] }); } catch (error) { denied = error instanceof DomainError && error.message.startsWith("DENY:"); }
    const record = await runtime.getIdempotency(companyId, `capability:${capability}:query:no-grant`);
    expect(denied && calls === 0 && record?.state === "failed", "authority denial did not fail closed before provider execution");
  }));

  cases.push(await runCase("adapter errors containing credential material are redacted before durable result", async () => {
    const companyId = randomUUID(); const capability = "email.send"; const secretValue = "ULTRA-PRIVATE-ERROR-KEY";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1));
    const adapters = new ProviderAdapterRegistry(); adapters.register({ descriptor: { companyId, providerId: "mail-a", capabilities: [capability], credentialNames: ["api-key"] }, execute: async (_request, context) => context.withCredential("api-key", async (value) => { throw new ProviderAdapterError(`provider failed with ${value}`, true); }) });
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-a", secretName: "api-key", value: secretValue });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, secrets, runtime, () => fixedNow);
    const result = await plane.execute({ ...planeRequest(companyId, capability, "send:error-redaction"), allowFallback: false, maxAttempts: 1 }, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    const record = await runtime.getIdempotency(companyId, `capability:${capability}:send:error-redaction`);
    expect(result.reconciliationRequired && !JSON.stringify(result).includes(secretValue) && !JSON.stringify(record).includes(secretValue), "credential material leaked through provider error path");
  }));


  cases.push(await runCase("capability plane rejects mismatched execution principal before durable claim", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: false, result: {}, evidenceRefs: [], cost: 0 }) });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow);
    let rejected = false; try { await plane.execute({ ...planeRequest(companyId, capability, "query:principal") , selection: { ...planeRequest(companyId, capability, "query:principal").selection, requireCredentials: false } }, { principal: "different-worker", grants: [grant(companyId, capability, "bootstrap")], budgets: [] }); } catch (error) { rejected = error instanceof DomainError; }
    expect(rejected && (await runtime.getIdempotency(companyId, `capability:${capability}:query:principal`)) === null, "principal mismatch was accepted or created durable intent");
  }));

  cases.push(await runCase("provider format cannot exceed semantic capability contract", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); p.inputFormats.push("csv"); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: false, result: {}, evidenceRefs: [], cost: 0 }) });
    const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), new InMemoryRuntimeStore(), () => fixedNow);
    const request = planeRequest(companyId, capability, "query:format"); request.selection.requireCredentials = false; request.selection.inputFormat = "csv";
    let rejected = false; try { await plane.execute(request, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] }); } catch (error) { rejected = error instanceof DomainError; }
    expect(rejected, "provider-only input format bypassed semantic capability contract");
  }));


  cases.push(await runCase("idempotency key replay with changed request fingerprint is rejected", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); let calls = 0; adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => { calls += 1; return { ok: true, sideEffectApplied: false, result: { rows: 1 }, evidenceRefs: [], cost: 0 }; } });
    const runtime = new InMemoryRuntimeStore(); const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow); const guard = { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] };
    const first = planeRequest(companyId, capability, "query:same-key"); first.selection.requireCredentials = false; first.capabilityRequest.payload = { sql: "select 1" };
    await plane.execute(first, guard);
    const changed = planeRequest(companyId, capability, "query:same-key"); changed.selection.requireCredentials = false; changed.capabilityRequest.payload = { sql: "select 2" };
    let conflict = false; try { await plane.execute(changed, guard); } catch (error) { conflict = error instanceof DomainError && error.message.startsWith("IDEMPOTENCY_CONFLICT:"); }
    expect(conflict && calls === 1, "changed request reused prior idempotency result or repeated provider call");
  }));

  cases.push(await runCase("credential-required semantic capability skips adapter with no credential contract", async () => {
    const companyId = randomUUID(); const capability = "email.send";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, true));
    const providers = new ProviderRegistry(); providers.register(provider(companyId, "mail-a", capability, 1)); providers.register(provider(companyId, "mail-b", capability, 2));
    const adapters = new ProviderAdapterRegistry(); let badCalls = 0; let goodCalls = 0;
    adapters.register({ descriptor: { companyId, providerId: "mail-a", capabilities: [capability], credentialNames: [] }, execute: async () => { badCalls += 1; return { ok: true, sideEffectApplied: true, result: {}, evidenceRefs: [], cost: 1 }; } });
    adapters.register({ descriptor: { companyId, providerId: "mail-b", capabilities: [capability], credentialNames: ["api-key"] }, execute: async (_request, context) => context.withCredential("api-key", async () => { goodCalls += 1; return { ok: true, sideEffectApplied: true, result: { id: "ok" }, evidenceRefs: [], cost: 1 }; }) });
    const secrets = new InMemorySecretResolver(); secrets.register({ companyId, providerId: "mail-b", secretName: "api-key", value: "VALID-MAIL-B-KEY" });
    const plane = new CapabilityPlane(semantics, providers, adapters, secrets, new InMemoryRuntimeStore(), () => fixedNow);
    const result = await plane.execute(planeRequest(companyId, capability, "send:adapter-contract"), { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    expect(result.result.ok && result.providerId === "mail-b" && badCalls === 0 && goodCalls === 1, "credential-less adapter executed a credential-required capability");
  }));


  cases.push(await runCase("cached capability result still requires current authority to read", async () => {
    const companyId = randomUUID(); const capability = "data.query";
    const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic(capability, false));
    const providers = new ProviderRegistry(); const p = provider(companyId, "db-a", capability, 1); delete p.credentialsRef; providers.register(p);
    const adapters = new ProviderAdapterRegistry(); let calls = 0; adapters.register({ descriptor: { companyId, providerId: "db-a", capabilities: [capability], credentialNames: [] }, execute: async () => { calls += 1; return { ok: true, sideEffectApplied: false, result: { confidential: "row" }, evidenceRefs: [], cost: 0 }; } });
    const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), new InMemoryRuntimeStore(), () => fixedNow);
    const request = planeRequest(companyId, capability, "query:replay-auth"); request.selection.requireCredentials = false;
    await plane.execute(request, { principal: "worker-a", grants: [grant(companyId, capability, "bootstrap")], budgets: [] });
    let denied = false; try { await plane.execute(request, { principal: "worker-a", grants: [], budgets: [] }); } catch (error) { denied = error instanceof DomainError && error.message.startsWith("DENY:replay_without_active_grant"); }
    expect(denied && calls === 1, "revoked principal read cached capability result or repeated provider call");
  }));

  return cases;
}
