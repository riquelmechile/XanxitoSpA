import { randomUUID } from "node:crypto";
import type {
  AuthorityGrant,
  CapabilityPlaneRequest,
  CapabilityPlaneResult,
  CapabilityRequest,
  CapabilityResult,
  ProviderAdapterDescriptor,
  ProviderDescriptor,
  SemanticCapabilityDescriptor,
} from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
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

export interface RocketChatPort {
  postMessage(targetName: string, text: string): Promise<void>;
  countOwnMessages(targetName: string, text: string): Promise<number>;
}

export interface RocketChatSessionPort extends RocketChatPort {
  primeSession(): Promise<void>;
  expireSession(): Promise<void>;
}

export interface RocketChatArmResult {
  mode: "direct" | "xanxitospa";
  completed: boolean;
  messageCount: number;
  sideEffects: number;
  duplicateSideEffects: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  integrityPreserved: boolean;
  safeHalt: boolean;
  auditEvents: string[];
}

export class HttpRocketChatPort implements RocketChatPort, RocketChatSessionPort {
  private authToken = "";
  private userId = "";
  private readonly roomByTarget = new Map<string, string>();

  constructor(private readonly config: { baseUrl: string; username: string; password: string }) {}

  async primeSession(): Promise<void> {
    this.authToken = "";
    this.userId = "";
    await this.login();
  }

  async expireSession(): Promise<void> {
    if (!this.authToken) await this.login();
    this.authToken = "expired-benchmark-session";
  }

  private async json(path: string, init: RequestInit = {}, authenticated = true): Promise<any> {
    if (authenticated && !this.authToken) await this.login();
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };
    if (authenticated) {
      headers["X-Auth-Token"] = this.authToken;
      headers["X-User-Id"] = this.userId;
    }
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/v1${path}`, { ...init, headers });
    const text = await response.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`RocketChat HTTP ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
    return body;
  }

  private async login(): Promise<void> {
    const body = await this.json("/login", { method: "POST", body: JSON.stringify({ user: this.config.username, password: this.config.password }) }, false);
    this.authToken = String(body?.data?.authToken ?? "");
    this.userId = String(body?.data?.userId ?? "");
    if (!this.authToken || !this.userId) throw new Error("RocketChat login did not return auth material");
  }

  private async room(targetName: string): Promise<string> {
    const cached = this.roomByTarget.get(targetName);
    if (cached) return cached;
    const users = await this.json("/users.list?count=200");
    const match = (users?.users ?? []).filter((user: any) => String(user?.name ?? "").trim().toLowerCase() === targetName.trim().toLowerCase());
    if (match.length !== 1) throw new Error(`RocketChat target is not unique: ${targetName}`);
    const username = String(match[0]?.username ?? "");
    if (!username) throw new Error(`RocketChat target has no username: ${targetName}`);
    const room = await this.json("/im.create", { method: "POST", body: JSON.stringify({ username }) });
    const rid = String(room?.room?.rid ?? "");
    if (!rid) throw new Error(`RocketChat IM room missing for: ${targetName}`);
    this.roomByTarget.set(targetName, rid);
    return rid;
  }

  async postMessage(targetName: string, text: string): Promise<void> {
    const roomId = await this.room(targetName);
    const result = await this.json("/chat.postMessage", { method: "POST", body: JSON.stringify({ roomId, text }) });
    if (result?.success !== true) throw new Error("RocketChat postMessage did not report success");
  }

  async countOwnMessages(targetName: string, text: string): Promise<number> {
    const roomId = await this.room(targetName);
    const result = await this.json(`/im.messages?roomId=${encodeURIComponent(roomId)}&count=100`);
    return (result?.messages ?? []).filter((message: any) => message?.msg === text && message?.u?._id === this.userId).length;
  }
}

const CAPABILITY = "benchmark.rocketchat.message.send";

