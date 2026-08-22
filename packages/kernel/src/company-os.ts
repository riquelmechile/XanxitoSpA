import { createHash, randomUUID } from "node:crypto";
import type {
  BootstrapPlan,
  CompanyAsset,
  CompanyIntakeInput,
  CompanyOperatingModelPlan,
  CompanyOperatingModelSnapshot,
  CompanySkillInstallation,
  CoreBusinessFunction,
  DepartmentBlueprint,
  ObservedCompanyProcess,
  ProcessBlueprint,
  SkillDefinition,
  SkillIndexEntry,
} from "../../contracts/src/index.js";
import { planCompanyBootstrap } from "./bootstrap.js";
import { planCompanySkillBootstrap } from "./company-skills.js";

export const CORE_BUSINESS_FUNCTIONS: readonly CoreBusinessFunction[] = [
  "executive-strategy",
  "commercial-revenue",
  "finance",
  "operations",
  "customer",
  "administration-risk",
] as const;

const CORE_DEPARTMENT: Record<CoreBusinessFunction, { id: string; name: string; responsibilities: string[]; kpis: string[] }> = {
  "executive-strategy": { id: "executive", name: "Executive & Strategy", responsibilities: ["Set priorities and adjudicate cross-company decisions"], kpis: ["objective-progress"] },
  "commercial-revenue": { id: "commercial", name: "Commercial & Revenue", responsibilities: ["Create sustainable revenue and manage demand"], kpis: ["revenue", "contribution-margin"] },
  finance: { id: "finance", name: "Finance", responsibilities: ["Protect cash, budgets and financial truth"], kpis: ["cash", "margin", "budget-variance"] },
  operations: { id: "operations", name: "Operations", responsibilities: ["Deliver the company promise reliably"], kpis: ["delivery-quality", "cycle-time"] },
  customer: { id: "customer", name: "Customer", responsibilities: ["Protect customer outcomes and retention"], kpis: ["customer-outcome", "retention"] },
  "administration-risk": { id: "administration-risk", name: "Administration & Risk", responsibilities: ["Maintain governance, obligations and operational risk controls"], kpis: ["incidents", "obligation-health"] },
};

const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;

export interface CompanyOperatingModelPlannerInput {
  companyId: string;
  intake: CompanyIntakeInput;
  existingAssets: CompanyAsset[];
  catalog: Array<SkillDefinition | SkillIndexEntry>;
  existingInstallations: CompanySkillInstallation[];
}

function clean(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "company-function";
}

function title(value: string): string {
  return value.split(/[-_.:/\s]+/g).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function assertText(value: string, name: string, max = 4000): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`${name} invalid`);
  return trimmed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, canonicalize(obj[key])]));
}

function semanticBootstrap(plan: BootstrapPlan): unknown {
  const semanticStepById = new Map(plan.steps.map((step) => [step.id, [step.requirementId, step.action, step.capability].join(":")]));
  return {
    companyId: plan.companyId,
    mode: plan.mode,
    reusedAssetIds: [...plan.reusedAssetIds].sort(),
    requestedCapabilities: [...plan.requestedCapabilities].sort(),
    approvalBoundaries: plan.approvalBoundaries.map((item) => ({ ...item })).sort((a, b) => a.requirementId.localeCompare(b.requirementId)),
    steps: plan.steps.map((step) => ({
      action: step.action,
      requirementId: step.requirementId,
      capability: step.capability,
      assetId: step.assetId ?? null,
      providerId: step.providerId ?? null,
      approvalRequired: step.approvalRequired,
      approvalReason: step.approvalReason ?? null,
      dependsOn: step.dependsOn.map((dependencyId) => {
        const dependency = semanticStepById.get(dependencyId);
        if (!dependency) throw new Error("bootstrap semantic dependency missing:" + dependencyId);
        return dependency;
      }).sort(),
    })),
  };
}

