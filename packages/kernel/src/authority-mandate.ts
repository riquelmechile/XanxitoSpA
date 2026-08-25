import { createHash, createPublicKey, verify } from "node:crypto";
import type {
  AuthorityMandate,
  AuthorityMandateUnsigned,
  AuthorityMandateVerification,
  CompanyPrincipalTrustAnchor,
  DiscoveryRevision,
  VerifiedPrincipal,
} from "../../contracts/src/index.js";
import { buildDiscoveryRevision } from "./company-discovery.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]));
}

export function canonicalMandatePayload(unsigned: AuthorityMandateUnsigned): { payload: string; hash: string } {
  const payload = JSON.stringify(canonicalize(unsigned));
  return { payload, hash: createHash("sha256").update(payload).digest("hex") };
}

function parseTime(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function anchorFor(mandate: AuthorityMandate, companyId: string, anchors: CompanyPrincipalTrustAnchor[]): CompanyPrincipalTrustAnchor | undefined {
  return anchors.find((anchor) => anchor.companyId === companyId && anchor.companyId === mandate.companyId && anchor.principalId === mandate.issuerPrincipalId && anchor.keyId === mandate.signature.keyId && anchor.algorithm === mandate.signature.algorithm);
}

function baseVerify(input: {
  mandate: AuthorityMandate;
  companyId: string;
  trustAnchors: CompanyPrincipalTrustAnchor[];
  requiredScope?: string;
  now: Date;
}): AuthorityMandateVerification {
  const { mandate, companyId, trustAnchors, requiredScope, now } = input;
  const reasons: string[] = [];
  const canonical = canonicalMandatePayload({
    vct: mandate.vct,
    id: mandate.id,
    companyId: mandate.companyId,
    issuerPrincipalId: mandate.issuerPrincipalId,
    subject: mandate.subject,
    effect: mandate.effect,
    scopes: mandate.scopes,
    claims: mandate.claims,
    constraints: mandate.constraints,
    issuedAt: mandate.issuedAt,
    ...(mandate.notBefore ? { notBefore: mandate.notBefore } : {}),
    ...(mandate.expiresAt ? { expiresAt: mandate.expiresAt } : {}),
    supersedesMandateIds: mandate.supersedesMandateIds,
    revokesMandateIds: mandate.revokesMandateIds,
  });
  const payloadHashValid = mandate.vct === "authority.mandate.1" && canonical.hash === mandate.payloadHash;
  if (!payloadHashValid) reasons.push("PAYLOAD_HASH_INVALID");
  const companyBound = mandate.companyId === companyId;
  if (!companyBound) reasons.push("COMPANY_MISMATCH");
  const anchor = anchorFor(mandate, companyId, trustAnchors);
  if (!anchor) reasons.push("UNTRUSTED_ISSUER");
  const issuedAt = parseTime(mandate.issuedAt);
  const notBefore = parseTime(mandate.notBefore);
  const expiresAt = parseTime(mandate.expiresAt);
  const nowMs = now.getTime();
  const anchorValidFrom = parseTime(anchor?.validFrom);
  const anchorValidUntil = parseTime(anchor?.validUntil);
  const anchorIssuanceValid = !anchor || (issuedAt !== null && (anchorValidFrom === null || issuedAt >= anchorValidFrom) && (anchorValidUntil === null || issuedAt < anchorValidUntil));
  const timeValid = issuedAt !== null && issuedAt <= nowMs && (notBefore === null || notBefore <= nowMs) && (expiresAt === null || expiresAt > nowMs) && anchorIssuanceValid;
  if (!timeValid) reasons.push(anchorIssuanceValid ? "TIME_INVALID" : "DELEGATION_TIME_INVALID");
  const required = requiredScope?.trim();
  const scopeValid = Boolean(anchor) && mandate.scopes.every((scope) => anchor!.allowedScopes.includes(scope)) && (!required || mandate.scopes.includes(required));
  if (!scopeValid) reasons.push("SCOPE_INVALID");
  let signatureValid = false;
  if (anchor && payloadHashValid) {
    try {
      signatureValid = verify(null, Buffer.from(canonical.payload), createPublicKey(anchor.publicKeyPem), Buffer.from(mandate.signature.value, "base64url"));
    } catch {
      signatureValid = false;
    }
  }
  if (!signatureValid) reasons.push("SIGNATURE_INVALID");
  const principal: VerifiedPrincipal | undefined = anchor && signatureValid && companyBound ? {
    principalId: anchor.principalId,
    companyId: anchor.companyId,
    role: anchor.role,
    keyId: anchor.keyId,
    verificationSource: anchor.delegatedByMandateId ? `mandate:${anchor.delegatedByMandateId}` : `trust-anchor:${anchor.keyId}`,
    verifiedAt: now.toISOString(),
  } : undefined;
  const active = payloadHashValid && signatureValid && companyBound && timeValid && scopeValid;
  return { valid: active, mandateId: mandate.id, ...(principal ? { principal } : {}), payloadHashValid, signatureValid, companyBound, timeValid, scopeValid, active, reasons };
}

function deriveActiveMandatesWithAnchors(mandates: AuthorityMandate[], companyId: string, trustAnchors: CompanyPrincipalTrustAnchor[], now = new Date()): Map<string, AuthorityMandateVerification> {
  const sorted = [...mandates].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id));
  const state = new Map<string, AuthorityMandateVerification>();
  const mandateById = new Map(sorted.map((mandate) => [mandate.id, mandate]));
  for (const mandate of sorted) state.set(mandate.id, baseVerify({ mandate, companyId, trustAnchors, now }));
  for (const mandate of sorted) {
    const actor = state.get(mandate.id);
    if (!actor?.valid || !actor.principal || !["founder", "owner", "board"].includes(actor.principal.role)) continue;
    for (const targetId of [...mandate.supersedesMandateIds, ...mandate.revokesMandateIds]) {
      const target = state.get(targetId);
      const targetMandate = mandateById.get(targetId);
      if (!target?.valid || !targetMandate) continue;
      const administrative = mandate.scopes.includes("company.authority.admin");
      const sameIssuerScoped = mandate.issuerPrincipalId === targetMandate.issuerPrincipalId && targetMandate.scopes.every((scope) => mandate.scopes.includes(scope));
      if (!administrative && !sameIssuerScoped) continue;
      state.set(targetId, { ...target, valid: false, active: false, reasons: [...target.reasons, mandate.revokesMandateIds.includes(targetId) ? `REVOKED_BY:${mandate.id}` : `SUPERSEDED_BY:${mandate.id}`] });
    }
  }
  return state;
}

