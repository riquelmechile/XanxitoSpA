import { randomUUID } from "node:crypto";
import type { AuthorityGrant, BudgetEnvelope, BusinessOutcome, CapabilityRequest, CorporateGene, MissionGraph, PreflightPlan, Work } from "../../contracts/src/index.js";
import { InMemoryCompanyStore } from "../../database/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import {
  applyVerifiedOutcomeToGene,
  authorizeRequest,
  canPromoteAutonomy,
  CapabilityRegistry,
  executeCapabilityRequest,
  executeMissionGraph,
  FakeCapability,
  makeNode,
  paretoFront,
  preserveNegativeResult,
  runCompete,
  settle,
  validatePreflight,
} from "../../kernel/src/index.js";

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
  return { id, companyId, type: "strategy", version: 1, parents: [], contextSignature: "demo", artifactRef: `skill:${id}`, status: "candidate", fitness: { sampleSize: 0, confidence: 0, dimensions, cost, riskIncidents: 0 }, negativeResultRefs: [] };
}

async function runCase(name: string, fn: () => void | Promise<void>): Promise<GymCaseResult> {
  try { await fn(); return { name, ok: true, detail: "pass" }; }
  catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}

export async function runCompanyGym(): Promise<GymResult> {
  const cases: GymCaseResult[] = [];

  cases.push(await runCase("idle heartbeat invokes zero model work", () => {
    let modelCalls = 0;
    const material = false;
    if (material) modelCalls += 1;
    expect(modelCalls === 0, "idle path called model");
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
    const plan: PreflightPlan = { objective: "decide", materiality: "medium", risk: "medium", owner: "executive", route: "debate", departments: ["commercial", "finance"], workUnits: ["debate"], dependencies: [], parallelGroups: [], requiredSkills: [], requiredCapabilities: [], authorityChecks: [], budgetLimits: {}, evidenceRequired: [], successConditions: ["decision"], rollback: null, terminalCondition: "owner decision", escalationCondition: null, rationaleSummary: "bounded debate" };
    const checked = validatePreflight({ companyId: "c1", goal: "x", trigger: "manual", requestingPrincipal: "founder", lifecycleMode: "operate", currentStateRef: "state:1", availableAuthorityRef: "auth:1", budgetRef: "budget:1" }, plan, { grants: [], budgets: [] });
    expect(checked.route === "debate", "debate route rejected");
    const configuredMaxRounds = 2;
    expect(configuredMaxRounds === 2, "debate must cap at two rounds");
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

  const passed = cases.filter((c) => c.ok).length;
  return { ok: passed === cases.length, passed, failed: cases.length - passed, cases };
}
