export type UUID = string;
export type ISODateTime = string;
export type Risk = "low" | "medium" | "high" | "critical";
export type LifecycleMode = "bootstrap" | "operate" | "improve" | "grow" | "expand" | "recover" | "exit";
export type PreflightRoute = "noop" | "direct" | "fan_out" | "collaborate" | "challenge" | "debate" | "compete" | "escalate";
export type MissionNodeKind = "work" | "collaborate" | "challenge" | "debate" | "compete" | "join" | "capability" | "verify" | "decide" | "settle";
export type GeneStatus = "candidate" | "challenger" | "champion" | "silent" | "quarantine" | "retired";
export type GeneType = "strategy" | "process" | "skill" | "team-composition" | "provider-routing";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type PrincipalMode = "pinned" | "portable";
export type PrincipalReasoningEffort = "max" | "xhigh";
export type ReasoningRole = "executive" | "supervisor" | "worker" | "critic" | "verifier";
export type CreativeProviderFamily = "openai-only";
export type CreativeImageGenerationMode = "responses-image-generation";
export type CreativeVideoGenerationMode = "staged-unavailable";

export interface CreativePolicy {
  providerFamily: CreativeProviderFamily;
  imageGeneration: CreativeImageGenerationMode;
  videoGeneration: CreativeVideoGenerationMode;
  allowLegacyVideo: false;
}

export interface PrincipalPolicy {
  role: "executive-principal";
  mode: PrincipalMode;
  model: string;
  reasoningEffort: PrincipalReasoningEffort;
  subordinateModel: string;
  subordinateReasoningEffort: "xhigh";
  maxReservedForExecutive: true;
  allowSecondaryModelProviders: false;
  branchOrchestration: "xanxitospa-mission-graph";
  allowProviderManagedMultiAgent: false;
  allowModelFallback: boolean;
  capabilityProvidersReplaceable: boolean;
  creativePolicy: CreativePolicy;
}

