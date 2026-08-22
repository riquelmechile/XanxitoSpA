import { randomUUID } from "node:crypto";
import type {
  KASTAdjudication,
  KASTAdoptionResult,
  KASTConstitutionalSurface,
  KASTHarnessSurface,
  KASTImprovementVariant,
  KASTLawPolicy,
  KASTLawResult,
  KASTLawTrigger,
  KASTMemoryRecord,
  KASTVariantVerification,
  KASTVerifiedVariant,
} from "../../contracts/src/index.js";
import { resolveModelLawProfile } from "../../domain/src/index.js";
import { DomainError } from "../../domain/src/index.js";

export interface EngramMemoryPort {
  search(query: string): Promise<KASTMemoryRecord[]>;
  save(record: KASTMemoryRecord): Promise<string>;
}

export class InMemoryEngramMemoryPort implements EngramMemoryPort {
  readonly records: KASTMemoryRecord[];
  constructor(seed: KASTMemoryRecord[] = []) { this.records = structuredClone(seed); }
  async search(_query: string): Promise<KASTMemoryRecord[]> { return structuredClone(this.records); }
  async save(record: KASTMemoryRecord): Promise<string> {
    this.records.push(structuredClone(record));
    return record.topicKey;
  }
}

type XhighProfile = { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
type MaxProfile = { model: "gpt-5.6-sol"; reasoningEffort: "max" };

export interface KASTVariantProposalInput {
  trigger: KASTLawTrigger;
  overlay: string;
  profile: XhighProfile;
  priorMemory: KASTMemoryRecord[];
  peerVariants: never[];
}

export interface KASTVariantProposalOutput {
  summary: string;
  changeRef: string;
  isolationRef: string;
  affectedSurfaces: KASTHarnessSurface[];
  evidenceRefs: string[];
  directMainMutation: boolean;
}

export interface KASTVariantVerificationInput {
  trigger: KASTLawTrigger;
  variant: KASTImprovementVariant;
  profile: XhighProfile;
  priorMemory: KASTMemoryRecord[];
}

export interface KASTAdjudicationInput {
  trigger: KASTLawTrigger;
  verifiedVariants: KASTVerifiedVariant[];
  ownerProfile: MaxProfile;
  priorMemory: KASTMemoryRecord[];
}

export interface KASTAdoptionInput {
  trigger: KASTLawTrigger;
  variant: KASTImprovementVariant;
  verification: KASTVariantVerification;
  adjudication: KASTAdjudication;
}

export interface KastEngineOptions {
  policy: KASTLawPolicy["principalPolicy"];
  memory: EngramMemoryPort;
  proposer?: (input: KASTVariantProposalInput) => Promise<KASTVariantProposalOutput>;
  verifier?: (input: KASTVariantVerificationInput) => Promise<KASTVariantVerification>;
  adjudicator?: (input: KASTAdjudicationInput) => Promise<KASTAdjudication>;
  adopter?: (input: KASTAdoptionInput) => Promise<KASTAdoptionResult>;
  defaultVariantCount?: number;
  maxVariantCount?: number;
}

const PROTECTED = new Set<KASTConstitutionalSurface>([
  "model-law",
  "constitution",
  "authority-root",
  "secret-isolation",
  "kast-law",
  "review-law",
  "memory-law",
  "human-reserved-boundary",
]);

const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;

function uniq(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
function hasProtectedSurface(surfaces: KASTHarnessSurface[]): boolean { return surfaces.some((surface) => PROTECTED.has(surface as KASTConstitutionalSurface)); }
function assertSafeTrigger(trigger: KASTLawTrigger): void {
  if (!trigger.companyId || !trigger.id || !trigger.sessionRef || !trigger.summary.trim()) throw new DomainError("KAST trigger missing required identity/summary");
  if (trigger.containsRawSecrets || trigger.containsRawConversation) throw new DomainError("KAST trigger cannot contain raw secret/conversation material");
  if (SECRET_LIKE.test(trigger.summary)) throw new DomainError("KAST trigger contains secret-like material");
  if (trigger.recurrence < 1) throw new DomainError("KAST trigger recurrence must be positive");
  if (trigger.severity !== "low" && trigger.evidenceRefs.length === 0) throw new DomainError("material KAST trigger requires evidence");
}
function xhigh(profile: { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" }): XhighProfile {
  if (profile.reasoningEffort !== "xhigh") throw new DomainError("KAST branch must use Sol/xhigh");
  return { model: profile.model, reasoningEffort: "xhigh" };
}
function max(profile: { model: "gpt-5.6-sol"; reasoningEffort: "max" | "xhigh" }): MaxProfile {
  if (profile.reasoningEffort !== "max") throw new DomainError("KAST owner must use Sol/max");
  return { model: profile.model, reasoningEffort: "max" };
}
function assertSafeVariantProposal(proposal: KASTVariantProposalOutput): void {
  const fields = [proposal.summary, proposal.changeRef, proposal.isolationRef, ...proposal.evidenceRefs];
  if (fields.some((value) => SECRET_LIKE.test(value))) throw new DomainError("KAST variant contains secret-like material");
  if (!proposal.summary.trim() || !proposal.changeRef.trim() || !proposal.isolationRef.trim()) throw new DomainError("KAST variant missing required summary/change/isolation reference");
}

function memoryTopic(trigger: KASTLawTrigger): string {
  const surface = trigger.affectedSurfaces.join("+") || "general";
  return `kast:${trigger.category}:${surface}`.toLowerCase();
}
function safeMemory(trigger: KASTLawTrigger, outcome: KASTMemoryRecord["outcome"], summary: string, variantRefs: string[] = []): KASTMemoryRecord {
  return {
    topicKey: memoryTopic(trigger),
    title: `KAST ${outcome}: ${trigger.category}`,
    summary: summary.trim().slice(0, 1200),
    evidenceRefs: uniq(trigger.evidenceRefs),
    outcome,
    variantRefs: uniq(variantRefs),
    createdAt: trigger.observedAt,
  };
}
function evidenceGate(variant: KASTImprovementVariant, verification: KASTVariantVerification): { ok: boolean; reason: string } {
  if (hasProtectedSurface(variant.affectedSurfaces) || hasProtectedSurface(verification.observedSurfaces)) return { ok: false, reason: "constitutional-surface" };
  if (variant.directMainMutation || !variant.isolationRef || variant.isolationRef === "main" || !verification.isolationVerified) return { ok: false, reason: "isolated-change-required" };
  if (verification.verifiedChangeRef !== variant.changeRef) return { ok: false, reason: "verified-change-ref-mismatch" };
  if (!verification.passed) return { ok: false, reason: "verification-failed" };
  if (!verification.sddComplete) return { ok: false, reason: "sdd-incomplete" };
  if (verification.regressionRefs.length === 0) return { ok: false, reason: "tdd-regression-evidence-missing" };
  const requiredLenses = ["risk", "readability", "reliability", "resilience"];
  const lensesPresent = requiredLenses.every((lens) => verification.fourRRefs.some((ref) => ref.toLowerCase().includes(lens)));
  if (!verification.reviewApproved || !lensesPresent || verification.blockingFindings.length > 0) return { ok: false, reason: "rdd-review-incomplete" };
  if (verification.verificationRefs.length === 0) return { ok: false, reason: "verification-evidence-missing" };
  return { ok: true, reason: "verified" };
}

export class KastEngine {
  private readonly defaultVariantCount: number;
  private readonly maxVariantCount: number;
  constructor(private readonly options: KastEngineOptions) {
    this.defaultVariantCount = options.defaultVariantCount ?? 2;
    this.maxVariantCount = options.maxVariantCount ?? 4;
    if (this.defaultVariantCount < 2 || this.defaultVariantCount > this.maxVariantCount || this.maxVariantCount > 4) throw new DomainError("KAST variant bounds invalid");
  }

  async run(trigger: KASTLawTrigger): Promise<KASTLawResult> {
    assertSafeTrigger(trigger);
    const priorMemory = await this.options.memory.search(`${trigger.summary} ${trigger.affectedSurfaces.join(" ")}`);
    const priorMemoryRefs = priorMemory.map((record) => record.topicKey);

    if (trigger.requestedMode === "noop") {
      return { triggerId: trigger.id, mode: "noop", status: "no-op", reason: "GPT requested no-op", priorMemoryRefs, variantRefs: [] };
    }

    if (trigger.requestedMode === "remember") {
      const ref = await this.options.memory.save(safeMemory(trigger, "remembered", trigger.summary));
      return { triggerId: trigger.id, mode: "remember", status: "remembered", reason: "stored in Engram", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs: [] };
    }

    if (hasProtectedSurface(trigger.affectedSurfaces)) {
      const ref = await this.options.memory.save(safeMemory(trigger, "founder-required", `Constitutional change detected and blocked from automatic adoption: ${trigger.summary}`));
      return { triggerId: trigger.id, mode: "improve", status: "founder-required", reason: "constitutional core requires explicit Founder/Board upgrade", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs: [] };
    }

    if (!this.options.proposer || !this.options.verifier || !this.options.adjudicator) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", "Improvement requested but proposer/verifier/adjudicator ports are not configured."));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: "improvement ports unavailable", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs: [] };
    }

    const branchProfile = xhigh(resolveModelLawProfile(this.options.policy, "worker"));
    const verifierProfile = xhigh(resolveModelLawProfile(this.options.policy, "verifier"));
    const ownerProfile = max(resolveModelLawProfile(this.options.policy, "executive"));
    const overlays = uniq(trigger.strategyOverlays ?? ["simplify-first", "reliability-first"]);
    const targetCount = Math.min(this.maxVariantCount, Math.max(this.defaultVariantCount, overlays.length));
    const selectedOverlays = [...overlays];
    while (selectedOverlays.length < targetCount) selectedOverlays.push(`alternative-${selectedOverlays.length + 1}`);
    if (selectedOverlays.length > this.maxVariantCount) selectedOverlays.length = this.maxVariantCount;

    const proposed = await Promise.allSettled(selectedOverlays.map(async (overlay): Promise<KASTImprovementVariant> => {
      const proposal = await this.options.proposer!({ trigger: structuredClone(trigger), overlay, profile: branchProfile, priorMemory: structuredClone(priorMemory), peerVariants: [] });
      assertSafeVariantProposal(proposal);
      return {
        id: randomUUID(),
        overlay,
        summary: proposal.summary,
        changeRef: proposal.changeRef,
        isolationRef: proposal.isolationRef,
        affectedSurfaces: proposal.affectedSurfaces,
        evidenceRefs: uniq(proposal.evidenceRefs),
        directMainMutation: proposal.directMainMutation,
      };
    }));
    const variants = proposed.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const variantRefs = variants.map((variant) => variant.changeRef);

    if (variants.length === 0) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", "No KAST variant could be proposed.", variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: "no variants", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs };
    }

    const verifiedResults = await Promise.allSettled(variants.map(async (variant): Promise<KASTVerifiedVariant> => {
      const verification = await this.options.verifier!({ trigger: structuredClone(trigger), variant: structuredClone(variant), profile: verifierProfile, priorMemory: structuredClone(priorMemory) });
      if (verification.variantId !== variant.id) throw new DomainError("KAST verifier returned mismatched variant id");
      return { variant, verification };
    }));
    const verifiedVariants = verifiedResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);

    if (verifiedVariants.length === 0) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", "All KAST variants failed verification execution.", variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: "verification unavailable", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs };
    }

    const adjudication = await this.options.adjudicator({ trigger: structuredClone(trigger), verifiedVariants: structuredClone(verifiedVariants), ownerProfile, priorMemory: structuredClone(priorMemory) });
    const selected = adjudication.selectedVariantId ? verifiedVariants.find((item) => item.variant.id === adjudication.selectedVariantId) : undefined;
    if (!selected) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", `No verified variant selected. ${adjudication.rationale}`, variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: "owner selected no variant", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs };
    }

    const gate = evidenceGate(selected.variant, selected.verification);
    if (!gate.ok) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", `Selected KAST variant rejected by evidence gate: ${gate.reason}.`, variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: gate.reason, priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs, selectedVariantId: selected.variant.id };
    }

    if (!this.options.adopter) {
      return { triggerId: trigger.id, mode: "improve", status: "adoptable", reason: "verified improvement ready for governed adoption", priorMemoryRefs, variantRefs, selectedVariantId: selected.variant.id };
    }

    let adoption: KASTAdoptionResult;
    try {
      adoption = await this.options.adopter({ trigger: structuredClone(trigger), variant: structuredClone(selected.variant), verification: structuredClone(selected.verification), adjudication: structuredClone(adjudication) });
    } catch (error) {
      const reason = `adopter-failed:${error instanceof Error ? error.message : String(error)}`;
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", `Verified KAST variant could not be adopted: ${reason}.`, variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason, priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs, selectedVariantId: selected.variant.id };
    }
    if (!adoption.adopted) {
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", `Verified KAST variant was not adopted: ${adoption.reason ?? "adopter rejected"}.`, variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason: adoption.reason ?? "adopter rejected", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs, selectedVariantId: selected.variant.id };
    }
    if (adoption.sourceChangeRef !== selected.variant.changeRef || !adoption.adoptionRef) {
      const reason = adoption.sourceChangeRef !== selected.variant.changeRef ? "adopter-source-mismatch" : "adoption-reference-missing";
      const ref = await this.options.memory.save(safeMemory(trigger, "rejected", `KAST adopter integrity check failed: ${reason}.`, variantRefs));
      return { triggerId: trigger.id, mode: "improve", status: "rejected", reason, priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs, selectedVariantId: selected.variant.id };
    }
    const ref = await this.options.memory.save(safeMemory(trigger, "adopted", `KAST adopted verified variant ${selected.variant.changeRef}.`, variantRefs));
    return { triggerId: trigger.id, mode: "improve", status: "adopted", reason: "verified improvement adopted", priorMemoryRefs: uniq([...priorMemoryRefs, ref]), variantRefs, selectedVariantId: selected.variant.id, adoptionRef: adoption.adoptionRef };
  }
}
