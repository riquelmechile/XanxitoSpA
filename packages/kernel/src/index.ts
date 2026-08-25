import { randomUUID } from "node:crypto";
import type {
  AuthorityGrant,
  BudgetEnvelope,
  BusinessEvent,
  BusinessOutcome,
  BusinessReceipt,
  CapabilityRequest,
  CapabilityResult,
  CompeteCandidate,
  CompeteDecision,
  CompeteResult,
  CorporateGene,
  ExecutionTraceSummary,
  FitnessSnapshot,
  MissionGraph,
  MissionNode,
  PreflightInput,
  PreflightPlan,
  PrincipalPolicy,
  ReasoningRole,
  Work,
} from "../../contracts/src/index.js";
import { assertPreflightPlan, assertPrincipalModelLaw, budgetAllows, DomainError, grantAllows, resolveModelLawProfile, validateGene } from "../../domain/src/index.js";

export interface Capability {
  name: string;
  execute(request: CapabilityRequest): Promise<CapabilityResult>;
}

export class FakeCapability implements Capability {
  readonly calls: CapabilityRequest[] = [];
  private readonly journal = new Map<string, CapabilityResult>();
  private readonly inFlight = new Map<string, Promise<CapabilityResult>>();
  constructor(public readonly name: string, private readonly handler: (request: CapabilityRequest) => CapabilityResult | Promise<CapabilityResult>) {}

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const existing = this.journal.get(request.idempotencyKey);
    if (existing) return existing;
    const active = this.inFlight.get(request.idempotencyKey);
    if (active) return active;
    const execution = (async () => {
      try {
        const result = await this.handler(request);
        this.calls.push(request);
        this.journal.set(request.idempotencyKey, result);
        return result;
      } finally {
        this.inFlight.delete(request.idempotencyKey);
      }
    })();
    this.inFlight.set(request.idempotencyKey, execution);
    return execution;
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();
  register(capability: Capability): void { this.capabilities.set(capability.name, capability); }
  get(name: string): Capability {
    const capability = this.capabilities.get(name);
    if (!capability) throw new DomainError(`capability not registered: ${name}`);
    return capability;
  }
}

export interface GuardContext {
  grants: AuthorityGrant[];
  budgets: BudgetEnvelope[];
  now?: Date;
}

export function authorizeRequest(request: CapabilityRequest, context: GuardContext): { grant: AuthorityGrant; budget?: BudgetEnvelope } {
  const grant = context.grants.find((candidate) => grantAllows(candidate, request, context.now));
  if (!grant) throw new DomainError(`DENY:no_active_grant:${request.action}:${request.scope}`);
  if (request.amount === undefined || request.amount <= 0) return { grant };
  const budget = context.budgets.find((candidate) => budgetAllows(candidate, request).allowed);
  if (!budget) throw new DomainError(`ESCALATE:budget_boundary:${request.amount}`);
  return { grant, budget };
}

export function validatePreflight(input: PreflightInput, plan: PreflightPlan, context: GuardContext): PreflightPlan {
  assertPreflightPlan(plan);
  if (plan.route === "noop" && plan.materiality !== "none") throw new DomainError("noop requires materiality=none");
  if (plan.risk === "critical" && plan.route !== "escalate") throw new DomainError("critical risk must escalate");
  if (plan.route === "compete" && plan.workUnits.length < 1) throw new DomainError("compete requires a work unit");
  if (plan.budgetLimits && Object.values(plan.budgetLimits).some((v) => v < 0)) throw new DomainError("negative budget limit");
  if (input.companyId.length === 0) throw new DomainError("company id required");
  if (plan.authorityChecks.length > 0 && context.grants.length === 0) throw new DomainError("preflight authority unavailable");
  const requestedBudget = Object.values(plan.budgetLimits).reduce((sum, value) => sum + value, 0);
  const availableBudget = context.budgets.reduce((sum, envelope) => sum + Math.max(0, envelope.periodCap - envelope.spent), 0);
  if (requestedBudget > 0 && requestedBudget > availableBudget) throw new DomainError("preflight budget unavailable");
  return structuredClone(plan);
}

