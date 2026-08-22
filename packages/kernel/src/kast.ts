import { createHash, randomUUID } from "node:crypto";
import type { HarnessImprovementHandoff, KASTEntry, KASTObservation, KASTPromotionResult, KASTSeverity, SessionCloseReceipt, Work } from "../../contracts/src/index.js";
import type { KastStore } from "../../database/src/kast-store.js";
import { DomainError } from "../../domain/src/index.js";

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;
function assertNoSecretLike(values: string[], label: string): void {
  if (values.some((value) => SECRET_LIKE.test(value))) throw new DomainError(`${label} contains secret-like material`);
}

const severityRank: Record<KASTSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
function maxSeverity(a: KASTSeverity, b: KASTSeverity): KASTSeverity { return severityRank[a] >= severityRank[b] ? a : b; }

export function canonicalKastFingerprint(observation: KASTObservation): string {
  const canonical = JSON.stringify({
    category: observation.category,
    title: normalized(observation.title),
    affectedPaths: uniq(observation.affectedPaths.map(normalized)),
    affectedCapabilities: uniq(observation.affectedCapabilities.map(normalized)),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function assertSafeKastObservation(observation: KASTObservation): void {
  if (observation.containsRawSecrets) throw new DomainError("KAST observation cannot contain raw secrets");
  if (observation.containsRawConversation) throw new DomainError("KAST observation cannot contain raw conversation");
  if (!observation.companyId || !observation.sessionRef || !observation.title.trim() || !observation.summary.trim()) throw new DomainError("KAST observation missing required identity/summary");
  assertNoSecretLike([observation.title, observation.summary, observation.recommendation, ...observation.reproduction, ...observation.verificationPlan], "KAST observation");
  if (!observation.evidenceRefs.length && observation.severity !== "low") throw new DomainError("material KAST observation requires evidence");
}

export async function recordKastObservation(store: KastStore, observation: KASTObservation): Promise<KASTEntry> {
  assertSafeKastObservation(observation);
  const fingerprint = canonicalKastFingerprint(observation);
  const existing = await store.getByFingerprint(observation.companyId, fingerprint);
  if (!existing) {
    const created: KASTEntry = {
      id: randomUUID(), companyId: observation.companyId, fingerprint,
      category: observation.category, severity: observation.severity,
      title: observation.title.trim(), summary: observation.summary.trim(),
      reproduction: uniq(observation.reproduction), affectedPaths: uniq(observation.affectedPaths),
      affectedCapabilities: uniq(observation.affectedCapabilities), evidenceRefs: uniq(observation.evidenceRefs),
      sessionRefs: [observation.sessionRef], recommendation: observation.recommendation.trim(),
      verificationPlan: uniq(observation.verificationPlan), occurrenceCount: 1,
      firstSeenAt: observation.observedAt, lastSeenAt: observation.observedAt, status: "candidate",
      regressionGuardRefs: [], verificationEvidenceRefs: [],
    };
    await store.upsertEntry(created);
    return (await store.getByFingerprint(observation.companyId, fingerprint)) ?? created;
  }
  const isNewSession = !existing.sessionRefs.includes(observation.sessionRef);
  const merged: KASTEntry = {
    ...existing,
    severity: maxSeverity(existing.severity, observation.severity),
    summary: observation.summary.trim() || existing.summary,
    reproduction: uniq([...existing.reproduction, ...observation.reproduction]),
    affectedPaths: uniq([...existing.affectedPaths, ...observation.affectedPaths]),
    affectedCapabilities: uniq([...existing.affectedCapabilities, ...observation.affectedCapabilities]),
    evidenceRefs: uniq([...existing.evidenceRefs, ...observation.evidenceRefs]),
    sessionRefs: uniq([...existing.sessionRefs, observation.sessionRef]),
    recommendation: observation.recommendation.trim() || existing.recommendation,
    verificationPlan: uniq([...existing.verificationPlan, ...observation.verificationPlan]),
    occurrenceCount: existing.occurrenceCount + (isNewSession ? 1 : 0),
    lastSeenAt: observation.observedAt > existing.lastSeenAt ? observation.observedAt : existing.lastSeenAt,
    status: existing.status === "verified" ? "candidate" : existing.status,
  };
  await store.upsertEntry(merged);
  return (await store.getByFingerprint(observation.companyId, fingerprint)) ?? merged;
}

export function shouldPromoteKast(entry: KASTEntry): { promote: boolean; reason: string } {
  if (entry.status === "verified" || entry.status === "rejected" || entry.status === "in-progress") return { promote: false, reason: `status=${entry.status}` };
  if (entry.severity === "critical" || entry.category === "security") return { promote: true, reason: "critical-or-security" };
  if (entry.severity === "high" && entry.occurrenceCount >= 2) return { promote: true, reason: "high-recurring" };
  if (entry.severity === "medium" && entry.occurrenceCount >= 3) return { promote: true, reason: "medium-recurring" };
  if (entry.severity === "low" && entry.occurrenceCount >= 4) return { promote: true, reason: "low-recurring" };
  return { promote: false, reason: "insufficient-evidence-or-recurrence" };
}

export async function promoteKastToImprovementWork(store: KastStore, entry: KASTEntry, now = new Date()): Promise<KASTPromotionResult> {
  const decision = shouldPromoteKast(entry);
  if (!decision.promote) return { promoted: false, reason: decision.reason };
  if (entry.improvementWorkId) return { promoted: false, reason: "already-promoted" };
  const work: Work = {
    id: entry.id, companyId: entry.companyId, owner: "harness-maintenance",
    objective: `Resolve KAST: ${entry.title}`,
    scope: `fingerprint=${entry.fingerprint}; evidence=${entry.evidenceRefs.join(",")}; verification=${entry.verificationPlan.join(" | ")}`,
    createdAt: now.toISOString(),
  };
  const next: KASTEntry = { ...entry, status: "accepted", improvementWorkId: work.id };
  await store.upsertEntry(next);
  return { promoted: true, reason: decision.reason, work };
}

export async function markKastVerified(store: KastStore, entry: KASTEntry, regressionGuardRefs: string[], verificationEvidenceRefs: string[], now = new Date()): Promise<KASTEntry> {
  if (!regressionGuardRefs.length || !verificationEvidenceRefs.length) throw new DomainError("KAST verification requires regression guard and evidence");
  const verified: KASTEntry = {
    ...entry, status: "verified", lastSeenAt: now.toISOString(),
    regressionGuardRefs: uniq([...entry.regressionGuardRefs, ...regressionGuardRefs]),
    verificationEvidenceRefs: uniq([...entry.verificationEvidenceRefs, ...verificationEvidenceRefs]),
  };
  await store.upsertEntry(verified);
  return verified;
}

export interface SessionCloseInput {
  companyId: string;
  sessionRef: string;
  status?: "complete" | "partial";
  businessMemoryCandidates?: string[];
  engramCandidates?: Array<{ title: string; summary: string; topicKey: string }>;
  artifactRefs?: string[];
  traceRefs?: string[];
  kastObservations?: KASTObservation[];
  unresolvedWorkRefs?: string[];
  nextSessionHints?: string[];
  containsRawSecrets: boolean;
  containsRawConversation: boolean;
  closedAt?: Date;
}

export async function closeHarnessSession(store: KastStore, input: SessionCloseInput): Promise<SessionCloseReceipt> {
  if (input.containsRawSecrets) throw new DomainError("session close cannot persist raw secrets");
  if (input.containsRawConversation) throw new DomainError("session close cannot persist raw conversation");
  if (!input.companyId || !input.sessionRef) throw new DomainError("session close requires companyId and sessionRef");
  assertNoSecretLike([...(input.businessMemoryCandidates ?? []), ...(input.artifactRefs ?? []), ...(input.traceRefs ?? []), ...(input.unresolvedWorkRefs ?? []), ...(input.nextSessionHints ?? []), ...(input.engramCandidates ?? []).flatMap((candidate) => [candidate.title, candidate.summary, candidate.topicKey])], "session close");
  const existing = await store.getSessionClose(input.companyId, input.sessionRef);
  if (existing) return existing;
  const kastEntryIds: string[] = [];
  for (const observation of input.kastObservations ?? []) {
    if (observation.companyId !== input.companyId || observation.sessionRef !== input.sessionRef) throw new DomainError("KAST observation session/company mismatch");
    kastEntryIds.push((await recordKastObservation(store, observation)).id);
  }
  const receipt: SessionCloseReceipt = {
    id: randomUUID(), companyId: input.companyId, sessionRef: input.sessionRef,
    closedAt: (input.closedAt ?? new Date()).toISOString(), status: input.status ?? "complete",
    businessMemoryCandidates: uniq(input.businessMemoryCandidates ?? []),
    engramCandidates: (input.engramCandidates ?? []).map((candidate) => ({ title: candidate.title.trim(), summary: candidate.summary.trim(), topicKey: candidate.topicKey.trim() })).filter((candidate) => candidate.title && candidate.summary && candidate.topicKey),
    artifactRefs: uniq(input.artifactRefs ?? []), traceRefs: uniq(input.traceRefs ?? []), kastEntryIds: uniq(kastEntryIds),
    unresolvedWorkRefs: uniq(input.unresolvedWorkRefs ?? []), nextSessionHints: uniq(input.nextSessionHints ?? []),
    containsRawSecrets: false, containsRawConversation: false,
  };
  await store.saveSessionClose(receipt);
  return receipt;
}

export function buildHarnessImprovementHandoff(companyId: string, entries: KASTEntry[], now = new Date()): HarnessImprovementHandoff {
  if (entries.some((entry) => entry.companyId !== companyId)) throw new DomainError("KAST handoff company isolation violation");
  return {
    generatedAt: now.toISOString(), companyId,
    entries: entries.filter((entry) => !["rejected", "silent", "verified"].includes(entry.status)).map((entry) => ({
      id: entry.id, fingerprint: entry.fingerprint, category: entry.category, severity: entry.severity,
      title: entry.title, summary: entry.summary, reproduction: [...entry.reproduction], affectedPaths: [...entry.affectedPaths],
      affectedCapabilities: [...entry.affectedCapabilities], evidenceRefs: [...entry.evidenceRefs], recommendation: entry.recommendation,
      verificationPlan: [...entry.verificationPlan], occurrenceCount: entry.occurrenceCount, status: entry.status,
      regressionGuardRefs: [...entry.regressionGuardRefs], verificationEvidenceRefs: [...entry.verificationEvidenceRefs],
    })),
    contract: { mayReadRawConversation: false, mayReadRawSecrets: false, maySelfModify: false, requiredFlow: "preflight-review-verify" },
  };
}

export async function requireSessionClose(store: KastStore, companyId: string, sessionRef: string): Promise<SessionCloseReceipt> {
  const receipt = await store.getSessionClose(companyId, sessionRef);
  if (!receipt) throw new DomainError(`session close receipt required:${sessionRef}`);
  return receipt;
}
