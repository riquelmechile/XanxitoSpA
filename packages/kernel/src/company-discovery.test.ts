import { describe, expect, it } from "vitest";
import type { BusinessEvidence } from "../../contracts/src/index.js";
import { applyDiscoveryAnswers, buildDiscoveryRevision, createDiscoveryAsset } from "./company-discovery.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-24T20:00:00.000Z");

const evidence: BusinessEvidence[] = [
  {
    id: "ev-sales-process",
    source: { id: "owner-interview", kind: "owner", label: "Founder interview" },
    kind: "process-observation",
    observedAt: now.toISOString(),
    statement: "Sales follow-up is managed manually by the revenue team",
    confidenceCeiling: 1,
  },
  {
    id: "ev-crm-gap",
    source: { id: "process-audit", kind: "system", label: "Process audit" },
    kind: "capability-observation",
    observedAt: now.toISOString(),
    statement: "The current sales process needs crm.read capability",
    confidenceCeiling: 0.95,
  },
];

describe("Company Discovery", () => {
  it("keeps evidence, facts and capabilities separate with provenance and confidence", () => {
    const revision = buildDiscoveryRevision({
      companyId,
      evidence,
      facts: [
        { id: "fact-manual-sales", statement: "Manual sales follow-up exists", status: "observed", confidence: 0.95, evidenceRefs: ["ev-sales-process"], provenance: "source-observation" },
      ],
      unknowns: [{ id: "unknown-crm-owner", question: "Who owns CRM quality?", category: "organization", priority: "high", status: "open" }],
      capabilities: [
        { id: "crm-read", name: "crm.read", description: "Read CRM state", criticality: "important", confidence: 0.9, factRefs: ["fact-manual-sales"], evidenceRefs: ["ev-crm-gap"], preferredDepartmentHint: "revenue-team" },
      ],
    }, now);

    expect(revision.sequence).toBe(1);
    expect(revision.facts[0]?.evidenceRefs).toEqual(["ev-sales-process"]);
    expect(revision.capabilities[0]?.name).toBe("crm.read");
    expect(revision.capabilities[0]?.preferredDepartmentHint).toBe("revenue-team");
    expect(revision.capabilities[0]?.id).not.toBe("revenue-team");
    expect(revision.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a new immutable revision when an owner resolves an unknown", () => {
    const first = buildDiscoveryRevision({
      companyId,
      evidence,
      facts: [{ id: "fact-manual-sales", statement: "Manual sales follow-up exists", status: "observed", confidence: 0.95, evidenceRefs: ["ev-sales-process"], provenance: "source-observation" }],
      unknowns: [{ id: "unknown-crm-owner", question: "Who owns CRM quality?", category: "organization", priority: "high", status: "open" }],
      capabilities: [],
    }, now);

    const second = applyDiscoveryAnswers({
      prior: first,
      answers: [{ unknownId: "unknown-crm-owner", answer: "Revenue Team owns CRM quality", evidenceId: "ev-owner-answer" }],
      evidence: [{ id: "ev-owner-answer", source: { id: "owner", kind: "owner", label: "Owner answer" }, kind: "owner-answer", observedAt: "2026-08-24T20:05:00.000Z", statement: "Revenue Team owns CRM quality", confidenceCeiling: 1 }],
    }, new Date("2026-08-24T20:05:00.000Z"));

    expect(second.sequence).toBe(2);
    expect(second.parentRevisionId).toBe(first.revisionId);
    expect(first.unknowns[0]?.status).toBe("open");
    expect(second.unknowns[0]?.status).toBe("resolved");
    expect(second.facts.some((fact) => fact.status === "owner-confirmed" && fact.evidenceRefs.includes("ev-owner-answer"))).toBe(true);
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it("persists discovery as a company asset without authority, budget, credentials or capability grants", () => {
    const revision = buildDiscoveryRevision({ companyId, evidence, facts: [], unknowns: [], capabilities: [] }, now);
    const asset = createDiscoveryAsset({ companyId, revision }, now);
    expect(asset.kind).toBe("company-discovery");
    expect(asset.companyId).toBe(companyId);
    expect(asset.grantRefs).toEqual([]);
    expect(asset.credentialsRef).toBeUndefined();
    expect(asset.metadata.grantsAuthority).toBe(false);
    expect(asset.metadata.grantsBudget).toBe(false);
    expect(asset.metadata.grantsCapabilities).toBe(false);
  });

  it("rejects secret-like evidence before persisting a discovery asset", () => {
    const revision = buildDiscoveryRevision({
      companyId,
      evidence: [{ id: "ev-secret", source: { id: "owner", kind: "owner", label: "Owner" }, kind: "owner-answer", observedAt: now.toISOString(), statement: "token=super-secret-material-123456", confidenceCeiling: 1 }],
      facts: [], unknowns: [], capabilities: [],
    }, now);
    expect(() => createDiscoveryAsset({ companyId, revision }, now)).toThrow(/secret-like/);
  });
});
