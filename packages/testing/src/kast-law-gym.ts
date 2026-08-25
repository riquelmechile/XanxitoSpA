import { runProductionBackedCase as runCase } from "./production-evidence.js";
import { randomUUID } from "node:crypto";
import type { KASTLawTrigger, PrincipalPolicy } from "../../contracts/src/index.js";
import { KastEngine, InMemoryEngramMemoryPort } from "../../kernel/src/kast-law.js";

export interface KastLawGymCaseResult { name: string; ok: boolean; detail: string }

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
    creativePolicy: { providerFamily: "chatgpt-host-only", imageGeneration: "host-native-image-tool", videoGeneration: "staged-unavailable", allowLegacyVideo: false },
  };
}

function trigger(overrides: Partial<KASTLawTrigger> = {}): KASTLawTrigger {
  return {
    id: randomUUID(),
    companyId: randomUUID(),
    sessionRef: `session:${randomUUID()}`,
    requestedMode: "improve",
    category: "friction",
    severity: "medium",
    summary: "Repeated exactOptionalPropertyTypes friction in harness code",
    evidenceRefs: ["trace:typescript"],
    recurrence: 3,
    affectedSurfaces: ["developer-experience"],
    strategyOverlays: ["simplify-first", "reliability-first"],
    containsRawSecrets: false,
    containsRawConversation: false,
    observedAt: "2026-08-22T00:25:00.000Z",
    ...overrides,
  };
}

