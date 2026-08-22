import { runProductionBackedCase as runCase } from "./production-evidence.js";
import { randomUUID } from "node:crypto";
import type { AuthorityGrant, BootstrapRequirement, BudgetEnvelope, BusinessEvent, BusinessOutcome, CapabilityRequest, CompanyAsset, CorporateGene, MissionGraph, PreflightPlan, ProviderDescriptor, ScheduledJob, Work } from "../../contracts/src/index.js";
import { InMemoryCompanyStore, InMemoryRuntimeStore } from "../../database/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import {
  applyVerifiedOutcomeToGene,
  authorizeRequest,
  canPromoteAutonomy,
  CapabilityRegistry,
  executeCapabilityRequest,
  executeMissionGraph,
  FakeCapability,
  HeartbeatEngine,
  makeNode,
  paretoFront,
  planCompanyBootstrap,
  preserveNegativeResult,
  runCompete,
  settle,
  validatePreflight,
} from "../../kernel/src/index.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { runCapabilityPlaneGym } from "./capability-gym.js";
import { runMcpBridgeGym } from "./mcp-gym.js";
import { runCreativePipelineGym } from "./creative-gym.js";
import { runKastRuntimeGym } from "./kast-runtime-gym.js";
import { runKastLawGym } from "./kast-law-gym.js";

