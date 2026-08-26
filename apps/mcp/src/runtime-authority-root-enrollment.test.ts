import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalRootEnrollmentPayload, createRootEnrollmentChallenge } from "../../../packages/kernel/src/index.js";
import { EnvironmentXspaAppOperations } from "./runtime.js";
import { InMemoryRuntimeStore } from "../../../packages/database/src/index.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const context = { principal: "operator", scopes: ["xspa.read", "xspa.write"] };

function operations(authorityTrustAnchors: any[] = []) {
  return new EnvironmentXspaAppOperations({
    store: new InMemoryRuntimeStore(),
    companyId,
    databaseConfigured: true,
    creativeConfigured: false,
    kastConfigured: false,
    authorityTrustAnchors,
  });
}

describe("EnvironmentXspaAppOperations first-root enrollment", () => {
  it("prepares and verifies a read-only proof-of-possession ceremony without activating trust", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const ops = operations();
    const prepared = await ops.authorityRootEnrollmentPrepare({
      principalId: "principal:founder",
      role: "founder",
      keyId: "key:founder:1",
      publicKeyPem,
      allowedScopes: ["company.discovery.confirm", "company.constitution"],
    }, context) as any;
    expect(prepared.challenge.companyId).toBe(companyId);
    expect(prepared.trustActivated).toBe(false);
    expect(prepared.requiresOutOfBandProvisioning).toBe(true);
    const issuedStatus = await ops.authorityRootEnrollmentStatus(context) as any;
    expect(issuedStatus.challenges[0]?.state).toBe("issued");
    expect(JSON.stringify(issuedStatus)).not.toContain("BEGIN PUBLIC KEY");
    const canonical = canonicalRootEnrollmentPayload(prepared.challenge);
    const proof = { challenge: prepared.challenge, signature: { algorithm: "Ed25519" as const, keyId: prepared.challenge.keyId, value: sign(null, Buffer.from(canonical.payload), privateKey).toString("base64") } };
    const verified = await ops.authorityRootEnrollmentVerify({ proof }, context) as any;
    expect(verified.valid).toBe(true);
    expect(verified.trustActivated).toBe(false);
    expect(verified.enrollmentBundle.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    await expect(ops.authorityRootEnrollmentVerify({ proof }, context)).rejects.toThrow(/CHALLENGE_CONSUMED/);
    const consumedStatus = await ops.authorityRootEnrollmentStatus(context) as any;
    expect(consumedStatus.challenges[0]?.state).toBe("consumed");
    const status = await ops.authorityMandateStatus(context) as any;
    expect(status.trustConfigured).toBe(false);
  });


  it("consumes the issued challenge on the first failed verification attempt", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const ops = operations();
    const prepared = await ops.authorityRootEnrollmentPrepare({ principalId: "principal:founder", role: "founder", keyId: "key:founder:fail", publicKeyPem, allowedScopes: ["company.constitution"] }, context) as any;
    const badProof = { challenge: prepared.challenge, signature: { algorithm: "Ed25519" as const, keyId: prepared.challenge.keyId, value: Buffer.alloc(64, 7).toString("base64") } };
    const failed = await ops.authorityRootEnrollmentVerify({ proof: badProof }, context) as any;
    expect(failed.valid).toBe(false);
    await expect(ops.authorityRootEnrollmentVerify({ proof: badProof }, context)).rejects.toThrow(/CHALLENGE_CONSUMED/);
    const status = await ops.authorityRootEnrollmentStatus(context) as any;
    expect(status.challenges[0]?.state).toBe("consumed");
  });

  it("allows at most one active unexpired challenge at a time", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const ops = operations();
    await ops.authorityRootEnrollmentPrepare({ principalId: "principal:founder", role: "founder", keyId: "key:founder:one", publicKeyPem, allowedScopes: ["company.constitution"] }, context);
    await expect(ops.authorityRootEnrollmentPrepare({ principalId: "principal:owner", role: "owner", keyId: "key:owner:two", publicKeyPem, allowedScopes: ["company.constitution"] }, context)).rejects.toThrow(/CHALLENGE_ALREADY_ACTIVE/);
  });

  it("bounds status history while reporting the full challenge count", async () => {
    const store = new InMemoryRuntimeStore();
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    for (let index = 0; index < 35; index += 1) {
      const issuedAt = new Date(Date.now() - (index + 20) * 10 * 60_000);
      const challenge = createRootEnrollmentChallenge({ companyId, principalId: `principal:${index}`, role: "owner", keyId: `key:${index}`, publicKeyPem, allowedScopes: ["company.constitution"], now: issuedAt, ttlMs: 5 * 60_000 });
      const canonical = canonicalRootEnrollmentPayload(challenge);
      await store.saveAsset({ id: challenge.challengeId, companyId, kind: "company-authority-root-enrollment-challenge", capability: "company.authority.root-enrollment", department: "executive", cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: ["one-time"], metadata: { challenge, challengeHash: canonical.hash, consumed: false }, createdAt: challenge.issuedAt, updatedAt: challenge.issuedAt }, 0);
    }
    const ops = new EnvironmentXspaAppOperations({ store, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false, authorityTrustAnchors: [] });
    const status = await ops.authorityRootEnrollmentStatus(context) as any;
    expect(status.challenges).toHaveLength(32);
    expect(status.totalChallenges).toBe(35);
    expect(status.truncated).toBe(true);
  });

  it("reports expired challenges as expired instead of issued", async () => {
    const store = new InMemoryRuntimeStore();
    const now = new Date();
    const expiredChallenge = createRootEnrollmentChallenge({ companyId, principalId: "principal:expired", role: "owner", keyId: "key:expired", publicKeyPem: generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString(), allowedScopes: ["company.constitution"], now: new Date(now.getTime() - 10 * 60_000), ttlMs: 5 * 60_000 });
    const canonical = canonicalRootEnrollmentPayload(expiredChallenge);
    await store.saveAsset({ id: expiredChallenge.challengeId, companyId, kind: "company-authority-root-enrollment-challenge", capability: "company.authority.root-enrollment", department: "executive", cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: ["one-time"], metadata: { challenge: expiredChallenge, challengeHash: canonical.hash, consumed: false }, createdAt: expiredChallenge.issuedAt, updatedAt: expiredChallenge.issuedAt }, 0);
    const ops = new EnvironmentXspaAppOperations({ store, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false, authorityTrustAnchors: [] });
    const status = await ops.authorityRootEnrollmentStatus(context) as any;
    expect(status.challenges[0]?.state).toBe("expired");
  });

  it("rejects a self-fabricated proof that was never issued by this runtime", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const challenge = createRootEnrollmentChallenge({ companyId, principalId: "principal:fake", role: "owner", keyId: "key:fake", publicKeyPem, allowedScopes: ["company.constitution"] });
    const canonical = canonicalRootEnrollmentPayload(challenge);
    const proof = { challenge, signature: { algorithm: "Ed25519" as const, keyId: challenge.keyId, value: sign(null, Buffer.from(canonical.payload), privateKey).toString("base64") } };
    await expect(operations().authorityRootEnrollmentVerify({ proof }, context)).rejects.toThrow(/CHALLENGE_NOT_ISSUED/);
  });

  it("refuses first-root enrollment when mandate history exists but the configured keyring is missing", async () => {
    const store = new InMemoryRuntimeStore();
    await store.saveAsset({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", companyId, kind: "company-authority-mandate", capability: "company.authority.mandate", department: "executive", cost: 0, currency: "USD", status: "active", grantRefs: [], restrictions: [], metadata: { mandate: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const ops = new EnvironmentXspaAppOperations({ store, companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false, authorityTrustAnchors: [] });
    await expect(ops.authorityRootEnrollmentPrepare({ principalId: "principal:new", role: "owner", keyId: "key:new", publicKeyPem, allowedScopes: ["company.constitution"] }, context)).rejects.toThrow(/ROOT_HISTORY_EXISTS/);
  });

  it("refuses first-root enrollment when a root is already configured", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const anchor = { principalId: "principal:existing", companyId, role: "owner", keyId: "key:existing", algorithm: "Ed25519", publicKeyPem, allowedScopes: ["company.constitution"] };
    const ops = operations([anchor]);
    await expect(ops.authorityRootEnrollmentPrepare({ principalId: "principal:new", role: "owner", keyId: "key:new", publicKeyPem, allowedScopes: ["company.constitution"] }, context)).rejects.toThrow(/ROOT_ALREADY_CONFIGURED/);
  });
});
