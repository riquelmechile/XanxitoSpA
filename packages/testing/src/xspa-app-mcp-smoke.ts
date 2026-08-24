import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { XspaAppOperations } from "../../../apps/mcp/src/server.js";
import { listenXspaMcp } from "../../../apps/mcp/src/server.js";
import { StreamableHttpMcpTransport } from "../../providers/src/mcp-streamable-http.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyXspaAppMcp(): Promise<void> {
  const calls: string[] = [];
  const operations: XspaAppOperations = {
    status: async () => ({
      version: "1.0.0",
      modelLaw: { executive: "gpt-5.6-sol/max", branches: "gpt-5.6-sol/xhigh", fallback: false },
      mcp: { ready: true, mode: "streamable-http" },
      database: { configured: true }, companyOs: { ready: true, intakeModes: ["new", "existing"], lifecycleModes: ["bootstrap", "operate", "improve", "grow", "expand", "recover", "exit"] },
      creative: { configured: true, renderer: "responses-image-generation", chatMode: "decision-only", video: "staged" },
      kast: { configured: true, execution: "queued" },
      skills: { configured: true, healthy: true, indexed: 2, activeCompanyCatalog: 1 },
    }),
    workCreate: async (input) => {
      calls.push(`work:${input.workId}`);
      return { work: { id: input.workId, owner: input.owner, objective: input.objective, scope: input.scope }, status: "created", companyScoped: true, grantsAuthority: false, grantsBudget: false };
    },
    workGet: async (workId) => {
      if (workId === "99999999-9999-4999-8999-999999999999") throw new Error("token=super-secret-value Bearer hidden-bearer-value sk-hidden-openai-key");
      return { work: { id: workId, owner: "executive", objective: "Test objective", scope: "sandbox" }, state: "found", companyScoped: true };
    },
    companyDiscoveryPlan: async (_input, context) => ({ revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyDiscoveryApply: async (input, context) => ({ discoveryId: input.discoveryId, assetId: input.discoveryId, revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, status: "applied", principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyDiscoveryStatus: async (context) => ({ state: "found", revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, principal: context.principal, grantsAuthority: false }),
    companyPlan: async (input, context) => ({ plan: { fingerprint: "a".repeat(64), mode: input.intake.mode, departments: [{ id: "executive" }], recommendedWork: { owner: "executive" } }, principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyApply: async (input, context) => ({ formationId: input.formationId, assetId: input.formationId, fingerprint: "a".repeat(64), status: "applied", principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyStatus: async (context) => ({ state: "found", operatingModel: { companyId: "deployment-company", mode: "new" }, principal: context.principal }),
    kastStatus: async (reflectionId) => ({ reflectionId, state: "queued", kind: "kast.improve", attempts: 0, companyScoped: true }),
    assetGet: async (assetId) => ({ state: "found", companyScoped: true, asset: { id: assetId, kind: "creative-image-selected", visibility: "selected", artifactRef: "https://assets.example.test/selected.png", artifactReady: true } }),
    creativeSubmit: async (input) => {
      calls.push(`creative:${input.missionId}`);
      return { missionId: input.missionId, status: "queued", chatMode: "decision-only", candidateArtVisible: false };
    },
    creativeStatus: async (missionId) => ({ missionId, state: "completed", receipt: { missionId, status: "selected", decisionOwner: "creative-supervisor", selectedAssetRefs: ["asset:selected"], rationaleSummary: "selected", escalationRequired: false, chatMode: "decision-only" }, candidateArtVisible: false }),
    skillsList: async () => ({ catalog: [{ id: "alpha-skill", version: "1.0.0", domain: "company", status: "active", installed: true }], companyLocal: [], installations: [{ skillRef: "skill://alpha-skill@1.0.0", status: "active" }], fullBodiesLoaded: false, progressiveDisclosure: true, companyScoped: true }),
    skillsSearch: async (input) => ({ installedMatches: [{ skill: { id: "alpha-skill", version: "1.0.0", domain: "company", status: "active" }, score: input.scope === "commerce.alpha" ? 90 : 60, reasons: ["trigger", "scope"] }], catalogSuggestions: [], fullBodiesLoaded: false, progressiveDisclosure: true, companyScoped: true }),
    skillGet: async (input) => ({ state: "found", skill: { manifest: { id: input.skillId, version: input.version ?? "1.0.0", domain: "company", status: "active" }, body: "# Alpha Skill\nFull instructions" }, progressiveDisclosure: true, companyScoped: true }),
    skillInstall: async (input) => { calls.push(`skill-install:${input.installationId}`); return { installationId: input.installationId, skillRef: input.skillRef, status: "installed", grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, companyScoped: true }; },
    skillsHealth: async () => ({ ok: true, indexed: 2, active: 2, companySkills: 1, harnessSkills: 1, issues: [] }),
    companySkillPlan: async (input) => ({ plan: { mode: input.mode, install: [{ skillRef: "skill://alpha-skill@1.0.0" }], reuse: [], gaps: [], createCandidates: [] }, companyScoped: true, grantsAuthority: false, grantsBudget: false }),
    autoskillPropose: async (input) => { calls.push(`autoskill:${input.proposalId}`); return { proposalId: input.proposalId, skillId: input.skillId, status: "candidate", directGlobalWrite: false, kastUsed: false, companyScoped: true }; },
    globalSkillPromotionPropose: async (input) => { calls.push(`global-skill:${input.proposalId}`); return { proposalId: input.proposalId, skillId: input.skillId, globalWriteDirect: false, kast: { status: "queued" } }; },
    kastReflect: async (input) => {
      calls.push(`kast:${input.reflectionId}`);
      return { reflectionId: input.reflectionId, status: input.mode === "noop" ? "no-op" : "queued", queued: input.mode !== "noop" };
    },
  };
  const authToken = "local-xspa-mcp-smoke-token";
  const server = await listenXspaMcp({ operations, authToken, host: "127.0.0.1", port: 0 });
  if (!server.listening) await once(server, "listening");
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unauthorized = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    assert(unauthorized.status === 401, "MCP app did not enforce configured bearer auth");

    const transport = new StreamableHttpMcpTransport({ id: "xspa-app-smoke", url: `${base}/mcp` });
    const metadata = { headers: { Authorization: `Bearer ${authToken}` } };
    const tools = await transport.listTools(metadata);
    const names = tools.map((tool) => tool.name).sort();
    for (const required of ["xspa_status", "xspa_company_discovery_plan", "xspa_company_discovery_apply", "xspa_company_discovery_status", "xspa_company_plan", "xspa_company_apply", "xspa_company_status", "xspa_work_create", "xspa_work_get", "xspa_kast_status", "xspa_asset_get", "xspa_creative_submit", "xspa_creative_status", "xspa_skills_list", "xspa_skills_search", "xspa_skill_get", "xspa_skill_install", "xspa_skills_health", "xspa_company_skill_plan", "xspa_autoskill_propose", "xspa_skill_global_promotion_propose", "xspa_kast_reflect"]) {
      assert(names.includes(required), `missing app MCP tool ${required}`);
    }

    const discoveryPlan = await transport.callTool("xspa_company_discovery_plan", { evidence: [], facts: [], unknowns: [], capabilities: [] }, metadata);
    assert(discoveryPlan.ok && JSON.stringify(discoveryPlan.content).includes("grantsAuthority"), "company discovery plan failed through app MCP");
    const discoveryId = "77777777-7777-4777-8777-777777777777";
    const discoveryApply = await transport.callTool("xspa_company_discovery_apply", { discovery_id: discoveryId, evidence: [], facts: [], unknowns: [], capabilities: [] }, metadata);
    assert(discoveryApply.ok && JSON.stringify(discoveryApply.content).includes(discoveryId), "company discovery apply failed through app MCP");
    const discoveryStatus = await transport.callTool("xspa_company_discovery_status", {}, metadata);
    assert(discoveryStatus.ok && JSON.stringify(discoveryStatus.content).includes("revisionId"), "company discovery status failed through app MCP");

    const status = await transport.callTool("xspa_status", {}, metadata);
    assert(status.ok, "xspa_status failed");
    const statusText = JSON.stringify(status.content);
    assert(statusText.includes("gpt-5.6-sol/max") && statusText.includes("gpt-5.6-sol/xhigh"), "app MCP status lost Model Law");
    assert(!statusText.includes(authToken), "app MCP result leaked auth token");

    const workId = "22222222-2222-4222-8222-222222222222";
    const workCreate = await transport.callTool("xspa_work_create", {
      work_id: workId, owner: "executive", objective: "Create the V1.0 MCP control surface", scope: "xanxitospa app surface",
    }, metadata);
    assert(workCreate.ok, "work create failed through app MCP");
    const workText = JSON.stringify(workCreate.content);
    assert(workText.includes("grantsAuthority") && workText.includes("false") && !workText.includes(authToken), "work create result violated authority/auth secrecy");
    const workGet = await transport.callTool("xspa_work_get", { work_id: workId }, metadata);
    assert(workGet.ok && JSON.stringify(workGet.content).includes("Test objective"), "work get failed through app MCP");

    const redactedError = await transport.callTool("xspa_work_get", { work_id: "99999999-9999-4999-8999-999999999999" }, metadata);
    const redactedText = JSON.stringify(redactedError.content);
    assert(!redactedText.includes("super-secret-value") && !redactedText.includes("hidden-bearer-value") && !redactedText.includes("sk-hidden-openai-key"), "app MCP tool error leaked secret-like material");

    const missionId = "11111111-1111-4111-8111-111111111111";
    const submit = await transport.callTool("xspa_creative_submit", {
      mission_id: missionId,
      work_id: workId,
      brief_ref: "brief:character:sovereign",
      evidence_snapshot_ref: "evidence:brand:v2",
      candidate_count: 2,
      required_successful_candidates: 1,
      executive_escalation_required: false,
    }, metadata);
    assert(submit.ok, "creative submit failed through app MCP");
    const submitText = JSON.stringify(submit.content);
    assert(submitText.includes("decision-only") && !submitText.includes("prompt"), "creative MCP exposed candidate workflow");

    const creativeStatus = await transport.callTool("xspa_creative_status", { mission_id: missionId }, metadata);
    assert(creativeStatus.ok, "creative status failed through app MCP");
    const creativeText = JSON.stringify(creativeStatus.content);
    assert(creativeText.includes("asset:selected") && !creativeText.includes("candidate prompt"), "creative status leaked internal candidate data");

    const selectedAssetId = "44444444-4444-4444-8444-444444444444";
    const selectedAsset = await transport.callTool("xspa_asset_get", { asset_id: selectedAssetId }, metadata);
    assert(selectedAsset.ok && JSON.stringify(selectedAsset.content).includes("creative-image-selected"), "selected asset lookup failed through app MCP");

    const skillList = await transport.callTool("xspa_skills_list", {}, metadata);
    assert(skillList.ok && JSON.stringify(skillList.content).includes("fullBodiesLoaded") && JSON.stringify(skillList.content).includes("false"), "skill list did not preserve progressive disclosure");
    const skillSearch = await transport.callTool("xspa_skills_search", { query: "alpha workflow", scope: "commerce.alpha", capabilities: ["alpha.run"] }, metadata);
    assert(skillSearch.ok && JSON.stringify(skillSearch.content).includes("alpha-skill"), "skill search failed through app MCP");
    const installationId = "77777777-7777-4777-8777-777777777777";
    const skillInstall = await transport.callTool("xspa_skill_install", { installation_id: installationId, skill_ref: "skill://alpha-skill@1.0.0", department: "operations", scopes: ["commerce.alpha"] }, metadata);
    const skillInstallText = JSON.stringify(skillInstall.content);
    assert(skillInstall.ok && skillInstallText.includes("installed") && skillInstallText.includes("grantsCapabilities") && skillInstallText.includes("false"), "skill install granted authority/capabilities or failed");
    const skillGet = await transport.callTool("xspa_skill_get", { skill_id: "alpha-skill" }, metadata);
    assert(skillGet.ok && JSON.stringify(skillGet.content).includes("Full instructions"), "skill body progressive load failed through app MCP");
    const skillHealth = await transport.callTool("xspa_skills_health", {}, metadata);
    assert(skillHealth.ok && JSON.stringify(skillHealth.content).includes("companySkills"), "skill registry health failed through app MCP");
    const companyPlan = await transport.callTool("xspa_company_skill_plan", { mode: "new", purpose: "Run an alpha company", departments: ["operations"], required_capabilities: ["alpha.run"] }, metadata);
    assert(companyPlan.ok && JSON.stringify(companyPlan.content).includes("skill://alpha-skill@1.0.0"), "Company Skill plan failed through app MCP");
    const proposalId = "55555555-5555-4555-8555-555555555555";
    const autoskill = await transport.callTool("xspa_autoskill_propose", { proposal_id: proposalId, skill_id: "alpha-helper", name: "Alpha Helper", description: "Company-specific alpha workflow.", instructions: "Run the verified alpha workflow under current Company grants.", department: "operations", triggers: ["alpha helper"], scopes: ["commerce.alpha"], capabilities: ["alpha.run"], evidence_refs: ["trace:alpha"] }, metadata);
    const autoskillText = JSON.stringify(autoskill.content);
    assert(autoskill.ok && autoskillText.includes("candidate") && autoskillText.includes("kastUsed") && autoskillText.includes("false"), "Company AutoSkill incorrectly used KAST or skipped candidate lifecycle");
    const globalProposalId = "66666666-6666-4666-8666-666666666666";
    const globalSkill = await transport.callTool("xspa_skill_global_promotion_propose", { proposal_id: globalProposalId, session_ref: "session:app-smoke", skill_id: "alpha-helper", summary: "Promote only after verified cross-context evidence.", evidence_refs: ["outcome:alpha"] }, metadata);
    assert(globalSkill.ok && JSON.stringify(globalSkill.content).includes("globalWriteDirect") && JSON.stringify(globalSkill.content).includes("false"), "global skill promotion bypassed KAST boundary");

    const reflectionId = "33333333-3333-4333-8333-333333333333";
    const kast = await transport.callTool("xspa_kast_reflect", {
      reflection_id: reflectionId,
      session_ref: "session:app-smoke",
      mode: "improve",
      category: "friction",
      severity: "medium",
      summary: "Repeated manual handoff should become a tested harness primitive.",
      evidence_refs: ["trace:smoke"],
      recurrence: 3,
      affected_surfaces: ["developer-experience"],
      strategy_overlays: ["simplify-first", "reliability-first"],
    }, metadata);
    assert(kast.ok, "KAST reflection failed through app MCP");
    const kastStatus = await transport.callTool("xspa_kast_status", { reflection_id: reflectionId }, metadata);
    assert(kastStatus.ok && JSON.stringify(kastStatus.content).includes("kast.improve"), "KAST status failed through app MCP");
    assert(calls.includes(`work:${workId}`) && calls.includes(`creative:${missionId}`) && calls.includes(`skill-install:${installationId}`) && calls.includes(`autoskill:${proposalId}`) && calls.includes(`global-skill:${globalProposalId}`) && calls.includes(`kast:${reflectionId}`), "app MCP did not invoke backend operations");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await verifyXspaAppMcp();
  console.log("PASS XanxitoSpA ChatGPT app MCP surface");
}