function delegatedAnchorFromClaim(value: unknown, companyId: string, delegationMandateId: string): CompanyPrincipalTrustAnchor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.role !== "delegate" || obj.algorithm !== "Ed25519") return null;
  const principalId = typeof obj.principalId === "string" ? obj.principalId.trim() : typeof obj.principal_id === "string" ? obj.principal_id.trim() : "";
  const keyId = typeof obj.keyId === "string" ? obj.keyId.trim() : typeof obj.key_id === "string" ? obj.key_id.trim() : "";
  const publicKeyPem = typeof obj.publicKeyPem === "string" ? obj.publicKeyPem : typeof obj.public_key_pem === "string" ? obj.public_key_pem : "";
  const scopesRaw = obj.allowedScopes ?? obj.allowed_scopes;
  if (!principalId || !keyId || !publicKeyPem.includes("BEGIN PUBLIC KEY") || !Array.isArray(scopesRaw) || scopesRaw.some((scope) => typeof scope !== "string")) return null;
  const allowedScopes = [...new Set((scopesRaw as string[]).map((scope) => scope.trim()).filter(Boolean))];
  return { principalId, companyId, role: "delegate", keyId, algorithm: "Ed25519", publicKeyPem, allowedScopes, delegatedByMandateId: delegationMandateId };
}

