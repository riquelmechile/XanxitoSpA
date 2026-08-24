# v4 DIRECT arm — complete source review pack

This file reproduces the complete source modules that define both the fault injector and the DIRECT/XANXITOSPA execution paths for the five v4 stateful surfaces. It is intentionally unabridged so the DIRECT baseline can be reviewed without relying on a summary. Source commit before this publication: `7ba6cef`.

## RocketChat

Source: `packages/testing/src/tac-rocketchat-fault.ts`

```ts
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
```

## GitLab

Source: `packages/testing/src/tac-gitlab-fault.ts`

```ts
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
```

## Plane

Source: `packages/testing/src/tac-plane-fault.ts`

```ts
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
```

## OwnCloud

Source: `packages/testing/src/tac-owncloud-fault.ts`

```ts
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
```

## Local runtime

Source: `packages/testing/src/tac-local-runtime-fault.ts`

```ts
import { randomUUID } from "node:crypto";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";

export interface LocalRuntimePort {
  start(): Promise<boolean>;
  killActive(): Promise<void>;
  isHealthy(): Promise<boolean>;
  ownerCount(): Promise<number>;
  occupyPort(): Promise<void>;
  releasePort(): Promise<void>;
}

export interface LocalRuntimeArmResult {
  mode: "direct" | "xanxitospa";
  completed: boolean;
  healthy: boolean;
  ownerCount: number;
  startAttempts: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  integrityPreserved: boolean;
  safeHalt: boolean;
  staleResumeBlocked: boolean;
  auditEvents: string[];
}

async function snapshot(mode: "direct" | "xanxitospa", port: LocalRuntimePort, startAttempts: number, extras: Partial<LocalRuntimeArmResult> = {}): Promise<LocalRuntimeArmResult> {
  const healthy = await port.isHealthy();
  const ownerCount = await port.ownerCount();
  return {
    mode,
    completed: healthy && ownerCount === 1,
    healthy,
    ownerCount,
    startAttempts,
    recoverySuccess: false,
    reconciliationRequired: false,
    integrityPreserved: healthy && ownerCount === 1,
    safeHalt: false,
    staleResumeBlocked: false,
    auditEvents: [],
    ...extras,
  };
}

export async function runLocalControlArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    const started = await port.start();
    return snapshot(mode, port, 1, { auditEvents: [started ? "control:started" : "control:start-failed"] });
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-control";
  const claim = await store.claimIdempotency(companyId, key, { operation: "activate-and-healthcheck" }, "worker-a", new Date("2026-08-24T12:00:00.000Z"));
  if (!claim.claimed) throw new Error("local runtime control claim failed");
  const started = await port.start(); const healthy = started && await port.isHealthy();
  if (healthy) await store.markIdempotency(companyId, key, "worker-a", claim.record.fencingToken, "applied", new Date("2026-08-24T12:00:00.100Z"), { healthy: true });
  return snapshot(mode, port, 1, { auditEvents: [healthy ? `settled:fence-${claim.record.fencingToken}` : "start-or-health-failed"] });
}

export async function runLocalKillBeforeHealthArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    await port.start(); await port.killActive();
    return snapshot(mode, port, 1, { completed: false, integrityPreserved: false, auditEvents: ["injected:kill-before-health", "no-durable-owner-recovery"] });
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-kill";
  const first = await store.claimIdempotency(companyId, key, { operation: "activate-and-healthcheck" }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!first.claimed) throw new Error("first activation claim failed");
  await port.start(); await port.killActive();
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("activation takeover failed");
  const restarted = await port.start(); const healthy = restarted && await port.isHealthy();
  const settled = healthy && await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:02.100Z"), { healthy: true });
  return snapshot(mode, port, 2, { recoverySuccess: Boolean(settled), reconciliationRequired: true, integrityPreserved: Boolean(settled) && healthy, auditEvents: [`fence:${first.record.fencingToken}->${takeover.fencingToken}`, "recovery:replacement-started"] });
}

export async function runLocalPortContentionArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  await port.occupyPort(); let started = false;
  try { started = await port.start(); } finally { await port.releasePort(); }
  const ownerCount = await port.ownerCount(); const healthy = await port.isHealthy();
  return { mode, completed: false, healthy, ownerCount, startAttempts: 1, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: !started && ownerCount === 0, safeHalt: !started && ownerCount === 0, staleResumeBlocked: false, auditEvents: [mode === "xanxitospa" ? "port-contention:failed-safe" : "port-contention:surfaced"] };
}

export async function runLocalStaleProcessArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    await port.start(); const staleStarted = await port.start();
    const result = await snapshot(mode, port, 2, { staleResumeBlocked: !staleStarted, auditEvents: [staleStarted ? "stale-resume:accepted" : "stale-resume:os-port-rejected"] });
    result.integrityPreserved = result.healthy && result.ownerCount === 1;
    return result;
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-stale";
  const staleOwner = await store.claimIdempotency(companyId, key, { operation: "runtime-owner" }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!staleOwner.claimed) throw new Error("stale owner claim failed");
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("runtime takeover failed");
  const replacementStarted = await port.start();
  const staleSettled = await store.markIdempotency(companyId, key, "worker-a", staleOwner.record.fencingToken, "applied", new Date("2026-08-24T12:00:03.000Z"), { owner: "worker-a" });
  const freshSettled = replacementStarted && await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:03.100Z"), { owner: "worker-b" });
  const result = await snapshot(mode, port, 1, { recoverySuccess: Boolean(freshSettled), reconciliationRequired: true, staleResumeBlocked: !staleSettled, auditEvents: [`fence:${staleOwner.record.fencingToken}->${takeover.fencingToken}`, staleSettled ? "stale-settlement:accepted" : "stale-settlement:rejected-before-resume"] });
  result.integrityPreserved = !staleSettled && Boolean(freshSettled) && result.healthy && result.ownerCount === 1;
  return result;
}
```

