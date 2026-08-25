import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthorityMandateUnsigned, CompanyPrincipalTrustAnchor, DiscoveryRevision } from "../../contracts/src/index.js";
import { applyVerifiedMandateToDiscovery, canonicalMandatePayload, deriveActiveMandates, verifyAuthorityMandate } from "./authority-mandate.js";
import { buildDiscoveryRevision } from "./company-discovery.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const otherCompanyId = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const anchor: CompanyPrincipalTrustAnchor = {
    principalId: "principal:founder",
    companyId,
    role: "founder",
    keyId: "key:founder:1",
    algorithm: "Ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    allowedScopes: ["company.discovery.confirm", "company.constitution"],
  };
  const signMandate = (unsigned: AuthorityMandateUnsigned) => {
    const canonical = canonicalMandatePayload(unsigned);
    const signature = sign(null, Buffer.from(canonical.payload), privateKey).toString("base64url");
    return { ...unsigned, payloadHash: canonical.hash, signature: { algorithm: "Ed25519" as const, keyId: anchor.keyId, value: signature } };
  };
  return { anchor, signMandate };
}

function unsigned(overrides: Partial<AuthorityMandateUnsigned> = {}): AuthorityMandateUnsigned {
  return {
    vct: "authority.mandate.1",
    id: "33333333-3333-4333-8333-333333333333",
    companyId,
    issuerPrincipalId: "principal:founder",
    subject: "company",
    effect: "assert",
    scopes: ["company.discovery.confirm"],
    claims: [{ type: "discovery-resolution", unknownId: "unknown:financial-truth", assertion: "Ledger is the trusted financial source of truth." }],
    constraints: [],
    issuedAt: "2026-08-25T00:00:00.000Z",
    expiresAt: "2026-08-26T00:00:00.000Z",
    supersedesMandateIds: [],
    revokesMandateIds: [],
    ...overrides,
  };
}

function prior(requirement: "owner-confirmation" | "constitutional-mandate" = "owner-confirmation"): DiscoveryRevision {
  return buildDiscoveryRevision({
    companyId,
    evidence: [],
    facts: [],
    capabilities: [],
    unknowns: [{ id: requirement === "constitutional-mandate" ? "unknown:authority-boundaries" : "unknown:financial-truth", question: "q", category: requirement === "constitutional-mandate" ? "governance" : "finance", priority: "high", status: "open", resolutionRequirement: requirement }],
  }, new Date("2026-08-25T00:00:00.000Z"));
}

function discoveryClaim(revision: DiscoveryRevision, unknownId: string, assertion: string) {
  return { type: "discovery-resolution" as const, unknownId, assertion, revisionId: revision.revisionId, revisionFingerprint: revision.fingerprint };
}