export function deriveEffectiveTrustAnchors(mandates: AuthorityMandate[], companyId: string, rootAnchors: CompanyPrincipalTrustAnchor[], now = new Date()): CompanyPrincipalTrustAnchor[] {
  const rootState = deriveActiveMandatesWithAnchors(mandates, companyId, rootAnchors, now);
  const result = [...rootAnchors];
  const seen = new Set(result.map((anchor) => `${anchor.principalId}:${anchor.keyId}`));
  for (const mandate of mandates) {
    const verification = rootState.get(mandate.id);
    if (!verification?.valid || !verification.principal || !["founder", "owner", "board"].includes(verification.principal.role)) continue;
    if (!mandate.scopes.includes("company.authority.delegate")) continue;
    const issuerAnchor = rootAnchors.find((anchor) => anchor.companyId === companyId && anchor.principalId === mandate.issuerPrincipalId && anchor.keyId === mandate.signature.keyId);
    if (!issuerAnchor) continue;
    for (const claim of mandate.claims.filter((item) => item.type === "delegation")) {
      const delegated = delegatedAnchorFromClaim(claim.value, companyId, mandate.id);
      if (!delegated) continue;
      delegated.validFrom = mandate.notBefore ?? mandate.issuedAt;
      if (mandate.expiresAt) delegated.validUntil = mandate.expiresAt;
      const canDelegateAll = issuerAnchor.allowedScopes.includes("company.authority.admin");
      if (!canDelegateAll && delegated.allowedScopes.some((scope) => !issuerAnchor.allowedScopes.includes(scope))) continue;
      const key = `${delegated.principalId}:${delegated.keyId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(delegated);
    }
  }
  return result;
}

export function deriveActiveMandates(mandates: AuthorityMandate[], companyId: string, trustAnchors: CompanyPrincipalTrustAnchor[], now = new Date()): Map<string, AuthorityMandateVerification> {
  const effectiveAnchors = deriveEffectiveTrustAnchors(mandates, companyId, trustAnchors, now);
  return deriveActiveMandatesWithAnchors(mandates, companyId, effectiveAnchors, now);
}

export function verifyAuthorityMandate(input: {
  mandate: AuthorityMandate;
  companyId: string;
  trustAnchors: CompanyPrincipalTrustAnchor[];
  ledger: AuthorityMandate[];
  requiredScope?: string;
  now?: Date;
}): AuthorityMandateVerification {
  const now = input.now ?? new Date();
  const effectiveAnchors = deriveEffectiveTrustAnchors(input.ledger, input.companyId, input.trustAnchors, now);
  const base = baseVerify({ mandate: input.mandate, companyId: input.companyId, trustAnchors: effectiveAnchors, ...(input.requiredScope ? { requiredScope: input.requiredScope } : {}), now });
  if (!base.valid) return base;
  const state = deriveActiveMandates([...input.ledger.filter((item) => item.id !== input.mandate.id), input.mandate], input.companyId, input.trustAnchors, now);
  const active = state.get(input.mandate.id);
  if (!active) return { ...base, valid: false, active: false, reasons: [...base.reasons, "MANDATE_STATE_MISSING"] };
  return { ...active, scopeValid: base.scopeValid, valid: active.valid && base.scopeValid, reasons: base.scopeValid ? active.reasons : [...active.reasons, "SCOPE_INVALID"] };
}

export function applyVerifiedMandateToDiscovery(prior: DiscoveryRevision, mandate: AuthorityMandate, verification: AuthorityMandateVerification, now = new Date()): DiscoveryRevision {
  if (!verification.valid || !verification.active || !verification.principal) throw new Error("MANDATE_NOT_VERIFIED");
  if (prior.companyId !== mandate.companyId || verification.principal.companyId !== prior.companyId) throw new Error("MANDATE_COMPANY_MISMATCH");
  const principal = verification.principal;
  if (mandate.effect !== "assert") throw new Error("DISCOVERY_RESOLUTION_REQUIRES_ASSERT_MANDATE");
  const ownerClass = ["founder", "owner", "board"].includes(principal.role);
  const ownerAuthorized = ownerClass || (principal.role === "delegate" && principal.verificationSource.startsWith("mandate:"));
  const claims = mandate.claims.filter((claim) => claim.type === "discovery-resolution" && claim.unknownId && claim.assertion);
  if (claims.length === 0) throw new Error("MANDATE_HAS_NO_DISCOVERY_CLAIMS");
  const unknowns = structuredClone(prior.unknowns);
  const evidence = structuredClone(prior.evidence);
  const facts = prior.facts.map(({ revisionId: _revisionId, ...fact }) => structuredClone(fact));
  let resolved = 0;
  for (const claim of claims) {
    if (!claim.revisionId || !claim.revisionFingerprint) throw new Error("MANDATE_DISCOVERY_REVISION_BINDING_REQUIRED");
    if (claim.revisionId !== prior.revisionId || claim.revisionFingerprint !== prior.fingerprint) throw new Error("MANDATE_DISCOVERY_REVISION_MISMATCH");
    const unknown = unknowns.find((item) => item.id === claim.unknownId);
    if (!unknown || unknown.status !== "open") continue;
    const requirement = unknown.resolutionRequirement ?? (unknown.category === "governance" ? "constitutional-mandate" : "owner-confirmation");
    if (requirement === "constitutional-mandate") {
      if (!ownerAuthorized || !mandate.scopes.includes("company.constitution")) throw new Error("CONSTITUTIONAL_MANDATE_REQUIRED");
    } else if (requirement === "owner-confirmation") {
      if (!ownerAuthorized || !mandate.scopes.includes("company.discovery.confirm")) throw new Error("OWNER_CONFIRMATION_MANDATE_REQUIRED");
    } else {
      throw new Error("MANDATE_CANNOT_RESOLVE_REQUIREMENT");
    }
    const evidenceId = `mandate:${mandate.id}:unknown:${unknown.id}`;
    evidence.push({
      id: evidenceId,
      source: { id: principal.principalId, kind: "owner", label: principal.principalId },
      kind: "signed-authority-mandate",
      observedAt: now.toISOString(),
      statement: claim.assertion!,
      confidenceCeiling: 1,
      contentRef: `mandate:${mandate.id}`,
    });
    facts.push({
      id: `owner-confirmed:${unknown.id}:${mandate.id}`,
      statement: claim.assertion!,
      status: "owner-confirmed",
      confidence: 1,
      evidenceRefs: [evidenceId],
      provenance: `mandate:${mandate.id}`,
    });
    unknown.status = "resolved";
    unknown.resolutionRef = `mandate:${mandate.id}`;
    resolved += 1;
  }
  if (resolved === 0) throw new Error("MANDATE_RESOLVED_NO_UNKNOWNS");
  return buildDiscoveryRevision({ companyId: prior.companyId, parent: prior, evidence, facts, unknowns, capabilities: structuredClone(prior.capabilities) }, now);
}
