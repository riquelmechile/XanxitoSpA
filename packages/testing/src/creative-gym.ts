import { randomUUID } from "node:crypto";
import type { CompanyAsset, CreativeMission, PrincipalPolicy } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { processCreativeMissionJob, runCreativeMission, submitCreativeMission } from "../../kernel/src/creative-pipeline.js";
import { buildControlCatalog } from "../../kernel/src/control-catalog.js";
import { ProviderRegistry } from "../../providers/src/index.js";
import { createUniversalSemanticCapabilityRegistry } from "../../providers/src/semantic-catalog.js";

export interface CreativeGymCaseResult { name: string; ok: boolean; detail: string }

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runCase(name: string, fn: () => void | Promise<void>): Promise<CreativeGymCaseResult> {
  try { await fn(); return { name, ok: true, detail: "pass" }; }
  catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}

function policy(): PrincipalPolicy {
  return {
    role: "executive-principal",
    mode: "pinned",
    model: "gpt-5.6-sol",
    reasoningEffort: "max",
    subordinateModel: "gpt-5.6-sol",
    subordinateReasoningEffort: "xhigh",
    maxReservedForExecutive: true,
    allowSecondaryModelProviders: false,
    branchOrchestration: "xanxitospa-mission-graph",
    allowProviderManagedMultiAgent: false,
    allowModelFallback: false,
    capabilityProvidersReplaceable: true,
    creativePolicy: { providerFamily: "openai-only", imageGeneration: "responses-image-generation", videoGeneration: "staged-unavailable", allowLegacyVideo: false },
  };
}

function mission(companyId = randomUUID()): CreativeMission {
  return {
    id: randomUUID(), companyId, workId: randomUUID(), supervisorPrincipal: "creative-supervisor",
    briefRef: "brief:character-roster", evidenceSnapshotRef: "evidence:brand-dna", candidateCount: 2,
    requiredSuccessfulCandidates: 2, executiveEscalationRequired: false, createdAt: "2026-08-21T23:30:00.000Z",
  };
}