function grant(companyId: string): AuthorityGrant {
  return {
    id: randomUUID(), companyId, principal: "benchmark-worker", actions: [CAPABILITY], scopes: ["benchmark.rocketchat"],
    validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
  };
}

function semantic(): SemanticCapabilityDescriptor {
  return {
    name: CAPABILITY,
    description: "Send one benchmark RocketChat direct message",
    risk: "medium",
    sideEffectClass: "external",
    credentialRequired: false,
    maxSensitivity: "internal",
    inputFormats: ["json"],
    outputFormats: ["json"],
  };
}

function provider(companyId: string): ProviderDescriptor {
  return {
    id: "tac-rocketchat",
    companyId,
    capabilities: [CAPABILITY],
    regions: ["local"],
    inputFormats: ["json"],
    outputFormats: ["json"],
    estimatedCost: 0,
    latencyP50Ms: 10,
    latencyP95Ms: 50,
    reliability: 1,
    quality: 1,
    privacyScore: 1,
    maxSensitivity: "internal",
    health: "healthy",
    metadata: { benchmark: "TheAgentCompany" },
  };
}

class LostAckRocketChatAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  calls = 0;
  sideEffects = 0;

  constructor(companyId: string, private readonly port: RocketChatPort) {
    this.descriptor = { companyId, providerId: "tac-rocketchat", capabilities: [CAPABILITY], credentialNames: [] };
  }

  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { targetName?: unknown; text?: unknown };
    if (typeof payload.targetName !== "string" || typeof payload.text !== "string") {
      throw new ProviderAdapterError("invalid RocketChat benchmark payload", false);
    }
    this.calls += 1;
    await this.port.postMessage(payload.targetName, payload.text);
    this.sideEffects += 1;
    if (this.calls === 1) throw new ProviderAdapterError("injected lost acknowledgement after RocketChat commit", true);
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["rocketchat:message"], cost: 0 };
  }
}

function makeRequest(companyId: string, input: { targetName: string; text: string }): CapabilityPlaneRequest {
  return {
    capabilityRequest: {
      companyId,
      principal: "benchmark-worker",
      action: CAPABILITY,
      scope: "benchmark.rocketchat",
      idempotencyKey: `tac-rocketchat-lost-ack:${input.targetName}:${input.text}`,
      payload: { targetName: input.targetName, text: input.text },
    },
    selection: {
      companyId,
      capability: CAPABILITY,
      region: "local",
      inputFormat: "json",
      outputFormat: "json",
      sensitivity: "internal",
      mode: "quality",
    },
    executionOwner: "tac-v4-runtime",
    allowFallback: false,
    maxAttempts: 1,
    staleAfterMs: 1_000,
  };
}

function createPlane(companyId: string, adapter: ProviderAdapter, runtime: InMemoryRuntimeStore): CapabilityPlane {
  const semantics = new SemanticCapabilityRegistry(); semantics.register(semantic());
  const adapters = new ProviderAdapterRegistry(); adapters.register(adapter);
  const providers = new ProviderRegistry(); providers.register(provider(companyId));
  return new CapabilityPlane(semantics, providers, adapters, new EnvironmentSecretResolver(), runtime);
}

