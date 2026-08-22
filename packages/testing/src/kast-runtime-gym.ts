import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { KASTImprovementVariant } from "../../contracts/src/index.js";
import { buildGitVariantVerification, GitAdoptionPort, GitWorktreeExperimentPort, classifyHarnessSurfaces } from "../../kernel/src/git-kast.js";
import { GitBackedKastRuntime } from "../../kernel/src/kast-harness-runtime.js";
import { InMemoryEngramMemoryPort } from "../../kernel/src/kast-law.js";
import type { PrincipalPolicy } from "../../contracts/src/index.js";
import { FakeMcpTransport } from "../../providers/src/mcp.js";
import { McpEngramMemoryPort, XanxitoMcpToolClient, XanxitoMcpWorkflowEvidencePort } from "../../providers/src/xanxito-harness.js";

const execFileAsync = promisify(execFile);

export interface KastRuntimeGymCaseResult { name: string; ok: boolean; detail: string }
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function runCase(name: string, fn: () => void | Promise<void>): Promise<KastRuntimeGymCaseResult> {
  try { await fn(); return { name, ok: true, detail: "pass" }; }
  catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "xspa-kast-git-gym-"));
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.name", "XanxitoSpA Gym"]);
  await git(root, ["config", "user.email", "gym@xanxitospa.invalid"]);
  await mkdir(path.join(root, "skills", "demo"), { recursive: true });
  await mkdir(path.join(root, "packages", "kernel", "src"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# fixture\n");
  await writeFile(path.join(root, "skills", "demo", "SKILL.md"), "v1\n");
  await writeFile(path.join(root, "packages", "kernel", "src", "kast-law.ts"), "constitutional\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "fixture base"]);
  return root;
}

export async function runKastRuntimeGym(): Promise<KastRuntimeGymCaseResult[]> {
  const cases: KastRuntimeGymCaseResult[] = [];

  cases.push(await runCase("KAST real Engram port uses discovered MCP tools and preserves memory abstraction", async () => {
    const transport = new FakeMcpTransport("xanxito-fake");
    const descriptors = {
      search: { name: "mem_search", inputSchema: { type: "object" } },
      save: { name: "mem_save", inputSchema: { type: "object" } },
    };
    transport.register({ descriptor: descriptors.search, handler: async () => ({ ok: true, content: { results: [{ id: 123, title: "prior", summary: "same bug happened before", evidence_refs: ["trace:1"] }] } }) });
    transport.register({ descriptor: descriptors.save, handler: async () => ({ ok: true, content: { observation_id: 456 } }) });
    const port = new McpEngramMemoryPort(new XanxitoMcpToolClient(transport));
    const found = await port.search("same bug");
    expect(found.length === 1 && found[0]?.topicKey === "123" && found[0]?.summary.includes("happened before"), "MCP Engram search did not map durable memory");
    const ref = await port.save({ topicKey: "kast:test", title: "test", summary: "verified learning", evidenceRefs: ["verify:1"], outcome: "adopted" });
    expect(ref === "456", "MCP Engram save did not return durable observation reference");
    expect(transport.calls.map((call) => call.tool).join(",") === "mem_search,mem_save", "unexpected MCP harness calls");
  }));


  cases.push(await runCase("KAST workflow evidence port reads SDD and four-lens review through MCP", async () => {
    const transport = new FakeMcpTransport("xanxito-workflow-fake");
    transport.register({ descriptor: { name: "sdd_status", inputSchema: { type: "object" } }, handler: async () => ({ ok: true, content: { explore: true, proposal: true, spec: true, design: true, tasks: true, apply: true, verify: true, archive: true } }) });
    transport.register({ descriptor: { name: "review_status", inputSchema: { type: "object" } }, handler: async () => ({ ok: true, content: { verdict: "approved", lenses: ["risk", "readability", "reliability", "resilience"] } }) });
    const port = new XanxitoMcpWorkflowEvidencePort(new XanxitoMcpToolClient(transport));
    const evidence = await port.inspect({ sddChange: "demo-change", reviewTarget: "demo-review" });
    expect(evidence.sddComplete && evidence.reviewApproved && evidence.fourRRefs.length === 4, "MCP workflow evidence did not recognize complete SDD/review state");
  }));

  cases.push(await runCase("KAST git experiment uses isolated worktree and governed adoption binds exact commit", async () => {
    const repo = await makeRepo();
    try {
      const baseSha = await git(repo, ["rev-parse", "HEAD"]);
      const worktreeRoot = await mkdtemp(path.join(tmpdir(), "xspa-kast-worktrees-"));
      const workspacePort = await GitWorktreeExperimentPort.create({ repoPath: repo, worktreeRoot });
      const ws = await workspacePort.createWorkspace({ id: "variant-a", baseRef: baseSha });
      await writeFile(path.join(ws.path, "skills", "demo", "SKILL.md"), "v2 improved\n");
      const sourceCommit = await workspacePort.commitAll(ws, "kast: improve demo skill");
      expect(sourceCommit !== baseSha, "isolated worktree did not produce source commit");
      expect((await readFile(path.join(repo, "skills", "demo", "SKILL.md"), "utf8")).trim() === "v1", "experiment mutated base worktree before adoption");
      const variant: KASTImprovementVariant = { id: randomUUID(), overlay: "simplify-first", summary: "improve demo skill", changeRef: sourceCommit, isolationRef: ws.path, affectedSurfaces: ["skill"], evidenceRefs: ["sdd:demo", "review:demo"], directMainMutation: false };
      const verification = await buildGitVariantVerification({
        workspacePort, variant, baseSha,
        workflow: { sddComplete: true, sddRef: "sdd:demo", reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], reviewRef: "review:demo" },
        regressionRefs: ["test:demo"], verificationRefs: ["verify:demo"],
      });
      expect(verification.passed && verification.observedSurfaces.includes("skill"), "git verifier did not accept safe isolated skill change");
      const adopter = new GitAdoptionPort({ repoPath: repo, expectedBaseSha: baseSha });
      const adoption = await adopter.adopt({ trigger: { id: randomUUID(), companyId: randomUUID(), sessionRef: "gym", requestedMode: "improve", category: "friction", severity: "medium", summary: "demo", evidenceRefs: ["trace:demo"], recurrence: 2, affectedSurfaces: ["skill"], containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString() }, variant, verification, adjudication: { selectedVariantId: variant.id, rationale: "winner" } });
      expect(adoption.adopted && adoption.sourceChangeRef === sourceCommit && adoption.adoptionRef, "governed Git adoption failed");
      expect((await readFile(path.join(repo, "skills", "demo", "SKILL.md"), "utf8")).includes("v2 improved"), "adoption did not change base repo");
      await workspacePort.removeWorkspace(ws, true).catch(() => undefined);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }));

  cases.push(await runCase("KAST git verifier derives constitutional surface from actual diff and blocks adoption", async () => {
    const repo = await makeRepo();
    try {
      const baseSha = await git(repo, ["rev-parse", "HEAD"]);
      const workspacePort = await GitWorktreeExperimentPort.create({ repoPath: repo });
      const ws = await workspacePort.createWorkspace({ id: "variant-protected", baseRef: baseSha });
      await writeFile(path.join(ws.path, "packages", "kernel", "src", "kast-law.ts"), "unsafe self rewrite\n");
      const sourceCommit = await workspacePort.commitAll(ws, "kast: unsafe self rewrite");
      const variant: KASTImprovementVariant = { id: randomUUID(), overlay: "speed-first", summary: "claims to be docs only", changeRef: sourceCommit, isolationRef: ws.path, affectedSurfaces: ["developer-experience"], evidenceRefs: [], directMainMutation: false };
      const verification = await buildGitVariantVerification({
        workspacePort, variant, baseSha,
        workflow: { sddComplete: true, sddRef: "sdd:x", reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], reviewRef: "review:x" },
        regressionRefs: ["test:x"], verificationRefs: ["verify:x"],
      });
      expect(!verification.passed && verification.observedSurfaces.includes("kast-law") && verification.blockingFindings.includes("constitutional-surface"), "actual protected path did not override proposer label");
      const adopter = new GitAdoptionPort({ repoPath: repo, expectedBaseSha: baseSha });
      const result = await adopter.adopt({ trigger: { id: randomUUID(), companyId: randomUUID(), sessionRef: "gym", requestedMode: "improve", category: "security", severity: "high", summary: "unsafe", evidenceRefs: ["trace:x"], recurrence: 1, affectedSurfaces: ["developer-experience"], containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString() }, variant, verification, adjudication: { selectedVariantId: variant.id, rationale: "bad" } });
      expect(!result.adopted, "constitutional self-rewrite reached adoption");
      expect(classifyHarnessSurfaces(["packages/kernel/src/kast-law.ts"]).includes("kast-law"), "protected path classifier regression");
      await workspacePort.removeWorkspace(ws, true).catch(() => undefined);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }));


  cases.push(await runCase("KAST end-to-end runtime mutates two isolated worktrees in parallel and adopts verified winner", async () => {
    const repo = await makeRepo();
    try {
      const workspacePort = await GitWorktreeExperimentPort.create({ repoPath: repo });
      const memory = new InMemoryEngramMemoryPort([{ topicKey: "kast:prior", title: "prior", summary: "prefer minimal skill changes", evidenceRefs: ["trace:prior"], outcome: "remembered" }]);
      const policy: PrincipalPolicy = {
        role: "executive-principal", mode: "pinned", model: "gpt-5.6-sol", reasoningEffort: "max", subordinateModel: "gpt-5.6-sol", subordinateReasoningEffort: "xhigh", maxReservedForExecutive: true, allowSecondaryModelProviders: false, branchOrchestration: "xanxitospa-mission-graph", allowProviderManagedMultiAgent: false, allowModelFallback: false, capabilityProvidersReplaceable: true, creativePolicy: { providerFamily: "openai-only", imageGeneration: "responses-image-generation", videoGeneration: "staged-unavailable", allowLegacyVideo: false },
      };
      let active = 0; let maxActive = 0;
      const runtime = new GitBackedKastRuntime({
        policy, memory, workspacePort,
        workflow: { async inspect({ sddChange, reviewTarget }) { return { sddComplete: true, sddRef: `sdd:${sddChange}`, reviewApproved: true, fourRRefs: [`review:risk:${reviewTarget}`, `review:readability:${reviewTarget}`, `review:reliability:${reviewTarget}`, `review:resilience:${reviewTarget}`], reviewRef: `review:${reviewTarget}` }; } },
        mutationExecutor: { async mutate({ overlay, profile, priorMemory, workspace }) {
          expect(profile.reasoningEffort === "xhigh" && priorMemory.length >= 1, "real KAST runtime lost model law or Engram restore");
          active += 1; maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          await writeFile(path.join(workspace.path, "skills", "demo", "SKILL.md"), `v2 ${overlay}\n`);
          active -= 1;
          return { summary: `improve via ${overlay}`, sddChangeRef: `sdd-${overlay}`, reviewTargetRef: `review-${overlay}`, evidenceRefs: [`mutation:${overlay}`] };
        } },
        regressionRunner: { async run({ workspace }) { const text = await readFile(path.join(workspace.path, "skills", "demo", "SKILL.md"), "utf8"); return { passed: text.startsWith("v2"), regressionRefs: ["test:skill"], verificationRefs: ["verify:skill"] }; } },
        adjudicator: async ({ ownerProfile, verifiedVariants }) => { expect(ownerProfile.reasoningEffort === "max", "KAST owner was not Sol/max"); const first = verifiedVariants[0]; return first ? { selectedVariantId: first.variant.id, rationale: "first verified minimal change" } : { rationale: "no verified variants" }; },
      });
      const companyId = randomUUID();
      const result = await runtime.run({ id: randomUUID(), companyId, sessionRef: "runtime-gym", requestedMode: "improve", category: "friction", severity: "medium", summary: "demo skill can be clearer", evidenceRefs: ["trace:runtime"], recurrence: 2, affectedSurfaces: ["skill"], strategyOverlays: ["simplify-first", "readability-first"], containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString() });
      expect(maxActive === 2, "real KAST runtime lost parallel isolated mutation execution");
      expect(result.status === "adopted" && result.adoptionRef, "real KAST runtime did not adopt verified winner");
      const final = await readFile(path.join(repo, "skills", "demo", "SKILL.md"), "utf8");
      expect(final.startsWith("v2"), "real KAST adoption did not reach base repo");
      expect(memory.records.some((record) => record.outcome === "adopted"), "real KAST runtime did not persist adoption learning to Engram port");
    } finally { await rm(repo, { recursive: true, force: true }); }
  }));

  return cases;
}