export interface GymCaseResult { name: string; ok: boolean; detail: string }
export interface GymResult { ok: boolean; passed: number; failed: number; cases: GymCaseResult[] }

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseGrant(companyId: string, principal = "worker-a"): AuthorityGrant {
  return { id: randomUUID(), companyId, principal, actions: ["demo.write"], scopes: ["demo"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" };
}
function baseBudget(companyId: string): BudgetEnvelope {
  return { id: randomUUID(), companyId, department: "commercial", currency: "CLP", periodCap: 100_000, spent: 0, perTransactionCap: 50_000, allowedCategories: ["ads"], blockedCategories: ["gambling"], allowedProviders: ["fake"], approvedBeneficiaries: ["approved"] };
}
function baseRequest(companyId: string, amount = 0): CapabilityRequest {
  return { companyId, principal: "worker-a", action: "demo.write", scope: "demo", idempotencyKey: randomUUID(), payload: { value: 1 }, ...(amount > 0 ? { category: "ads", provider: "fake", beneficiary: "approved", amount, currency: "CLP" } : {}) };
}
function baseGene(companyId: string, id = "gene-a", dimensions: Record<string, number> = { value: 0.5 }, cost = 10): CorporateGene {
  return { id, companyId, type: "strategy", version: 1, parents: [], contextSignature: "demo", artifactRef: `skill:${id}`, status: "candidate", fitness: { sampleSize: 0, confidence: 0, dimensions, cost, riskIncidents: 0 }, negativeResultRefs: [], experienceRefs: [] };
}


export async function runCompanyGym(): Promise<GymResult> {
  const cases: GymCaseResult[] = [];

  cases.push(await runCase("idle heartbeat invokes zero model work", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    let modelCalls = 0;
    const engine = new HeartbeatEngine(
      store,
      { eventTypes: ["sales.material"], minimumJobMateriality: "medium" },
      async () => { modelCalls += 1; },
    );
    const result = await engine.tick(companyId, "daemon-idle", new Date("2026-08-21T19:00:00Z"));
    expect(result.state === "sleep" && result.wakeInvoked === false, "idle heartbeat did not stay asleep");
    expect(modelCalls === 0, "idle heartbeat invoked model work");
  }));

  cases.push(await runCase("fan-out executes independent nodes then joins", async () => {
    const graph: MissionGraph = { id: randomUUID(), companyId: "c1", revision: 1, nodes: [makeNode("a", "work", "commercial", "A"), makeNode("b", "work", "finance", "B"), makeNode("join", "join", "executive", "join", ["a", "b"])] };
    const context = { companyId: "c1", principal: "executive", grants: [], budgets: [], capabilities: new CapabilityRegistry(), outputs: new Map<string, unknown>() };
    const output = await executeMissionGraph(graph, context, { work: async (node) => node.id.toUpperCase(), join: async (_node, ctx) => `${ctx.outputs.get("a")}${ctx.outputs.get("b")}` });
    expect(output.get("join") === "AB", "join did not receive fan-out results");
  }));

  cases.push(await runCase("COMPETE is blind and owner adjudicates", async () => {
    const seen: string[] = [];
    const result = await runCompete({
      evidenceSnapshotRef: "evidence:1", evidenceSnapshot: { market: 10 }, owner: "commercial-supervisor",
      strategies: [
        { id: "a", overlay: "margin-first", run: async (evidence) => { seen.push(JSON.stringify(evidence)); return { output: { score: 8 }, evidenceRefs: ["e:a"], cost: 2 }; } },
        { id: "b", overlay: "growth-first", run: async (evidence) => { seen.push(JSON.stringify(evidence)); return { output: { score: 9 }, evidenceRefs: ["e:b"], cost: 3 }; } },
      ],
      crossCritic: async (self, opponent) => `${self.id}-challenges-${opponent.id}`,
      adjudicator: async ({ candidates, owner }) => ({ winnerId: candidates[1]?.id ?? "b", decisionOwner: owner, rationale: "higher bounded score" }),
    });
    expect(result.candidates.length === 2, "expected two candidates");
    expect(result.critiqueRounds === 1, "critique must be bounded to one round in COMPETE default");
    expect(result.decision.decisionOwner === "commercial-supervisor", "owner lost adjudication");
    expect(seen[0] === seen[1], "candidates did not receive same evidence snapshot");
  }));

  cases.push(await runCase("collaboration stays structured", async () => {
    const graph: MissionGraph = { id: randomUUID(), companyId: "c1", revision: 1, nodes: [makeNode("commercial", "work", "commercial", "demand"), makeNode("operations", "work", "operations", "capacity"), makeNode("joint", "collaborate", "commercial", "joint", ["commercial", "operations"])] };
    const ctx = { companyId: "c1", principal: "executive", grants: [], budgets: [], capabilities: new CapabilityRegistry(), outputs: new Map<string, unknown>() };
    const output = await executeMissionGraph(graph, ctx, { work: async (n) => ({ source: n.id }), collaborate: async (_n, c) => ({ demand: c.outputs.get("commercial"), capacity: c.outputs.get("operations") }) });
    expect(typeof output.get("joint") === "object", "joint result missing");
  }));

  cases.push(await runCase("debate contract is max two rounds", () => {
    const input = { companyId: "c1", goal: "x", trigger: "manual", requestingPrincipal: "founder", lifecycleMode: "operate" as const, currentStateRef: "state:1", availableAuthorityRef: "auth:1", budgetRef: "budget:1" };
    const plan: PreflightPlan = { objective: "decide", materiality: "medium", risk: "medium", owner: "executive", route: "debate", debateRounds: 2, departments: ["commercial", "finance"], workUnits: ["debate"], dependencies: [], parallelGroups: [], requiredSkills: [], requiredCapabilities: [], authorityChecks: [], budgetLimits: {}, evidenceRequired: [], successConditions: ["decision"], rollback: null, terminalCondition: "owner decision", escalationCondition: null, rationaleSummary: "bounded debate" };
    const checked = validatePreflight(input, plan, { grants: [], budgets: [] });
    expect(checked.route === "debate" && checked.debateRounds === 2, "two-round debate contract was rejected");
    let rejected = false;
    try { validatePreflight(input, { ...plan, debateRounds: 3 }, { grants: [], budgets: [] }); }
    catch (error) { rejected = error instanceof DomainError && error.message.includes("debate rounds"); }
    expect(rejected, "production preflight accepted debate beyond two rounds");
  }));

  cases.push(await runCase("action without grant is denied before side effect", async () => {
    const registry = new CapabilityRegistry();
    const fake = new FakeCapability("demo", () => ({ ok: true, sideEffectApplied: true, result: {}, evidenceRefs: [], cost: 0 }));
    registry.register(fake);
    let denied = false;
    try { await executeCapabilityRequest(baseRequest("c1"), "demo", { companyId: "c1", principal: "worker-a", grants: [], budgets: [], capabilities: registry, outputs: new Map() }); }
    catch (error) { denied = error instanceof DomainError && error.message.startsWith("DENY:"); }
    expect(denied, "request was not denied");
    expect(fake.calls.length === 0, "side effect ran before authority check");
  }));

  cases.push(await runCase("budget envelope allows inside and escalates outside", () => {
    const companyId = "c1"; const grant = baseGrant(companyId); const budget = baseBudget(companyId);
    expect(authorizeRequest(baseRequest(companyId, 20_000), { grants: [grant], budgets: [budget], now: new Date("2026-08-21T12:00:00Z") }).budget?.id === budget.id, "inside budget denied");
    let escalated = false;
    try { authorizeRequest(baseRequest(companyId, 60_000), { grants: [grant], budgets: [budget], now: new Date("2026-08-21T12:00:00Z") }); }
    catch (error) { escalated = error instanceof DomainError && error.message.startsWith("ESCALATE:"); }
    expect(escalated, "outside budget did not escalate");
  }));

  cases.push(await runCase("provider fallback can switch without duplicate first effect", async () => {
    const companyId = "c1"; const grant = baseGrant(companyId); const registry = new CapabilityRegistry();
    const primary = new FakeCapability("primary", () => ({ ok: false, sideEffectApplied: false, result: "down", evidenceRefs: ["p:down"], cost: 0 }));
    const fallback = new FakeCapability("fallback", () => ({ ok: true, sideEffectApplied: true, result: "ok", evidenceRefs: ["f:ok"], cost: 1 }));
    registry.register(primary); registry.register(fallback);
    const request = baseRequest(companyId);
    const ctx = { companyId, principal: "worker-a", grants: [grant], budgets: [], capabilities: registry, outputs: new Map<string, unknown>() };
    const first = await executeCapabilityRequest(request, "primary", ctx);
    const second = first.ok ? first : await executeCapabilityRequest({ ...request, idempotencyKey: `${request.idempotencyKey}:fallback` }, "fallback", ctx);
    expect(second.ok && primary.calls.length === 1 && fallback.calls.length === 1, "fallback behavior invalid");
  }));

  cases.push(await runCase("idempotency prevents repeated external effect", async () => {
    const companyId = "c1"; const grant = baseGrant(companyId); let effects = 0;
    const registry = new CapabilityRegistry(); const fake = new FakeCapability("demo", () => { effects += 1; return { ok: true, sideEffectApplied: true, result: effects, evidenceRefs: ["effect:1"], cost: 1 }; }); registry.register(fake);
    const request = baseRequest(companyId); const ctx = { companyId, principal: "worker-a", grants: [grant], budgets: [], capabilities: registry, outputs: new Map<string, unknown>() };
    await executeCapabilityRequest(request, "demo", ctx); await executeCapabilityRequest(request, "demo", ctx);
    expect(effects === 1, "idempotency journal surrogate repeated effect");
  }));

  cases.push(await runCase("concurrent budget requests cannot overspend", async () => {
    const companyId = "c1"; const grant = baseGrant(companyId); const budget = baseBudget(companyId); budget.periodCap = 60_000;
    const registry = new CapabilityRegistry();
    const fake = new FakeCapability("demo", async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return { ok: true, sideEffectApplied: true, result: "ok", evidenceRefs: ["effect"], cost: 1 }; }); registry.register(fake);
    const ctx = { companyId, principal: "worker-a", grants: [grant], budgets: [budget], capabilities: registry, outputs: new Map<string, unknown>() };
    const results = await Promise.allSettled([executeCapabilityRequest(baseRequest(companyId, 40_000), "demo", ctx), executeCapabilityRequest(baseRequest(companyId, 40_000), "demo", ctx)]);
    expect(results.filter((r) => r.status === "fulfilled").length === 1, "both concurrent spends were allowed");
    expect(budget.spent === 40_000, "budget reservation accounting is incorrect");
  }));

  cases.push(await runCase("concurrent duplicate idempotency key executes once", async () => {
    const companyId = "c1"; const grant = baseGrant(companyId); let effects = 0;
    const registry = new CapabilityRegistry(); const fake = new FakeCapability("demo", async () => { effects += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { ok: true, sideEffectApplied: true, result: effects, evidenceRefs: ["effect"], cost: 1 }; }); registry.register(fake);
    const request = baseRequest(companyId); const ctx = { companyId, principal: "worker-a", grants: [grant], budgets: [], capabilities: registry, outputs: new Map<string, unknown>() };
    await Promise.all([executeCapabilityRequest(request, "demo", ctx), executeCapabilityRequest(request, "demo", ctx)]);
    expect(effects === 1 && fake.calls.length === 1, "concurrent duplicate caused repeated effect");
  }));

  cases.push(await runCase("invalid grant timestamps fail closed", () => {
    const companyId = "c1"; const grant = { ...baseGrant(companyId), validFrom: "not-a-date" };
    let denied = false;
    try { authorizeRequest(baseRequest(companyId), { grants: [grant], budgets: [], now: new Date("2026-08-21T12:00:00Z") }); }
    catch (error) { denied = error instanceof DomainError && error.message.startsWith("DENY:"); }
    expect(denied, "invalid grant timestamp did not fail closed");
  }));

  cases.push(await runCase("preflight fails closed when declared authority is unavailable", () => {
    const plan: PreflightPlan = { objective: "act", materiality: "medium", risk: "low", owner: "commercial", route: "direct", departments: ["commercial"], workUnits: ["act"], dependencies: [], parallelGroups: [], requiredSkills: [], requiredCapabilities: [], authorityChecks: ["pricing.write"], budgetLimits: {}, evidenceRequired: [], successConditions: ["done"], rollback: null, terminalCondition: "done", escalationCondition: null, rationaleSummary: "requires grant" };
    let denied = false;
    try { validatePreflight({ companyId: "c1", goal: "x", trigger: "manual", requestingPrincipal: "founder", lifecycleMode: "operate", currentStateRef: "s", availableAuthorityRef: "none", budgetRef: "none" }, plan, { grants: [], budgets: [] }); }
    catch (error) { denied = error instanceof DomainError; }
    expect(denied, "preflight accepted unavailable authority");
  }));

  cases.push(await runCase("guard denial emits structured event when recorder is configured", async () => {
    const companyId = "c1"; const registry = new CapabilityRegistry(); const fake = new FakeCapability("demo", () => ({ ok: true, sideEffectApplied: true, result: {}, evidenceRefs: [], cost: 0 })); registry.register(fake);
    const events: unknown[] = []; let denied = false;
    try { await executeCapabilityRequest(baseRequest(companyId), "demo", { companyId, principal: "worker-a", grants: [], budgets: [], capabilities: registry, outputs: new Map(), recordEvent: async (event) => { events.push(event); } }); }
    catch (error) { denied = error instanceof DomainError; }
    expect(denied && events.length === 1 && (events[0] as { type: string }).type === "authority.denied", "guard event was not recorded");
  }));

  cases.push(await runCase("tenant isolation in store", async () => {
    const store = new InMemoryCompanyStore();
    await store.saveGene(baseGene("company-a", "a")); await store.saveGene(baseGene("company-b", "b"));
    const genes = await store.listGenes("company-a");
    expect(genes.length === 1 && genes[0]?.companyId === "company-a", "cross-company gene leak");
  }));

  cases.push(await runCase("learning ignores unverified outcome", () => {
    const gene = baseGene("c1");
    const outcome: BusinessOutcome = { id: randomUUID(), companyId: "c1", workId: randomUUID(), verified: false, dimensions: { value: 1 }, evidenceRefs: [], cost: 1, riskIncidents: [], occurredAt: new Date().toISOString() };
    const updated = applyVerifiedOutcomeToGene(gene, outcome, { minSamplesForChampion: 2 });
    expect(updated.fitness.sampleSize === 0 && updated.status === "candidate", "unverified outcome changed gene");
  }));

  cases.push(await runCase("negative result is preserved and gene becomes silent", () => {
    const updated = preserveNegativeResult(baseGene("c1"), "outcome:failed-discount");
    expect(updated.status === "silent" && updated.negativeResultRefs.includes("outcome:failed-discount"), "negative result not preserved");
  }));

  cases.push(await runCase("Pareto removes dominated gene", () => {
    const a = baseGene("c1", "a", { quality: 0.9 }, 5); a.fitness.sampleSize = 3; a.fitness.confidence = 0.8; a.status = "challenger";
    const b = baseGene("c1", "b", { quality: 0.7 }, 10); b.fitness.sampleSize = 3; b.fitness.confidence = 0.8; b.status = "challenger";
    const front = paretoFront([a, b], ["quality"]);
    expect(front.some((g) => g.id === "a") && !front.some((g) => g.id === "b"), "dominated gene survived Pareto front");
  }));

  cases.push(await runCase("autonomy promotion needs evidence and zero incidents", () => {
    expect(canPromoteAutonomy({ currentLevel: 3, verifiedOutcomes: 10, incidents: 0, requiredOutcomes: 10 }), "eligible process did not promote");
    expect(!canPromoteAutonomy({ currentLevel: 3, verifiedOutcomes: 10, incidents: 1, requiredOutcomes: 10 }), "incident did not block promotion");
  }));

  cases.push(await runCase("settlement creates linked verified outcome and receipt", () => {
    const work: Work = { id: randomUUID(), companyId: "c1", owner: "commercial", objective: "test", scope: "demo", createdAt: new Date().toISOString() };
    const { outcome, receipt } = settle({ work, actor: "worker-a", authorityRefs: ["grant:1"], budgetRefs: [], verified: true, dimensions: { quality: 1 }, evidenceRefs: ["e:1"], cost: 3 });
    expect(receipt.outcomeId === outcome.id && outcome.verified, "settlement linkage invalid");
  }));


  cases.push(await runCase("heartbeat sleeps without material signal and never wakes", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    let wakes = 0;
    const engine = new HeartbeatEngine(store, { eventTypes: ["sales.material"], minimumJobMateriality: "medium" }, async () => { wakes += 1; });
    const now = new Date("2026-08-21T20:00:00Z");
    const event: BusinessEvent = { id: randomUUID(), companyId, type: "telemetry.noise", occurredAt: now.toISOString(), actorPrincipal: "system", correlationId: randomUUID(), idempotencyKey: "noise:1", payload: { materiality: "low" }, sensitivity: "internal", evidenceRefs: [] };
    await store.appendEvent(event);
    const result = await engine.tick(companyId, "daemon-a", now);
    expect(result.state === "sleep" && !result.wakeInvoked && wakes === 0, "non-material heartbeat invoked wake callback");
  }));

  cases.push(await runCase("material heartbeat wakes once and advances cursor", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    let wakes = 0;
    const startedAt = new Date("2026-08-21T20:00:00Z");
    let clock = startedAt;
    const engine = new HeartbeatEngine(store, { eventTypes: ["sales.material"], minimumJobMateriality: "medium" }, async ({ events }) => { wakes += 1; expect(events.length === 1, "material event missing from wake"); }, { clock: () => clock });
    await store.appendEvent({ id: randomUUID(), companyId, type: "sales.material", occurredAt: startedAt.toISOString(), actorPrincipal: "commerce", correlationId: randomUUID(), idempotencyKey: "sales:1", payload: {}, sensitivity: "internal", evidenceRefs: ["sale:1"] });
    const first = await engine.tick(companyId, "daemon-a", startedAt);
    clock = new Date(startedAt.getTime() + 1);
    const second = await engine.tick(companyId, "daemon-a", clock);
    expect(first.state === "wake" && first.wakeInvoked && wakes === 1, "material signal did not wake exactly once");
    expect(second.state === "sleep" && wakes === 1, "cursor did not prevent repeated wake");
  }));

  cases.push(await runCase("stale heartbeat lease cannot advance cursor", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const startedAt = new Date("2026-08-21T20:00:00Z");
    let clock = startedAt;
    let takeover = false;
    const engine = new HeartbeatEngine(
      store,
      { eventTypes: ["sales.material"], minimumJobMateriality: "medium" },
      async () => {
        clock = new Date(startedAt.getTime() + 20);
        takeover = Boolean(await store.claimHeartbeatLease(companyId, "daemon-b", clock, 1_000));
      },
      { leaseMs: 10, clock: () => clock },
    );
    const event: BusinessEvent = { id: randomUUID(), companyId, type: "sales.material", occurredAt: startedAt.toISOString(), actorPrincipal: "commerce", correlationId: randomUUID(), idempotencyKey: "stale-heartbeat:1", payload: {}, sensitivity: "internal", evidenceRefs: [] };
    await store.appendEvent(event);
    let fenced = false;
    try { await engine.tick(companyId, "daemon-a", startedAt); }
    catch (error) { fenced = error instanceof DomainError && error.message.includes("stale heartbeat lease"); }
    const cursor = await store.getHeartbeatCursor(companyId, clock);
    expect(takeover && fenced, "stale heartbeat holder was not fenced after takeover");
    expect(cursor.lastEventId === undefined, "stale heartbeat holder advanced cursor");
  }));

  cases.push(await runCase("heartbeat lease fences concurrent daemon", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const now = new Date("2026-08-21T20:00:00Z");
    const first = await store.claimHeartbeatLease(companyId, "daemon-a", now, 30_000);
    const sameOwner = await store.claimHeartbeatLease(companyId, "daemon-a", now, 30_000);
    const second = await store.claimHeartbeatLease(companyId, "daemon-b", now, 30_000);
    expect(Boolean(first) && sameOwner === null && second === null, "concurrent heartbeat tick bypassed active lease");
  }));

  cases.push(await runCase("stale job fencing token cannot settle newer lease", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const base = new Date("2026-08-21T20:00:00Z");
    const job: ScheduledJob = { id: randomUUID(), companyId, kind: "demo", payload: {}, materiality: "high", dueAt: base.toISOString(), state: "pending", attempts: 0, maxAttempts: 3, fencingToken: 0, createdAt: base.toISOString(), updatedAt: base.toISOString() };
    await store.enqueueJob(job);
    const lease1 = await store.claimJob(companyId, job.id, "worker-a", base, 1_000);
    expect(Boolean(lease1), "first lease missing");
    const lease2 = await store.claimJob(companyId, job.id, "worker-b", new Date(base.getTime() + 2_000), 1_000);
    expect(Boolean(lease2) && (lease2?.fencingToken ?? 0) > (lease1?.fencingToken ?? 0), "lease did not advance fencing token");
    expect(!(await store.settleJob(lease1!, "completed", new Date(base.getTime() + 2_001))), "stale lease settled job");
    expect(await store.settleJob(lease2!, "completed", new Date(base.getTime() + 2_001)), "current lease could not settle job");
  }));

  cases.push(await runCase("durable idempotency state machine claims once", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const now = new Date();
    const [a, b] = await Promise.all([
      store.claimIdempotency(companyId, "effect:1", { action: "send" }, "worker-a", now),
      store.claimIdempotency(companyId, "effect:1", { action: "send" }, "worker-b", now),
    ]);
    expect([a.claimed, b.claimed].filter(Boolean).length === 1, "idempotency key was claimed more than once");
    const winner = a.claimed ? a : b;
    expect(await store.markIdempotency(companyId, "effect:1", winner.record.owner!, winner.record.fencingToken, "applied", now, { ok: true }), "owner could not settle idempotency record");
    const record = await store.getIdempotency(companyId, "effect:1");
    expect(record?.state === "applied", "idempotency record did not persist applied state");
  }));

  cases.push(await runCase("orphaned idempotency intent moves to reconciliation owner", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const startedAt = new Date("2026-08-21T20:00:00Z");
    const claim = await store.claimIdempotency(companyId, "effect:orphan", { action: "send" }, "worker-a", startedAt);
    expect(claim.claimed, "initial idempotency claim missing");
    const resolverAt = new Date(startedAt.getTime() + 1_000);
    const recovery = await store.claimStaleIdempotencyForReconciliation(companyId, "effect:orphan", "reconciler", resolverAt, 500);
    expect(recovery?.state === "unknown" && recovery.owner === "reconciler" && recovery.fencingToken > claim.record.fencingToken, "stale intent was not fenced into unknown reconciliation state");
    expect(!(await store.markIdempotency(companyId, "effect:orphan", "worker-a", claim.record.fencingToken, "applied", resolverAt, { bad: true })), "original owner settled after reconciliation takeover");
    expect(await store.markIdempotency(companyId, "effect:orphan", "reconciler", recovery!.fencingToken, "reconciled", resolverAt, { observed: "not-applied" }), "reconciler could not settle orphaned intent");
  }));

  cases.push(await runCase("provider routing applies hard filters before scoring", () => {
    const companyId = randomUUID();
    const registry = new ProviderRegistry();
    const providers: ProviderDescriptor[] = [
      { id: "cheap-public", companyId, capabilities: ["image.generate"], regions: ["CL"], inputFormats: ["text"], outputFormats: ["png"], estimatedCost: 1, latencyP50Ms: 100, latencyP95Ms: 200, reliability: 0.95, quality: 0.8, privacyScore: 0.5, maxSensitivity: "public", health: "healthy", metadata: {} },
      { id: "private-premium", companyId, capabilities: ["image.generate"], regions: ["CL"], inputFormats: ["text"], outputFormats: ["png"], estimatedCost: 3, latencyP50Ms: 120, latencyP95Ms: 250, reliability: 0.99, quality: 0.95, privacyScore: 0.95, maxSensitivity: "restricted", credentialsRef: "secret://image", health: "healthy", metadata: {} },
      { id: "wrong-region", companyId, capabilities: ["image.generate"], regions: ["US"], inputFormats: ["text"], outputFormats: ["png"], estimatedCost: 0.1, latencyP50Ms: 10, latencyP95Ms: 20, reliability: 1, quality: 1, privacyScore: 1, maxSensitivity: "restricted", health: "healthy", metadata: {} },
    ];
    for (const provider of providers) registry.register(provider);
    const selected = registry.route({ companyId, capability: "image.generate", region: "CL", inputFormat: "text", outputFormat: "png", maxCost: 5, minQuality: 0.7, minReliability: 0.9, minPrivacyScore: 0.9, sensitivity: "restricted", requireCredentials: true, mode: "cost" });
    expect(selected.providerId === "private-premium", "hard filters allowed cheaper ineligible provider");
    expect(!selected.eligibleProviderIds.includes("wrong-region") && !selected.eligibleProviderIds.includes("cheap-public"), "ineligible provider survived hard filters");
  }));

  cases.push(await runCase("asset ownership remains with Company", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const now = new Date().toISOString();
    const asset: CompanyAsset = { id: randomUUID(), companyId, kind: "email-account", providerId: "workspace", capability: "email.send", department: "commercial", cost: 10, currency: "USD", status: "active", credentialsRef: "secret://gmail", grantRefs: ["grant:commercial"], restrictions: [], metadata: { address: "sales@example.test" }, createdAt: now, updatedAt: now };
    await store.saveAsset(asset);
    const assets = await store.listAssets(companyId);
    expect(assets.length === 1 && assets[0]?.companyId === companyId && !("workerId" in (assets[0]?.metadata ?? {})), "asset ownership leaked to worker identity");
  }));

  cases.push(await runCase("bootstrap never reuses another Company asset", () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const now = new Date().toISOString();
    const foreign: CompanyAsset = { id: randomUUID(), companyId: otherCompanyId, kind: "database", capability: "data.query", department: "operations", cost: 0, currency: "USD", status: "active", grantRefs: [], restrictions: [], metadata: {}, createdAt: now, updatedAt: now };
    const requirements: BootstrapRequirement[] = [{ id: "db", capability: "data.query", assetKind: "database", department: "operations", estimatedCost: 0, currency: "USD", humanBoundary: "none" }];
    const plan = planCompanyBootstrap({ companyId, mode: "existing", requirements, existingAssets: [foreign], autonomousCapabilities: ["data.query"] });
    expect(!plan.reusedAssetIds.includes(foreign.id), "bootstrap reused foreign Company asset");
    expect(plan.steps.some((step) => step.requirementId === "db" && step.action === "provision"), "bootstrap failed to provision after rejecting foreign asset");
  }));

  cases.push(await runCase("bootstrap reuses existing asset and stops at human boundary", () => {
    const companyId = randomUUID();
    const now = new Date().toISOString();
    const existing: CompanyAsset = { id: randomUUID(), companyId, kind: "database", capability: "data.query", department: "operations", cost: 0, currency: "USD", status: "active", grantRefs: [], restrictions: [], metadata: {}, createdAt: now, updatedAt: now };
    const requirements: BootstrapRequirement[] = [
      { id: "db", capability: "data.query", assetKind: "database", department: "operations", estimatedCost: 0, currency: "USD", humanBoundary: "none" },
      { id: "phone", capability: "phone.sms", assetKind: "phone-number", department: "customer", estimatedCost: 5, currency: "USD", humanBoundary: "kyc", preferredProviderIds: ["twilio"] },
    ];
    const plan = planCompanyBootstrap({ companyId, mode: "existing", requirements, existingAssets: [existing], autonomousCapabilities: ["data.query"] });
    expect(plan.reusedAssetIds.includes(existing.id), "bootstrap failed to reuse existing asset");
    const phoneApproval = plan.steps.find((step) => step.requirementId === "phone" && step.action === "request-approval");
    const phoneProvision = plan.steps.find((step) => step.requirementId === "phone" && step.action === "provision");
    expect(Boolean(phoneApproval) && Boolean(phoneProvision) && phoneProvision?.dependsOn.includes(phoneApproval!.id), "KYC boundary was not placed before provisioning");
  }));

  cases.push(...await runCapabilityPlaneGym());
  cases.push(...await runMcpBridgeGym());
  cases.push(...await runCreativePipelineGym());
  cases.push(...await (await import("./xspa-app-runtime-gym.js")).runXspaAppRuntimeGym());
  cases.push(...await runKastRuntimeGym());
  cases.push(...await runKastLawGym());
  cases.push(...await (await import("./kast-gym.js")).runKastGym());
  cases.push(...await (await import("./hardening-gym.js")).runEnterpriseHardeningGym());

  const passed = cases.filter((c) => c.ok).length;
  return { ok: passed === cases.length, passed, failed: cases.length - passed, cases };
}
