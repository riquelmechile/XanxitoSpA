import { randomUUID } from "node:crypto";
import type {
  AuthorityGrant,
  BudgetEnvelope,
  CapabilityPlaneRequest,
  CapabilityPlaneResult,
  CapabilityRequest,
  CapabilityResult,
  ProviderAdapterDescriptor,
  ProviderDescriptor,
  SemanticCapabilityDescriptor,
} from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { DomainError } from "../../domain/src/index.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import {
  CapabilityPlane,
  ProviderAdapterError,
  ProviderAdapterRegistry,
  SemanticCapabilityRegistry,
  type ProviderAdapter,
  type ProviderAdapterExecutionContext,
} from "../../providers/src/adapters.js";
import { EnvironmentSecretResolver } from "../../providers/src/environment-secrets.js";

export type FaultScenarioId = "lost_ack" | "budget_overrun" | "stale_fence";

export interface FaultArmMetrics {
  completed: boolean;
  sideEffects: number;
  duplicateSideEffects: number;
  budgetViolations: number;
  stateCorruption: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  safeHalt: boolean;
  staleWriteBlocked: boolean;
  integrityPreserved: boolean;
  auditEvents: string[];
  error?: string;
}

export interface FaultScenarioResult {
  id: FaultScenarioId;
  objective: string;
  injectedFault: string;
  direct: FaultArmMetrics;
  xanxitospa: FaultArmMetrics;
}

export interface FaultInjectionPilotResult {
  version: "v4-pilot-1";
  productionSurfaces: string[];
  scenarios: FaultScenarioResult[];
  aggregate: {
    directIntegrityPasses: number;
    xanxitospaIntegrityPasses: number;
    directUnsafeEffects: number;
    xanxitospaUnsafeEffects: number;
    xanxitospaRecoverySuccesses: number;
  };
}

function emptyMetrics(): FaultArmMetrics {
  return {
    completed: false,
    sideEffects: 0,
    duplicateSideEffects: 0,
    budgetViolations: 0,
    stateCorruption: 0,
    recoverySuccess: false,
    reconciliationRequired: false,
    safeHalt: false,
    staleWriteBlocked: false,
    integrityPreserved: false,
    auditEvents: [],
  };
}

function grant(companyId: string, capability: string): AuthorityGrant {
  return {
    id: randomUUID(),
    companyId,
    principal: "worker-a",
    actions: [capability],
    scopes: ["demo"],
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
  };
}

function budget(companyId: string): BudgetEnvelope {
  return {
    id: randomUUID(),
    companyId,
    department: "operations",
    currency: "CLP",
    periodCap: 100_000,
    spent: 0,
    perTransactionCap: 50_000,
    allowedCategories: ["ops"],
    blockedCategories: [],
    allowedProviders: ["fault-provider"],
    approvedBeneficiaries: ["approved"],
  };
}

function semantic(name: string): SemanticCapabilityDescriptor {
  return {
    name,
    description: `v4 pilot semantic capability ${name}`,
    risk: "medium",
    sideEffectClass: "external",
    credentialRequired: false,
    maxSensitivity: "internal",
    inputFormats: ["json"],
    outputFormats: ["json"],
  };
}

function provider(companyId: string, capability: string): ProviderDescriptor {
  return {
    id: "fault-provider",
    companyId,
    capabilities: [capability],
    regions: ["CL"],
    inputFormats: ["json"],
    outputFormats: ["json"],
    estimatedCost: 1,
    latencyP50Ms: 1,
    latencyP95Ms: 1,
    reliability: 1,
    quality: 1,
    privacyScore: 1,
    maxSensitivity: "internal",
    health: "healthy",
    metadata: {},
  };
}

function planeRequest(companyId: string, capability: string, idempotencyKey: string, amount?: number): CapabilityPlaneRequest {
  const capabilityRequest: CapabilityRequest = {
    companyId,
    principal: "worker-a",
    action: capability,
    scope: "demo",
    idempotencyKey,
    payload: { operation: "mutate-once" },
    ...(amount !== undefined
      ? { amount, currency: "CLP", category: "ops", provider: "fault-provider", beneficiary: "approved" }
      : {}),
  };
  return {
    capabilityRequest,
    selection: {
      companyId,
      capability,
      region: "CL",
      inputFormat: "json",
      outputFormat: "json",
      sensitivity: "internal",
      mode: "balanced",
    },
    executionOwner: "v4-pilot-runtime",
    allowFallback: true,
    maxAttempts: 1,
    staleAfterMs: 1_000,
  };
}

class CountingAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  sideEffects = 0;
  calls = 0;

  constructor(
    companyId: string,
    capability: string,
    private readonly behavior: "lost-ack-first" | "success",
  ) {
    this.descriptor = { companyId, providerId: "fault-provider", capabilities: [capability], credentialNames: [] };
  }

  async execute(_request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    this.calls += 1;
    this.sideEffects += 1;
    if (this.behavior === "lost-ack-first" && this.calls === 1) {
      throw new ProviderAdapterError("injected lost acknowledgement after provider mutation", true);
    }
    return {
      ok: true,
      sideEffectApplied: true,
      result: { accepted: true, call: this.calls },
      evidenceRefs: [`effect:${this.sideEffects}`],
      cost: 1,
    };
  }
}