export async function runRocketChatLostAckArm(
  mode: "direct" | "xanxitospa",
  input: { targetName: string; text: string },
  port: RocketChatPort,
): Promise<RocketChatArmResult> {
  const companyId = randomUUID();
  const adapter = new LostAckRocketChatAdapter(companyId, port);
  const request = makeRequest(companyId, input);
  const auditEvents: string[] = [];

  if (mode === "direct") {
    const context: ProviderAdapterExecutionContext = {
      companyId,
      providerId: "tac-rocketchat",
      capability: CAPABILITY,
      withCredential: async (_name, use) => use("unused"),
    };
    let completed = false;
    try {
      await adapter.execute(request.capabilityRequest, context);
    } catch (error) {
      auditEvents.push(`unknown-result:${error instanceof Error ? error.message : String(error)}`);
      const retry = await adapter.execute(request.capabilityRequest, context);
      completed = retry.ok;
    }
    const messageCount = await port.countOwnMessages(input.targetName, input.text);
    const duplicateSideEffects = Math.max(0, messageCount - 1);
    return {
      mode,
      completed,
      messageCount,
      sideEffects: adapter.sideEffects,
      duplicateSideEffects,
      recoverySuccess: false,
      reconciliationRequired: false,
      integrityPreserved: duplicateSideEffects === 0,
      safeHalt: false,
      auditEvents,
    };
  }

  const runtime = new InMemoryRuntimeStore();
  const plane = createPlane(companyId, adapter, runtime);
  const first = await plane.execute(request, {
    principal: "benchmark-worker",
    grants: [grant(companyId)],
    budgets: [],
  });
  auditEvents.push(first.reconciliationRequired ? "result:unknown-reconciliation-required" : "result:settled");
  const observed = await port.countOwnMessages(input.targetName, input.text);
  if (observed !== 1) throw new Error(`reconciliation probe expected exactly one committed message, observed=${observed}`);

  const journalKey = `capability:${CAPABILITY}:${request.capabilityRequest.idempotencyKey}`;
  const record = await runtime.getIdempotency(companyId, journalKey);
  if (!record) throw new Error("RocketChat lost-ACK journal record missing");
  const reconciled: CapabilityPlaneResult = {
    ...first,
    reconciliationRequired: false,
    result: {
      ok: true,
      sideEffectApplied: true,
      result: { reconciled: true, messageCount: observed },
      evidenceRefs: ["rocketchat:reconciliation-probe"],
      cost: 0,
    },
  };
  const settled = await runtime.markIdempotency(companyId, journalKey, "tac-v4-runtime", record.fencingToken, "reconciled", new Date(), reconciled);
  if (!settled) throw new Error("RocketChat reconciliation lost fencing");
  const replay = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  const messageCount = await port.countOwnMessages(input.targetName, input.text);
  const duplicateSideEffects = Math.max(0, messageCount - 1);
  auditEvents.push("reconciliation:verified-and-replayed-without-new-message");
  return {
    mode,
    completed: replay.result.ok,
    messageCount,
    sideEffects: adapter.sideEffects,
    duplicateSideEffects,
    recoverySuccess: replay.result.ok && messageCount === 1,
    reconciliationRequired: first.reconciliationRequired,
    integrityPreserved: duplicateSideEffects === 0 && messageCount === 1,
    safeHalt: false,
    auditEvents,
  };
}


class BasicRocketChatAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  sideEffects = 0;
  constructor(companyId: string, private readonly port: RocketChatPort) {
    this.descriptor = { companyId, providerId: "tac-rocketchat", capabilities: [CAPABILITY], credentialNames: [] };
  }
  async execute(request: CapabilityRequest, _context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    const payload = request.payload as { targetName?: unknown; text?: unknown };
    if (typeof payload.targetName !== "string" || typeof payload.text !== "string") throw new ProviderAdapterError("invalid RocketChat benchmark payload", false);
    try {
      await this.port.postMessage(payload.targetName, payload.text);
    } catch (error) {
      throw new ProviderAdapterError(error instanceof Error ? error.message : "RocketChat write failed", false);
    }
    this.sideEffects += 1;
    return { ok: true, sideEffectApplied: true, result: { accepted: true }, evidenceRefs: ["rocketchat:message"], cost: 0 };
  }
}