describe("verified authority mandates", () => {
  it("verifies a founder mandate and resolves owner-confirmation without trusting xspa.write", () => {
    const { anchor, signMandate } = fixture();
    const revision = prior();
    const mandate = signMandate(unsigned({ claims: [discoveryClaim(revision, "unknown:financial-truth", "Ledger is the trusted financial source of truth.")] }));
    const verification = verifyAuthorityMandate({ mandate, companyId, trustAnchors: [anchor], ledger: [], requiredScope: "company.discovery.confirm", now: new Date("2026-08-25T01:00:00.000Z") });
    expect(verification.valid).toBe(true);
    const next = applyVerifiedMandateToDiscovery(revision, mandate, verification, new Date("2026-08-25T01:00:00.000Z"));
    expect(next.unknowns.find((u) => u.id === "unknown:financial-truth")?.status).toBe("resolved");
    expect(next.facts.some((f) => f.status === "owner-confirmed" && f.provenance === `mandate:${mandate.id}`)).toBe(true);
  });

  it("fails closed for wrong company, tampered signature, expiry and missing scope", () => {
    const { anchor, signMandate } = fixture();
    const good = signMandate(unsigned());
    const wrongCompany = verifyAuthorityMandate({ mandate: good, companyId: otherCompanyId, trustAnchors: [anchor], ledger: [], now: new Date("2026-08-25T01:00:00.000Z") });
    expect(wrongCompany.valid).toBe(false);
    const tampered = { ...good, subject: "attacker" };
    expect(verifyAuthorityMandate({ mandate: tampered, companyId, trustAnchors: [anchor], ledger: [], now: new Date("2026-08-25T01:00:00.000Z") }).valid).toBe(false);
    expect(verifyAuthorityMandate({ mandate: good, companyId, trustAnchors: [anchor], ledger: [], now: new Date("2026-08-27T01:00:00.000Z") }).valid).toBe(false);
    expect(verifyAuthorityMandate({ mandate: good, companyId, trustAnchors: [anchor], ledger: [], requiredScope: "company.constitution", now: new Date("2026-08-25T01:00:00.000Z") }).valid).toBe(false);
  });

  it("derives revocation and supersession append-only", () => {
    const { anchor, signMandate } = fixture();
    const original = signMandate(unsigned());
    const replacement = signMandate(unsigned({ id: "44444444-4444-4444-8444-444444444444", issuedAt: "2026-08-25T02:00:00.000Z", supersedesMandateIds: [original.id], claims: [{ type: "discovery-resolution", unknownId: "unknown:financial-truth", assertion: "New source of truth." }] }));
    const state = deriveActiveMandates([original, replacement], companyId, [anchor], new Date("2026-08-25T03:00:00.000Z"));
    expect(state.get(original.id)?.active).toBe(false);
    expect(state.get(replacement.id)?.active).toBe(true);
    const revoke = signMandate(unsigned({ id: "55555555-5555-4555-8555-555555555555", effect: "revoke", issuedAt: "2026-08-25T04:00:00.000Z", scopes: ["company.discovery.confirm"], claims: [], revokesMandateIds: [replacement.id] }));
    const revoked = deriveActiveMandates([original, replacement, revoke], companyId, [anchor], new Date("2026-08-25T05:00:00.000Z"));
    expect(revoked.get(replacement.id)?.active).toBe(false);
  });

  it("supports explicit signed delegation and removes it when the delegation mandate is revoked", () => {
    const { anchor, signMandate } = fixture();
    anchor.allowedScopes.push("company.authority.delegate");
    const { publicKey: delegatePublic, privateKey: delegatePrivate } = generateKeyPairSync("ed25519");
    const delegation = signMandate(unsigned({
      id: "88888888-8888-4888-8888-888888888888",
      effect: "delegate",
      scopes: ["company.authority.delegate"],
      claims: [{ type: "delegation", value: { principalId: "principal:cfo", role: "delegate", keyId: "key:cfo:1", algorithm: "Ed25519", publicKeyPem: delegatePublic.export({ type: "spki", format: "pem" }).toString(), allowedScopes: ["company.discovery.confirm"] } }],
    }));
    const delegatedPrior = prior();
    const delegatedUnsigned = unsigned({ id: "99999999-9999-4999-8999-999999999999", issuerPrincipalId: "principal:cfo", scopes: ["company.discovery.confirm"], claims: [discoveryClaim(delegatedPrior, "unknown:financial-truth", "Ledger is the trusted financial source of truth.")] });
    const delegatedCanonical = canonicalMandatePayload(delegatedUnsigned);
    const delegated = { ...delegatedUnsigned, payloadHash: delegatedCanonical.hash, signature: { algorithm: "Ed25519" as const, keyId: "key:cfo:1", value: sign(null, Buffer.from(delegatedCanonical.payload), delegatePrivate).toString("base64url") } };
    const verified = verifyAuthorityMandate({ mandate: delegated, companyId, trustAnchors: [anchor], ledger: [delegation], requiredScope: "company.discovery.confirm", now: new Date("2026-08-25T01:00:00.000Z") });
    expect(verified.valid).toBe(true);
    expect(verified.principal?.role).toBe("delegate");
    expect(verified.principal?.verificationSource).toBe(`mandate:${delegation.id}`);
    expect(() => applyVerifiedMandateToDiscovery(delegatedPrior, delegated, verified, new Date("2026-08-25T01:00:00.000Z"))).not.toThrow();

    const revokeDelegation = signMandate(unsigned({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", effect: "revoke", scopes: ["company.authority.delegate"], claims: [], revokesMandateIds: [delegation.id] }));
    const afterRevoke = verifyAuthorityMandate({ mandate: delegated, companyId, trustAnchors: [anchor], ledger: [delegation, revokeDelegation], requiredScope: "company.discovery.confirm", now: new Date("2026-08-25T02:00:00.000Z") });
    expect(afterRevoke.valid).toBe(false);
    expect(afterRevoke.reasons).toContain("UNTRUSTED_ISSUER");
  });

  it("does not retroactively authorize delegate signatures created before delegation", () => {
    const { anchor, signMandate } = fixture();
    anchor.allowedScopes.push("company.authority.delegate");
    const { publicKey: delegatePublic, privateKey: delegatePrivate } = generateKeyPairSync("ed25519");
    const delegation = signMandate(unsigned({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuedAt: "2026-08-25T02:00:00.000Z", scopes: ["company.authority.delegate"], effect: "delegate", claims: [{ type: "delegation", value: { principalId: "principal:ops", role: "delegate", keyId: "key:ops:1", algorithm: "Ed25519", publicKeyPem: delegatePublic.export({ type: "spki", format: "pem" }).toString(), allowedScopes: ["company.discovery.confirm"] } }] }));
    const predelegationUnsigned = unsigned({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", issuerPrincipalId: "principal:ops", issuedAt: "2026-08-25T01:00:00.000Z" });
    const canonical = canonicalMandatePayload(predelegationUnsigned);
    const predelegation = { ...predelegationUnsigned, payloadHash: canonical.hash, signature: { algorithm: "Ed25519" as const, keyId: "key:ops:1", value: sign(null, Buffer.from(canonical.payload), delegatePrivate).toString("base64url") } };
    const verification = verifyAuthorityMandate({ mandate: predelegation, companyId, trustAnchors: [anchor], ledger: [delegation], now: new Date("2026-08-25T03:00:00.000Z") });
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toContain("DELEGATION_TIME_INVALID");
  });

  it("does not let a narrow mandate revoke a broader-scope mandate", () => {
    const { anchor, signMandate } = fixture();
    anchor.allowedScopes.push("company.authority.admin");
    const constitutional = signMandate(unsigned({ id: "66666666-6666-4666-8666-666666666666", scopes: ["company.constitution"], claims: [{ type: "authority-policy", scope: "company.constitution", value: { reserved: true } }] }));
    const narrow = signMandate(unsigned({ id: "77777777-7777-4777-8777-777777777777", effect: "revoke", scopes: ["company.discovery.confirm"], claims: [], revokesMandateIds: [constitutional.id] }));
    const state = deriveActiveMandates([constitutional, narrow], companyId, [anchor], new Date("2026-08-25T05:00:00.000Z"));
    expect(state.get(constitutional.id)?.active).toBe(true);
  });

  it("requires constitutional scope and trusted owner-class role for constitutional unknowns", () => {
    const { anchor, signMandate } = fixture();
    const revision = prior("constitutional-mandate");
    const mandate = signMandate(unsigned({ scopes: ["company.constitution"], claims: [discoveryClaim(revision, "unknown:authority-boundaries", "Irreversible and financial actions require explicit approval.")] }));
    const verification = verifyAuthorityMandate({ mandate, companyId, trustAnchors: [anchor], ledger: [], requiredScope: "company.constitution", now: new Date("2026-08-25T01:00:00.000Z") });
    expect(verification.valid).toBe(true);
    expect(() => applyVerifiedMandateToDiscovery(revision, mandate, verification, new Date("2026-08-25T01:00:00.000Z"))).not.toThrow();
  });

  it("rejects replay of a discovery mandate against a later revision with the same unknown id", () => {
    const { anchor, signMandate } = fixture();
    const original = prior();
    const mandate = signMandate(unsigned({ claims: [discoveryClaim(original, "unknown:financial-truth", "Ledger is trusted.")] }));
    const verification = verifyAuthorityMandate({ mandate, companyId, trustAnchors: [anchor], ledger: [], requiredScope: "company.discovery.confirm", now: new Date("2026-08-25T01:00:00.000Z") });
    expect(verification.valid).toBe(true);
    const later = buildDiscoveryRevision({ companyId, parent: original, evidence: [...original.evidence, { id: "ev:new", source: { id: "system:new", kind: "system", label: "New system" }, kind: "observation", observedAt: "2026-08-25T00:30:00.000Z", statement: "New evidence arrived", confidenceCeiling: 1 }], facts: original.facts.map(({ revisionId: _revisionId, ...fact }) => fact), unknowns: original.unknowns, capabilities: original.capabilities }, new Date("2026-08-25T00:30:00.000Z"));
    expect(later.unknowns[0]?.id).toBe(original.unknowns[0]?.id);
    expect(() => applyVerifiedMandateToDiscovery(later, mandate, verification, new Date("2026-08-25T01:00:00.000Z"))).toThrow(/REVISION_MISMATCH/);
  });


  it("preserves historical verification across owner key rotation while rejecting post-retirement issuance", () => {
    const old = fixture();
    old.anchor.validUntil = "2026-08-25T12:00:00.000Z";
    const historical = old.signMandate(unsigned({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", issuedAt: "2026-08-25T11:00:00.000Z", expiresAt: "2026-08-27T00:00:00.000Z", claims: [] }));
    expect(verifyAuthorityMandate({ mandate: historical, companyId, trustAnchors: [old.anchor], ledger: [], now: new Date("2026-08-26T00:00:00.000Z") }).valid).toBe(true);
    const tooLate = old.signMandate(unsigned({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", issuedAt: "2026-08-25T13:00:00.000Z", expiresAt: "2026-08-27T00:00:00.000Z", claims: [] }));
    expect(verifyAuthorityMandate({ mandate: tooLate, companyId, trustAnchors: [old.anchor], ledger: [], now: new Date("2026-08-26T00:00:00.000Z") }).valid).toBe(false);
  });

});