export interface CompanyManifestSnapshot {
  companyId: UUID;
  revision: number;
  digest: string;
  purpose: string;
  jurisdiction: string;
  timezone: string;
  lifecycleModes: LifecycleMode[];
  reservedHumanActions: string[];
  principalPolicy: PrincipalPolicy;
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

export interface ExecutionTraceSummary {
  id: UUID;
  companyId: UUID;
  workId: UUID;
  traceRef: string;
  startedAt: ISODateTime;
  completedAt: ISODateTime;
  stepCount: number;
  failedStepCount: number;
  decisionRefs: string[];
  capabilityRefs: string[];
  errorClasses: string[];
  evidenceRefs: string[];
  sanitized: boolean;
  containsRawSecrets: boolean;
  containsRawConversation: boolean;
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
  experienceRefs: string[];
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



export type CreativeMissionStatus = "queued" | "running" | "decided" | "escalated" | "failed";
export type CreativeRenderState = "completed" | "failed";

export interface CreativeMission {
  id: UUID;
  companyId: UUID;
  workId: UUID;
  supervisorPrincipal: string;
  briefRef: string;
  evidenceSnapshotRef: string;
  candidateCount: number;
  requiredSuccessfulCandidates: number;
  executiveEscalationRequired: boolean;
  createdAt: ISODateTime;
}

export interface CreativeStrategyCandidate {
  id: string;
  missionId: UUID;
  strategyOverlay: string;
  prompt: string;
  rationale: string;
  evidenceRefs: string[];
  cost: number;
  model: "gpt-5.6-sol";
  reasoningEffort: "xhigh";
}

export interface CreativeRenderRecord {
  candidateId: string;
  state: CreativeRenderState;
  assetId?: UUID;
  artifactRef?: string;
  evidenceRefs: string[];
  cost: number;
  error?: string;
}

export interface VisualFitnessEvaluation {
  candidateId: string;
  evaluatorId: string;
  scores: Record<string, number>;
  rationale: string;
  evidenceRefs: string[];
  model: "gpt-5.6-sol";
  reasoningEffort: "xhigh";
}

export interface CreativeDecision {
  missionId: UUID;
  status: "selected" | "escalated" | "insufficient-candidates";
  decisionOwner: string;
  selectedCandidateId?: string;
  selectedAssetId?: UUID;
  rationale: string;
  escalationRequired: boolean;
}

export interface CreativeSubmissionReceipt {
  missionId: UUID;
  status: "queued";
  chatMode: "decision-only";
}

export interface CreativeDecisionReceipt {
  missionId: UUID;
  status: "selected" | "escalated" | "insufficient-candidates";
  decisionOwner: string;
  selectedAssetRefs: string[];
  rationaleSummary: string;
  escalationRequired: boolean;
  chatMode: "decision-only";
}

export type HeartbeatState = "sleep" | "wake" | "contended";
export type JobState = "pending" | "running" | "completed" | "failed" | "cancelled";
export type IdempotencyState = "intent" | "applied" | "failed" | "unknown" | "reconciled";
export type ProviderHealth = "healthy" | "degraded" | "unavailable";
export type ProviderSelectionMode = "quality" | "cost" | "latency" | "balanced";
export type AssetStatus = "planned" | "active" | "degraded" | "suspended" | "retired";
export type BootstrapMode = "new" | "existing";
export type HumanBoundary = "none" | "kyc" | "contract" | "financial-authority" | "identity" | "reserved-action";

export interface ScheduledJob<T = unknown> {
  id: UUID;
  companyId: UUID;
  kind: string;
  payload: T;
  materiality: "none" | "low" | "medium" | "high";
  dueAt: ISODateTime;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  leaseOwner?: string;
  leaseUntil?: ISODateTime;
  fencingToken: number;
  lastError?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface HeartbeatCursor {
  companyId: UUID;
  lastEventOccurredAt?: ISODateTime;
  lastEventId?: UUID;
  updatedAt: ISODateTime;
}

export interface FencedLease {
  companyId: UUID;
  resourceType: "heartbeat" | "job" | "mission";
  resourceId: string;
  owner: string;
  fencingToken: number;
  leaseUntil: ISODateTime;
}

export interface IdempotencyRecord {
  companyId: UUID;
  idempotencyKey: string;
  intent: unknown;
  state: IdempotencyState;
  owner?: string;
  fencingToken: number;
  result?: unknown;
  lastError?: string;
  updatedAt: ISODateTime;
}

export interface ProviderDescriptor {
  id: string;
  companyId: UUID;
  capabilities: string[];
  regions: string[];
  inputFormats: string[];
  outputFormats: string[];
  estimatedCost: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  reliability: number;
  quality: number;
  privacyScore: number;
  maxSensitivity: "public" | "internal" | "restricted";
  rateLimitPerMinute?: number;
  health: ProviderHealth;
  credentialsRef?: string;
  metadata: Record<string, unknown>;
}

export interface ProviderSelectionRequest {
  companyId: UUID;
  capability: string;
  region: string;
  inputFormat?: string;
  outputFormat?: string;
  maxCost?: number;
  minQuality?: number;
  minReliability?: number;
  minPrivacyScore?: number;
  sensitivity: "public" | "internal" | "restricted";
  requireCredentials?: boolean;
  mode: ProviderSelectionMode;
}

export interface ProviderSelectionResult {
  providerId: string;
  mode: ProviderSelectionMode;
  score: number;
  eligibleProviderIds: string[];
  rationale: string;
}

export interface CompanyAsset {
  id: UUID;
  companyId: UUID;
  kind: string;
  providerId?: string;
  capability: string;
  department: string;
  cost: number;
  currency: string;
  status: AssetStatus;
  credentialsRef?: string;
  grantRefs: string[];
  restrictions: string[];
  metadata: Record<string, unknown>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BootstrapRequirement {
  id: string;
  capability: string;
  assetKind: string;
  department: string;
  estimatedCost: number;
  currency: string;
  humanBoundary: HumanBoundary;
  preferredProviderIds?: string[];
}

export interface BootstrapStep {
  id: string;
  action: "reuse" | "provision" | "configure" | "verify" | "request-approval";
  requirementId: string;
  capability: string;
  assetId?: UUID;
  providerId?: string;
  approvalRequired: boolean;
  approvalReason?: string;
  dependsOn: string[];
}

export interface BootstrapPlan {
  companyId: UUID;
  mode: BootstrapMode;
  steps: BootstrapStep[];
  reusedAssetIds: UUID[];
  requestedCapabilities: string[];
  approvalBoundaries: Array<{ requirementId: string; reason: string }>;
  skillPlan?: import("./skill-registry.js").CompanySkillBootstrapPlan;
}

export type CoreBusinessFunction = "executive-strategy" | "commercial-revenue" | "finance" | "operations" | "customer" | "administration-risk";
export type DepartmentDisposition = "preserve" | "create" | "extend";
export type ProcessDisposition = "preserve" | "create" | "map";

export interface ObservedDepartment {
  id: string;
  name: string;
  functions: string[];
  responsibilities: string[];
  kpis: string[];
  evidenceRefs: string[];
}

export interface ProposedDepartment {
  id: string;
  name: string;
  functions: string[];
  responsibilities: string[];
  kpis: string[];
}

export interface ProposedProcess {
  id: string;
  name: string;
  department: string;
  objective: string;
  description: string;
  triggers: string[];
  requiredSkills: string[];
  requiredCapabilities: string[];
  evidenceRefs: string[];
}

export interface CompanyIntakeInput {
  mode: BootstrapMode;
  purpose: string;
  businessModel: string;
  jurisdiction: string;
  timezone: string;
  objectives: string[];
  requiredFunctions?: string[];
  observedDepartments?: ObservedDepartment[];
  observedProcesses?: import("./skill-registry.js").ObservedCompanyProcess[];
  proposedDepartments?: ProposedDepartment[];
  proposedProcesses?: ProposedProcess[];
  requiredCapabilities?: string[];
  bootstrapRequirements?: BootstrapRequirement[];
}

export interface DepartmentBlueprint {
  id: string;
  name: string;
  functions: string[];
  responsibilities: string[];
  kpis: string[];
  disposition: DepartmentDisposition;
  evidenceRefs: string[];
}

export interface ProcessBlueprint {
  id: string;
  name: string;
  department: string;
  objective: string;
  description: string;
  triggers: string[];
  requiredSkills: string[];
  requiredCapabilities: string[];
  disposition: ProcessDisposition;
  evidenceRefs: string[];
}

export interface RecommendedCompanyWork {
  owner: "executive";
  objective: string;
  scope: string;
}

export interface CompanyOperatingModelPlan {
  schemaVersion: 1;
  companyId: UUID;
  mode: BootstrapMode;
  lifecycleMode: "bootstrap";
  purpose: string;
  businessModel: string;
  jurisdiction: string;
  timezone: string;
  objectives: string[];
  departments: DepartmentBlueprint[];
  processes: ProcessBlueprint[];
  requiredCapabilities: string[];
  requiredSkills: string[];
  readinessGaps: string[];
  skillPlan: import("./skill-registry.js").CompanySkillBootstrapPlan;
  bootstrapPlan: BootstrapPlan;
  fingerprint: string;
  recommendedWork: RecommendedCompanyWork;
}

export interface CompanyOperatingModelSnapshot extends CompanyOperatingModelPlan {
  formationId: UUID;
  appliedAt: ISODateTime;
}

export type CapabilitySideEffectClass = "none" | "reversible" | "external";
export type BootstrapStepStatus = "pending" | "running" | "completed" | "paused" | "failed";

export interface SecretHandle {
  ref: string;
  companyId: UUID;
  providerId: string;
  secretName: string;
  version: number;
}

export interface SemanticCapabilityDescriptor {
  name: string;
  risk: Risk;
  maxSensitivity: "public" | "internal" | "restricted";
  sideEffectClass: CapabilitySideEffectClass;
  inputFormats: string[];
  outputFormats: string[];
  credentialRequired: boolean;
  availability?: "enabled" | "native" | "staged";
  description: string;
}

export interface ProviderAdapterDescriptor {
  companyId: UUID;
  providerId: string;
  capabilities: string[];
  credentialNames: string[];
}

export interface CapabilityPlaneRequest {
  capabilityRequest: CapabilityRequest;
  selection: ProviderSelectionRequest;
  executionOwner: string;
  allowFallback: boolean;
  maxAttempts: number;
  staleAfterMs: number;
}

export interface CapabilityAttemptRecord {
  providerId: string;
  ok: boolean;
  sideEffectApplied: boolean;
  evidenceRefs: string[];
  cost: number;
  error?: string;
}

export interface CapabilityPlaneResult {
  capability: string;
  providerId?: string;
  attempts: CapabilityAttemptRecord[];
  result: CapabilityResult;
  fallbackUsed: boolean;
  reconciliationRequired: boolean;
}

export interface ApprovalReceipt {
  id: UUID;
  companyId: UUID;
  requirementId: string;
  planFingerprint: string;
  approvedBy: string;
  approvedAt: ISODateTime;
  expiresAt?: ISODateTime;
}

export interface BootstrapStepExecutionState {
  stepId: string;
  status: BootstrapStepStatus;
  assetId?: UUID;
  evidenceRefs: string[];
  error?: string;
}

export interface BootstrapExecutionState {
  executionId: UUID;
  companyId: UUID;
  planFingerprint: string;
  startedAt: ISODateTime;
  updatedAt: ISODateTime;
  steps: BootstrapStepExecutionState[];
  pausedAtStepId?: string;
  completed: boolean;
}

export type { KASTCategory, KASTSeverity, KASTStatus, KASTObservation, KASTEntry, SessionCloseReceipt, HarnessImprovementHandoff, KASTPromotionResult } from "./kast.js";
export type { KASTLawMode, KASTLawStatus, KASTMutableSurface, KASTConstitutionalSurface, KASTHarnessSurface, KASTLawTrigger, KASTMemoryRecord, KASTImprovementVariant, KASTVariantVerification, KASTVerifiedVariant, KASTAdjudication, KASTAdoptionResult, KASTLawResult, KASTLawPolicy } from "./kast-law.js";
export type { SkillDefinitionStatus, SkillDomain, SkillRisk, SkillProvenance, SkillDefinition, SkillIndexEntry, SkillSearchInput, SkillMatch, SkillRegistryIssueKind, SkillRegistryIssue, SkillRegistryHealth, LoadedSkill, CompanySkillInstallationStatus, CompanySkillInstallationSource, CompanySkillInstallation, ObservedCompanyProcess, CompanySkillInstallPlan, CompanySkillReusePlan, CompanySkillGap, CompanySkillCreationCandidate, CompanySkillBootstrapInput, CompanySkillBootstrapPlan } from "./skill-registry.js";