export function fingerprintCompanyOperatingModel(plan: Omit<CompanyOperatingModelPlan, "fingerprint">): string {
  const semantic = {
    ...plan,
    bootstrapPlan: semanticBootstrap(plan.bootstrapPlan),
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(semantic))).digest("hex");
}

function departmentForCapability(capability: string, departments: DepartmentBlueprint[], processHints: Map<string, string>, requirements: CompanyIntakeInput["bootstrapRequirements"]): string {
  const hinted = processHints.get(capability) ?? requirements?.find((item) => item.capability === capability)?.department;
  if (hinted && departments.some((department) => department.id === hinted)) return hinted;
  const lower = capability.toLowerCase();
  const fn: CoreBusinessFunction = lower.startsWith("finance.") || lower.startsWith("billing.") || lower.startsWith("accounting.") ? "finance"
    : lower.startsWith("crm.") || lower.startsWith("sales.") || lower.startsWith("marketing.") || lower === "email.send" ? "commercial-revenue"
      : lower.startsWith("inventory.") || lower.startsWith("supplier.") || lower.startsWith("logistics.") || lower.startsWith("shipping.") ? "operations"
        : lower.startsWith("customer.") || lower.startsWith("support.") ? "customer"
          : "executive-strategy";
  return departments.find((department) => department.functions.includes(fn))?.id ?? departments[0]?.id ?? "executive";
}

function buildDepartments(intake: CompanyIntakeInput): { departments: DepartmentBlueprint[]; readinessGaps: string[] } {
  const departments = new Map<string, DepartmentBlueprint>();
  const readinessGaps: string[] = [];

  if (intake.mode === "existing") {
    for (const observed of intake.observedDepartments ?? []) {
      const id = assertText(observed.id, "observed department id", 120);
      if (departments.has(id)) throw new Error(`duplicate observed department id:${id}`);
      departments.set(id, {
        id,
        name: assertText(observed.name, `observed department ${id} name`, 200),
        functions: clean(observed.functions),
        responsibilities: clean(observed.responsibilities),
        kpis: clean(observed.kpis),
        disposition: "preserve",
        evidenceRefs: clean(observed.evidenceRefs),
      });
    }
  }

  for (const proposed of intake.proposedDepartments ?? []) {
    const id = assertText(proposed.id, "proposed department id", 120);
    const existing = departments.get(id);
    if (existing) {
      existing.functions = clean([...existing.functions, ...proposed.functions]);
      existing.responsibilities = clean([...existing.responsibilities, ...proposed.responsibilities]);
      existing.kpis = clean([...existing.kpis, ...proposed.kpis]);
      existing.disposition = "extend";
      continue;
    }
    departments.set(id, {
      id,
      name: assertText(proposed.name, `proposed department ${id} name`, 200),
      functions: clean(proposed.functions),
      responsibilities: clean(proposed.responsibilities),
      kpis: clean(proposed.kpis),
      disposition: "create",
      evidenceRefs: [],
    });
  }

  const requiredFunctions = clean([...CORE_BUSINESS_FUNCTIONS, ...(intake.requiredFunctions ?? [])]);
  for (const fn of requiredFunctions) {
    if ([...departments.values()].some((department) => department.functions.includes(fn))) continue;
    const core = CORE_DEPARTMENT[fn as CoreBusinessFunction];
    const id = core?.id ?? slug(fn);
    const existing = departments.get(id);
    if (existing) {
      existing.functions = clean([...existing.functions, fn]);
      existing.disposition = existing.disposition === "preserve" ? "extend" : existing.disposition;
    } else {
      departments.set(id, {
        id,
        name: core?.name ?? title(fn),
        functions: [fn],
        responsibilities: core?.responsibilities ?? [`Own the ${title(fn)} business function`],
        kpis: core?.kpis ?? [`${slug(fn)}-outcome`],
        disposition: "create",
        evidenceRefs: [],
      });
    }
    if (intake.mode === "existing") readinessGaps.push(`uncovered business function requires new coverage: ${fn}`);
  }

  if (departments.size === 0) throw new Error("company operating model requires departments");
  return { departments: [...departments.values()], readinessGaps };
}

