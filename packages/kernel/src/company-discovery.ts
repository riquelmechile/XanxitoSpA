import { createHash, randomUUID } from "node:crypto";
import type { BusinessCapability, BusinessEvidence, BusinessFact, BusinessUnknown, CompanyAsset, DiscoveryRevision } from "../../contracts/src/index.js";

const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, canonicalize(obj[key])]));
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function assertConfidence(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} confidence invalid`);
  return value;
}

function clean(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export interface BuildDiscoveryRevisionInput {
  companyId: string;
  evidence: BusinessEvidence[];
  facts: Omit<BusinessFact, "revisionId">[];
  unknowns: BusinessUnknown[];
  capabilities: BusinessCapability[];
  parent?: DiscoveryRevision | null;
}

export function buildDiscoveryRevision(input: BuildDiscoveryRevisionInput, now = new Date()): DiscoveryRevision {
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  if (evidenceIds.size !== input.evidence.length) throw new Error("duplicate evidence id");
  for (const evidence of input.evidence) assertConfidence(evidence.confidenceCeiling, `evidence:${evidence.id}`);

  const revisionId = randomUUID();
  const factIds = new Set(input.facts.map((item) => item.id));
  if (factIds.size !== input.facts.length) throw new Error("duplicate fact id");
  const facts: BusinessFact[] = input.facts.map((fact) => {
    assertConfidence(fact.confidence, `fact:${fact.id}`);
    const evidenceRefs = clean(fact.evidenceRefs);
    for (const ref of evidenceRefs) if (!evidenceIds.has(ref) && !input.parent?.evidence.some((item) => item.id === ref)) throw new Error(`fact evidence missing:${ref}`);
    return { ...fact, statement: fact.statement.trim(), evidenceRefs, revisionId };
  });

  const allFactIds = new Set([...(input.parent?.facts.map((item) => item.id) ?? []), ...facts.map((item) => item.id)]);
  const capabilities = input.capabilities.map((capability) => {
    assertConfidence(capability.confidence, `capability:${capability.id}`);
    const factRefs = clean(capability.factRefs);
    const evidenceRefs = clean(capability.evidenceRefs);
    for (const ref of factRefs) if (!allFactIds.has(ref)) throw new Error(`capability fact missing:${ref}`);
    for (const ref of evidenceRefs) if (!evidenceIds.has(ref) && !input.parent?.evidence.some((item) => item.id === ref)) throw new Error(`capability evidence missing:${ref}`);
    return { ...capability, factRefs, evidenceRefs };
  });

  const unknownIds = new Set(input.unknowns.map((item) => item.id));
  if (unknownIds.size !== input.unknowns.length) throw new Error("duplicate unknown id");

  const semantic = {
    schemaVersion: 1 as const,
    companyId: input.companyId,
    parentRevisionId: input.parent?.revisionId ?? null,
    sequence: (input.parent?.sequence ?? 0) + 1,
    sourceRefs: clean(input.evidence.map((item) => item.id)),
    evidence: structuredClone(input.evidence),
    facts,
    unknowns: structuredClone(input.unknowns),
    capabilities,
  };

  return {
    ...semantic,
    revisionId,
    createdAt: now.toISOString(),
    fingerprint: fingerprint(semantic),
  };
}

export function applyDiscoveryAnswers(input: {
  prior: DiscoveryRevision;
  answers: Array<{ unknownId: string; answer: string; evidenceId: string }>;
  evidence: BusinessEvidence[];
}, now = new Date()): DiscoveryRevision {
  const answerByUnknown = new Map(input.answers.map((answer) => [answer.unknownId, answer]));
  const unknowns = input.prior.unknowns.map((unknown) => {
    const answer = answerByUnknown.get(unknown.id);
    return answer ? { ...unknown, status: "resolved" as const, resolutionRef: answer.evidenceId } : { ...unknown };
  });
  for (const answer of input.answers) if (!input.prior.unknowns.some((unknown) => unknown.id === answer.unknownId)) throw new Error(`unknown not found:${answer.unknownId}`);

  const facts: Omit<BusinessFact, "revisionId">[] = [
    ...input.prior.facts.map(({ revisionId: _revisionId, ...fact }) => fact),
    ...input.answers.map((answer) => ({
      id: `owner-confirmed:${answer.unknownId}:${answer.evidenceId}`,
      statement: answer.answer.trim(),
      status: "owner-confirmed" as const,
      confidence: 1,
      evidenceRefs: [answer.evidenceId],
      provenance: "owner-answer",
    })),
  ];

  return buildDiscoveryRevision({
    companyId: input.prior.companyId,
    parent: input.prior,
    evidence: [...input.prior.evidence, ...input.evidence],
    facts,
    unknowns,
    capabilities: structuredClone(input.prior.capabilities),
  }, now);
}

export function createDiscoveryAsset(input: { companyId: string; revision: DiscoveryRevision }, now = new Date()): CompanyAsset {
  if (input.revision.companyId !== input.companyId) throw new Error("company mismatch in discovery revision");
  if (SECRET_LIKE.test(JSON.stringify(input.revision))) throw new Error("company discovery contains secret-like material");
  return {
    id: randomUUID(),
    companyId: input.companyId,
    kind: "company-discovery",
    capability: "company.discovery",
    department: "executive",
    cost: 0,
    currency: "USD",
    status: "active",
    grantRefs: [],
    restrictions: ["descriptive-only", "no-authority-grant"],
    metadata: {
      schemaVersion: 1,
      revisionId: input.revision.revisionId,
      parentRevisionId: input.revision.parentRevisionId,
      sequence: input.revision.sequence,
      fingerprint: input.revision.fingerprint,
      snapshot: structuredClone(input.revision),
      grantsAuthority: false,
      grantsBudget: false,
      grantsCapabilities: false,
      executesWork: false,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
