import type { BusinessUnknown, DiscoveryResolutionRequirement, DiscoveryRevision } from "../../contracts/src/index.js";
import type { BusinessSystemConnector, DiscoveredBusinessSystem } from "./business-system-connector.js";
import { projectBusinessSystemDiscoveries } from "./business-system-connector.js";
import { buildDiscoveryRevision } from "./company-discovery.js";

export type DiscoveryDecisionDomain = "organization" | "operations" | "economics" | "authority" | "customer" | "risk";
export type DiscoveryScopeId = "governance" | "commercial" | "finance" | "operations" | "organization" | string;

export interface OwnerQuestion {
  id: string;
  unknownId: string;
  question: string;
  category: string;
  priority: BusinessUnknown["priority"];
  rationale: string;
  affectedDecisionDomains: DiscoveryDecisionDomain[];
  resolutionRequirement: DiscoveryResolutionRequirement;
  candidateEvidenceRefs: string[];
}

export interface DiscoveryScopeReadiness {
  scope: DiscoveryScopeId;
  sufficient: boolean;
  blockerIds: string[];
  confidence: number;
}

export interface DiscoveryOrchestrationResult {
  revision: DiscoveryRevision;
  questions: OwnerQuestion[];
  readiness: DiscoveryScopeReadiness[];
  discoveryComplete: boolean;
  grantsAuthority: false;
  grantsBudget: false;
  grantsCapabilities: false;
  executesWork: false;
}

export interface DiscoveryOrchestratorInput {
  companyId: string;
  connectors: BusinessSystemConnector[];
  prior?: DiscoveryRevision | null;
}

type Concern = {
  id: string;
  category: string;
  priority: BusinessUnknown["priority"];
  question: string;
  confirmationQuestion?: string;
  rationale: string;
  affectedDecisionDomains: DiscoveryDecisionDomain[];
  scopes: DiscoveryScopeId[];
  resolutionRequirement: DiscoveryResolutionRequirement;
  capabilityPrefixes?: string[];
  alwaysAsk?: boolean;
};

const CONCERNS: readonly Concern[] = [
  {
    id: "commercial-model", category: "commercial", priority: "high",
    question: "How does this company create revenue today, and which customer or demand flow is operationally critical?",
    confirmationQuestion: "I detected systems that observe commercial or customer flow. Which of these actually represents how the company creates revenue today, and which demand flow is operationally critical?",
    rationale: "Observed commercial systems are evidence of activity, not proof of the revenue model or business-critical flow.",
    affectedDecisionDomains: ["organization", "economics", "customer"], scopes: ["commercial", "organization"],
    resolutionRequirement: "owner-confirmation",
    capabilityPrefixes: ["sales.", "crm.", "marketing.", "commerce.", "revenue.", "customer."],
  },
  {
    id: "financial-truth", category: "finance", priority: "high",
    question: "Which system or process is the source of truth for cash, revenue, costs, liabilities and financial reconciliation?",
    confirmationQuestion: "I detected a finance/accounting system. Is it actually the trusted and current source of truth for cash, revenue, costs, liabilities and reconciliation?",
    rationale: "Existence of a ledger is not evidence that it is current, reconciled, trusted or authoritative.",
    affectedDecisionDomains: ["organization", "economics", "risk"], scopes: ["finance"],
    resolutionRequirement: "owner-confirmation",
    capabilityPrefixes: ["finance.", "accounting.", "billing.", "payments.", "ledger."],
  },
  {
    id: "delivery-model", category: "operations", priority: "high",
    question: "What must happen after demand is accepted for the company to actually deliver its promise, and where is that process tracked?",
    confirmationQuestion: "I detected operational/delivery systems. Which of these tracks the actual end-to-end delivery promise, and what steps still happen outside it?",
    rationale: "Operational tooling can reveal steps, but does not prove the complete delivery model or ownership.",
    affectedDecisionDomains: ["organization", "operations", "customer"], scopes: ["operations", "organization"],
    resolutionRequirement: "owner-confirmation",
    capabilityPrefixes: ["operations.", "inventory.", "supplier.", "logistics.", "shipping.", "delivery.", "fulfillment."],
  },
  {
    id: "authority-boundaries", category: "governance", priority: "critical",
    question: "Which decisions may the company make automatically, which require approval, and what financial or irreversible actions are always reserved?",
    rationale: "Observed systems and workflows never imply permission. Authority must come from a verified constitutional mandate.",
    affectedDecisionDomains: ["authority", "risk", "economics"], scopes: ["governance", "organization"],
    resolutionRequirement: "constitutional-mandate", alwaysAsk: true,
  },
  {
    id: "organizational-ownership", category: "organization", priority: "high",
    question: "Who currently owns the major business functions and processes, including any existing departments, people or external providers that must be preserved?",
    rationale: "An existing company must preserve observed ownership before XanxitoSpA proposes new organizational coverage.",
    affectedDecisionDomains: ["organization", "operations", "authority"], scopes: ["organization"],
    resolutionRequirement: "owner-confirmation", alwaysAsk: true,
  },
  {
    id: "system-observability", category: "systems", priority: "low",
    question: "Which business systems can be inspected to establish evidence about the company?",
    rationale: "System existence is an evidence-only question and can be resolved by successful connector description.",
    affectedDecisionDomains: ["operations"], scopes: ["operations", "commercial", "finance"],
    resolutionRequirement: "evidence", capabilityPrefixes: [""],
  },
] as const;