export async function runKastLawGym(): Promise<KastLawGymCaseResult[]> {
  const cases: KastLawGymCaseResult[] = [];

  cases.push(await runCase("KAST direct law operates without database", async () => {
    const memory = new InMemoryEngramMemoryPort();
    const engine = new KastEngine({ policy: policy(), memory });
    const result = await engine.run(trigger({ requestedMode: "remember" }));
    expect(result.status === "remembered", "remember mode required database or failed");
    expect(memory.records.length === 1, "remember mode did not persist sanitized Engram record");
  }));

  cases.push(await runCase("KAST consults Engram before improvement", async () => {
    const memory = new InMemoryEngramMemoryPort([{ topicKey: "kast:prior", title: "Prior friction", summary: "Prior safe lesson", evidenceRefs: ["trace:prior"], outcome: "rejected" }]);
    let sawPrior = false;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async ({ priorMemory }) => { sawPrior = priorMemory.length > 0; return { summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["developer-experience"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }; },
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: false, sddComplete: true, regressionRefs: [], reviewApproved: false, fourRRefs: [], verificationRefs: [], blockingFindings: ["not-ready"] }),
      adjudicator: async () => ({ rationale: "no winner" }),
    });
    await engine.run(trigger());
    expect(sawPrior, "improvement proposer ran without restored Engram context");
  }));

  cases.push(await runCase("KAST variants run blind in parallel on Sol xhigh and owner is Sol max", async () => {
    const memory = new InMemoryEngramMemoryPort();
    let active = 0; let maxActive = 0; const efforts: string[] = []; let ownerEffort = "";
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async ({ profile, peerVariants }) => {
        efforts.push(profile.reasoningEffort); active += 1; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 15)); active -= 1;
        expect(peerVariants.length === 0, "variant proposer was not blind");
        return { summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["developer-experience"], evidenceRefs: ["proposal:evidence"], directMainMutation: false };
      },
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: true, regressionRefs: ["test:regression"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ ownerProfile, verifiedVariants }) => { ownerEffort = ownerProfile.reasoningEffort; return { selectedVariantId: verifiedVariants[0]!.variant.id, rationale: "best verified variant" }; },
      adopter: async ({ variant }) => ({ adopted: true, sourceChangeRef: variant.changeRef, adoptionRef: `commit:${variant.id}` }),
    });
    const result = await engine.run(trigger());
    expect(maxActive === 2, "KAST lost parallel variant generation");
    expect(efforts.length === 2 && efforts.every((effort) => effort === "xhigh"), "KAST branches did not use Sol/xhigh");
    expect(ownerEffort === "max", "KAST owner did not reserve Sol/max");
    expect(result.status === "adopted", "verified KAST experiment did not adopt");
  }));

  cases.push(await runCase("KAST cannot adopt without SDD TDD and RDD evidence", async () => {
    const memory = new InMemoryEngramMemoryPort(); let adoptionCalls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["routing"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: false, regressionRefs: [], reviewApproved: false, fourRRefs: [], verificationRefs: [], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "attempt" }) : ({ rationale: "attempt" }),
      adopter: async () => { adoptionCalls += 1; return { adopted: true, sourceChangeRef: "change:unsafe", adoptionRef: "commit:unsafe" }; },
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["routing"] }));
    expect(result.status === "rejected" && adoptionCalls === 0, "KAST bypassed SDD/TDD/RDD gate");
  }));

  cases.push(await runCase("KAST constitutional core is founder-required and never auto-adopted", async () => {
    const memory = new InMemoryEngramMemoryPort(); let proposerCalls = 0; let adoptionCalls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => { proposerCalls += 1; return { summary: "unsafe", changeRef: "change:model", isolationRef: "worktree:model", affectedSurfaces: ["model-law"], evidenceRefs: ["evidence:model"], directMainMutation: false }; },
      adopter: async () => { adoptionCalls += 1; return { adopted: true, adoptionRef: "commit:model" }; },
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["model-law"], severity: "critical" }));
    expect(result.status === "founder-required", "constitutional KAST did not escalate to Founder");
    expect(proposerCalls === 0 && adoptionCalls === 0, "constitutional change entered auto-improvement path");
  }));

  cases.push(await runCase("KAST rejects direct-main mutation even with otherwise green evidence", async () => {
    const memory = new InMemoryEngramMemoryPort(); let adoptionCalls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: "main", affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: true }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: true, regressionRefs: ["test:green"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "unsafe winner" }) : ({ rationale: "unsafe winner" }),
      adopter: async () => { adoptionCalls += 1; return { adopted: true, sourceChangeRef: "change:bad", adoptionRef: "commit:bad" }; },
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["skill"] }));
    expect(result.status === "rejected" && adoptionCalls === 0, "KAST allowed direct-main self-modification");
  }));

  cases.push(await runCase("KAST rejected experiment is retained as Engram learning", async () => {
    const memory = new InMemoryEngramMemoryPort();
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["performance"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: false, sddComplete: true, regressionRefs: ["test:failed"], reviewApproved: false, fourRRefs: [], verificationRefs: ["verify:failed"], blockingFindings: ["regression"] }),
      adjudicator: async () => ({ rationale: "nothing survived" }),
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["performance"] }));
    expect(result.status === "rejected", "failed experiment did not reject");
    expect(memory.records.some((record) => record.outcome === "rejected"), "failed experiment was not retained in Engram");
  }));

  cases.push(await runCase("KAST variant proposal rejects secret-like material", async () => {
    const memory = new InMemoryEngramMemoryPort();
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "token=supersecretvalue123", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: true, regressionRefs: ["test:green"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "winner" }) : ({ rationale: "none" }),
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["skill"] }));
    expect(result.status === "rejected" && result.variantRefs.length === 0, "secret-like variant entered KAST experiment");
  }));

  cases.push(await runCase("KAST caps improvement fanout at four variants", async () => {
    const memory = new InMemoryEngramMemoryPort(); let calls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => { calls += 1; return { summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }; },
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: false, sddComplete: true, regressionRefs: [], reviewApproved: false, fourRRefs: [], verificationRefs: [], blockingFindings: ["stop"] }),
      adjudicator: async () => ({ rationale: "none" }),
    });
    await engine.run(trigger({ affectedSurfaces: ["skill"], strategyOverlays: ["a", "b", "c", "d", "e", "f"] }));
    expect(calls === 4, "KAST exceeded four-way reasoning fanout");
  }));

  cases.push(await runCase("KAST verifier-observed constitutional surface overrides proposer label", async () => {
    const memory = new InMemoryEngramMemoryPort(); let adoptionCalls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "looks harmless", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: ["model-law"], passed: true, sddComplete: true, regressionRefs: ["test:green"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "winner" }) : ({ rationale: "none" }),
      adopter: async () => { adoptionCalls += 1; return { adopted: true, sourceChangeRef: "change:unsafe", adoptionRef: "commit:unsafe" }; },
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["skill"] }));
    expect(result.status === "rejected" && result.reason === "constitutional-surface" && adoptionCalls === 0, "KAST trusted proposer label over verifier-observed constitutional surface");
  }));

  cases.push(await runCase("KAST requires verifier to bind evidence to exact change ref", async () => {
    const memory = new InMemoryEngramMemoryPort(); let adoptionCalls = 0;
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: "change:different", isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: true, regressionRefs: ["test:green"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "winner" }) : ({ rationale: "none" }),
      adopter: async () => { adoptionCalls += 1; return { adopted: true, sourceChangeRef: "change:unsafe", adoptionRef: "commit:unsafe" }; },
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["skill"] }));
    expect(result.status === "rejected" && result.reason === "verified-change-ref-mismatch" && adoptionCalls === 0, "KAST accepted verification for a different change");
  }));

  cases.push(await runCase("KAST adopter must bind adoption to selected change ref", async () => {
    const memory = new InMemoryEngramMemoryPort();
    const engine = new KastEngine({
      policy: policy(), memory,
      proposer: async () => ({ summary: "candidate", changeRef: `change:${randomUUID()}`, isolationRef: `worktree:${randomUUID()}`, affectedSurfaces: ["skill"], evidenceRefs: ["proposal:evidence"], directMainMutation: false }),
      verifier: async ({ variant }) => ({ variantId: variant.id, verifiedChangeRef: variant.changeRef, isolationVerified: true, observedSurfaces: variant.affectedSurfaces, passed: true, sddComplete: true, regressionRefs: ["test:green"], reviewApproved: true, fourRRefs: ["review:risk", "review:readability", "review:reliability", "review:resilience"], verificationRefs: ["verify:green"], blockingFindings: [] }),
      adjudicator: async ({ verifiedVariants }) => verifiedVariants[0] ? ({ selectedVariantId: verifiedVariants[0].variant.id, rationale: "winner" }) : ({ rationale: "none" }),
      adopter: async () => ({ adopted: true, sourceChangeRef: "change:different", adoptionRef: "commit:wrong" }),
    });
    const result = await engine.run(trigger({ affectedSurfaces: ["skill"] }));
    expect(result.status === "rejected" && result.reason === "adopter-source-mismatch", "KAST accepted adoption for a different change");
  }));

  return cases;
}
