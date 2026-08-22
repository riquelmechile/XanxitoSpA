import { createHash, randomUUID } from "node:crypto";
import type {
  CompanyAsset,
  CreativeDecision,
  CreativeDecisionReceipt,
  CreativeMission,
  CreativeRenderRecord,
  CreativeStrategyCandidate,
  CreativeSubmissionReceipt,
  PrincipalPolicy,
  ScheduledJob,
  VisualFitnessEvaluation,
} from "../../contracts/src/index.js";
import type { RuntimeStore } from "../../database/src/runtime-store.js";
import { DomainError, resolveModelLawProfile } from "../../domain/src/index.js";


type XhighProfile = { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
type MaxProfile = { model: "gpt-5.6-sol"; reasoningEffort: "max" };

function asXhighProfile(profile: { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" }, label: string): XhighProfile {
  if (profile.reasoningEffort !== "xhigh") throw new DomainError(`${label} must use xhigh`);
  return { model: profile.model, reasoningEffort: "xhigh" };
}

function asMaxProfile(profile: { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" }, label: string): MaxProfile {
  if (profile.reasoningEffort !== "max") throw new DomainError(`${label} must use max`);
  return { model: profile.model, reasoningEffort: "max" };
}

export interface CreativeConceptWorker {
  id: string;
  overlay: string;
  run(input: {
    mission: CreativeMission;
    profile: { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
  }): Promise<{ prompt: string; rationale: string; evidenceRefs: string[]; cost: number }>;
}

export interface NativeImageRenderer {
  render(input: {
    mission: CreativeMission;
    candidate: CreativeStrategyCandidate;
  }): Promise<{ artifactRef: string; mimeType: string; evidenceRefs: string[]; cost: number }>;
}

export interface CreativeEvaluator {
  id: string;
  evaluate(input: {
    mission: CreativeMission;
    candidate: CreativeStrategyCandidate;
    asset: CompanyAsset;
    profile: { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
  }): Promise<{ scores: Record<string, number>; rationale: string; evidenceRefs: string[] }>;
}

export interface CreativeAdjudicator {
  decide(input: {
    mission: CreativeMission;
    successfulCandidates: Array<{ candidate: CreativeStrategyCandidate; render: CreativeRenderRecord; asset: CompanyAsset }>;
    evaluations: VisualFitnessEvaluation[];
    supervisorPrincipal: string;
    supervisorProfile: { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
  }): Promise<{ winnerId: string; decisionOwner: string; rationale: string }>;
}

export interface CreativeMissionRunInput {
  mission: CreativeMission;
  policy: PrincipalPolicy;
  store: RuntimeStore;
  conceptWorkers: CreativeConceptWorker[];
  renderer: NativeImageRenderer;
  evaluators: CreativeEvaluator[];
  adjudicator: CreativeAdjudicator;
  maxConceptConcurrency?: number;
  maxRenderConcurrency?: number;
  maxEvaluationConcurrency?: number;
  currency: string;
  grantRefs: string[];
}

export interface CreativeMissionRunResult {
  missionId: string;
  candidates: CreativeStrategyCandidate[];
  renders: CreativeRenderRecord[];
  evaluations: VisualFitnessEvaluation[];
  decision: CreativeDecision;
  receipt: CreativeDecisionReceipt;
  supervisorProfile: { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
  executiveProfile: { model: "gpt-5.6-sol"; reasoningEffort: "max" };
}

function safeCreativeError(error: unknown): string {
  if (error instanceof DomainError) return error.message.slice(0, 240);
  if (error instanceof Error) return `creative-${error.name || "error"}`;
  return "creative-error";
}

function chatSafeRationale(rationale: string, candidates: CreativeStrategyCandidate[]): string {
  const compact = rationale.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!compact) return "Creative Supervisor completed governed adjudication.";
  for (const candidate of candidates) {
    const prompt = candidate.prompt.trim();
    if (prompt.length >= 8 && compact.includes(prompt)) throw new DomainError("creative rationale attempted to expose candidate prompt");
  }
  return compact;
}

async function mapBounded<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new DomainError("creative concurrency must be a positive integer");
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(runners);
  return results;
}


function creativeMissionFingerprint(mission: CreativeMission): string {
  return createHash("sha256").update(JSON.stringify({
    id: mission.id,
    companyId: mission.companyId,
    workId: mission.workId,
    supervisorPrincipal: mission.supervisorPrincipal,
    briefRef: mission.briefRef,
    evidenceSnapshotRef: mission.evidenceSnapshotRef,
    candidateCount: mission.candidateCount,
    requiredSuccessfulCandidates: mission.requiredSuccessfulCandidates,
    executiveEscalationRequired: mission.executiveEscalationRequired,
  })).digest("hex");
}

export async function submitCreativeMission(store: RuntimeStore, mission: CreativeMission, now = new Date()): Promise<CreativeSubmissionReceipt> {
  if (mission.candidateCount < 2) throw new DomainError("creative COMPETE requires at least two candidates");
  if (mission.candidateCount > 4) throw new DomainError("creative COMPETE candidate fanout cannot exceed four");
  if (mission.requiredSuccessfulCandidates < 1 || mission.requiredSuccessfulCandidates > mission.candidateCount) throw new DomainError("invalid required successful candidate count");
  const timestamp = now.toISOString();
  const fingerprint = creativeMissionFingerprint(mission);
  const submissionKey = `creative:submit:${mission.id}`;
  const submissionOwner = `creative-submit:${mission.id}`;
  const submission = await store.claimIdempotency(mission.companyId, submissionKey, { fingerprint }, submissionOwner, now);
  if (!submission.claimed) {
    const prior = submission.record.intent as { fingerprint?: unknown };
    if (prior.fingerprint !== fingerprint) throw new DomainError(`IDEMPOTENCY_CONFLICT:creative_submission_changed:${mission.id}`);
    return { missionId: mission.id, status: "queued", chatMode: "decision-only" };
  }
  const job: ScheduledJob<CreativeMission> = {
    id: mission.id,
    companyId: mission.companyId,
    kind: "creative.mission",
    payload: structuredClone(mission),
    materiality: "medium",
    dueAt: timestamp,
    state: "pending",
    attempts: 0,
    maxAttempts: 3,
    fencingToken: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    await store.enqueueJob(job);
    const settled = await store.markIdempotency(mission.companyId, submissionKey, submissionOwner, submission.record.fencingToken, "applied", now, { jobId: mission.id });
    if (!settled) throw new DomainError("creative submission idempotency fencing lost");
    return { missionId: mission.id, status: "queued", chatMode: "decision-only" };
  } catch (error) {
    await store.markIdempotency(mission.companyId, submissionKey, submissionOwner, submission.record.fencingToken, "failed", now, undefined, safeCreativeError(error));
    throw error;
  }
}

export async function runCreativeMission(input: CreativeMissionRunInput): Promise<CreativeMissionRunResult> {
  const { mission, policy } = input;
  if (input.conceptWorkers.length < mission.candidateCount) throw new DomainError("not enough creative concept workers for mission");
  if (input.evaluators.length < 1) throw new DomainError("creative mission requires at least one evaluator");

  const supervisorProfile = asXhighProfile(resolveModelLawProfile(policy, "supervisor"), "Creative Supervisor");
  const workerProfile = asXhighProfile(resolveModelLawProfile(policy, "worker"), "Creative worker");
  const verifierProfile = asXhighProfile(resolveModelLawProfile(policy, "verifier"), "Creative evaluator");
  const executiveProfile = asMaxProfile(resolveModelLawProfile(policy, "executive"), "Executive");

  const selectedWorkers = input.conceptWorkers.slice(0, mission.candidateCount);
  const maxConceptConcurrency = Math.min(input.maxConceptConcurrency ?? 4, 4);
  const candidates = await mapBounded(selectedWorkers, maxConceptConcurrency, async (worker, index): Promise<CreativeStrategyCandidate> => {
    const result = await worker.run({ mission: structuredClone(mission), profile: workerProfile });
    if (!result.prompt.trim()) throw new DomainError(`creative candidate ${worker.id} returned empty prompt`);
    return {
      id: `${mission.id}:candidate:${index}`,
      missionId: mission.id,
      strategyOverlay: worker.overlay,
      prompt: result.prompt,
      rationale: result.rationale,
      evidenceRefs: [...result.evidenceRefs],
      cost: result.cost,
      model: workerProfile.model,
      reasoningEffort: workerProfile.reasoningEffort,
    };
  });

  const renderResults = await mapBounded(candidates, Math.min(input.maxRenderConcurrency ?? 2, 2), async (candidate): Promise<{ record: CreativeRenderRecord; asset?: CompanyAsset }> => {
    try {
      const rendered = await input.renderer.render({ mission, candidate });
      if (!rendered.artifactRef.trim()) throw new DomainError("native image renderer returned empty artifact ref");
      const now = new Date().toISOString();
      const asset: CompanyAsset = {
        id: randomUUID(),
        companyId: mission.companyId,
        kind: "creative-image-candidate",
        providerId: "openai-responses-native",
        capability: "creative.image.generate",
        department: "creative",
        cost: rendered.cost,
        currency: input.currency,
        status: "active",
        grantRefs: [...input.grantRefs],
        restrictions: ["internal-candidate", "not-chat-visible"],
        metadata: {
          missionId: mission.id,
          candidateId: candidate.id,
          artifactRef: rendered.artifactRef,
          mimeType: rendered.mimeType,
          visibility: "internal-candidate",
          briefRef: mission.briefRef,
          evidenceSnapshotRef: mission.evidenceSnapshotRef,
        },
        createdAt: now,
        updatedAt: now,
      };
      await input.store.saveAsset(asset);
      return {
        asset,
        record: { candidateId: candidate.id, state: "completed", assetId: asset.id, artifactRef: rendered.artifactRef, evidenceRefs: [...rendered.evidenceRefs], cost: rendered.cost },
      };
    } catch (error) {
      return {
        record: { candidateId: candidate.id, state: "failed", evidenceRefs: [], cost: 0, error: safeCreativeError(error) },
      };
    }
  });

  const renders = renderResults.map((entry) => entry.record);
  const successfulCandidates = renderResults.flatMap((entry) => {
    if (!entry.asset || entry.record.state !== "completed") return [];
    const candidate = candidates.find((item) => item.id === entry.record.candidateId);
    if (!candidate) return [];
    return [{ candidate, render: entry.record, asset: entry.asset }];
  });

  if (successfulCandidates.length < mission.requiredSuccessfulCandidates || mission.executiveEscalationRequired) {
    const insufficient = successfulCandidates.length < mission.requiredSuccessfulCandidates;
    const decision: CreativeDecision = {
      missionId: mission.id,
      status: insufficient ? "insufficient-candidates" : "escalated",
      decisionOwner: "executive",
      rationale: insufficient ? "Not enough successful internal candidates to complete governed creative adjudication." : "Creative mission crossed an Executive authority/risk boundary.",
      escalationRequired: true,
    };
    return {
      missionId: mission.id,
      candidates,
      renders,
      evaluations: [],
      decision,
      receipt: {
        missionId: mission.id,
        status: decision.status,
        decisionOwner: "executive",
        selectedAssetRefs: [],
        rationaleSummary: decision.rationale,
        escalationRequired: true,
        chatMode: "decision-only",
      },
      supervisorProfile,
      executiveProfile,
    };
  }

  const selectedEvaluators = input.evaluators.slice(0, 2);
  const evaluationWork = successfulCandidates.flatMap((entry) => selectedEvaluators.map((evaluator) => ({ entry, evaluator })));
  const evaluations = await mapBounded(evaluationWork, Math.min(input.maxEvaluationConcurrency ?? 2, 2), async ({ entry, evaluator }): Promise<VisualFitnessEvaluation> => {
    const result = await evaluator.evaluate({ mission, candidate: entry.candidate, asset: entry.asset, profile: verifierProfile });
    return {
      candidateId: entry.candidate.id,
      evaluatorId: evaluator.id,
      scores: { ...result.scores },
      rationale: result.rationale,
      evidenceRefs: [...result.evidenceRefs],
      model: verifierProfile.model,
      reasoningEffort: verifierProfile.reasoningEffort,
    };
  });

  const adjudication = await input.adjudicator.decide({ mission, successfulCandidates, evaluations, supervisorPrincipal: mission.supervisorPrincipal, supervisorProfile });
  if (adjudication.decisionOwner !== mission.supervisorPrincipal) throw new DomainError("ordinary creative adjudication must remain with Creative Supervisor");
  const winner = successfulCandidates.find((entry) => entry.candidate.id === adjudication.winnerId);
  if (!winner) throw new DomainError("creative adjudicator selected unavailable or failed candidate");

  const decision: CreativeDecision = {
    missionId: mission.id,
    status: "selected",
    decisionOwner: mission.supervisorPrincipal,
    selectedCandidateId: winner.candidate.id,
    selectedAssetId: winner.asset.id,
    rationale: chatSafeRationale(adjudication.rationale, candidates),
    escalationRequired: false,
  };
  return {
    missionId: mission.id,
    candidates,
    renders,
    evaluations,
    decision,
    receipt: {
      missionId: mission.id,
      status: "selected",
      decisionOwner: mission.supervisorPrincipal,
      selectedAssetRefs: [winner.asset.id],
      rationaleSummary: chatSafeRationale(adjudication.rationale, candidates),
      escalationRequired: false,
      chatMode: "decision-only",
    },
    supervisorProfile,
    executiveProfile,
  };
}


export interface ProcessCreativeMissionJobInput extends CreativeMissionRunInput {
  jobOwner: string;
  now?: Date;
  leaseMs?: number;
  staleAfterMs?: number;
}

export async function processCreativeMissionJob(input: ProcessCreativeMissionJobInput): Promise<CreativeMissionRunResult> {
  const now = input.now ?? new Date();
  const lease = await input.store.claimJob(input.mission.companyId, input.mission.id, input.jobOwner, now, input.leaseMs ?? 120_000);
  if (!lease) throw new DomainError(`CONTENDED:creative_job:${input.mission.id}`);

  const journalKey = `creative:mission:${input.mission.id}`;
  const claim = await input.store.claimIdempotency(
    input.mission.companyId,
    journalKey,
    { workId: input.mission.workId, briefRef: input.mission.briefRef, evidenceSnapshotRef: input.mission.evidenceSnapshotRef },
    input.jobOwner,
    now,
  );

  if (!claim.claimed) {
    if (claim.record.state === "applied" && claim.record.result) {
      const cached = structuredClone(claim.record.result as CreativeMissionRunResult);
      const settled = await input.store.settleJob(lease, "completed", now);
      if (!settled) throw new DomainError("creative job fencing lost while replaying completed mission");
      return cached;
    }
    if (claim.record.state === "intent") {
      const reconciliation = await input.store.claimStaleIdempotencyForReconciliation(
        input.mission.companyId,
        journalKey,
        `${input.jobOwner}:reconciler`,
        now,
        input.staleAfterMs ?? 60_000,
      );
      await input.store.settleJob(lease, "failed", now, "creative mission requires reconciliation");
      if (reconciliation) throw new DomainError(`ESCALATE:creative_reconciliation_required:${input.mission.id}`);
      throw new DomainError(`CONTENDED:creative_mission:${input.mission.id}`);
    }
    await input.store.settleJob(lease, "failed", now, "creative mission requires reconciliation");
    throw new DomainError(`ESCALATE:creative_reconciliation_required:${input.mission.id}`);
  }

  try {
    const result = await runCreativeMission(input);
    const applied = await input.store.markIdempotency(
      input.mission.companyId,
      journalKey,
      input.jobOwner,
      claim.record.fencingToken,
      "applied",
      new Date(),
      result,
    );
    if (!applied) throw new DomainError("creative mission idempotency fencing lost after execution");
    await input.store.appendEvent({
      id: randomUUID(),
      companyId: input.mission.companyId,
      type: "creative.mission.decided",
      occurredAt: new Date().toISOString(),
      actorPrincipal: result.receipt.decisionOwner,
      correlationId: input.mission.workId,
      idempotencyKey: `creative:decision:${input.mission.id}`,
      payload: structuredClone(result.receipt),
      sensitivity: "internal",
      evidenceRefs: [...result.receipt.selectedAssetRefs],
    });
    const settled = await input.store.settleJob(lease, "completed", new Date());
    if (!settled) throw new DomainError("creative job fencing lost after execution");
    return result;
  } catch (error) {
    await input.store.markIdempotency(
      input.mission.companyId,
      journalKey,
      input.jobOwner,
      claim.record.fencingToken,
      "unknown",
      new Date(),
      undefined,
      safeCreativeError(error),
    );
    await input.store.settleJob(lease, "failed", new Date(), safeCreativeError(error));
    throw error;
  }
}
