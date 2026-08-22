import { randomUUID } from "node:crypto";
import type { SkillDefinition } from "../../contracts/src/index.js";
import { SkillRegistry } from "../../kernel/src/skill-registry.js";
import { EnvironmentXspaAppOperations } from "../../../apps/mcp/src/runtime.js";
import { InMemoryCompanyStore } from "../../database/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";

interface GymCase { name: string; ok: boolean; detail: string }

async function runCase(name: string, fn: () => Promise<void>): Promise<GymCase> {
  try { await fn(); return { name, ok: true, detail: "pass" }; }
  catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export async function runXspaAppRuntimeGym(): Promise<GymCase[]> {
  const cases: GymCase[] = [];

  cases.push(await runCase("app MCP Work is Company-scoped, idempotent and grants no authority", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    const workId = randomUUID();
    const input = { workId, owner: "executive", objective: "Test governed Work creation", scope: "sandbox" };
    const context = { principal: "app-user", scopes: ["xspa.write"] };
    const first = await ops.workCreate(input, context) as { status?: string; grantsAuthority?: boolean; grantsBudget?: boolean };
    const second = await ops.workCreate(input, context) as { status?: string };
    expect(first.status === "created" && second.status === "created", "Work replay was not idempotent");
    expect(first.grantsAuthority === false && first.grantsBudget === false, "Work creation implicitly granted authority or budget");
    const stored = await workStore.getWork(companyId, workId);
    expect(stored?.companyId === companyId && stored.objective === input.objective, "Work was not persisted in deployment Company scope");
    let conflict = false;
    try { await ops.workCreate({ ...input, objective: "Changed objective under same Work id" }, context); }
    catch (error) { conflict = error instanceof Error && error.message.includes("IDEMPOTENCY_CONFLICT"); }
    expect(conflict, "changed Work payload reused identity without conflict");
  }));

  cases.push(await runCase("app MCP Work lookup cannot cross Company boundary", async () => {
    const companyA = randomUUID();
    const companyB = randomUUID();
    const runtimeA = new InMemoryRuntimeStore();
    const runtimeB = new InMemoryRuntimeStore();
    const sharedWorks = new InMemoryCompanyStore();
    const workId = randomUUID();
    const opsA = new EnvironmentXspaAppOperations({ store: runtimeA, workStore: sharedWorks, companyId: companyA, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    const opsB = new EnvironmentXspaAppOperations({ store: runtimeB, workStore: sharedWorks, companyId: companyB, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    await opsA.workCreate({ workId, owner: "executive", objective: "Company A only", scope: "private" }, { principal: "a", scopes: ["xspa.write"] });
    const visibleA = await opsA.workGet(workId, { principal: "a", scopes: ["xspa.read"] }) as { state?: string };
    const visibleB = await opsB.workGet(workId, { principal: "b", scopes: ["xspa.read"] }) as { state?: string };
    expect(visibleA.state === "found" && visibleB.state === "not-found", "Work lookup crossed Company boundary");
  }));

  cases.push(await runCase("app MCP creative submission is server-Company scoped", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const ops = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: true, kastConfigured: true });
    const missionId = randomUUID();
    await ops.creativeSubmit({
      missionId,
      workId: randomUUID(),
      briefRef: "brief:app",
      evidenceSnapshotRef: "evidence:app",
      candidateCount: 2,
      requiredSuccessfulCandidates: 1,
      executiveEscalationRequired: false,
    }, { principal: "test-user", scopes: ["xspa.write"] });
    const job = store.jobs.get(`${companyId}:${missionId}`);
    expect(job?.companyId === companyId && job.kind === "creative.mission", "app creative mission escaped server Company scope");
  }));

  cases.push(await runCase("app KAST reflection is idempotent and payload-conflict safe", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const ops = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    const reflectionId = randomUUID();
    const base = {
      reflectionId,
      sessionRef: "session:test",
      mode: "improve" as const,
      category: "friction" as const,
      severity: "medium" as const,
      summary: "Repeated manual step should become a tested harness primitive.",
      evidenceRefs: ["trace:1"],
      recurrence: 3,
      affectedSurfaces: ["developer-experience"],
      strategyOverlays: ["simplify-first", "reliability-first"],
    };
    const context = { principal: "test-user", scopes: ["xspa.write"] };
    const first = await ops.kastReflect(base, context) as { status?: string };
    const second = await ops.kastReflect(base, context) as { status?: string };
    expect(first.status === "queued" && second.status === "queued", "same KAST reflection did not replay safely");
    let conflict = false;
    try { await ops.kastReflect({ ...base, summary: "Changed payload under the same reflection identity." }, context); }
    catch (error) { conflict = error instanceof Error && error.message.includes("IDEMPOTENCY_CONFLICT"); }
    expect(conflict, "changed KAST payload reused reflection identity without conflict");
  }));

  cases.push(await runCase("app KAST rejects secret-like material in every free-form reflection field", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    let rejected = false;
    try {
      await ops.kastReflect({
        reflectionId: randomUUID(), sessionRef: "session:safe", mode: "remember", category: "friction", severity: "low",
        summary: "Safe summary", evidenceRefs: ["token=secret-material-123456"], recurrence: 1, affectedSurfaces: ["developer-experience"], strategyOverlays: [],
      }, { principal: "test-user", scopes: ["xspa.write"] });
    } catch (error) { rejected = error instanceof Error && error.message.includes("secret-like"); }
    expect(rejected, "KAST accepted secret-like material through evidence refs");
  }));

  cases.push(await runCase("app KAST constitutional improve returns founder-required without job", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const ops = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true });
    const reflectionId = randomUUID();
    const result = await ops.kastReflect({
      reflectionId,
      sessionRef: "session:constitutional",
      mode: "improve",
      category: "opportunity",
      severity: "high",
      summary: "Consider changing the model-law policy.",
      evidenceRefs: ["design:proposal"],
      recurrence: 1,
      affectedSurfaces: ["model-law"],
      strategyOverlays: [],
    }, { principal: "test-user", scopes: ["xspa.write"] }) as { status?: string; queued?: boolean };
    expect(result.status === "founder-required" && result.queued === false, "constitutional app KAST request was not stopped");
    expect(!store.jobs.has(`${companyId}:${reflectionId}`), "constitutional KAST request created automatic improvement job");
  }));

  cases.push(await runCase("app reusable Company skill install gates execution and progressive disclosure without granting capabilities", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const definition: SkillDefinition = { schemaVersion: 1, id: "sales-followup", name: "Sales Follow-up", version: "1.0.0", domain: "company", status: "active", description: "Follow up commercial leads", triggers: ["follow up lead"], scopes: ["commercial.sales"], capabilities: ["email.send"], defaultDepartments: ["commercial"], contentRef: "file:skills/sales-followup/SKILL.md", risk: "medium", provenance: "project" };
    const registry = new SkillRegistry([definition], { exists: async () => true, read: async () => "# Sales Follow-up\nFull company instructions" });
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const before = await ops.skillsSearch({ query: "follow up lead", department: "commercial", capabilities: ["email.send"], limit: 8 }, { principal: "sales-user", scopes: ["xspa.read"] }) as { installedMatches?: unknown[]; catalogSuggestions?: Array<{ skill?: { id?: string } }> };
    expect(before.installedMatches?.length === 0 && before.catalogSuggestions?.[0]?.skill?.id === "sales-followup", "uninstalled catalog skill was executable or not discoverable");
    const beforeGet = await ops.skillGet({ skillId: "sales-followup" }, { principal: "sales-user", scopes: ["xspa.read"] }) as { state?: string };
    expect(beforeGet.state === "not-installed", "uninstalled skill body was disclosed for execution");
    const installationId = randomUUID();
    const installed = await ops.skillInstall({ installationId, skillRef: "skill://sales-followup@1.0.0", department: "commercial", scopes: ["commercial.sales"] }, { principal: "sales-user", scopes: ["xspa.write"] }) as { status?: string; grantsCapabilities?: boolean; grantsAuthority?: boolean };
    const replay = await ops.skillInstall({ installationId, skillRef: "skill://sales-followup@1.0.0", department: "commercial", scopes: ["commercial.sales"] }, { principal: "sales-user", scopes: ["xspa.write"] }) as { installationId?: string };
    expect(installed.status === "installed" && installed.grantsCapabilities === false && installed.grantsAuthority === false && replay.installationId === installationId, "skill install was not idempotent or granted execution authority");
    const after = await ops.skillsSearch({ query: "follow up lead", department: "commercial", capabilities: ["email.send"], limit: 8 }, { principal: "sales-user", scopes: ["xspa.read"] }) as { installedMatches?: Array<{ skill?: { id?: string } }> };
    expect(after.installedMatches?.[0]?.skill?.id === "sales-followup", "installed skill was not eligible for Company matching");
    const loaded = await ops.skillGet({ skillId: "sales-followup" }, { principal: "sales-user", scopes: ["xspa.read"] }) as { state?: string; skill?: { body?: string } };
    expect(loaded.state === "found" && loaded.skill?.body?.includes("Full company instructions"), "installed skill did not progressive-load its body");
    let collisionBlocked = false;
    try { await ops.autoskillPropose({ proposalId: randomUUID(), skillId: "sales-followup", name: "Local Sales Follow-up", description: "Would shadow global skill", instructions: "Do not allow this collision.", department: "commercial", triggers: ["follow up lead"], scopes: ["commercial.sales"], capabilities: ["email.send"], evidenceRefs: [] }, { principal: "sales-user", scopes: ["xspa.write"] }); }
    catch (error) { collisionBlocked = error instanceof Error && error.message.includes("conflicts with reusable catalog"); }
    expect(collisionBlocked, "Company AutoSkill was allowed to shadow an active reusable global skill id");
  }));

  cases.push(await runCase("app Company AutoSkill creates CompanyAsset + SkillGene without KAST and replays idempotently", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const registry = new SkillRegistry([], { exists: async () => true, read: async () => "" });
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const proposalId = randomUUID();
    const input = { proposalId, skillId: "supplier-ritual", name: "Supplier Ritual", description: "Company-specific supplier replenishment flow", instructions: "Use verified demand and stock before supplier ordering.", department: "operations", triggers: ["supplier replenishment"], scopes: ["operations.supply"], capabilities: ["supplier.order"], evidenceRefs: ["process-map:supplier"] };
    const first = await ops.autoskillPropose(input, { principal: "ops-user", scopes: ["xspa.write"] }) as { status?: string; kastUsed?: boolean; definitionAssetId?: string };
    const second = await ops.autoskillPropose(input, { principal: "ops-user", scopes: ["xspa.write"] }) as { definitionAssetId?: string };
    expect(first.status === "candidate" && first.kastUsed === false, "Company AutoSkill incorrectly used KAST");
    expect(first.definitionAssetId === second.definitionAssetId, "Company AutoSkill replay changed durable identity");
    const assets = await store.listAssets(companyId);
    expect(assets.filter((asset) => asset.kind === "company-skill-definition").length === 1, "Company AutoSkill duplicated definition asset");
    expect(assets.filter((asset) => asset.kind === "skill-installation").length === 1, "Company AutoSkill did not create exactly one installation");
    const genes = await workStore.listGenes(companyId);
    expect(genes.length === 1 && genes[0]?.type === "skill" && genes[0]?.status === "candidate", "Company AutoSkill did not persist a candidate SkillGene");
    let duplicateIdBlocked = false;
    try { await ops.autoskillPropose({ ...input, proposalId: randomUUID(), instructions: "Different definition under same stable skill id." }, { principal: "ops-user", scopes: ["xspa.write"] }); }
    catch (error) { duplicateIdBlocked = error instanceof Error && error.message.includes("already exists"); }
    expect(duplicateIdBlocked, "Company AutoSkill allowed a second active definition under the same stable id");
    expect(store.jobs.size === 0, "Company AutoSkill unexpectedly enqueued KAST work");
  }));

  cases.push(await runCase("app global skill promotion is blocked until Company SkillGene is champion and then crosses KAST boundary", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const registry = new SkillRegistry([], { exists: async () => true, read: async () => "" });
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const localProposalId = randomUUID();
    const local = await ops.autoskillPropose({ proposalId: localProposalId, skillId: "local-forecast", name: "Local Forecast", description: "Private forecasting workflow", instructions: "Forecast from current verified demand evidence.", department: "operations", triggers: ["local forecast"], scopes: ["operations.forecast"], capabilities: ["inventory.forecast"], evidenceRefs: ["outcome:1"] }, { principal: "ops-user", scopes: ["xspa.write"] }) as { definitionAssetId?: string };
    let blocked = false;
    try { await ops.globalSkillPromotionPropose({ proposalId: randomUUID(), sessionRef: "session:global-skill", skillId: "local-forecast", summary: "Could be reusable.", evidenceRefs: ["outcome:1"], severity: "medium" }, { principal: "ops-user", scopes: ["xspa.write"] }); }
    catch (error) { blocked = error instanceof Error && error.message.includes("champion"); }
    expect(blocked, "non-champion Company SkillGene reached global promotion");
    const [gene] = await workStore.listGenes(companyId);
    expect(Boolean(gene && local.definitionAssetId), "local SkillGene missing before promotion test");
    await workStore.saveGene({ ...gene!, status: "champion", fitness: { ...gene!.fitness, sampleSize: 5, confidence: 0.9, riskIncidents: 1 } });
    let riskyChampionBlocked = false;
    try { await ops.globalSkillPromotionPropose({ proposalId: randomUUID(), sessionRef: "session:global-skill", skillId: "local-forecast", summary: "Unsafe reusable candidate.", evidenceRefs: ["outcome:risk"], severity: "medium" }, { principal: "ops-user", scopes: ["xspa.write"] }); }
    catch (error) { riskyChampionBlocked = error instanceof Error && error.message.includes("zero risk incidents"); }
    expect(riskyChampionBlocked, "champion SkillGene with incidents crossed global promotion boundary");
    await workStore.saveGene({ ...gene!, status: "champion", fitness: { ...gene!.fitness, sampleSize: 5, confidence: 0.9, riskIncidents: 0 } });
    const promotionId = randomUUID();
    const promoted = await ops.globalSkillPromotionPropose({ proposalId: promotionId, sessionRef: "session:global-skill", skillId: "local-forecast", summary: "Verified reusable candidate.", evidenceRefs: ["outcome:1", "outcome:2"], severity: "medium" }, { principal: "ops-user", scopes: ["xspa.write"] }) as { globalWriteDirect?: boolean; kast?: { status?: string } };
    expect(promoted.globalWriteDirect === false && promoted.kast?.status === "queued", "champion global promotion did not route through KAST");
    expect(store.jobs.get(`${companyId}:${promotionId}`)?.kind === "kast.improve", "global skill promotion did not enqueue KAST improve");
  }));

  cases.push(await runCase("app Company Skill plan maps existing processes before proposing replacements", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const definition: SkillDefinition = { schemaVersion: 1, id: "sales-followup", name: "Sales Follow-up", version: "1.0.0", domain: "company", status: "active", description: "Follow up commercial leads", triggers: ["follow up lead"], scopes: ["sales.pipeline"], capabilities: ["crm.read", "email.send"], defaultDepartments: ["commercial"], contentRef: "file:skills/sales-followup/SKILL.md", risk: "medium", provenance: "project" };
    const registry = new SkillRegistry([definition], { exists: async () => true, read: async () => "# Sales Follow-up" });
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const result = await ops.companySkillPlan({ mode: "existing", purpose: "Existing distributor", departments: ["commercial", "operations"], requiredCapabilities: [], observedProcesses: [{ id: "p1", name: "Lead follow-up", department: "commercial", description: "Sales team follows CRM leads by email", capabilities: ["crm.read", "email.send"], triggers: ["follow up lead"], evidenceRefs: ["map:p1"] }] }, { principal: "executive", scopes: ["xspa.read"] }) as { plan?: { reuse?: Array<{ observedProcessId?: string; skillRef?: string }>; createCandidates?: unknown[] } };
    expect(result.plan?.reuse?.some((item) => item.observedProcessId === "p1" && item.skillRef === "skill://sales-followup@1.0.0"), "existing Company process was not mapped to reusable skill");
    expect(result.plan?.createCandidates?.length === 0, "mapped existing Company process was unnecessarily replaced");
  }));

  cases.push(await runCase("app Company OS plan/apply is idempotent, durable and grants no authority", async () => {
    const companyId = randomUUID();
    const store = new InMemoryRuntimeStore();
    const workStore = new InMemoryCompanyStore();
    const registry = new SkillRegistry([], { exists: async () => true, read: async () => "" });
    const ops = new EnvironmentXspaAppOperations({ store, workStore, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const intake = { mode: "new" as const, purpose: "Create a governed services company", businessModel: "B2B services", jurisdiction: "CL", timezone: "America/Santiago", objectives: ["Launch safely"], proposedDepartments: [], proposedProcesses: [], requiredCapabilities: ["email.send"], bootstrapRequirements: [{ id: "commercial-email", capability: "email.send", assetKind: "email-account", department: "commercial", estimatedCost: 0, currency: "CLP", humanBoundary: "none" as const }] };
    const planned = await ops.companyPlan({ intake }, { principal: "founder", scopes: ["xspa.read"] }) as { plan?: { fingerprint?: string; departments?: unknown[] }; grantsAuthority?: boolean; grantsBudget?: boolean; grantsCapabilities?: boolean };
    expect(Boolean(planned.plan?.fingerprint) && (planned.plan?.departments?.length ?? 0) >= 6, "Company OS plan did not produce universal operating model coverage");
    const plannedFingerprint = planned.plan?.fingerprint;
    expect(typeof plannedFingerprint === "string", "Company OS plan fingerprint missing");
    expect(planned.grantsAuthority === false && planned.grantsBudget === false && planned.grantsCapabilities === false, "Company OS planning granted execution power");
    const formationId = randomUUID();
    const first = await ops.companyApply({ formationId, intake }, { principal: "founder", scopes: ["xspa.write"] }) as { status?: string; assetId?: string; grantsAuthority?: boolean; grantsBudget?: boolean; grantsCapabilities?: boolean; recommendedWork?: unknown };
    const changedAt = new Date().toISOString();
    await store.saveAsset({ id: randomUUID(), companyId, kind: "email-account", capability: "email.send", department: "commercial", cost: 0, currency: "CLP", status: "active", grantRefs: [], restrictions: [], metadata: {}, createdAt: changedAt, updatedAt: changedAt });
    const replay = await ops.companyApply({ formationId, intake }, { principal: "founder", scopes: ["xspa.write"] }) as { assetId?: string; status?: string };
    expect(first.status === "applied" && replay.status === "applied" && first.assetId === replay.assetId, "Company OS apply did not replay idempotently");
    expect(first.grantsAuthority === false && first.grantsBudget === false && first.grantsCapabilities === false && Boolean(first.recommendedWork), "Company OS apply crossed Work/authority boundary");
    const assets = await store.listAssets(companyId);
    expect(assets.filter((asset) => asset.kind === "company-operating-model").length === 1, "Company OS apply did not persist exactly one operating model");
    expect(store.jobs.size === 0, "Company OS apply unexpectedly invoked KAST or background jobs");
    let stalePlanBlocked = false;
    try { await ops.companyApply({ formationId: randomUUID(), intake, expectedFingerprint: plannedFingerprint }, { principal: "founder", scopes: ["xspa.write"] }); }
    catch (error) { stalePlanBlocked = error instanceof Error && error.message.includes("PLAN_FINGERPRINT_MISMATCH"); }
    expect(stalePlanBlocked, "Company OS apply accepted a stale preview fingerprint after Company state drift");
    let conflict = false;
    try { await ops.companyApply({ formationId, intake: { ...intake, purpose: "Changed company purpose" } }, { principal: "founder", scopes: ["xspa.write"] }); }
    catch (error) { conflict = error instanceof Error && error.message.includes("IDEMPOTENCY_CONFLICT"); }
    expect(conflict, "Company OS apply allowed changed payload under same formation id");
  }));

  cases.push(await runCase("app Company OS status is deployment-Company scoped", async () => {
    const companyA = randomUUID();
    const companyB = randomUUID();
    const sharedStore = new InMemoryRuntimeStore();
    const registry = new SkillRegistry([], { exists: async () => true, read: async () => "" });
    const opsA = new EnvironmentXspaAppOperations({ store: sharedStore, workStore: new InMemoryCompanyStore(), companyId: companyA, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const opsB = new EnvironmentXspaAppOperations({ store: sharedStore, workStore: new InMemoryCompanyStore(), companyId: companyB, databaseConfigured: true, creativeConfigured: false, kastConfigured: true, skillRegistry: registry });
    const intake = { mode: "existing" as const, purpose: "Adopt Company A", businessModel: "Existing business", jurisdiction: "CL", timezone: "America/Santiago", objectives: ["Establish baseline"], observedDepartments: [], observedProcesses: [], proposedDepartments: [], proposedProcesses: [], requiredCapabilities: [], bootstrapRequirements: [] };
    await opsA.companyApply({ formationId: randomUUID(), intake }, { principal: "founder-a", scopes: ["xspa.write"] });
    const visibleA = await opsA.companyStatus({ principal: "reader-a", scopes: ["xspa.read"] }) as { state?: string; operatingModel?: { companyId?: string } };
    const visibleB = await opsB.companyStatus({ principal: "reader-b", scopes: ["xspa.read"] }) as { state?: string; operatingModel?: unknown };
    expect(visibleA.state === "found" && visibleA.operatingModel?.companyId === companyA, "Company A operating model was not visible in its deployment");
    expect(visibleB.state === "not-found" && !visibleB.operatingModel, "Company OS status crossed tenant boundary");
  }));

  return cases;
}
