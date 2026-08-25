import type { BusinessUnknown, DiscoveryRevision } from "../../contracts/src/index.js";
import type { BusinessSystemConnector, DiscoveredBusinessSystem } from "./business-system-connector.js";
import { projectBusinessSystemDiscoveries } from "./business-system-connector.js";
import { buildDiscoveryRevision } from "./company-discovery.js";

export type DiscoveryDecisionDomain = "organization" | "operations" | "economics" | "authority" | "customer" | "risk";

export interface OwnerQuestion {
  id: string;
  unknownId: string;
  question: string;
  category: string;
  priority: BusinessUnknown["priority"];
  rationale: string;
  affectedDecisionDomains: DiscoveryDecisionDomain[];
}

export interface DiscoveryOrchestrationResult {
  revision: DiscoveryRevision;
  questions: OwnerQuestion[];
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
  rationale: string;
  affectedDecisionDomains: DiscoveryDecisionDomain[];
  capabilityPrefixes?: string[];
  alwaysAsk?: boolean;
};

const CONCERNS: readonly Concern[] = [
  {
    id: "commercial-model",
    category: "commercial",
    priority: "high",
    question: "How does this company create revenue today, and which customer or demand flow is operationally critical?",
    rationale: "Revenue ownership and demand flow are needed before deciding commercial coverage or objectives.",
    affectedDecisionDomains: ["organization", "economics", "customer"],
    capabilityPrefixes: ["sales.", "crm.", "marketing.", "commerce.", "revenue.", "customer."],
  },
  {
    id: "financial-truth",
    category: "finance",
    priority: "high",
    question: "Which system or process is the source of truth for cash, revenue, costs, liabilities and financial reconciliation?",
    rationale: "The company cannot safely define financial ownership or urgency without knowing where financial truth lives.",
    affectedDecisionDomains: ["organization", "economics", "risk"],
    capabilityPrefixes: ["finance.", "accounting.", "billing.", "payments.", "ledger."],
  },
  {
    id: "delivery-model",
    category: "operations",
    priority: "high",
    question: "What must happen after demand is accepted for the company to actually deliver its promise, and where is that process tracked?",
    rationale: "Delivery flow determines operational capabilities, dependencies and ownership.",
    affectedDecisionDomains: ["organization", "operations", "customer"],
    capabilityPrefixes: ["operations.", "inventory.", "supplier.", "logistics.", "shipping.", "delivery.", "fulfillment."],
  },
  {
    id: "authority-boundaries",
    category: "governance",
    priority: "critical",
    question: "Which decisions may the company make automatically, which require approval, and what financial or irreversible actions are always reserved?",
    rationale: "Observed systems and workflows never imply permission. Authority must be explicitly provided by the owner or constitution.",
    affectedDecisionDomains: ["authority", "risk", "economics"],
    alwaysAsk: true,
  },
  {
    id: "organizational-ownership",
    category: "organization",
    priority: "high",
    question: "Who currently owns the major business functions and processes, including any existing departments, people or external providers that must be preserved?",
    rationale: "An existing company must preserve observed ownership before XanxitoSpA proposes new organizational coverage.",
    affectedDecisionDomains: ["organization", "operations", "authority"],
    alwaysAsk: true,
  },
] as const;

function capabilityCovered(capabilities: string[], concern: Concern): boolean {
  if (concern.alwaysAsk) return false;
  return capabilities.some((capability) => concern.capabilityPrefixes?.some((prefix) => capability.toLowerCase().startsWith(prefix)) ?? false);
}

function unknownFor(concern: Concern): BusinessUnknown {
  return {
    id: `unknown:${concern.id}`,
    question: concern.question,
    category: concern.category,
    priority: concern.priority,
    status: "open",
  };
}

function questionFor(concern: Concern): OwnerQuestion {
  return {
    id: `question:${concern.id}`,
    unknownId: `unknown:${concern.id}`,
    question: concern.question,
    category: concern.category,
    priority: concern.priority,
    rationale: concern.rationale,
    affectedDecisionDomains: [...concern.affectedDecisionDomains],
  };
}

function priorityRank(priority: BusinessUnknown["priority"]): number {
  return priority === "critical" ? 4 : priority === "high" ? 3 : priority === "normal" ? 2 : 1;
}

export class GenericDiscoveryOrchestrator {
  async run(input: DiscoveryOrchestratorInput, now = new Date()): Promise<DiscoveryOrchestrationResult> {
    if (input.prior && input.prior.companyId !== input.companyId) throw new Error("company mismatch in discovery orchestration");

    const discoveries: DiscoveredBusinessSystem[] = await Promise.all(input.connectors.map((connector) => connector.discover()));
    const projected = projectBusinessSystemDiscoveries({ companyId: input.companyId, discoveries, prior: input.prior ?? null }, now);
    const capabilityNames = projected.capabilities.map((item) => item.name.toLowerCase());
    const priorUnknowns = structuredClone(input.prior?.unknowns ?? []);
    const unknownById = new Map(priorUnknowns.map((unknown) => [unknown.id, unknown]));

    for (const concern of CONCERNS) {
      const id = `unknown:${concern.id}`;
      if (unknownById.has(id)) continue;
      if (!capabilityCovered(capabilityNames, concern)) unknownById.set(id, unknownFor(concern));
    }

    const unknowns = [...unknownById.values()].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));
    const facts = projected.facts.map(({ revisionId: _revisionId, ...fact }) => fact);
    const revision = buildDiscoveryRevision({
      companyId: input.companyId,
      parent: input.prior ?? null,
      evidence: projected.evidence,
      facts,
      unknowns,
      capabilities: projected.capabilities,
    }, now);

    const concernByUnknownId = new Map(CONCERNS.map((concern) => [`unknown:${concern.id}`, concern]));
    const questions = unknowns
      .filter((unknown) => unknown.status === "open")
      .map((unknown) => {
        const concern = concernByUnknownId.get(unknown.id);
        return concern ? questionFor(concern) : {
          id: `question:${unknown.id}`,
          unknownId: unknown.id,
          question: unknown.question,
          category: unknown.category,
          priority: unknown.priority,
          rationale: "This unresolved business unknown blocks a reliable operating-model decision.",
          affectedDecisionDomains: ["organization"] as DiscoveryDecisionDomain[],
        };
      })
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));

    const discoveryComplete = !unknowns.some((unknown) => unknown.status === "open" && (unknown.priority === "critical" || unknown.priority === "high"));
    return { revision, questions, discoveryComplete, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
  }
}