function matchingCapabilityNames(capabilities: string[], concern: Concern): string[] {
  if (concern.alwaysAsk || !concern.capabilityPrefixes?.length) return [];
  return capabilities.filter((capability) => concern.capabilityPrefixes!.some((prefix) => capability.toLowerCase().startsWith(prefix)));
}

function lowerPriority(priority: BusinessUnknown["priority"]): BusinessUnknown["priority"] {
  return priority === "critical" ? "high" : priority === "high" ? "normal" : priority === "normal" ? "low" : "low";
}

function requirementForUnknown(unknown: BusinessUnknown): DiscoveryResolutionRequirement {
  if (unknown.resolutionRequirement) return unknown.resolutionRequirement;
  if (unknown.category === "governance") return "constitutional-mandate";
  if (unknown.category === "finance" || unknown.category === "organization") return "owner-confirmation";
  return "operator-confirmation";
}

function priorityRank(priority: BusinessUnknown["priority"]): number {
  return priority === "critical" ? 4 : priority === "high" ? 3 : priority === "normal" ? 2 : 1;
}

function unknownFor(concern: Concern, matched: string[]): BusinessUnknown {
  return {
    id: `unknown:${concern.id}`,
    question: matched.length > 0 && concern.confirmationQuestion ? concern.confirmationQuestion : concern.question,
    category: concern.category,
    priority: matched.length > 0 && concern.resolutionRequirement !== "evidence" ? lowerPriority(concern.priority) : concern.priority,
    status: "open",
    resolutionRequirement: concern.resolutionRequirement,
  };
}

function evidenceRefsForCapabilities(revision: DiscoveryRevision, names: string[]): string[] {
  const set = new Set(names);
  return [...new Set(revision.capabilities.filter((capability) => set.has(capability.name.toLowerCase())).flatMap((capability) => capability.evidenceRefs))];
}

function concernScopes(unknown: BusinessUnknown): DiscoveryScopeId[] {
  const concern = CONCERNS.find((item) => `unknown:${item.id}` === unknown.id);
  if (concern) return [...concern.scopes];
  return [unknown.category || "organization"];
}

