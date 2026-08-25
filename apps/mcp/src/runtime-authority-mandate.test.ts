import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthorityMandateUnsigned, CompanyPrincipalTrustAnchor } from "../../../packages/contracts/src/index.js";
import { canonicalMandatePayload } from "../../../packages/kernel/src/index.js";
import { InMemoryCompanyStore, InMemoryRuntimeStore } from "../../../packages/database/src/index.js";
import { EnvironmentXspaAppOperations } from "./runtime.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const context = { principal: "operator:has-xspa-write", scopes: ["xspa.read", "xspa.write"] };

function signedFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const anchor: CompanyPrincipalTrustAnchor = { principalId: "principal:founder", companyId, role: "founder", keyId: "key:founder:1", algorithm: "Ed25519", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(), allowedScopes: ["company.discovery.confirm", "company.constitution"] };
  const unsigned: AuthorityMandateUnsigned = { vct: "authority.mandate.1", id: "33333333-3333-4333-8333-333333333333", companyId, issuerPrincipalId: anchor.principalId, subject: "company", effect: "assert", scopes: ["company.discovery.confirm"], claims: [{ type: "discovery-resolution", unknownId: "unknown:financial-truth", assertion: "The ledger is the trusted and current financial source of truth." }], constraints: [], issuedAt: "2026-08-25T00:00:00.000Z", expiresAt: "2099-08-26T00:00:00.000Z", supersedesMandateIds: [], revokesMandateIds: [] };
  const canonical = canonicalMandatePayload(unsigned);
  return { anchor, mandate: { ...unsigned, payloadHash: canonical.hash, signature: { algorithm: "Ed25519" as const, keyId: anchor.keyId, value: sign(null, Buffer.from(canonical.payload), privateKey).toString("base64url") } } };
}

describe("runtime authority mandate boundary", () => {
  it("does not let xspa.write become owner identity when no trust anchor exists", async () => {
    const store = new InMemoryRuntimeStore();
    const operations = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false });
    const { mandate } = signedFixture();
    await expect(operations.authorityMandateApply({ mandate }, context)).rejects.toThrow(/AUTHORITY_TRUST_NOT_CONFIGURED/);
    expect((await store.listAssets(companyId)).filter((asset) => asset.kind === "company-authority-mandate")).toHaveLength(0);
  });

  it("rejects private-key or secret material inside signed mandate payloads before persistence", async () => {
    const store = new InMemoryRuntimeStore();
    const { anchor, mandate } = signedFixture();
    const operations = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false, authorityTrustAnchors: [anchor] });
    const unsafe = structuredClone(mandate);
    unsafe.claims = [{ type: "authority-policy", value: { privateKey: "synthetic-private-material" } }];
    await expect(operations.authorityMandateApply({ mandate: unsafe }, context)).rejects.toThrow(/SECRET_MATERIAL_REJECTED/);
    expect((await store.listAssets(companyId)).filter((asset) => asset.kind === "company-authority-mandate")).toHaveLength(0);
  });

  it("persists a verified signed mandate and resolves only its covered owner-confirmation unknown", async () => {
    const store = new InMemoryRuntimeStore();
    const { anchor, mandate } = signedFixture();
    const operations = new EnvironmentXspaAppOperations({ store, workStore: new InMemoryCompanyStore(), companyId, databaseConfigured: true, creativeConfigured: false, kastConfigured: false, authorityTrustAnchors: [anchor] });
    await operations.companyDiscoveryApply({ discoveryId: "77777777-7777-4777-8777-777777777777", evidence: [], facts: [], capabilities: [], unknowns: [
      { id: "unknown:financial-truth", question: "Where is financial truth?", category: "finance", priority: "high", status: "open", resolutionRequirement: "owner-confirmation" },
      { id: "unknown:authority-boundaries", question: "What is reserved?", category: "governance", priority: "critical", status: "open", resolutionRequirement: "constitutional-mandate" },
    ] }, context);
    const applied = await operations.authorityMandateApply({ mandate }, context) as { discoveryRevision: any; verification: { valid: boolean } };
    expect(applied.verification.valid).toBe(true);
    expect(applied.discoveryRevision.unknowns.find((u: any) => u.id === "unknown:financial-truth").status).toBe("resolved");
    expect(applied.discoveryRevision.unknowns.find((u: any) => u.id === "unknown:authority-boundaries").status).toBe("open");
    const replay = await operations.authorityMandateApply({ mandate }, context) as { status: string };
    expect(replay.status).toBe("already-applied");
    const status = await operations.authorityMandateStatus(context) as { mandates: Array<{ id: string; verification: { active: boolean } }> };
    expect(status.mandates.find((item) => item.id === mandate.id)?.verification.active).toBe(true);
    expect(JSON.stringify(status)).not.toContain("BEGIN PUBLIC KEY");
  });
});
