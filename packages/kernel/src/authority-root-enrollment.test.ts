import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalRootEnrollmentPayload, createRootEnrollmentChallenge, verifyRootEnrollmentProof } from "./authority-root-enrollment.js";

const companyId = "11111111-1111-4111-8111-111111111111";

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const challenge = createRootEnrollmentChallenge({
    companyId,
    principalId: "principal:founder",
    role: "founder",
    keyId: "key:founder:1",
    publicKeyPem,
    allowedScopes: ["company.discovery.confirm", "company.constitution"],
    now: new Date("2026-08-25T20:00:00.000Z"),
    ttlMs: 5 * 60_000,
    nonce: "nonce-0123456789abcdef",
  });
  const canonical = canonicalRootEnrollmentPayload(challenge);
  const proof = {
    challenge,
    signature: { algorithm: "Ed25519" as const, keyId: challenge.keyId, value: sign(null, Buffer.from(canonical.payload), privateKey).toString("base64") },
  };
  return { challenge, proof };
}

describe("authority root enrollment ceremony", () => {
  it("verifies proof of possession and returns a public-only out-of-band bundle", () => {
    const { proof } = fixture();
    const result = verifyRootEnrollmentProof({ proof, companyId, now: new Date("2026-08-25T20:01:00.000Z") });
    expect(result.valid).toBe(true);
    expect(result.requiresOutOfBandProvisioning).toBe(true);
    expect(result.enrollmentBundle?.companyId).toBe(companyId);
    expect(result.enrollmentBundle?.role).toBe("founder");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE KEY|password|secret|token/i);
  });

  it("fails closed for tampering, wrong company, expiry and key mismatch", () => {
    const { proof } = fixture();
    expect(verifyRootEnrollmentProof({ proof: { ...proof, challenge: { ...proof.challenge, principalId: "principal:attacker" } }, companyId, now: new Date("2026-08-25T20:01:00.000Z") }).valid).toBe(false);
    expect(verifyRootEnrollmentProof({ proof, companyId: "22222222-2222-4222-8222-222222222222", now: new Date("2026-08-25T20:01:00.000Z") }).valid).toBe(false);
    expect(verifyRootEnrollmentProof({ proof, companyId, now: new Date("2026-08-25T20:10:00.000Z") }).valid).toBe(false);
    expect(verifyRootEnrollmentProof({ proof: { ...proof, signature: { ...proof.signature, keyId: "key:other" } }, companyId, now: new Date("2026-08-25T20:01:00.000Z") }).valid).toBe(false);
  });

  it("rejects non-root roles and unsafe or empty scopes when creating challenges", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => createRootEnrollmentChallenge({ companyId, principalId: "p", role: "delegate" as never, keyId: "k", publicKeyPem, allowedScopes: ["company.constitution"] })).toThrow(/ROLE_INVALID/);
    expect(() => createRootEnrollmentChallenge({ companyId, principalId: "p", role: "owner", keyId: "k", publicKeyPem, allowedScopes: [] })).toThrow(/SCOPES_INVALID/);
    expect(() => createRootEnrollmentChallenge({ companyId, principalId: "p", role: "owner", keyId: "k", publicKeyPem, allowedScopes: ["secret=abcdefghijk"] })).toThrow(/SECRET_MATERIAL_REJECTED/);
  });
});
