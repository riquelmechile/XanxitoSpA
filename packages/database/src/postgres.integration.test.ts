import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BusinessEvent, CorporateGene, Work } from "../../contracts/src/index.js";
import { PostgresCompanyStore, PostgresDatabase, PostgresRuntimeStore } from "./postgres.js";

const connectionString = process.env.XSPA_TEST_DATABASE_URL;
const describePg = connectionString ? describe : describe.skip;

describePg("PostgreSQL durable runtime", () => {
  it("migrates, enforces tenant RLS, idempotency and fencing", async () => {
    if (!connectionString) throw new Error("XSPA_TEST_DATABASE_URL missing");
    const target = new URL(connectionString);
    const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
    if (!localHosts.has(target.hostname) && process.env.XSPA_ALLOW_REMOTE_PG_SMOKE !== "1") throw new Error("refusing integration test against non-loopback PostgreSQL host");
    const admin = new PostgresDatabase(connectionString);
    let app: PostgresDatabase | undefined;
    try {
      await admin.migrate();
      const rolePassword = randomBytes(24).toString("base64url");
      await admin.pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xspa_app') THEN
            CREATE ROLE xspa_app LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOBYPASSRLS;
          ELSE
            ALTER ROLE xspa_app WITH LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOBYPASSRLS;
          END IF;
        END $$;
      `);
      await admin.pool.query("GRANT USAGE ON SCHEMA xspa TO xspa_app");
      await admin.pool.query("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA xspa TO xspa_app");

      const appUrl = new URL(connectionString);
      appUrl.username = "xspa_app";
      appUrl.password = rolePassword;
      app = new PostgresDatabase(appUrl.toString());

      const companyA = randomUUID();
      const companyB = randomUUID();
      await app.ensureCompany(companyA, "Company A", "digest-a");
      await app.ensureCompany(companyB, "Company B", "digest-b");

      const companyStore = new PostgresCompanyStore(app);
      const runtimeStore = new PostgresRuntimeStore(app);
      const workA: Work = { id: randomUUID(), companyId: companyA, owner: "ops", objective: "A", scope: "demo", createdAt: new Date().toISOString() };
      const workB: Work = { id: randomUUID(), companyId: companyB, owner: "ops", objective: "B", scope: "demo", createdAt: new Date().toISOString() };
      await companyStore.saveWork(workA);
      await companyStore.saveWork(workB);

      const visibleA = await app.withCompanyTransaction(companyA, async (client) => client.query<{ company_id: string }>("SELECT company_id FROM xspa.works ORDER BY id"));
      expect(visibleA.rows).toHaveLength(1);
      expect(visibleA.rows[0]?.company_id).toBe(companyA);

      const geneA: CorporateGene = { id: "routing", companyId: companyA, type: "provider-routing", version: 1, parents: [], contextSignature: "demo", artifactRef: "gene:routing", status: "candidate", fitness: { sampleSize: 0, confidence: 0, dimensions: {}, cost: 0, riskIncidents: 0 }, negativeResultRefs: [] };
      const geneB: CorporateGene = { ...geneA, companyId: companyB };
      await companyStore.saveGene(geneA);
      await companyStore.saveGene(geneB);
      expect(await companyStore.listGenes(companyA)).toHaveLength(1);
      expect((await companyStore.listGenes(companyA))[0]?.companyId).toBe(companyA);

      const now = new Date();
      const event: BusinessEvent = { id: randomUUID(), companyId: companyA, type: "sales.material", occurredAt: now.toISOString(), actorPrincipal: "commerce", correlationId: randomUUID(), idempotencyKey: "sale:one", payload: { materiality: "high" }, sensitivity: "internal", evidenceRefs: [] };
      expect(await runtimeStore.appendEvent(event)).toBe(true);
      expect(await runtimeStore.appendEvent({ ...event, id: randomUUID() })).toBe(false);

      const lease1 = await runtimeStore.claimHeartbeatLease(companyA, "daemon-a", now, 40);
      expect(lease1).not.toBeNull();
      expect(await runtimeStore.claimHeartbeatLease(companyA, "daemon-b", now, 40)).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 70));
      const lease2 = await runtimeStore.claimHeartbeatLease(companyA, "daemon-b", new Date(), 40);
      expect(lease2).not.toBeNull();
      expect((lease2?.fencingToken ?? 0)).toBeGreaterThan(lease1?.fencingToken ?? 0);
      expect(await runtimeStore.releaseHeartbeatLease(lease1!, new Date())).toBe(false);
      expect(await runtimeStore.releaseHeartbeatLease(lease2!, new Date())).toBe(true);

      const claim1 = await runtimeStore.claimIdempotency(companyA, "effect:pg", { action: "demo" }, "worker-a", now);
      const claim2 = await runtimeStore.claimIdempotency(companyA, "effect:pg", { action: "demo" }, "worker-b", now);
      expect(claim1.claimed).toBe(true);
      expect(claim2.claimed).toBe(false);
      expect(await runtimeStore.markIdempotency(companyA, "effect:pg", "worker-a", claim1.record.fencingToken, "applied", now, { ok: true })).toBe(true);
      expect((await runtimeStore.getIdempotency(companyA, "effect:pg"))?.state).toBe("applied");
    } finally {
      await app?.close();
      await admin.close();
    }
  }, 30_000);
});
