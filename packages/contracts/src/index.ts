export type UUID = string;
export type ISODateTime = string;
export type Risk = "low" | "medium" | "high" | "critical";
export type LifecycleMode = "bootstrap" | "operate" | "improve" | "grow" | "expand" | "recover" | "exit";
export type PreflightRoute = "noop" | "direct" | "fan_out" | "collaborate" | "challenge" | "debate" | "compete" | "escalate";
export type MissionNodeKind = "work" | "collaborate" | "challenge" | "debate" | "compete" | "join" | "capability" | "verify" | "decide" | "settle";
export type GeneStatus = "candidate" | "challenger" | "champion" | "silent" | "quarantine" | "retired";
export type GeneType = "strategy" | "process" | "skill" | "team-composition" | "provider-routing";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface CompanyManifestSnapshot {
  companyId: UUID;
  revision: number;
  digest: string;
  purpose: string;
  jurisdiction: string;
  timezone: string;
  lifecycleModes: LifecycleMode[];
  reservedHumanActions: string[];
}

export interface Work {
  id: UUID;
  companyId: UUID;
  owner: string;
  objective: string;
  scope: string;
  createdAt: ISODateTime;
}

export interface Delegation {
  id: UUID;
  companyId: UUID;
  workId: UUID;
  principal: string;
  authorityGrantIds: UUID[];
  budgetEnvelopeIds: UUID[];
  expiresAt?: ISODateTime;
}

export interface AuthorityGrant {
  id: UUID;
  companyId: UUID;
  principal: string;
  actions: string[];
  scopes: string[];
  validFrom: ISODateTime;
  validUntil: ISODateTime;
}

export interface BudgetEnvelope {
  id: UUID;
  companyId: UUID;
  department: string;
  currency: string;
  periodCap: number;
  spent: number;
  perTransactionCap: number;
  allowedCategories: string[];
  blockedCategories: string[];
  allowedProviders: string[];
  approvedBeneficiaries: string[];
}

export interface BusinessEvent<T = unknown> {
  id: UUID;
  companyId: UUID;
  type: string;
  occurredAt: ISODateTime;
  actorPrincipal: string;
  correlationId: UUID;
  causationId?: UUID;
  idempotencyKey: string;
  payload: T;
  sensitivity: "public" | "internal" | "restricted";
  evidenceRefs: string[];
}

export interface PreflightInput {
  companyId: UUID;
  goal: string;
  trigger: string;
  requestingPrincipal: string;
  lifecycleMode: LifecycleMode;
  currentStateRef: string;
  availableAuthorityRef: string;
  budgetRef: string;
}

export interface PreflightPlan {
  objective: string;
  materiality: "none" | "low" | "medium" | "high";
  risk: Risk;
  owner: string;
  route: PreflightRoute;
  departments: string[];
  workUnits: string[];
  dependencies: Array<[string, string]>;
  parallelGroups: string[][];
  requiredSkills: string[];
  requiredCapabilities: string[];
  authorityChecks: string[];
  budgetLimits: Record<string, number>;
  evidenceRequired: string[];
  successConditions: string[];
  rollback: string | null;
  terminalCondition: string;
  escalationCondition: string | null;
  rationaleSummary: string;
}

export interface MissionNode {
  id: string;
  kind: MissionNodeKind;
  owner: string;
  objective: string;
  inputRefs: string[];
  dependsOn: string[];
  authorityRef?: string;
  budgetRef?: string;
  skillRefs: string[];
  capabilityRefs: string[];
  timeoutMs: number;
  retryLimit: number;
  successCondition: string;
  outputContract: string;
  metadata?: Record<string, unknown>;
}

export interface MissionGraph {
  id: UUID;
  companyId: UUID;
  revision: number;
  nodes: MissionNode[];
}

export interface CapabilityRequest {
  companyId: UUID;
  principal: string;
  action: string;
  scope: string;
  category?: string;
  provider?: string;
  beneficiary?: string;
  amount?: number;
  currency?: string;
  idempotencyKey: string;
  payload: unknown;
}

export interface CapabilityResult {
  ok: boolean;
  sideEffectApplied: boolean;
  result: unknown;
  evidenceRefs: string[];
  cost: number;
}

export interface BusinessOutcome {
  id: UUID;
  companyId: UUID;
  workId: UUID;
  verified: boolean;
  dimensions: Record<string, number>;
  evidenceRefs: string[];
  cost: number;
  riskIncidents: string[];
  occurredAt: ISODateTime;
}

export interface BusinessReceipt {
  id: UUID;
  companyId: UUID;
  workId: UUID;
  actor: string;
  authorityRefs: string[];
  budgetRefs: string[];
  evidenceRefs: string[];
  outcomeId: UUID;
  cost: number;
  createdAt: ISODateTime;
}

export interface FitnessSnapshot {
  sampleSize: number;
  confidence: number;
  dimensions: Record<string, number>;
  cost: number;
  riskIncidents: number;
}

export interface CorporateGene {
  id: string;
  companyId: UUID;
  type: GeneType;
  version: number;
  parents: string[];
  contextSignature: string;
  artifactRef: string;
  status: GeneStatus;
  fitness: FitnessSnapshot;
  negativeResultRefs: string[];
}

export interface CompeteCandidate<T = unknown> {
  id: string;
  strategyOverlay: string;
  output: T;
  evidenceRefs: string[];
  cost: number;
}

export interface CompeteDecision<T = unknown> {
  winnerId: string;
  decisionOwner: string;
  synthesis?: T;
  rationale: string;
}

export interface CompeteResult<T = unknown> {
  evidenceSnapshotRef: string;
  candidates: CompeteCandidate<T>[];
  decision: CompeteDecision<T>;
  critiqueRounds: number;
}