export function evaluateDiscoveryReadiness(revision: DiscoveryRevision, scopes?: DiscoveryScopeId[]): DiscoveryScopeReadiness[] {
  const requested = scopes?.length ? [...new Set(scopes)] : ["governance", "commercial", "finance", "operations", "organization"];
  return requested.map((scope) => {
    const blockers = revision.unknowns.filter((unknown) => unknown.status === "open" && concernScopes(unknown).includes(scope));
    const penalty = blockers.reduce((sum, unknown) => sum + priorityRank(unknown.priority), 0);
    return {
      scope,
      sufficient: blockers.length === 0,
      blockerIds: blockers.map((unknown) => unknown.id).sort(),
      confidence: blockers.length === 0 ? 1 : Math.max(0, Number((1 - Math.min(1, penalty / 12)).toFixed(3))),
    };
  });
}

export class GenericDiscoveryOrchestrator {
  async run(input: DiscoveryOrchestratorInput, now = new Date()): Promise<DiscoveryOrchestrationResult> {
    if (input.prior && input.prior.companyId !== input.companyId) throw new Error("company mismatch in discovery orchestration");

    const discoveries: DiscoveredBusinessSystem[] = await Promise.all(input.connectors.map((connector) => connector.describe()));
    const projected = projectBusinessSystemDiscoveries({ companyId: input.companyId, discoveries, prior: input.prior ?? null }, now);
    const capabilityNames = projected.capabilities.map((item) => item.name.toLowerCase());
    const priorUnknowns = structuredClone(input.prior?.unknowns ?? []);
    const unknownById = new Map(priorUnknowns.map((unknown) => [unknown.id, unknown]));

    for (const concern of CONCERNS) {
      const id = `unknown:${concern.id}`;
      const matched = matchingCapabilityNames(capabilityNames, concern);
      const existing = unknownById.get(id);
      if (existing && existing.status !== "open") continue;
      if (concern.resolutionRequirement === "evidence" && matched.length > 0) {
        const evidenceRefs = evidenceRefsForCapabilities(projected, matched);
        unknownById.set(id, {
          ...(existing ?? unknownFor(concern, matched)),
          question: concern.question,
          category: concern.category,
          priority: concern.priority,
          status: "resolved",
          resolutionRequirement: "evidence",
          resolutionRef: evidenceRefs[0] ?? `connector:${matched[0]}`,
        });
        continue;
      }
      const next = unknownFor(concern, matched);
      unknownById.set(id, existing ? { ...existing, question: next.question, category: next.category, priority: next.priority, resolutionRequirement: concern.resolutionRequirement } : next);
    }

    const unknowns = [...unknownById.values()].map((unknown) => ({ ...unknown, resolutionRequirement: requirementForUnknown(unknown) }))
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));
    const facts = projected.facts.map(({ revisionId: _revisionId, ...fact }) => fact);
    const revision = buildDiscoveryRevision({ companyId: input.companyId, parent: input.prior ?? null, evidence: projected.evidence, facts, unknowns, capabilities: projected.capabilities }, now);

    const concernByUnknownId = new Map(CONCERNS.map((concern) => [`unknown:${concern.id}`, concern]));
    const questions = unknowns.filter((unknown) => unknown.status === "open").map((unknown) => {
      const concern = concernByUnknownId.get(unknown.id);
      const matched = concern ? matchingCapabilityNames(capabilityNames, concern) : [];
      return {
        id: `question:${unknown.id.replace(/^unknown:/, "")}`,
        unknownId: unknown.id,
        question: unknown.question,
        category: unknown.category,
        priority: unknown.priority,
        rationale: concern?.rationale ?? "This unresolved business unknown blocks a reliable scoped operating decision.",
        affectedDecisionDomains: concern ? [...concern.affectedDecisionDomains] : ["organization"],
        resolutionRequirement: requirementForUnknown(unknown),
        candidateEvidenceRefs: evidenceRefsForCapabilities(revision, matched),
      } satisfies OwnerQuestion;
    }).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));

    const readiness = evaluateDiscoveryReadiness(revision);
    const discoveryComplete = readiness.every((item) => item.sufficient);
    return { revision, questions, readiness, discoveryComplete, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
  }
}
