import { createHash } from "node:crypto";
import type {
  AuthorityGrant,
  BudgetEnvelope,
  CapabilityAttemptRecord,
  CapabilityPlaneRequest,
  CapabilityPlaneResult,
  CapabilityRequest,
  CapabilityResult,
  ProviderAdapterDescriptor,
  SemanticCapabilityDescriptor,
} from "../../contracts/src/index.js";
import type { RuntimeStore } from "../../database/src/runtime-store.js";
import { NoopTelemetrySink, type TelemetrySink } from "../../observability/src/index.js";
import { DomainError, grantAllows } from "../../domain/src/index.js";
import {
  CapabilityRegistry,
  executeCapabilityRequest,
  type Capability,
} from "../../kernel/src/index.js";
import { ProviderRegistry } from "./index.js";
import type { SecretResolver } from "./secrets.js";

const sensitivityRank = { public: 0, internal: 1, restricted: 2 } as const;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DomainError("capability request contains non-finite number");
    return value;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new DomainError("capability request contains invalid date");
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map((entry) => {
    if (entry === undefined) throw new DomainError("capability request arrays cannot contain undefined");
    return canonicalize(entry);
  });
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new DomainError("capability request must contain JSON-safe plain objects");
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => [key, canonicalize(record[key])]));
  }
  if (value === undefined) return undefined;
  throw new DomainError(`unsupported capability request value: ${typeof value}`);
}

function executionFingerprint(input: CapabilityPlaneRequest, selection: CapabilityPlaneRequest["selection"]): string {
  const { idempotencyKey: _idempotencyKey, ...requestWithoutKey } = input.capabilityRequest;
  return createHash("sha256").update(JSON.stringify(canonicalize({
    request: requestWithoutKey,
    selection,
    allowFallback: input.allowFallback,
    maxAttempts: input.maxAttempts,
  }))).digest("hex");
}

export class ProviderAdapterError extends Error {
  constructor(message: string, public readonly sideEffectApplied: boolean) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}

export interface ProviderAdapterExecutionContext {
  companyId: string;
  providerId: string;
  capability: string;
  withCredential<T>(name: string, use: (value: string) => T | Promise<T>): Promise<T>;
}

export interface ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  execute(request: CapabilityRequest, context: ProviderAdapterExecutionContext): Promise<CapabilityResult>;
}

export class SemanticCapabilityRegistry {
  private readonly values = new Map<string, SemanticCapabilityDescriptor>();

  register(descriptor: SemanticCapabilityDescriptor): void {
    if (!descriptor.name.includes(".")) throw new DomainError("semantic capability names must be namespaced");
    if (descriptor.inputFormats.length === 0 || descriptor.outputFormats.length === 0) throw new DomainError("semantic capability requires input/output formats");
    this.values.set(descriptor.name, structuredClone(descriptor));
  }

  get(name: string): SemanticCapabilityDescriptor {
    const descriptor = this.values.get(name);
    if (!descriptor) throw new DomainError(`semantic capability not registered: ${name}`);
    return structuredClone(descriptor);
  }

  list(): SemanticCapabilityDescriptor[] {
    return [...this.values.values()].map((value) => structuredClone(value)).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    const d = adapter.descriptor;
    if (!d.companyId || !d.providerId || d.capabilities.length === 0) throw new DomainError("invalid provider adapter descriptor");
    this.adapters.set(`${d.companyId}:${d.providerId}`, adapter);
  }

  get(companyId: string, providerId: string, capability: string): ProviderAdapter {
    const adapter = this.adapters.get(`${companyId}:${providerId}`);
    if (!adapter) throw new DomainError(`provider adapter unavailable: ${providerId}`);
    if (adapter.descriptor.companyId !== companyId) throw new DomainError("provider adapter company mismatch");
    if (!adapter.descriptor.capabilities.includes(capability)) throw new DomainError(`provider adapter does not implement ${capability}`);
    return adapter;
  }