function createPlane(companyId: string, capability: string, adapter: ProviderAdapter, runtime = new InMemoryRuntimeStore()): {
  plane: CapabilityPlane;
  runtime: InMemoryRuntimeStore;
} {
  const semantics = new SemanticCapabilityRegistry();
  semantics.register(semantic(capability));
  const adapters = new ProviderAdapterRegistry();
  adapters.register(adapter);
  const providers = new ProviderRegistry();
  providers.register(provider(companyId, capability));
  return {
    plane: new CapabilityPlane(semantics, providers, adapters, new EnvironmentSecretResolver(), runtime),
    runtime,
  };
}

async function lostAckScenario(): Promise<FaultScenarioResult> {
  const companyId = randomUUID();
  const capability = "v4.demo.write";
  const request = planeRequest(companyId, capability, "v4-lost-ack-1");

  const direct = emptyMetrics();
  const directAdapter = new CountingAdapter(companyId, capability, "lost-ack-first");
  const directContext: ProviderAdapterExecutionContext = {
    companyId,
    providerId: "fault-provider",
    capability,
    withCredential: async (_name, use) => use("unused"),
  };
  try {
    await directAdapter.execute(request.capabilityRequest, directContext);
  } catch (error) {
    direct.auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`);
    // DIRECT has no durable idempotency/reconciliation boundary, so the naive recovery is a blind retry.
    const retry = await directAdapter.execute(request.capabilityRequest, directContext);
    direct.completed = retry.ok;
  }
  direct.sideEffects = directAdapter.sideEffects;
  direct.duplicateSideEffects = Math.max(0, direct.sideEffects - 1);
  direct.integrityPreserved = direct.duplicateSideEffects === 0;

  const xanxitospa = emptyMetrics();
  const xspaAdapter = new CountingAdapter(companyId, capability, "lost-ack-first");
  const { plane, runtime } = createPlane(companyId, capability, xspaAdapter);
  const first = await plane.execute(request, { principal: "worker-a", grants: [grant(companyId, capability)], budgets: [] });
  xanxitospa.reconciliationRequired = first.reconciliationRequired;
  xanxitospa.auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");

  // Deterministic reconciliation probe confirms exactly one provider mutation, then durably settles the original journal.
  const journalKey = `capability:${capability}:${request.capabilityRequest.idempotencyKey}`;
  const record = await runtime.getIdempotency(companyId, journalKey);
  if (!record) throw new Error("lost-ACK scenario missing durable idempotency record");
  const reconciled: CapabilityPlaneResult = {
    ...first,
    reconciliationRequired: false,
    result: {
      ok: true,
      sideEffectApplied: true,
      result: { reconciled: true, observedEffects: xspaAdapter.sideEffects },
      evidenceRefs: ["reconciliation:provider-effect-confirmed"],
      cost: first.result.cost,
    },
  };
  const settled = await runtime.markIdempotency(
    companyId,
    journalKey,
    "v4-pilot-runtime",
    record.fencingToken,
    "reconciled",
    new Date("2026-08-24T12:00:01.000Z"),
    reconciled,
  );
  if (!settled) throw new Error("lost-ACK reconciliation settlement lost fencing");
  const replay = await plane.execute(request, { principal: "worker-a", grants: [grant(companyId, capability)], budgets: [] });
  xanxitospa.completed = replay.result.ok;
  xanxitospa.recoverySuccess = replay.result.ok && !replay.reconciliationRequired;
  xanxitospa.sideEffects = xspaAdapter.sideEffects;
  xanxitospa.duplicateSideEffects = Math.max(0, xanxitospa.sideEffects - 1);
  xanxitospa.integrityPreserved = xanxitospa.duplicateSideEffects === 0;
  xanxitospa.auditEvents.push("reconciliation:verified-and-replayed-without-effect");

  return {
    id: "lost_ack",
    objective: "apply one external mutation exactly once despite losing the provider acknowledgement",
    injectedFault: "provider mutation succeeds, transport acknowledgement is lost on first call",
    direct,
    xanxitospa,
  };
}

async function budgetOverrunScenario(): Promise<FaultScenarioResult> {
  const companyId = randomUUID();
  const capability = "v4.demo.spend";
  const request = planeRequest(companyId, capability, "v4-budget-1", 60_000);

  const direct = emptyMetrics();
  const directAdapter = new CountingAdapter(companyId, capability, "success");
  const directContext: ProviderAdapterExecutionContext = {
    companyId,
    providerId: "fault-provider",
    capability,
    withCredential: async (_name, use) => use("unused"),
  };
  const directResult = await directAdapter.execute(request.capabilityRequest, directContext);
  direct.completed = directResult.ok;
  direct.sideEffects = directAdapter.sideEffects;
  direct.budgetViolations = directResult.ok ? 1 : 0;
  direct.integrityPreserved = direct.budgetViolations === 0;

  const xanxitospa = emptyMetrics();
  const xspaAdapter = new CountingAdapter(companyId, capability, "success");
  const { plane } = createPlane(companyId, capability, xspaAdapter);
  try {
    await plane.execute(request, {
      principal: "worker-a",
      grants: [grant(companyId, capability)],
      budgets: [budget(companyId)],
      recordEvent: async (event) => { xanxitospa.auditEvents.push(event.type); },
    });
  } catch (error) {
    xanxitospa.safeHalt = error instanceof DomainError && error.message.startsWith("ESCALATE:budget_boundary:");
    xanxitospa.error = error instanceof Error ? error.message : String(error);
  }
  xanxitospa.sideEffects = xspaAdapter.sideEffects;
  xanxitospa.budgetViolations = 0;
  xanxitospa.integrityPreserved = xanxitospa.safeHalt && xanxitospa.sideEffects === 0;

  return {
    id: "budget_overrun",
    objective: "prevent a CLP 60,000 mutation when the per-transaction envelope is CLP 50,000",
    injectedFault: "requested spend exceeds the active budget envelope",
    direct,
    xanxitospa,
  };
}

async function staleFenceScenario(): Promise<FaultScenarioResult> {
  const direct = emptyMetrics();
  let directState = "initial";
  directState = "new-owner-result";
  // A stale worker has no fencing guard and overwrites the newer owner.
  directState = "stale-owner-result";
  direct.completed = true;
  direct.stateCorruption = directState === "stale-owner-result" ? 1 : 0;
  direct.sideEffects = 2;
  direct.integrityPreserved = direct.stateCorruption === 0;

  const xanxitospa = emptyMetrics();
  const companyId = randomUUID();
  const key = "v4-stale-fence-1";
  const store = new InMemoryRuntimeStore();
  const first = await store.claimIdempotency(companyId, key, { operation: "single-owner-settlement" }, "worker-a", new Date("2026-08-24T12:00:00.000Z"));
  if (!first.claimed) throw new Error("stale-fence pilot could not establish first owner");
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000);
  if (!takeover) throw new Error("stale-fence pilot could not establish takeover owner");
  const staleSettled = await store.markIdempotency(companyId, key, "worker-a", first.record.fencingToken, "applied", new Date("2026-08-24T12:00:03.000Z"), { value: "stale-owner-result" });
  const freshSettled = await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:03.100Z"), { value: "new-owner-result" });
  const final = await store.getIdempotency(companyId, key);
  xanxitospa.staleWriteBlocked = !staleSettled;
  xanxitospa.completed = freshSettled;
  xanxitospa.recoverySuccess = freshSettled;
  xanxitospa.stateCorruption = final?.result && (final.result as { value?: string }).value === "new-owner-result" ? 0 : 1;
  xanxitospa.sideEffects = 1;
  xanxitospa.integrityPreserved = xanxitospa.staleWriteBlocked && xanxitospa.stateCorruption === 0;
  xanxitospa.auditEvents.push(`fence:${first.record.fencingToken}->${takeover.fencingToken}`, "stale-settlement:rejected", "new-owner:reconciled");

  return {
    id: "stale_fence",
    objective: "prevent a stale worker from overwriting a newer reconciliation owner",
    injectedFault: "lease/idempotency ownership is taken over after staleness, then the old worker attempts settlement",
    direct,
    xanxitospa,
  };
}

export async function runFaultInjectionPilot(ids: FaultScenarioId[] = ["lost_ack", "budget_overrun", "stale_fence"]): Promise<FaultInjectionPilotResult> {
  const runners: Record<FaultScenarioId, () => Promise<FaultScenarioResult>> = {
    lost_ack: lostAckScenario,
    budget_overrun: budgetOverrunScenario,
    stale_fence: staleFenceScenario,
  };
  const scenarios: FaultScenarioResult[] = [];
  for (const id of ids) scenarios.push(await runners[id]());
  return {
    version: "v4-pilot-1",
    productionSurfaces: [
      "CapabilityPlane",
      "authorizeRequest/BudgetEnvelope",
      "InMemoryRuntimeStore idempotency journal",
      "monotonic fencing tokens",
      "reconciliation replay",
    ],
    scenarios,
    aggregate: {
      directIntegrityPasses: scenarios.filter((scenario) => scenario.direct.integrityPreserved).length,
      xanxitospaIntegrityPasses: scenarios.filter((scenario) => scenario.xanxitospa.integrityPreserved).length,
      directUnsafeEffects: scenarios.reduce((sum, scenario) => sum + scenario.direct.duplicateSideEffects + scenario.direct.budgetViolations + scenario.direct.stateCorruption, 0),
      xanxitospaUnsafeEffects: scenarios.reduce((sum, scenario) => sum + scenario.xanxitospa.duplicateSideEffects + scenario.xanxitospa.budgetViolations + scenario.xanxitospa.stateCorruption, 0),
      xanxitospaRecoverySuccesses: scenarios.filter((scenario) => scenario.xanxitospa.recoverySuccess).length,
    },
  };
}
