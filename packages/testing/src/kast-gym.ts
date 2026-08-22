import { randomUUID } from "node:crypto";
import type { KASTObservation } from "../../contracts/src/index.js";
import { InMemoryKastStore } from "../../database/src/index.js";
import { buildHarnessImprovementHandoff, closeHarnessSession, markKastVerified, promoteKastToImprovementWork, recordKastObservation, requireSessionClose, shouldPromoteKast } from "../../kernel/src/index.js";

interface CaseResult { name: string; ok: boolean; detail: string }
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function runCase(name: string, fn: () => void | Promise<void>): Promise<CaseResult> {
  try { await fn(); return { name, ok: true, detail: "pass" }; } catch (error) { return { name, ok: false, detail: error instanceof Error ? error.message : String(error) }; }
}

function observation(input: Partial<KASTObservation> = {}): KASTObservation {
  return {
    companyId: input.companyId ?? randomUUID(), sessionRef: input.sessionRef ?? `session:${randomUUID()}`,
    category: input.category ?? "bug", severity: input.severity ?? "medium", title: input.title ?? "Lease recovery duplicates effect",
    summary: input.summary ?? "A stale recovery path can repeat an already-applied effect.", reproduction: input.reproduction ?? ["claim lease", "apply effect", "crash before settle"],
    affectedPaths: input.affectedPaths ?? ["packages/kernel/src/example.ts"], affectedCapabilities: input.affectedCapabilities ?? ["runtime.reconcile"],
    evidenceRefs: input.evidenceRefs ?? ["trace:test:1"], recommendation: input.recommendation ?? "Fence settlement and reconcile before retry.",
    verificationPlan: input.verificationPlan ?? ["add crash regression", "run Company Gym"], containsRawSecrets: input.containsRawSecrets ?? false,
    containsRawConversation: input.containsRawConversation ?? false, observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

export async function runKastGym(): Promise<CaseResult[]> {
  const cases: CaseResult[] = [];

  cases.push(await runCase("meaningful session requires explicit close receipt", async () => {
    const store = new InMemoryKastStore();
    let failed = false;
    try { await requireSessionClose(store, "c1", "s1"); } catch { failed = true; }
    expect(failed, "missing session close receipt was accepted");
    const receipt = await closeHarnessSession(store, { companyId: "c1", sessionRef: "s1", containsRawSecrets: false, containsRawConversation: false, nextSessionHints: ["resume tests"] });
    expect((await requireSessionClose(store, "c1", "s1")).id === receipt.id, "stored session close not retrievable");
  }));

  cases.push(await runCase("session close separates Engram candidates, artifacts, KAST and business memory", async () => {
    const store = new InMemoryKastStore();
    const companyId = randomUUID(); const sessionRef = "session:split";
    const receipt = await closeHarnessSession(store, {
      companyId, sessionRef, containsRawSecrets: false, containsRawConversation: false,
      businessMemoryCandidates: ["pricing outcome changed"],
      engramCandidates: [{ title: "Harness invariant", summary: "Lease must fence settlement", topicKey: "runtime/fencing" }],
      artifactRefs: ["artifact:log:1"], traceRefs: ["trace:1"], unresolvedWorkRefs: ["work:1"], nextSessionHints: ["verify recovery"],
      kastObservations: [observation({ companyId, sessionRef })],
    });
    expect(receipt.businessMemoryCandidates.length === 1 && receipt.engramCandidates.length === 1 && receipt.kastEntryIds.length === 1, "destinations were conflated");
    expect(receipt.artifactRefs[0] === "artifact:log:1" && receipt.traceRefs[0] === "trace:1", "artifact/trace refs missing");
  }));

  cases.push(await runCase("KAST rejects raw secrets and raw conversation", async () => {
    const store = new InMemoryKastStore();
    let secretRejected = false; let conversationRejected = false;
    try { await recordKastObservation(store, observation({ containsRawSecrets: true })); } catch { secretRejected = true; }
    try { await recordKastObservation(store, observation({ containsRawConversation: true })); } catch { conversationRejected = true; }
    expect(secretRejected && conversationRejected, "unsafe KAST observation was accepted");
  }));


  cases.push(await runCase("same-session KAST replay is idempotent and does not inflate recurrence", async () => {
    const store = new InMemoryKastStore(); const companyId = randomUUID();
    const first = await recordKastObservation(store, observation({ companyId, sessionRef: "same-session" }));
    const replay = await recordKastObservation(store, observation({ companyId, sessionRef: "same-session", evidenceRefs: ["trace:replay"] }));
    expect(first.id === replay.id && replay.occurrenceCount === 1, "same-session replay inflated occurrence count");
    expect(replay.evidenceRefs.includes("trace:replay"), "same-session replay failed to merge evidence");
  }));

  cases.push(await runCase("secret-like text is rejected even when unsafe flags are false", async () => {
    const store = new InMemoryKastStore();
    let rejected = false;
    try { await recordKastObservation(store, observation({ summary: "provider token=abcdefghijklmnop leaked in error" })); } catch { rejected = true; }
    expect(rejected, "secret-like KAST text was accepted");
  }));

  cases.push(await runCase("KAST deduplicates recurring issue by fingerprint and preserves evidence", async () => {
    const store = new InMemoryKastStore(); const companyId = randomUUID();
    const first = await recordKastObservation(store, observation({ companyId, sessionRef: "s1", observedAt: "2026-08-21T10:00:00Z" }));
    const second = await recordKastObservation(store, observation({ companyId, sessionRef: "s2", observedAt: "2026-08-21T11:00:00Z", evidenceRefs: ["trace:test:2"] }));
    expect(first.id === second.id && second.occurrenceCount === 2, "recurring KAST issue duplicated instead of merging");
    expect(second.sessionRefs.includes("s1") && second.sessionRefs.includes("s2") && second.evidenceRefs.includes("trace:test:2"), "recurrence evidence/session refs lost");
  }));

  cases.push(await runCase("KAST promotion is evidence/recurrence based and cannot self-modify", async () => {
    const store = new InMemoryKastStore(); const companyId = randomUUID();
    let entry = await recordKastObservation(store, observation({ companyId, sessionRef: "s1", severity: "medium" }));
    expect(!shouldPromoteKast(entry).promote, "single medium issue promoted too early");
    entry = await recordKastObservation(store, observation({ companyId, sessionRef: "s2", severity: "medium" }));
    entry = await recordKastObservation(store, observation({ companyId, sessionRef: "s3", severity: "medium" }));
    const promoted = await promoteKastToImprovementWork(store, entry);
    expect(promoted.promoted && promoted.work?.owner === "harness-maintenance", "recurring issue did not become ordinary improvement Work");
    expect(!("patch" in (promoted.work as unknown as Record<string, unknown>)), "promotion attempted direct self-modification");
  }));

  cases.push(await runCase("critical/security KAST promotes immediately", async () => {
    const store = new InMemoryKastStore();
    const entry = await recordKastObservation(store, observation({ severity: "critical", category: "security" }));
    expect(shouldPromoteKast(entry).promote, "critical security issue did not promote immediately");
  }));

  cases.push(await runCase("KAST verified closure requires regression guard and verification evidence", async () => {
    const store = new InMemoryKastStore();
    const entry = await recordKastObservation(store, observation({ severity: "high" }));
    let rejected = false;
    try { await markKastVerified(store, entry, [], ["ci:1"]); } catch { rejected = true; }
    expect(rejected, "verified without regression guard");
    const verified = await markKastVerified(store, entry, ["gym:kast:dedupe"], ["ci:green"]);
    expect(verified.status === "verified" && verified.regressionGuardRefs.length === 1, "verified KAST did not retain regression evidence");
  }));


  cases.push(await runCase("verified KAST entries are excluded from maintainer backlog", async () => {
    const store = new InMemoryKastStore(); const companyId = randomUUID();
    const entry = await recordKastObservation(store, observation({ companyId, severity: "high" }));
    const verified = await markKastVerified(store, entry, ["gym:guard"], ["ci:green"]);
    const handoff = buildHarnessImprovementHandoff(companyId, [verified]);
    expect(handoff.entries.length === 0, "verified issue was re-exported as actionable work");
  }));

  cases.push(await runCase("harness improvement handoff is sanitized and explicitly forbids self-modification", async () => {
    const store = new InMemoryKastStore(); const companyId = randomUUID();
    const entry = await recordKastObservation(store, observation({ companyId }));
    const handoff = buildHarnessImprovementHandoff(companyId, [entry], new Date("2026-08-21T12:00:00Z"));
    expect(handoff.contract.mayReadRawConversation === false && handoff.contract.mayReadRawSecrets === false && handoff.contract.maySelfModify === false, "handoff expanded maintainer authority");
    expect(handoff.contract.requiredFlow === "preflight-review-verify", "handoff bypassed governed maintenance flow");
    const serialized = JSON.stringify(handoff);
    expect(!serialized.includes("rawConversation") && !serialized.includes("rawSecrets"), "handoff leaked raw content fields");
  }));

  return cases;
}