  has(companyId: string, providerId: string, capability: string): boolean {
    const adapter = this.adapters.get(`${companyId}:${providerId}`);
    return Boolean(adapter && adapter.descriptor.companyId === companyId && adapter.descriptor.capabilities.includes(capability));
  }
}

export interface CapabilityPlaneGuardContext {
  principal: string;
  grants: AuthorityGrant[];
  budgets: BudgetEnvelope[];
  outputs?: Map<string, unknown>;
  recordEvent?: Parameters<typeof executeCapabilityRequest>[2]["recordEvent"];
}

function safeFailureResult(message: string): CapabilityResult {
  return { ok: false, sideEffectApplied: false, result: { error: message }, evidenceRefs: [], cost: 0 };
}

function unknownFailureResult(message: string): CapabilityResult {
  return { ok: false, sideEffectApplied: true, result: { error: message, state: "unknown" }, evidenceRefs: [], cost: 0 };
}

function planeResultFromRecord(value: unknown): CapabilityPlaneResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CapabilityPlaneResult>;
  if (typeof candidate.capability !== "string" || !Array.isArray(candidate.attempts) || !candidate.result) return null;
  return structuredClone(candidate as CapabilityPlaneResult);
}

export class CapabilityPlane {
  constructor(
    private readonly semantics: SemanticCapabilityRegistry,
    private readonly providers: ProviderRegistry,
    private readonly adapters: ProviderAdapterRegistry,
    private readonly secrets: SecretResolver,
    private readonly runtime: RuntimeStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly telemetry: TelemetrySink = new NoopTelemetrySink(),
  ) {}