export async function runCreativePipelineGym(): Promise<CreativeGymCaseResult[]> {
  const cases: CreativeGymCaseResult[] = [];

  cases.push(await runCase("creative submission returns immediately without candidate art in chat receipt", async () => {
    const store = new InMemoryRuntimeStore();
    const m = mission();
    const receipt = await submitCreativeMission(store, m, new Date(m.createdAt));
    const serialized = JSON.stringify(receipt);
    expect(receipt.status === "queued" && receipt.chatMode === "decision-only", "creative mission did not queue as decision-only");
    expect(!serialized.includes("prompt") && !serialized.includes("candidate") && !serialized.includes("image"), "submission leaked creative internals into chat receipt");
    const due = await store.listDueJobs(m.companyId, new Date(m.createdAt), 10);
    expect(due.some((job) => job.kind === "creative.mission" && job.id === m.id), "creative mission was not persisted as durable job");
  }));

  cases.push(await runCase("creative pipeline renders and evaluates in bounded parallelism and stores Company assets", async () => {
    const store = new InMemoryRuntimeStore(); const m = mission();
    let activeRenders = 0; let maxRenders = 0; let activeEvals = 0; let maxEvals = 0;
    const result = await runCreativeMission({
      mission: m, policy: policy(), store, currency: "USD", grantRefs: [],
      conceptWorkers: [
        { id: "concept-a", overlay: "monumental-authority", run: async (_input) => ({ prompt: "A", rationale: "A", evidenceRefs: ["concept:a"], cost: 1 }) },
        { id: "concept-b", overlay: "human-authority", run: async (_input) => ({ prompt: "B", rationale: "B", evidenceRefs: ["concept:b"], cost: 1 }) },
      ],
      renderer: { render: async ({ candidate }) => { activeRenders += 1; maxRenders = Math.max(maxRenders, activeRenders); await new Promise((r) => setTimeout(r, 10)); activeRenders -= 1; return { artifactRef: `asset://${candidate.id}.png`, mimeType: "image/png", evidenceRefs: [`render:${candidate.id}`], cost: 2 }; } },
      evaluators: [
        { id: "eval-1", evaluate: async ({ candidate }) => { activeEvals += 1; maxEvals = Math.max(maxEvals, activeEvals); await new Promise((r) => setTimeout(r, 5)); activeEvals -= 1; return { scores: { silhouette: candidate.id.endsWith("0") ? 4 : 5 }, rationale: "ok", evidenceRefs: ["eval:1"] }; } },
        { id: "eval-2", evaluate: async ({ candidate }) => { activeEvals += 1; maxEvals = Math.max(maxEvals, activeEvals); await new Promise((r) => setTimeout(r, 5)); activeEvals -= 1; return { scores: { role: 5 }, rationale: "ok", evidenceRefs: ["eval:2"] }; } },
      ],
      adjudicator: { decide: async ({ successfulCandidates, supervisorPrincipal, supervisorProfile }) => ({ winnerId: successfulCandidates[0]!.candidate.id, decisionOwner: supervisorPrincipal, rationale: `owner:${supervisorProfile.reasoningEffort}` }) },
      maxRenderConcurrency: 2, maxEvaluationConcurrency: 2,
    });
    const assets = await store.listAssets(m.companyId);
    expect(maxRenders === 2 && maxEvals === 2, "creative work lost bounded parallel execution");
    expect(assets.length === 2 && assets.every((asset: CompanyAsset) => asset.companyId === m.companyId && asset.metadata.visibility === "internal-candidate"), "rendered candidates were not stored as internal Company assets");
    expect(result.receipt.selectedAssetRefs.length === 1 && !JSON.stringify(result.receipt).includes("prompt"), "decision receipt leaked candidate internals or lost selected asset");
  }));

  cases.push(await runCase("failed render does not cancel sibling and cannot be selected", async () => {
    const store = new InMemoryRuntimeStore(); const m = { ...mission(), requiredSuccessfulCandidates: 1 };
    const result = await runCreativeMission({
      mission: m, policy: policy(), store, currency: "USD", grantRefs: [],
      conceptWorkers: [
        { id: "a", overlay: "a", run: async () => ({ prompt: "A", rationale: "A", evidenceRefs: [], cost: 0 }) },
        { id: "b", overlay: "b", run: async () => ({ prompt: "B", rationale: "B", evidenceRefs: [], cost: 0 }) },
      ],
      renderer: { render: async ({ candidate }) => { if (candidate.strategyOverlay === "b") throw new Error("render failed"); return { artifactRef: "asset://a.png", mimeType: "image/png", evidenceRefs: [], cost: 1 }; } },
      evaluators: [{ id: "eval", evaluate: async () => ({ scores: { quality: 5 }, rationale: "ok", evidenceRefs: [] }) }],
      adjudicator: { decide: async ({ successfulCandidates, supervisorPrincipal }) => ({ winnerId: successfulCandidates[0]!.candidate.id, decisionOwner: supervisorPrincipal, rationale: "only successful render" }) },
    });
    expect(result.renders.filter((r) => r.state === "failed").length === 1 && result.renders.filter((r) => r.state === "completed").length === 1, "one failed render cancelled or corrupted sibling work");
    expect(result.decision.status === "selected" && result.decision.selectedAssetId, "supervisor could not select surviving render");
  }));

  cases.push(await runCase("ordinary creative decisions belong to supervisor and escalation reserves Executive max", async () => {
    const store = new InMemoryRuntimeStore(); const m = { ...mission(), executiveEscalationRequired: true };
    let adjudicatorCalled = false;
    const result = await runCreativeMission({
      mission: m, policy: policy(), store, currency: "USD", grantRefs: [],
      conceptWorkers: [
        { id: "a", overlay: "a", run: async () => ({ prompt: "A", rationale: "A", evidenceRefs: [], cost: 0 }) },
        { id: "b", overlay: "b", run: async () => ({ prompt: "B", rationale: "B", evidenceRefs: [], cost: 0 }) },
      ],
      renderer: { render: async ({ candidate }) => ({ artifactRef: `asset://${candidate.id}.png`, mimeType: "image/png", evidenceRefs: [], cost: 1 }) },
      evaluators: [{ id: "eval", evaluate: async () => ({ scores: { quality: 5 }, rationale: "ok", evidenceRefs: [] }) }],
      adjudicator: { decide: async () => { adjudicatorCalled = true; return { winnerId: "never", decisionOwner: "creative-supervisor", rationale: "never" }; } },
    });
    expect(!adjudicatorCalled && result.decision.status === "escalated" && result.receipt.decisionOwner === "executive", "high-boundary creative mission did not reserve Executive decision");
    expect(result.executiveProfile.reasoningEffort === "max" && result.supervisorProfile.reasoningEffort === "xhigh", "model law was not preserved across creative escalation");
  }));

  cases.push(await runCase("durable creative job settles once and replay does not rerender", async () => {
    const store = new InMemoryRuntimeStore(); const m = mission(); const now = new Date(m.createdAt);
    await submitCreativeMission(store, m, now);
    let renders = 0;
    const base = {
      mission: m, policy: policy(), store, currency: "USD", grantRefs: [], jobOwner: "creative-worker", now,
      conceptWorkers: [
        { id: "a", overlay: "a", run: async () => ({ prompt: "A", rationale: "A", evidenceRefs: [], cost: 0 }) },
        { id: "b", overlay: "b", run: async () => ({ prompt: "B", rationale: "B", evidenceRefs: [], cost: 0 }) },
      ],
      renderer: { render: async ({ candidate }: { candidate: { id: string } }) => { renders += 1; return { artifactRef: `asset://${candidate.id}.png`, mimeType: "image/png", evidenceRefs: [], cost: 1 }; } },
      evaluators: [{ id: "eval", evaluate: async () => ({ scores: { quality: 5 }, rationale: "ok", evidenceRefs: [] }) }],
      adjudicator: { decide: async ({ successfulCandidates, supervisorPrincipal }: any) => ({ winnerId: successfulCandidates[0].candidate.id, decisionOwner: supervisorPrincipal, rationale: "winner" }) },
    };
    const first = await processCreativeMissionJob(base);
    expect(first.decision.status === "selected" && renders === 2, "first creative job did not execute exactly two renders");
    const events = await store.listEventsAfter(m.companyId, { companyId: m.companyId, updatedAt: now.toISOString() }, 10);
    const decisionEvent = events.find((event) => event.type === "creative.mission.decided");
    expect(Boolean(decisionEvent), "creative decision event was not emitted");
    const eventText = JSON.stringify(decisionEvent?.payload ?? {});
    expect(!eventText.includes("prompt") && !eventText.includes("candidate") && eventText.includes("decision-only"), "creative decision event exposed internal candidate data");
    let contended = false;
    try { await processCreativeMissionJob({ ...base, jobOwner: "creative-worker-2", now: new Date(now.getTime() + 1_000) }); } catch (error) { contended = error instanceof Error && error.message.includes("CONTENDED:creative_job"); }
    expect(contended && renders === 2, "completed creative job was rerendered on replay");
  }));

  cases.push(await runCase("creative supervisor rationale cannot echo candidate prompt into chat receipt", async () => {
    const store = new InMemoryRuntimeStore(); const m = mission();
    let blocked = false;
    try {
      await runCreativeMission({
        mission: m, policy: policy(), store, currency: "USD", grantRefs: [],
        conceptWorkers: [
          { id: "a", overlay: "a", run: async () => ({ prompt: "PRIVATE-CANDIDATE-PROMPT-ALPHA", rationale: "A", evidenceRefs: [], cost: 0 }) },
          { id: "b", overlay: "b", run: async () => ({ prompt: "PRIVATE-CANDIDATE-PROMPT-BETA", rationale: "B", evidenceRefs: [], cost: 0 }) },
        ],
        renderer: { render: async ({ candidate }) => ({ artifactRef: `asset://${candidate.id}.png`, mimeType: "image/png", evidenceRefs: [], cost: 1 }) },
        evaluators: [{ id: "eval", evaluate: async () => ({ scores: { quality: 5 }, rationale: "ok", evidenceRefs: [] }) }],
        adjudicator: { decide: async ({ successfulCandidates, supervisorPrincipal }) => ({ winnerId: successfulCandidates[0]!.candidate.id, decisionOwner: supervisorPrincipal, rationale: "PRIVATE-CANDIDATE-PROMPT-ALPHA" }) },
      });
    } catch (error) { blocked = error instanceof Error && error.message.includes("attempted to expose candidate prompt"); }
    expect(blocked, "candidate prompt was allowed into chat-safe rationale");
  }));

  cases.push(await runCase("duplicate creative submission cannot overwrite mission payload", async () => {
    const store = new InMemoryRuntimeStore(); const m = mission(); const now = new Date(m.createdAt);
    await submitCreativeMission(store, m, now);
    const replay = await submitCreativeMission(store, structuredClone(m), now);
    expect(replay.status === "queued", "idempotent creative submission replay failed");
    let conflict = false;
    try { await submitCreativeMission(store, { ...m, briefRef: "brief:changed" }, now); } catch (error) { conflict = error instanceof Error && error.message.startsWith("IDEMPOTENCY_CONFLICT:"); }
    expect(conflict, "changed creative mission overwrote prior durable job payload");
  }));

  cases.push(await runCase("default control catalog hides internal creative candidates", async () => {
    const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const now = new Date().toISOString();
    const hidden: CompanyAsset = { id: randomUUID(), companyId, kind: "creative-image-candidate", providerId: "openai-responses-native", capability: "creative.image.generate", department: "creative", cost: 1, currency: "USD", status: "active", grantRefs: [], restrictions: ["internal-candidate", "not-chat-visible"], metadata: { visibility: "internal-candidate", artifactRef: "asset://hidden.png" }, createdAt: now, updatedAt: now };
    const publicAsset: CompanyAsset = { id: randomUUID(), companyId, kind: "selected-creative-image", providerId: "openai-responses-native", capability: "creative.image.generate", department: "creative", cost: 1, currency: "USD", status: "active", grantRefs: [], restrictions: [], metadata: { visibility: "selected" }, createdAt: now, updatedAt: now };
    await store.saveAsset(hidden); await store.saveAsset(publicAsset);
    const base = { companyId, semantics: createUniversalSemanticCapabilityRegistry(), providers: new ProviderRegistry(), runtime: store };
    const normal = await buildControlCatalog(base);
    expect(normal.assets.some((asset) => asset.id === publicAsset.id) && !normal.assets.some((asset) => asset.id === hidden.id), "default control catalog exposed internal creative candidate");
    const review = await buildControlCatalog({ ...base, includeInternalAssets: true });
    expect(review.assets.some((asset) => asset.id === hidden.id), "explicit internal review could not access candidate asset metadata");
  }));

  cases.push(await runCase("creative fanout rejects more than four concept candidates", async () => {
    const store = new InMemoryRuntimeStore(); const m = { ...mission(), candidateCount: 5, requiredSuccessfulCandidates: 2 };
    let rejected = false;
    try { await submitCreativeMission(store, m, new Date(m.createdAt)); } catch (error) { rejected = error instanceof Error && error.message.includes("cannot exceed four"); }
    expect(rejected, "creative mission accepted unbounded concept fanout");
  }));

  return cases;
}