function buildProcesses(intake: CompanyIntakeInput, departments: DepartmentBlueprint[]): ProcessBlueprint[] {
  const validDepartments = new Set(departments.map((department) => department.id));
  const processes = new Map<string, ProcessBlueprint>();

  if (intake.mode === "existing") {
    for (const observed of intake.observedProcesses ?? []) {
      if (!validDepartments.has(observed.department)) throw new Error(`observed process department not mapped:${observed.department}`);
      if (processes.has(observed.id)) throw new Error(`duplicate observed process id:${observed.id}`);
      processes.set(observed.id, {
        id: assertText(observed.id, "observed process id", 120),
        name: assertText(observed.name, `observed process ${observed.id} name`, 200),
        department: observed.department,
        objective: `Preserve, understand and verify ${observed.name}`,
        description: assertText(observed.description, `observed process ${observed.id} description`, 2000),
        triggers: clean(observed.triggers),
        requiredSkills: [],
        requiredCapabilities: clean(observed.capabilities),
        disposition: "preserve",
        evidenceRefs: clean(observed.evidenceRefs),
      });
    }
  }

  for (const proposed of intake.proposedProcesses ?? []) {
    if (!validDepartments.has(proposed.department)) throw new Error(`proposed process department not mapped:${proposed.department}`);
    const existing = processes.get(proposed.id);
    if (existing) {
      if (existing.department !== proposed.department) throw new Error(`process department conflict:${proposed.id}`);
      existing.objective = assertText(proposed.objective, `proposed process ${proposed.id} objective`, 1000);
      existing.requiredSkills = clean([...existing.requiredSkills, ...proposed.requiredSkills]);
      existing.requiredCapabilities = clean([...existing.requiredCapabilities, ...proposed.requiredCapabilities]);
      existing.triggers = clean([...existing.triggers, ...proposed.triggers]);
      existing.evidenceRefs = clean([...existing.evidenceRefs, ...proposed.evidenceRefs]);
      existing.disposition = "map";
      continue;
    }
    processes.set(proposed.id, {
      id: assertText(proposed.id, "proposed process id", 120),
      name: assertText(proposed.name, `proposed process ${proposed.id} name`, 200),
      department: proposed.department,
      objective: assertText(proposed.objective, `proposed process ${proposed.id} objective`, 1000),
      description: assertText(proposed.description, `proposed process ${proposed.id} description`, 2000),
      triggers: clean(proposed.triggers),
      requiredSkills: clean(proposed.requiredSkills),
      requiredCapabilities: clean(proposed.requiredCapabilities),
      disposition: "create",
      evidenceRefs: clean(proposed.evidenceRefs),
    });
  }

  return [...processes.values()];
}

function observedProcessesForSkills(intake: CompanyIntakeInput): ObservedCompanyProcess[] {
  return (intake.mode === "existing" ? intake.observedProcesses ?? [] : []).map((process) => ({ ...process, capabilities: clean(process.capabilities), triggers: clean(process.triggers), evidenceRefs: clean(process.evidenceRefs) }));
}

