import { createHash } from "node:crypto";
import type { AgentSubscription, CompanyConstitution, CompanyOperatingModelPlan, DiscoveryRevision, DurableObjective } from "../../contracts/src/index.js";

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "objective";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, canonicalize(obj[key])]));
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function subscriptionDefaults(criticality: string): Pick<AgentSubscription, "urgencyPolicy" | "threshold" | "accumulationWindowSeconds" | "accumulationCap"> {
  if (criticality === "critical") return {
    urgencyPolicy: { opportunityCostWeight: 0.7, actionWindowWeight: 0.3, defaultOpportunityCost: 0.8, defaultActionWindowMinutes: 30 },
    threshold: 0.65,
    accumulationWindowSeconds: 900,
    accumulationCap: 1,
  };
  if (criticality === "important") return {
    urgencyPolicy: { opportunityCostWeight: 0.65, actionWindowWeight: 0.35, defaultOpportunityCost: 0.5, defaultActionWindowMinutes: 120 },
    threshold: 0.75,
    accumulationWindowSeconds: 3600,
    accumulationCap: 1,
  };
  return {
    urgencyPolicy: { opportunityCostWeight: 0.6, actionWindowWeight: 0.4, defaultOpportunityCost: 0.25, defaultActionWindowMinutes: 480 },
    threshold: 0.85,
    accumulationWindowSeconds: 14_400,
    accumulationCap: 1,
  };
}

export function projectCompanyConstitution(input: {
  companyId: string;
  operatingModel: CompanyOperatingModelPlan;
  discovery?: DiscoveryRevision | null;
}): CompanyConstitution {
  if (input.operatingModel.companyId !== input.companyId) throw new Error("company mismatch in constitution projection");
  if (input.discovery && input.discovery.companyId !== input.companyId) throw new Error("company mismatch in constitution discovery");

  const durableObjectives: DurableObjective[] = input.operatingModel.objectives.map((statement, index) => ({
    id: `objective:${index + 1}:${slug(statement)}`,
    statement,
    owner: "executive",
    status: "active",
  }));
  const fallbackObjective = durableObjectives[0] ?? { id: "objective:company-health", statement: "Protect company health and continuity", owner: "executive" as const, status: "active" as const };
  const capabilities = input.discovery?.capabilities ?? [];
  const signalSources = capabilities.map((capability) => ({
    id: `signal:${capability.id}`,
    kind: "business-capability" as const,
    label: `Signals for ${capability.name}`,
    capabilityScopes: [capability.name],
    topics: [capability.name],
    urgency: capability.criticality === "critical" ? "critical" as const : capability.criticality === "important" ? "high" as const : "normal" as const,
    dedupeWindowSeconds: 300,
    debounceSeconds: 30,
    grantsAuthority: false as const,
  }));

  const subscriptions: AgentSubscription[] = capabilities.map((capability) => {
    const defaults = subscriptionDefaults(capability.criticality);
    return {
      id: `subscription:${capability.id}`,
      signalSourceId: `signal:${capability.id}`,
      targetDepartment: capability.preferredDepartmentHint && input.operatingModel.departments.some((department) => department.id === capability.preferredDepartmentHint)
        ? capability.preferredDepartmentHint
        : input.operatingModel.departments.find((department) => department.functions.includes("executive-strategy"))?.id ?? input.operatingModel.departments[0]?.id ?? "executive",
      targetRole: "department-supervisor",
      capabilityScopes: [capability.name],
      objectiveId: fallbackObjective.id,
      objective: fallbackObjective.statement,
      match: { topics: [capability.name], capabilityScopes: [capability.name] },
      ...defaults,
      wakeIntentOnly: true,
      grantsAuthority: false,
    };
  });

  const semantic = {
    schemaVersion: 1 as const,
    companyId: input.companyId,
    operatingModelFingerprint: input.operatingModel.fingerprint,
    discoveryRevisionId: input.discovery?.revisionId ?? null,
    durableObjectives,
    authorityBoundaries: [
      { id: "authority:discovery", subject: "company-discovery", rule: "Discovery is descriptive and cannot grant authority, budget, credentials or execution rights.", reserved: true },
      { id: "authority:signals", subject: "signals-and-subscriptions", rule: "Signals may create attention or wake intent only; execution requires the governed Work/authority path.", reserved: true },
    ],
    reservedActions: ["financial-authority", "identity", "contract", "reserved-action"],
    escalationRules: [{ id: "escalation:reserved", condition: "reserved-action", target: "executive", required: true }],
    signalSources,
    subscriptions,
    grantsAuthority: false as const,
    grantsBudget: false as const,
    grantsCapabilities: false as const,
    executesWork: false as const,
  };

  return { ...semantic, fingerprint: fingerprint(semantic) };
}