export async function runRocketChatControlArm(
  mode: "direct" | "xanxitospa",
  input: { targetName: string; text: string },
  port: RocketChatPort,
): Promise<RocketChatArmResult> {
  const companyId = randomUUID();
  const adapter = new BasicRocketChatAdapter(companyId, port);
  const request = makeRequest(companyId, input);
  if (mode === "direct") {
    await port.postMessage(input.targetName, input.text);
    const messageCount = await port.countOwnMessages(input.targetName, input.text);
    return { mode, completed: true, messageCount, sideEffects: 1, duplicateSideEffects: Math.max(0, messageCount - 1), recoverySuccess: false, reconciliationRequired: false, integrityPreserved: messageCount === 1, safeHalt: false, auditEvents: ["control:direct"] };
  }
  const plane = createPlane(companyId, adapter, new InMemoryRuntimeStore());
  const result = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
  const messageCount = await port.countOwnMessages(input.targetName, input.text);
  return { mode, completed: result.result.ok, messageCount, sideEffects: adapter.sideEffects, duplicateSideEffects: Math.max(0, messageCount - 1), recoverySuccess: false, reconciliationRequired: result.reconciliationRequired, integrityPreserved: result.result.ok && messageCount === 1, safeHalt: false, auditEvents: ["control:xspa"] };
}

export async function runRocketChatAuthExpiryArm(
  mode: "direct" | "xanxitospa",
  input: { targetName: string; text: string },
  port: RocketChatSessionPort,
): Promise<RocketChatArmResult> {
  await port.primeSession();
  await port.expireSession();
  const auditEvents: string[] = [];
  let completed = false;
  let sideEffects = 0;
  if (mode === "direct") {
    try {
      await port.postMessage(input.targetName, input.text);
      sideEffects = 1;
      completed = true;
    } catch (error) {
      auditEvents.push(`auth-failure:${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    const companyId = randomUUID();
    const adapter = new BasicRocketChatAdapter(companyId, port);
    const request = makeRequest(companyId, input);
    const plane = createPlane(companyId, adapter, new InMemoryRuntimeStore());
    const result = await plane.execute(request, { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] });
    completed = result.result.ok;
    sideEffects = adapter.sideEffects;
    auditEvents.push(result.result.ok ? "unexpected-success" : "capability-failed-safe");
  }
  await port.primeSession();
  const messageCount = await port.countOwnMessages(input.targetName, input.text);
  return { mode, completed, messageCount, sideEffects, duplicateSideEffects: Math.max(0, messageCount - 1), recoverySuccess: false, reconciliationRequired: false, integrityPreserved: messageCount === 0 && sideEffects === 0, safeHalt: !completed && sideEffects === 0, auditEvents };
}

export async function runRocketChatConcurrentDuplicateArm(
  mode: "direct" | "xanxitospa",
  input: { targetName: string; text: string },
  port: RocketChatPort,
): Promise<RocketChatArmResult> {
  const auditEvents: string[] = [];
  if (mode === "direct") {
    await Promise.all([port.postMessage(input.targetName, input.text), port.postMessage(input.targetName, input.text)]);
    const messageCount = await port.countOwnMessages(input.targetName, input.text);
    const duplicateSideEffects = Math.max(0, messageCount - 1);
    return { mode, completed: true, messageCount, sideEffects: 2, duplicateSideEffects, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: duplicateSideEffects === 0, safeHalt: false, auditEvents: ["concurrent:unfenced"] };
  }
  const companyId = randomUUID();
  const adapter = new BasicRocketChatAdapter(companyId, port);
  const request = makeRequest(companyId, input);
  const runtime = new InMemoryRuntimeStore();
  const plane = createPlane(companyId, adapter, runtime);
  const guard = { principal: "benchmark-worker", grants: [grant(companyId)], budgets: [] };
  const outcomes = await Promise.allSettled([plane.execute(request, guard), plane.execute(request, guard)]);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") auditEvents.push(`contended:${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
    else auditEvents.push("replay-or-owner:fulfilled");
  }
  const messageCount = await port.countOwnMessages(input.targetName, input.text);
  const duplicateSideEffects = Math.max(0, messageCount - 1);
  return { mode, completed: outcomes.some((outcome) => outcome.status === "fulfilled" && outcome.value.result.ok), messageCount, sideEffects: adapter.sideEffects, duplicateSideEffects, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: messageCount === 1 && duplicateSideEffects === 0, safeHalt: false, auditEvents };
}
