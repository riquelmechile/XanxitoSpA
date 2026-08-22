import type { ISODateTime, UUID, Work } from "./index.js";

export type KASTCategory = "bug" | "friction" | "missing-capability" | "policy-ambiguity" | "performance" | "security" | "repeated-workaround" | "test-gap" | "docs-drift" | "developer-experience" | "recommendation";
export type KASTSeverity = "low" | "medium" | "high" | "critical";
export type KASTStatus = "candidate" | "open" | "accepted" | "in-progress" | "verified" | "rejected" | "silent";

export interface KASTObservation {
  companyId: UUID;
  sessionRef: string;
  category: KASTCategory;
  severity: KASTSeverity;
  title: string;
  summary: string;
  reproduction: string[];
  affectedPaths: string[];
  affectedCapabilities: string[];
  evidenceRefs: string[];
  recommendation: string;
  verificationPlan: string[];
  containsRawSecrets: boolean;
  containsRawConversation: boolean;
  observedAt: ISODateTime;
}

export interface KASTEntry {
  id: UUID;
  companyId: UUID;
  fingerprint: string;
  category: KASTCategory;
  severity: KASTSeverity;
  title: string;
  summary: string;
  reproduction: string[];
  affectedPaths: string[];
  affectedCapabilities: string[];
  evidenceRefs: string[];
  sessionRefs: string[];
  recommendation: string;
  verificationPlan: string[];
  occurrenceCount: number;
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
  status: KASTStatus;
  improvementWorkId?: UUID;
  regressionGuardRefs: string[];
  verificationEvidenceRefs: string[];
}

export interface SessionCloseReceipt {
  id: UUID;
  companyId: UUID;
  sessionRef: string;
  closedAt: ISODateTime;
  status: "complete" | "partial";
  businessMemoryCandidates: string[];
  engramCandidates: Array<{ title: string; summary: string; topicKey: string }>;
  artifactRefs: string[];
  traceRefs: string[];
  kastEntryIds: UUID[];
  unresolvedWorkRefs: string[];
  nextSessionHints: string[];
  containsRawSecrets: false;
  containsRawConversation: false;
}

export interface HarnessImprovementHandoff {
  generatedAt: ISODateTime;
  companyId: UUID;
  entries: Array<Pick<KASTEntry,
    "id" | "fingerprint" | "category" | "severity" | "title" | "summary" | "reproduction" |
    "affectedPaths" | "affectedCapabilities" | "evidenceRefs" | "recommendation" | "verificationPlan" |
    "occurrenceCount" | "status" | "regressionGuardRefs" | "verificationEvidenceRefs"
  >>;
  contract: {
    mayReadRawConversation: false;
    mayReadRawSecrets: false;
    maySelfModify: false;
    requiredFlow: "preflight-review-verify";
  };
}

export interface KASTPromotionResult {
  promoted: boolean;
  reason: string;
  work?: Work;
}