  async execute(input: CapabilityPlaneRequest, guard: CapabilityPlaneGuardContext): Promise<CapabilityPlaneResult> {
    const request = input.capabilityRequest;
    const selection = structuredClone(input.selection);
    const semantic = this.semantics.get(selection.capability);
    if (selection.capability === "creative.video.generate" || semantic.availability === "staged") {
      throw new DomainError(`STAGED:capability_unavailable:${selection.capability}`);
    }
    if (selection.capability === "creative.image.generate" || selection.capability === "creative.image.edit" || semantic.availability === "native") {
      throw new DomainError(`NATIVE:capability_requires_responses_gateway:${selection.capability}`);
    }
    if (request.companyId !== selection.companyId) throw new DomainError("capability plane company mismatch");
    if (guard.principal !== request.principal) throw new DomainError("capability guard principal mismatch");
    if (!input.executionOwner.trim()) throw new DomainError("capability execution owner required");
    if (request.action !== selection.capability) throw new DomainError("capability request action must equal semantic capability");
    if (selection.inputFormat && !semantic.inputFormats.includes(selection.inputFormat)) throw new DomainError("input format exceeds semantic capability contract");
    if (selection.outputFormat && !semantic.outputFormats.includes(selection.outputFormat)) throw new DomainError("output format exceeds semantic capability contract");
    if (sensitivityRank[selection.sensitivity] > sensitivityRank[semantic.maxSensitivity]) throw new DomainError("capability sensitivity exceeds semantic contract");
    if (semantic.credentialRequired) selection.requireCredentials = true;
    if (input.maxAttempts < 1) throw new DomainError("maxAttempts must be >= 1");
    if (input.staleAfterMs <= 0) throw new DomainError("staleAfterMs must be > 0");

    const now = this.clock();
    const journalKey = `capability:${selection.capability}:${request.idempotencyKey}`;
    const requestFingerprint = executionFingerprint(input, selection);
    const claim = await this.runtime.claimIdempotency(
      request.companyId,
      journalKey,
      { capability: selection.capability, scope: request.scope, providerMode: selection.mode, requestFingerprint },
      input.executionOwner,
      now,
    );

    if (!claim.claimed) {
      const replayAuthorized = guard.grants.some((candidate) => grantAllows(candidate, request, now));
      if (!replayAuthorized) throw new DomainError(`DENY:replay_without_active_grant:${request.action}:${request.scope}`);
      const priorIntent = claim.record.intent as { requestFingerprint?: unknown };
      if (priorIntent.requestFingerprint !== requestFingerprint) throw new DomainError(`IDEMPOTENCY_CONFLICT:request_changed:${journalKey}`);
      if ((claim.record.state === "applied" || claim.record.state === "failed" || claim.record.state === "reconciled") && claim.record.result !== undefined) {
        const cached = planeResultFromRecord(claim.record.result);
        if (!cached) throw new DomainError("durable capability result is invalid");
        this.secrets.assertSafe(cached);
        return cached;
      }
      if (claim.record.state === "failed" && claim.record.lastError) throw new DomainError(claim.record.lastError);
      if (claim.record.state === "intent") {
        const reconciliation = await this.runtime.claimStaleIdempotencyForReconciliation(
          request.companyId,
          journalKey,
          `${input.executionOwner}:reconciler`,
          now,
          input.staleAfterMs,
        );
        if (reconciliation) throw new DomainError(`ESCALATE:capability_reconciliation_required:${journalKey}`);
        throw new DomainError(`CONTENDED:capability_inflight:${journalKey}`);
      }
      throw new DomainError(`ESCALATE:capability_reconciliation_required:${journalKey}`);
    }

    const failBeforeEffect = async (error: unknown): Promise<never> => {
      const rawMessage = error instanceof Error ? error.message : String(error);
      let message = rawMessage;
      try { this.secrets.assertSafe({ error: rawMessage }); } catch { message = "pre-effect capability failure (details redacted)"; }
      const settled = await this.runtime.markIdempotency(request.companyId, journalKey, input.executionOwner, claim.record.fencingToken, "failed", this.clock(), undefined, message);
      if (!settled) throw new DomainError("capability idempotency fencing lost before pre-effect failure settlement");
      throw error instanceof Error && message === rawMessage ? error : new DomainError(message);
    };

    let route;
    try { route = this.providers.route(selection); } catch (error) { return failBeforeEffect(error); }
    const candidateIds = route.eligibleProviderIds.slice(0, input.maxAttempts);
    const attempts: CapabilityAttemptRecord[] = [];
    let lastResult = safeFailureResult("no provider attempt completed");

    for (let index = 0; index < candidateIds.length; index += 1) {
      const providerId = candidateIds[index];
      if (!providerId) continue;
      if (!this.adapters.has(request.companyId, providerId, selection.capability)) {
        attempts.push({ providerId, ok: false, sideEffectApplied: false, evidenceRefs: [], cost: 0, error: "adapter unavailable" });
        if (!input.allowFallback) break;
        continue;
      }

      const adapter = this.adapters.get(request.companyId, providerId, selection.capability);
      if (semantic.credentialRequired && adapter.descriptor.credentialNames.length === 0) {
        attempts.push({ providerId, ok: false, sideEffectApplied: false, evidenceRefs: [], cost: 0, error: "adapter credential contract missing" });
        if (!input.allowFallback) break;
        continue;
      }
      const allowedCredentialNames = new Set(adapter.descriptor.credentialNames);
      const adapterContext: ProviderAdapterExecutionContext = {
        companyId: request.companyId,
        providerId,
        capability: selection.capability,
        withCredential: async <T>(name: string, use: (value: string) => T | Promise<T>): Promise<T> => {
          if (!allowedCredentialNames.has(name)) throw new ProviderAdapterError(`adapter credential not declared: ${name}`, false);
          let handle;
          try {
            handle = this.secrets.getHandle(request.companyId, providerId, name);
          } catch (error) {
            throw new ProviderAdapterError(error instanceof Error ? error.message : "credential unavailable", false);
          }
          if (handle.companyId !== request.companyId || handle.providerId !== providerId) throw new ProviderAdapterError("credential scope mismatch", false);
          return this.secrets.withSecret(handle, use);
        },
      };

      const capabilityName = `adapter:${request.companyId}:${providerId}:${selection.capability}`;
      const wrapper: Capability = {
        name: capabilityName,
        execute: async (attemptRequest) => {
          try {
            const result = await adapter.execute(attemptRequest, adapterContext);
            try {
              this.secrets.assertSafe(result);
            } catch (error) {
              return unknownFailureResult(error instanceof Error ? error.message : "adapter output rejected");
            }
            return result;
          } catch (error) {
            const rawMessage = error instanceof Error ? error.message : "provider adapter failure";
            let message = rawMessage;
            try { this.secrets.assertSafe({ error: rawMessage }); } catch { message = "provider adapter failure (details redacted)"; }
            if (error instanceof ProviderAdapterError && !error.sideEffectApplied) return safeFailureResult(message);
            return unknownFailureResult(message);
          }
        },
      };
      const registry = new CapabilityRegistry();
      registry.register(wrapper);
      const attemptRequest: CapabilityRequest = {
        ...structuredClone(request),
        provider: providerId,
        idempotencyKey: `${request.idempotencyKey}:provider:${providerId}`,
      };
      const nodeContext = {
        companyId: request.companyId,
        principal: guard.principal,
        grants: guard.grants,
        budgets: guard.budgets,
        capabilities: registry,
        outputs: guard.outputs ?? new Map<string, unknown>(),
        ...(guard.recordEvent ? { recordEvent: guard.recordEvent } : {}),
      };
      let result: CapabilityResult;
      try {
        result = await this.telemetry.withSpan(`execute_tool ${selection.capability}`, {
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": selection.capability,
          "xanxitospa.company.id": request.companyId,
          "xanxitospa.provider.id": providerId,
          "xanxitospa.content.capture": false,
        }, async () => executeCapabilityRequest(attemptRequest, capabilityName, nodeContext));
      } catch (error) {
        return failBeforeEffect(error);
      }
      lastResult = result;
      attempts.push({ providerId, ok: result.ok, sideEffectApplied: result.sideEffectApplied, evidenceRefs: [...result.evidenceRefs], cost: result.cost });

      if (result.ok) {
        const finalResult: CapabilityPlaneResult = {
          capability: selection.capability,
          providerId,
          attempts,
          result,
          fallbackUsed: index > 0,
          reconciliationRequired: false,
        };
        this.secrets.assertSafe(finalResult);
        const settled = await this.runtime.markIdempotency(request.companyId, journalKey, input.executionOwner, claim.record.fencingToken, "applied", this.clock(), finalResult);
        if (!settled) throw new DomainError("capability idempotency fencing lost before settlement");
        return finalResult;
      }

      if (result.sideEffectApplied) {
        const finalResult: CapabilityPlaneResult = {
          capability: selection.capability,
          providerId,
          attempts,
          result,
          fallbackUsed: index > 0,
          reconciliationRequired: true,
        };
        const markedUnknown = await this.runtime.markIdempotency(request.companyId, journalKey, input.executionOwner, claim.record.fencingToken, "unknown", this.clock(), finalResult, "provider result requires reconciliation");
        if (!markedUnknown) throw new DomainError("capability idempotency fencing lost before reconciliation settlement");
        return finalResult;
      }
      if (!input.allowFallback) break;
    }

    const lastProviderId = attempts.at(-1)?.providerId;
    const finalResult: CapabilityPlaneResult = {
      capability: selection.capability,
      ...(lastProviderId ? { providerId: lastProviderId } : {}),
      attempts,
      result: lastResult,
      fallbackUsed: attempts.length > 1,
      reconciliationRequired: false,
    };
    this.secrets.assertSafe(finalResult);
    const settled = await this.runtime.markIdempotency(request.companyId, journalKey, input.executionOwner, claim.record.fencingToken, "failed", this.clock(), finalResult, "all eligible provider attempts failed safely");
    if (!settled) throw new DomainError("capability idempotency fencing lost before failure settlement");
    return finalResult;
  }
}
