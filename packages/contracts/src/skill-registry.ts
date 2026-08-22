export type SkillDefinitionStatus = "active" | "deprecated";
export type SkillDomain = "company" | "harness";
export type SkillRisk = "low" | "medium" | "high" | "critical";
export type SkillProvenance = "project" | "kast" | "human" | "imported" | "company";

export interface SkillDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  domain: SkillDomain;
  status: SkillDefinitionStatus;
  description: string;
  triggers: string[];
  scopes: string[];
  capabilities: string[];
  defaultDepartments: string[];
  contentRef: string;
  risk: SkillRisk;
  provenance: SkillProvenance;
  ownerCompanyId?: string;
  supersedes?: string;
  tags?: string[];
}

export interface SkillIndexEntry {
  id: string;
  name: string;
  version: string;
  domain: SkillDomain;
  status: SkillDefinitionStatus;
  description: string;
  triggers: string[];
  scopes: string[];
  capabilities: string[];
  defaultDepartments: string[];
  contentRef: string;
  risk: SkillRisk;
  provenance: SkillProvenance;
  ownerCompanyId?: string;
  tags: string[];
}

export interface SkillSearchInput {
  query: string;
  scope?: string;
  department?: string;
  capabilities?: string[];
  domain?: SkillDomain;
  companyId?: string;
  includeDeprecated?: boolean;
  limit?: number;
}

export interface SkillMatch {
  skill: SkillIndexEntry;
  score: number;
  reasons: string[];
}

export type SkillRegistryIssueKind =
  | "invalid-definition"
  | "duplicate-version"
  | "multiple-active-versions"
  | "missing-content"
  | "trigger-conflict";

export interface SkillRegistryIssue {
  kind: SkillRegistryIssueKind;
  severity: "warning" | "error";
  skillRefs: string[];
  detail: string;
}

export interface SkillRegistryHealth {
  ok: boolean;
  indexed: number;
  active: number;
  companySkills: number;
  harnessSkills: number;
  issues: SkillRegistryIssue[];
}

export interface LoadedSkill {
  manifest: SkillIndexEntry;
  body: string;
}

export type CompanySkillInstallationStatus = "active" | "paused" | "retired";
export type CompanySkillInstallationSource = "catalog" | "existing" | "company-local";

export interface CompanySkillInstallation {
  companyId: string;
  assetId: string;
  skillRef: string;
  department: string;
  scopes: string[];
  source: CompanySkillInstallationSource;
  status: CompanySkillInstallationStatus;
}

export interface ObservedCompanyProcess {
  id: string;
  name: string;
  department: string;
  description: string;
  capabilities: string[];
  triggers: string[];
  evidenceRefs: string[];
}

export interface CompanySkillInstallPlan {
  skillRef: string;
  department: string;
  reason: string;
  source: "catalog" | "existing";
}

export interface CompanySkillReusePlan {
  observedProcessId: string;
  skillRef: string;
  department: string;
  evidenceRefs: string[];
  reason: string;
}

export interface CompanySkillGap {
  capability: string;
  department: string;
  reason: string;
}

export interface CompanySkillCreationCandidate {
  id: string;
  name: string;
  department: string;
  description: string;
  triggers: string[];
  scopes: string[];
  capabilities: string[];
  evidenceRefs: string[];
  source: "gap" | "observed-process";
}

export interface CompanySkillBootstrapInput {
  companyId: string;
  mode: "new" | "existing";
  purpose: string;
  departments: string[];
  requiredCapabilities: string[];
  capabilityDepartments?: Record<string, string>;
  catalog: Array<SkillIndexEntry | SkillDefinition>;
  existingInstallations: CompanySkillInstallation[];
  observedProcesses: ObservedCompanyProcess[];
}

export interface CompanySkillBootstrapPlan {
  companyId: string;
  mode: "new" | "existing";
  install: CompanySkillInstallPlan[];
  reuse: CompanySkillReusePlan[];
  gaps: CompanySkillGap[];
  createCandidates: CompanySkillCreationCandidate[];
}
