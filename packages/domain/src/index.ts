import type { AuthorityGrant, BudgetEnvelope, CapabilityRequest, CorporateGene, PreflightPlan } from "../../contracts/src/index.js";

export class DomainError extends Error {}

export function assertPreflightPlan(plan: PreflightPlan): void {
  const routes = new Set(["noop", "direct", "fan_out", "collaborate", "challenge", "debate", "compete", "escalate"]);
  if (!routes.has(plan.route)) throw new DomainError(`unsupported preflight route: ${plan.route}`);
  if (!plan.objective.trim()) throw new DomainError("preflight objective is required");
  if (!plan.owner.trim()) throw new DomainError("preflight owner is required");
  if (!plan.terminalCondition.trim()) throw new DomainError("terminal condition is required");
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
