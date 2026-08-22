import type { ISODateTime, PrincipalPolicy, UUID } from "./index.js";

export type KASTLawMode = "noop" | "remember" | "improve";
export type KASTLawStatus = "no-op" | "remembered" | "founder-required" | "rejected" | "adoptable" | "adopted";

export type KASTMutableSurface =
  | "skill"
  | "routing"
  | "prompt"
  | "process"
  | "heuristic"
  | "parallelism-policy"
  | "adapter"
  | "performance"
  | "test"
  | "ux"
  | "memory-strategy"
  | "developer-experience";

export type KASTConstitutionalSurface =
  | "model-law"
  | "constitution"
  | "authority-root"
  | "secret-isolation"
  | "kast-law"
  | "review-law"
  | "memory-law"
  | "human-reserved-boundary";

export type KASTHarnessSurface = KASTMutableSurface | KASTConstitutionalSurface;

export interface KASTLawTrigger {
  id: UUID;
  companyId: UUID;
  sessionRef: string;
  requestedMode: KASTLawMode;
  category: "bug" | "friction" | "opportunity" | "performance" | "security" | "test-gap" | "repeated-workaround";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  evidenceRefs: string[];
  recurrence: number;
  affectedSurfaces: KASTHarnessSurface[];
  strategyOverlays?: string[];
  containsRawSecrets: boolean;
  containsRawConversation: boolean;
  observedAt: ISODateTime;
}

export interface KASTMemoryRecord {
  topicKey: string;
  title: string;
  summary: string;
  evidenceRefs: string[];
  outcome: "remembered" | "rejected" | "founder-required" | "adopted";
  variantRefs?: string[];
  createdAt?: ISODateTime;
}

export interface KASTImprovementVariant {
  id: UUID;
  overlay: string;
  summary: string;
  changeRef: string;
  isolationRef: string;
  affectedSurfaces: KASTHarnessSurface[];
  evidenceRefs: string[];
  directMainMutation: boolean;
}

export interface KASTVariantVerification {
  variantId: UUID;
  passed: boolean;
  verifiedChangeRef: string;
  isolationVerified: boolean;
  observedSurfaces: KASTHarnessSurface[];
  sddComplete: boolean;
  regressionRefs: string[];
  reviewApproved: boolean;
  fourRRefs: string[];
  verificationRefs: string[];
  blockingFindings: string[];
}

export interface KASTVerifiedVariant {
  variant: KASTImprovementVariant;
  verification: KASTVariantVerification;
}

export interface KASTAdjudication {
  selectedVariantId?: UUID;
  rationale: string;
}

export interface KASTAdoptionResult {
  adopted: boolean;
  sourceChangeRef?: string;
  adoptionRef?: string;
  reason?: string;
}

export interface KASTLawResult {
  triggerId: UUID;
  mode: KASTLawMode;
  status: KASTLawStatus;
  reason: string;
  priorMemoryRefs: string[];
  variantRefs: string[];
  selectedVariantId?: UUID;
  adoptionRef?: string;
}

export interface KASTLawPolicy {
  principalPolicy: PrincipalPolicy;
  defaultVariantCount: 2;
  maxVariantCount: 4;
}
