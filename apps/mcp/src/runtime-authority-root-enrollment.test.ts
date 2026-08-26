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