export function assertAcyclic(graph: MissionGraph): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new DomainError("duplicate mission node id");
  for (const node of graph.nodes) {
    for (const dependency of node.dependsOn) if (!ids.has(dependency)) throw new DomainError(`missing dependency ${dependency}`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new DomainError("mission graph cycle detected");
    if (visited.has(id)) return;
    visiting.add(id);
    const node = byId.get(id);
    if (!node) throw new DomainError(`node not found ${id}`);
    for (const dependency of node.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

export function topologicalLayers(graph: MissionGraph): MissionNode[][] {
  assertAcyclic(graph);
  const pending = new Map(graph.nodes.map((node) => [node.id, node]));
  const complete = new Set<string>();
  const layers: MissionNode[][] = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((node) => node.dependsOn.every((id) => complete.has(id)));
    if (!ready.length) throw new DomainError("mission graph cannot progress");
    layers.push(ready);
    for (const node of ready) { pending.delete(node.id); complete.add(node.id); }
  }
  return layers;
}

export interface CompeteStrategy<T> {
  id: string;
  overlay: string;
  run(evidenceSnapshot: unknown): Promise<{ output: T; evidenceRefs: string[]; cost: number }>;
}
export type CrossCritic<T> = (self: CompeteCandidate<T>, opponent: CompeteCandidate<T>) => Promise<string>;
export type Adjudicator<T> = (input: { candidates: CompeteCandidate<T>[]; critiques: Record<string, string>; owner: string }) => Promise<CompeteDecision<T>>;

export async function runCompete<T>(input: {
  evidenceSnapshotRef: string;
  evidenceSnapshot: unknown;
  strategies: CompeteStrategy<T>[];
  owner: string;
  crossCritic?: CrossCritic<T>;
  adjudicator: Adjudicator<T>;
}): Promise<CompeteResult<T>> {
  if (input.strategies.length < 2) throw new DomainError("COMPETE requires at least 2 candidates");
  if (new Set(input.strategies.map((s) => s.overlay)).size !== input.strategies.length) throw new DomainError("COMPETE requires distinct strategy overlays");
  const frozenEvidence = deepFreeze(structuredClone(input.evidenceSnapshot));
  const candidates = await Promise.all(input.strategies.map(async (strategy): Promise<CompeteCandidate<T>> => {
    const result = await strategy.run(frozenEvidence);
    return { id: strategy.id, strategyOverlay: strategy.overlay, output: result.output, evidenceRefs: [...result.evidenceRefs], cost: result.cost };
  }));
  const critiques: Record<string, string> = {};
  let critiqueRounds = 0;
  if (input.crossCritic) {
    critiqueRounds = 1;
    for (let i = 0; i < candidates.length; i += 1) {
      const self = candidates[i];
      const opponent = candidates[(i + 1) % candidates.length];
      if (self && opponent) critiques[self.id] = await input.crossCritic(self, opponent);
    }
  }
  const decision = await input.adjudicator({ candidates, critiques, owner: input.owner });
  if (!candidates.some((candidate) => candidate.id === decision.winnerId) && decision.synthesis === undefined) {
    throw new DomainError("adjudicator must select a candidate or provide synthesis");
  }
  return { evidenceSnapshotRef: input.evidenceSnapshotRef, candidates, decision, critiqueRounds };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export interface NodeExecutionContext {
  companyId: string;
  principal: string;
  grants: AuthorityGrant[];
  budgets: BudgetEnvelope[];
  capabilities: CapabilityRegistry;
  outputs: Map<string, unknown>;
  recordEvent?: (event: BusinessEvent) => void | Promise<void>;
}

export async function executeCapabilityRequest(request: CapabilityRequest, capabilityName: string, context: NodeExecutionContext): Promise<CapabilityResult> {
  let decision: ReturnType<typeof authorizeRequest>;
  try {
    decision = authorizeRequest(request, context);
  } catch (error) {
    if (error instanceof DomainError && context.recordEvent) {
      await context.recordEvent({
        id: randomUUID(), companyId: request.companyId, type: error.message.startsWith("DENY:") ? "authority.denied" : "budget.escalated",
        occurredAt: new Date().toISOString(), actorPrincipal: request.principal, correlationId: randomUUID(),
        idempotencyKey: `guard:${request.idempotencyKey}`, payload: { action: request.action, scope: request.scope, reason: error.message },
        sensitivity: "internal", evidenceRefs: [],
      });
    }
    throw error;
  }
  const reservation = request.amount && decision.budget ? request.amount : 0;
  if (reservation && decision.budget) decision.budget.spent += reservation;
  try {
    const result = await context.capabilities.get(capabilityName).execute(request);
    if ((!result.sideEffectApplied || !result.ok) && reservation && decision.budget) decision.budget.spent -= reservation;
    return result;
  } catch (error) {
    if (reservation && decision.budget) decision.budget.spent -= reservation;
    throw error;
  }
}

export type NodeHandler = (node: MissionNode, context: NodeExecutionContext) => Promise<unknown>;

export async function executeMissionGraph(graph: MissionGraph, context: NodeExecutionContext, handlers: Partial<Record<MissionNode["kind"], NodeHandler>>): Promise<Map<string, unknown>> {
  assertAcyclic(graph);
  for (const layer of topologicalLayers(graph)) {
    const results = await Promise.all(layer.map(async (node) => {
      const handler = handlers[node.kind];
      if (!handler) throw new DomainError(`no handler for node kind ${node.kind}`);
      return [node.id, await handler(node, context)] as const;
    }));
    for (const [id, output] of results) context.outputs.set(id, output);
  }
  return context.outputs;
}

export function settle(input: {
  work: Work;
  actor: string;
  authorityRefs: string[];
  budgetRefs: string[];
  verified: boolean;
  dimensions: Record<string, number>;
  evidenceRefs: string[];
  cost: number;
  riskIncidents?: string[];
  now?: Date;
}): { outcome: BusinessOutcome; receipt: BusinessReceipt } {
  const now = (input.now ?? new Date()).toISOString();
  const outcome: BusinessOutcome = {
    id: randomUUID(), companyId: input.work.companyId, workId: input.work.id, verified: input.verified,
    dimensions: { ...input.dimensions }, evidenceRefs: [...input.evidenceRefs], cost: input.cost,
    riskIncidents: [...(input.riskIncidents ?? [])], occurredAt: now,
  };
  const receipt: BusinessReceipt = {
    id: randomUUID(), companyId: input.work.companyId, workId: input.work.id, actor: input.actor,
    authorityRefs: [...input.authorityRefs], budgetRefs: [...input.budgetRefs], evidenceRefs: [...input.evidenceRefs],
    outcomeId: outcome.id, cost: input.cost, createdAt: now,
  };
  return { outcome, receipt };
}


export function validatePrincipalPolicy(policy: PrincipalPolicy): void {
  assertPrincipalModelLaw(policy);
}

export function resolveReasoningProfile(policy: PrincipalPolicy, role: ReasoningRole): { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" } {
  return resolveModelLawProfile(policy, role);
}

export function applyLearningEvidenceToGene(
  gene: CorporateGene,
  outcome: BusinessOutcome,
  trace: ExecutionTraceSummary,
  options: { minSamplesForChampion: number; confidenceStep?: number },
): CorporateGene {
  if (!outcome.verified) throw new DomainError("unverified outcome cannot teach corporate gene");
  if (trace.companyId !== gene.companyId || outcome.companyId !== gene.companyId) throw new DomainError("learning evidence company mismatch");
  if (trace.workId !== outcome.workId) throw new DomainError("learning trace/outcome work mismatch");
  if (!trace.sanitized || trace.containsRawSecrets || trace.containsRawConversation) throw new DomainError("unsafe execution trace cannot become institutional learning");
  if (!trace.traceRef.trim()) throw new DomainError("learning trace reference required");
  const next = applyVerifiedOutcomeToGene(gene, outcome, options);
  if (!next.experienceRefs.includes(trace.traceRef)) next.experienceRefs.push(trace.traceRef);
  validateGene(next);
  return next;
}

export function dominates(a: FitnessSnapshot, b: FitnessSnapshot, higherIsBetter: string[]): boolean {
  const keys = new Set([...Object.keys(a.dimensions), ...Object.keys(b.dimensions)]);
  let strictlyBetter = false;
  for (const key of keys) {
    const av = a.dimensions[key] ?? 0;
    const bv = b.dimensions[key] ?? 0;
    const high = higherIsBetter.includes(key);
    if (high ? av < bv : av > bv) return false;
    if (av !== bv) strictlyBetter = true;
  }
  if (a.cost > b.cost || a.riskIncidents > b.riskIncidents) return false;
  if (a.cost < b.cost || a.riskIncidents < b.riskIncidents) strictlyBetter = true;
  return strictlyBetter;
}

export function paretoFront(genes: CorporateGene[], higherIsBetter: string[]): CorporateGene[] {
  for (const gene of genes) validateGene(gene);
  return genes.filter((candidate) => !genes.some((other) => other.id !== candidate.id && dominates(other.fitness, candidate.fitness, higherIsBetter)));
}

export function applyVerifiedOutcomeToGene(gene: CorporateGene, outcome: BusinessOutcome, options: { minSamplesForChampion: number; confidenceStep?: number }): CorporateGene {
  if (!outcome.verified) return structuredClone(gene);
  const next = structuredClone(gene);
  const previousN = next.fitness.sampleSize;
  const nextN = previousN + 1;
  for (const [key, value] of Object.entries(outcome.dimensions)) {
    const prev = next.fitness.dimensions[key] ?? value;
    next.fitness.dimensions[key] = ((prev * previousN) + value) / nextN;
  }
  next.fitness.sampleSize = nextN;
  next.fitness.cost = ((next.fitness.cost * previousN) + outcome.cost) / nextN;
  next.fitness.riskIncidents += outcome.riskIncidents.length;
  next.fitness.confidence = Math.min(1, next.fitness.confidence + (options.confidenceStep ?? 0.1));
  if (outcome.riskIncidents.length > 0) next.status = "quarantine";
  else if (nextN >= options.minSamplesForChampion && next.fitness.confidence >= 0.6) next.status = "champion";
  else if (next.status === "candidate") next.status = "challenger";
  validateGene(next);
  return next;
}

export function preserveNegativeResult(gene: CorporateGene, ref: string): CorporateGene {
  const next = structuredClone(gene);
  if (!next.negativeResultRefs.includes(ref)) next.negativeResultRefs.push(ref);
  if (next.status !== "retired") next.status = "silent";
  return next;
}

export function canPromoteAutonomy(input: { currentLevel: number; verifiedOutcomes: number; incidents: number; requiredOutcomes: number }): boolean {
  if (input.currentLevel >= 5) return false;
  return input.verifiedOutcomes >= input.requiredOutcomes && input.incidents === 0;
}

export function makeNode(id: string, kind: MissionNode["kind"], owner: string, objective: string, dependsOn: string[] = []): MissionNode {
  return { id, kind, owner, objective, inputRefs: [], dependsOn, skillRefs: [], capabilityRefs: [], timeoutMs: 30_000, retryLimit: 0, successCondition: "output-valid", outputContract: "json" };
}

export * from "./heartbeat.js";
export * from "./bootstrap.js";

export * from "./bootstrap-executor.js";

export * from "./control-catalog.js";

export * from "./creative-pipeline.js";

export * from "./kast.js";
export * from "./kast-law.js";

export * from "./git-kast.js";
export * from "./kast-harness-runtime.js";
export * from "./skill-registry.js";
export * from "./company-skills.js";
export * from "./company-os.js";

export * from "./company-discovery.js";

export * from "./company-constitution.js";

export * from "./authority-mandate.js";
export * from "./business-system-connector.js";
export * from "./discovery-orchestrator.js";
export * from "./signal-source.js";
export * from "./csv-signal-source.js";
export * from "./governed-wake.js";

export * from "./governed-heartbeat.js";
export * from "./observed-signal-scheduler.js";