export function planCompanyOperatingModel(input: CompanyOperatingModelPlannerInput): CompanyOperatingModelPlan {
  const purpose = assertText(input.intake.purpose, "company purpose", 2000);
  const businessModel = assertText(input.intake.businessModel, "business model", 2000);
  const jurisdiction = assertText(input.intake.jurisdiction, "jurisdiction", 120);
  const timezone = assertText(input.intake.timezone, "timezone", 120);
  const objectives = clean(input.intake.objectives);
  if (objectives.length === 0) throw new Error("company objectives required");

  const { departments, readinessGaps } = buildDepartments(input.intake);
  const processes = buildProcesses(input.intake, departments);
  const processHints = new Map<string, string>();
  for (const process of processes) for (const capability of process.requiredCapabilities) if (!processHints.has(capability)) processHints.set(capability, process.department);
  const requiredCapabilities = clean([
    ...(input.intake.requiredCapabilities ?? []),
    ...processes.flatMap((process) => process.requiredCapabilities),
    ...(input.intake.bootstrapRequirements ?? []).map((requirement) => requirement.capability),
  ]);
  const requiredSkills = clean(processes.flatMap((process) => process.requiredSkills));
  const capabilityDepartments = Object.fromEntries(requiredCapabilities.map((capability) => [capability, departmentForCapability(capability, departments, processHints, input.intake.bootstrapRequirements)]));
  const sameCompanyAssets = input.existingAssets.filter((asset) => asset.companyId === input.companyId);

  const skillPlan = planCompanySkillBootstrap({
    companyId: input.companyId,
    mode: input.intake.mode,
    purpose,
    departments: departments.map((department) => department.id),
    requiredCapabilities,
    capabilityDepartments,
    catalog: input.catalog,
    existingInstallations: input.existingInstallations,
    observedProcesses: observedProcessesForSkills(input.intake),
  });
  const bootstrapPlan = planCompanyBootstrap({
    companyId: input.companyId,
    mode: input.intake.mode,
    requirements: input.intake.bootstrapRequirements ?? [],
    existingAssets: sameCompanyAssets,
    autonomousCapabilities: [],
  });

  const withoutFingerprint: Omit<CompanyOperatingModelPlan, "fingerprint"> = {
    schemaVersion: 1,
    companyId: input.companyId,
    mode: input.intake.mode,
    lifecycleMode: "bootstrap",
    purpose,
    businessModel,
    jurisdiction,
    timezone,
    objectives,
    departments,
    processes,
    requiredCapabilities,
    requiredSkills,
    readinessGaps,
    skillPlan,
    bootstrapPlan,
    recommendedWork: {
      owner: "executive",
      objective: input.intake.mode === "new" ? `Form and launch Company: ${purpose}` : `Adopt and establish trusted baseline for Company: ${purpose}`,
      scope: `company-bootstrap:${input.intake.mode}:${input.companyId}`,
    },
  };
  return { ...withoutFingerprint, fingerprint: fingerprintCompanyOperatingModel(withoutFingerprint) };
}

export function createCompanyOperatingModelAsset(input: { companyId: string; formationId: string; plan: CompanyOperatingModelPlan }, now = new Date()): CompanyAsset {
  if (input.plan.companyId !== input.companyId) throw new Error("company mismatch in operating model plan");
  const snapshot: CompanyOperatingModelSnapshot = { ...structuredClone(input.plan), formationId: input.formationId, appliedAt: now.toISOString() };
  if (SECRET_LIKE.test(JSON.stringify(snapshot))) throw new Error("company operating model contains secret-like material");
  return {
    id: randomUUID(),
    companyId: input.companyId,
    kind: "company-operating-model",
    capability: "company.operate",
    department: "executive",
    cost: 0,
    currency: "XXX",
    status: "active",
    grantRefs: [],
    restrictions: ["company-internal", "no-authority-grant", "no-budget-grant", "no-capability-grant"],
    metadata: { schemaVersion: 1, formationId: input.formationId, fingerprint: input.plan.fingerprint, mode: input.plan.mode, snapshot },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function companyOperatingModelFromAsset(asset: CompanyAsset): CompanyOperatingModelSnapshot {
  if (asset.kind !== "company-operating-model") throw new Error("asset is not a company operating model");
  const raw = asset.metadata.snapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("company operating model snapshot missing");
  const snapshot = structuredClone(raw) as CompanyOperatingModelSnapshot;
  if (snapshot.companyId !== asset.companyId) throw new Error("company mismatch in operating model asset");
  if (snapshot.formationId !== asset.metadata.formationId) throw new Error("operating model formation id mismatch");
  if (snapshot.fingerprint !== asset.metadata.fingerprint) throw new Error("operating model fingerprint mismatch");
  return snapshot;
}
