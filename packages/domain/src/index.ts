import type { AuthorityGrant, BudgetEnvelope, CapabilityRequest, CorporateGene, PreflightPlan, PrincipalPolicy, ReasoningRole } from "../../contracts/src/index.js";

export class DomainError extends Error {}

export const MAX_DEBATE_ROUNDS = 2;

export function assertPreflightPlan(plan: PreflightPlan): void {
  const routes = new Set(["noop", "direct", "fan_out", "collaborate", "challenge", "debate", "compete", "escalate"]);
  if (!routes.has(plan.route)) throw new DomainError(`unsupported preflight route: ${plan.route}`);
  if (!plan.objective.trim()) throw new DomainError("preflight objective is required");
  if (!plan.owner.trim()) throw new DomainError("preflight owner is required");
  if (!plan.terminalCondition.trim()) throw new DomainError("terminal condition is required");
  if (plan.route === "debate") {
    const rounds = plan.debateRounds ?? 1;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_DEBATE_ROUNDS) throw new DomainError(`debate rounds must be 1..${MAX_DEBATE_ROUNDS}`);
  } else if (plan.debateRounds !== undefined) {
    throw new DomainError("debateRounds is only valid for debate route");
  }
}

export function grantAllows(grant: AuthorityGrant, request: CapabilityRequest, now = new Date()): boolean {
  if (grant.companyId !== request.companyId || grant.principal !== request.principal) return false;
  const t = now.getTime();
  const validFrom = Date.parse(grant.validFrom);
  const validUntil = Date.parse(grant.validUntil);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validUntil < validFrom) return false;
  if (t < validFrom || t > validUntil) return false;
  const actionAllowed = grant.actions.includes(request.action) || grant.actions.includes("*");
  const scopeAllowed = grant.scopes.includes(request.scope) || grant.scopes.includes("*");
  return actionAllowed && scopeAllowed;
}

export interface BudgetDecision { allowed: boolean; reason: string }

export function budgetAllows(envelope: BudgetEnvelope, request: CapabilityRequest): BudgetDecision {
  if (request.amount === undefined || request.amount <= 0) return { allowed: true, reason: "no_spend" };
  if (envelope.companyId !== request.companyId) return { allowed: false, reason: "company_mismatch" };
  if (request.currency && request.currency !== envelope.currency) return { allowed: false, reason: "currency_mismatch" };
  if (request.amount > envelope.perTransactionCap) return { allowed: false, reason: "per_transaction_cap" };
  if (envelope.spent + request.amount > envelope.periodCap) return { allowed: false, reason: "period_cap" };
  if (request.category && envelope.blockedCategories.includes(request.category)) return { allowed: false, reason: "blocked_category" };
  if (request.category && envelope.allowedCategories.length && !envelope.allowedCategories.includes(request.category)) return { allowed: false, reason: "category_not_allowed" };
  if (request.provider && envelope.allowedProviders.length && !envelope.allowedProviders.includes(request.provider)) return { allowed: false, reason: "provider_not_allowed" };
  if (request.beneficiary && envelope.approvedBeneficiaries.length && !envelope.approvedBeneficiaries.includes(request.beneficiary)) return { allowed: false, reason: "beneficiary_not_approved" };
  return { allowed: true, reason: "within_envelope" };
}

export function validateGene(gene: CorporateGene): void {
  if (gene.fitness.sampleSize < 0) throw new DomainError("gene sample size cannot be negative");
  if (gene.fitness.confidence < 0 || gene.fitness.confidence > 1) throw new DomainError("gene confidence must be 0..1");
  if (gene.status === "champion" && gene.fitness.sampleSize === 0) throw new DomainError("champion requires evidence");
}

export function assertPrincipalModelLaw(policy: PrincipalPolicy): void {
  if (policy.role !== "executive-principal") throw new DomainError("invalid principal role");
  if (policy.mode !== "pinned") throw new DomainError("V1 principal policy must remain pinned");
  if (policy.model !== "gpt-5.6-sol") throw new DomainError("V1 pinned principal must be gpt-5.6-sol");
  if (policy.reasoningEffort !== "max") throw new DomainError("V1 executive principal requires max reasoning effort");
  if (policy.subordinateModel !== "gpt-5.6-sol") throw new DomainError("V1 subordinate reasoning must remain on gpt-5.6-sol");
  if (policy.subordinateReasoningEffort !== "xhigh") throw new DomainError("V1 subordinate reasoning requires xhigh effort");
  if (!policy.maxReservedForExecutive) throw new DomainError("V1 max reasoning is reserved for executive principal");
  if (policy.allowSecondaryModelProviders) throw new DomainError("V1 secondary model providers are forbidden");
  if (policy.branchOrchestration !== "xanxitospa-mission-graph") throw new DomainError("V1 branch orchestration belongs to XanxitoSpA Mission Graph");
  if (policy.allowProviderManagedMultiAgent) throw new DomainError("V1 provider-managed multi-agent orchestration is disabled");
  if (policy.allowModelFallback) throw new DomainError("V1 pinned principal forbids model fallback");
  if (!policy.capabilityProvidersReplaceable) throw new DomainError("capability provider replaceability must remain enabled");
  if (policy.creativePolicy.providerFamily !== "chatgpt-host-only") throw new DomainError("V1 creative model policy is ChatGPT-host-only");
  if (policy.creativePolicy.imageGeneration !== "host-native-image-tool") throw new DomainError("V1 images require a ChatGPT host-native image tool");
  if (policy.creativePolicy.videoGeneration !== "staged-unavailable" || policy.creativePolicy.allowLegacyVideo) throw new DomainError("V1 legacy video generation is disabled");
}

export function resolveModelLawProfile(policy: PrincipalPolicy, role: ReasoningRole): { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" } {
  assertPrincipalModelLaw(policy);
  return role === "executive"
    ? { model: "gpt-5.6-sol", reasoningEffort: "max" }
    : { model: "gpt-5.6-sol", reasoningEffort: "xhigh" };
}
