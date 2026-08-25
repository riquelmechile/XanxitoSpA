import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BusinessEvent, CompanyAsset, CorporateGene, Work } from "../../contracts/src/index.js";
import { PostgresCompanyStore, PostgresDatabase, PostgresRuntimeStore } from "../../database/src/postgres.js";
import { PostgresKastStore } from "../../database/src/postgres-kast.js";
import { closeHarnessSession, recordKastObservation } from "../../kernel/src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function verifyPostgresRuntime(connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(target.hostname) && process.env.XSPA_ALLOW_REMOTE_PG_SMOKE !== "1") {
    throw new Error("refusing PostgreSQL smoke against non-loopback host; set XSPA_ALLOW_REMOTE_PG_SMOKE=1 only for an isolated CI database");
  }
  const admin = new PostgresDatabase(connectionString);
  let app: PostgresDatabase | undefined;
  try {
    const [migrationRunA, migrationRunB] = await Promise.all([admin.migrate(), admin.migrate()]);
    const migrations = [...new Set([...migrationRunA, ...migrationRunB])];
    console.log(`migrations applied: ${migrations.join(", ") || "already-current"}`);

    const tempMigrations = await mkdtemp(path.join(tmpdir(), "xspa-migrations-"));
    try {
      await cp(path.resolve(process.cwd(), "packages/database/migrations"), tempMigrations, { recursive: true });
      const driftFile = path.join(tempMigrations, "0002_durable_runtime.sql");
      await writeFile(driftFile, `${await readFile(driftFile, "utf8")}\n-- intentional checksum drift for smoke verification\n`);
      let driftRejected = false;
      try { await admin.migrate(tempMigrations); }
      catch (error) { driftRejected = error instanceof Error && error.message.includes("checksum drift"); }
      assert(driftRejected, "migration checksum drift was not rejected");
    } finally {
      await rm(tempMigrations, { recursive: true, force: true });
    }
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
    const kastStore = new PostgresKastStore(app);
    const workA: Work = { id: randomUUID(), companyId: companyA, owner: "ops", objective: "A", scope: "demo", createdAt: new Date().toISOString() };
    const workB: Work = { id: randomUUID(), companyId: companyB, owner: "ops", objective: "B", scope: "demo", createdAt: new Date().toISOString() };
    await companyStore.saveWork(workA);
    await companyStore.saveWork(workB);
    const fetchedA = await companyStore.getWork(companyA, workA.id);
    const hiddenFromB = await companyStore.getWork(companyB, workA.id);
    assert(fetchedA?.companyId === companyA && fetchedA.objective === "A", "Company Work lookup failed");
    assert(hiddenFromB === null, "Company Work lookup crossed RLS Company boundary");

    const visibleA = await app.withCompanyTransaction(companyA, async (client) => client.query<{ company_id: string }>("SELECT company_id FROM xspa.works ORDER BY id"));
    assert(visibleA.rows.length === 1 && visibleA.rows[0]?.company_id === companyA, "RLS leaked another Company work row");

    const kastSession = "session:pg-smoke";
    const kastEntry = await recordKastObservation(kastStore, {
      companyId: companyA, sessionRef: kastSession, category: "bug", severity: "medium", title: "PG KAST smoke",
      summary: "Verify durable KAST persistence and RLS.", reproduction: ["run postgres smoke"], affectedPaths: ["packages/database"],
      affectedCapabilities: ["kast.persist"], evidenceRefs: ["smoke:postgres"], recommendation: "Keep regression.", verificationPlan: ["rerun smoke"],
      containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString(),
    });
    await closeHarnessSession(kastStore, { companyId: companyA, sessionRef: kastSession, containsRawSecrets: false, containsRawConversation: false, kastObservations: [], engramCandidates: [{ title: "KAST smoke", summary: "Postgres KAST persisted", topicKey: "kast/pg-smoke" }] });
    assert((await kastStore.getByFingerprint(companyA, kastEntry.fingerprint))?.id === kastEntry.id, "KAST entry persistence failed");
    assert((await kastStore.getSessionClose(companyA, kastSession))?.sessionRef === kastSession, "session close receipt persistence failed");
    await Promise.all([
      recordKastObservation(kastStore, {
        companyId: companyA, sessionRef: "session:pg-race-a", category: "bug", severity: "medium", title: "PG KAST smoke",
        summary: "Verify durable KAST persistence and RLS.", reproduction: ["run postgres smoke"], affectedPaths: ["packages/database"],
        affectedCapabilities: ["kast.persist"], evidenceRefs: ["smoke:race:a"], recommendation: "Keep regression.", verificationPlan: ["rerun smoke"],
        containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString(),
      }),
      recordKastObservation(kastStore, {
        companyId: companyA, sessionRef: "session:pg-race-b", category: "bug", severity: "high", title: "PG KAST smoke",
        summary: "Verify durable KAST persistence and RLS.", reproduction: ["run postgres smoke"], affectedPaths: ["packages/database"],
        affectedCapabilities: ["kast.persist"], evidenceRefs: ["smoke:race:b"], recommendation: "Keep regression.", verificationPlan: ["rerun smoke"],
        containsRawSecrets: false, containsRawConversation: false, observedAt: new Date().toISOString(),
      }),
    ]);
    const racedKast = await kastStore.getByFingerprint(companyA, kastEntry.fingerprint);
    assert(racedKast?.occurrenceCount === 3, "concurrent KAST observations lost recurrence");
    assert(racedKast.severity === "high" && racedKast.evidenceRefs.includes("smoke:race:a") && racedKast.evidenceRefs.includes("smoke:race:b"), "concurrent KAST merge lost severity/evidence");
    const visibleKastA = await app.withCompanyTransaction(companyA, async (client) => client.query<{ company_id: string }>("SELECT company_id FROM xspa.kast_entries ORDER BY id"));
    assert(visibleKastA.rows.length === 1 && visibleKastA.rows[0]?.company_id === companyA, "RLS leaked KAST entries");

    const geneA: CorporateGene = { id: "routing", companyId: companyA, type: "provider-routing", version: 1, parents: [], contextSignature: "demo", artifactRef: "gene:routing", status: "candidate", fitness: { sampleSize: 0, confidence: 0, dimensions: {}, cost: 0, riskIncidents: 0 }, negativeResultRefs: [], experienceRefs: ["trace:test"] };
    const geneB: CorporateGene = { ...geneA, companyId: companyB };
    await companyStore.saveGene(geneA);
    await companyStore.saveGene(geneB);
    const genesA = await companyStore.listGenes(companyA);
    assert(genesA.length === 1 && genesA[0]?.companyId === companyA, "RLS leaked another Company gene");
    assert(genesA[0]?.experienceRefs.includes("trace:test"), "CorporateGene experience trace persistence failed");

    const assetNow = new Date().toISOString();
    const assetA: CompanyAsset = { id: randomUUID(), companyId: companyA, kind: "skill-installation", capability: "skill.execute", department: "operations", cost: 0, currency: "CLP", status: "active", grantRefs: [], restrictions: [], metadata: { installation: { companyId: companyA, assetId: "placeholder", skillRef: "skill://demo@1.0.0", department: "operations", scopes: ["operations.demo"], source: "catalog", status: "active" } }, createdAt: assetNow, updatedAt: assetNow };
    (assetA.metadata.installation as { assetId: string }).assetId = assetA.id;
    const assetB: CompanyAsset = { ...assetA, id: randomUUID(), companyId: companyB, metadata: { installation: { companyId: companyB, assetId: "placeholder", skillRef: "skill://demo@1.0.0", department: "operations", scopes: ["operations.demo"], source: "catalog", status: "active" } } };
    (assetB.metadata.installation as { assetId: string }).assetId = assetB.id;
    await runtimeStore.saveAsset(assetA);
    const runtimeStoreB = new PostgresRuntimeStore(app);
    await runtimeStoreB.saveAsset(assetB);
    const assetsA = await runtimeStore.listAssets(companyA);
    assert(assetsA.some((asset) => asset.id === assetA.id && asset.companyId === companyA), "CompanyAsset persistence failed");
    assert(!assetsA.some((asset) => asset.id === assetB.id || asset.companyId === companyB), "RLS leaked another Company asset");

    const now = new Date();
    const event: BusinessEvent = { id: randomUUID(), companyId: companyA, type: "sales.material", occurredAt: now.toISOString(), actorPrincipal: "commerce", correlationId: randomUUID(), idempotencyKey: `sale:${randomUUID()}`, payload: { materiality: "high" }, sensitivity: "internal", evidenceRefs: [] };
    assert(await runtimeStore.appendEvent(event), "first event insert failed");
    assert(!(await runtimeStore.appendEvent({ ...event, id: randomUUID() })), "event idempotency duplicate was inserted");

    const lease1 = await runtimeStore.claimHeartbeatLease(companyA, "daemon-a", now, 40);
    assert(lease1, "first heartbeat lease missing");
    assert(await runtimeStore.isHeartbeatLeaseCurrent(lease1, now), "fresh heartbeat lease not current");
    assert((await runtimeStore.claimHeartbeatLease(companyA, "daemon-b", now, 40)) === null, "concurrent heartbeat lease was granted");
    await new Promise((resolve) => setTimeout(resolve, 70));
    const lease2 = await runtimeStore.claimHeartbeatLease(companyA, "daemon-b", new Date(), 40);
    assert(lease2 && lease2.fencingToken > lease1.fencingToken, "fencing token did not advance after database-clock lease expiry");
    assert(!(await runtimeStore.isHeartbeatLeaseCurrent(lease1, new Date())), "stale heartbeat lease still considered current");
    const newerEvent: BusinessEvent = { ...event, id: randomUUID(), occurredAt: new Date(now.getTime() + 2_000).toISOString(), idempotencyKey: `sale:${randomUUID()}` };
    assert(!(await runtimeStore.saveHeartbeatCursor(lease1, event, new Date())), "stale heartbeat lease advanced cursor");
    assert(await runtimeStore.saveHeartbeatCursor(lease2, newerEvent, new Date()), "current lease failed monotonic cursor advance");
    assert(!(await runtimeStore.saveHeartbeatCursor(lease2, event, new Date())), "cursor regressed to older event");
    assert((await runtimeStore.getHeartbeatCursor(companyA, new Date())).lastEventId === newerEvent.id, "cursor monotonic guard lost newest event");
    assert(!(await runtimeStore.releaseHeartbeatLease(lease1, new Date())), "stale heartbeat lease released current holder");
    assert(await runtimeStore.releaseHeartbeatLease(lease2, new Date()), "current heartbeat lease failed release");

    const wakeAsset: CompanyAsset = { id: randomUUID(), companyId: companyA, kind: "company-wake-state", capability: "company.attention", department: "executive", cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: [], metadata: { state: [] }, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    assert(await runtimeStore.saveAsset(wakeAsset, 0), "versioned asset insert failed");
    const wakeStored = (await runtimeStore.listAssets(companyA)).find((asset) => asset.id === wakeAsset.id);
    assert(wakeStored?.version === 1, "versioned asset insert did not set version 1");
    assert(!(await runtimeStore.saveAsset({ ...wakeAsset, metadata: { stale: true } }, 0)), "create-only CAS overwrote existing asset");
    const missingUpdate = { ...wakeAsset, id: randomUUID(), metadata: { missing: true } };
    assert(!(await runtimeStore.saveAsset(missingUpdate, 1)), "update-only CAS inserted a missing asset");
    const atomicMandate = { ...wakeAsset, id: randomUUID(), kind: "company-authority-mandate", metadata: { mandate: true } };
    assert(!(await runtimeStore.saveAssetsAtomically([{ asset: atomicMandate, expectedVersion: 0 }, { asset: { ...wakeAsset, metadata: { staleAtomic: true } }, expectedVersion: 0 }])), "atomic CAS accepted stale head version");
    assert(!(await runtimeStore.listAssets(companyA)).some((item) => item.id === atomicMandate.id), "atomic CAS left a partial asset after conflict");
    assert(await runtimeStore.saveAssetsAtomically([{ asset: atomicMandate, expectedVersion: 0 }, { asset: { ...wakeAsset, metadata: { freshAtomic: true } }, expectedVersion: 1 }]), "atomic CAS update failed");

    const key = `effect:${randomUUID()}`;
    const firstClaim = await runtimeStore.claimIdempotency(companyA, key, { action: "demo" }, "worker-a", now);
    const secondClaim = await runtimeStore.claimIdempotency(companyA, key, { action: "demo" }, "worker-b", now);
    assert(firstClaim.claimed && !secondClaim.claimed, "durable idempotency key was claimed twice");
    assert(await runtimeStore.markIdempotency(companyA, key, "worker-a", firstClaim.record.fencingToken, "applied", now, { ok: true }), "idempotency owner failed settlement");
    assert((await runtimeStore.getIdempotency(companyA, key))?.state === "applied", "idempotency applied state not durable");

    const orphanKey = `effect:${randomUUID()}`;
    const orphan = await runtimeStore.claimIdempotency(companyA, orphanKey, { action: "maybe-applied" }, "worker-crashed", new Date());
    assert(orphan.claimed, "orphan test could not claim intent");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const recovery = await runtimeStore.claimStaleIdempotencyForReconciliation(companyA, orphanKey, "reconciler", new Date(), 5);
    assert(recovery?.state === "unknown" && recovery.owner === "reconciler" && recovery.fencingToken > orphan.record.fencingToken, "stale durable intent did not enter fenced reconciliation");
    assert(!(await runtimeStore.markIdempotency(companyA, orphanKey, "worker-crashed", orphan.record.fencingToken, "applied", new Date(), { unsafe: true })), "stale idempotency owner settled after reconciliation takeover");
    assert(await runtimeStore.markIdempotency(companyA, orphanKey, "reconciler", recovery.fencingToken, "reconciled", new Date(), { observed: "not-applied" }), "reconciler could not settle durable orphan");

    console.log("PASS PostgreSQL migrations/checksum lock + RLS + CompanyAsset CAS + CorporateGene + KAST/session close + event idempotency + fenced monotonic heartbeat cursor + orphan reconciliation");
  } finally {
    await app?.close();
    await admin.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.XSPA_TEST_DATABASE_URL ?? process.argv.find((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"));
  if (!url) throw new Error("usage: tsx packages/testing/src/postgres-smoke.ts <postgres-url> (or set XSPA_TEST_DATABASE_URL)");
  await verifyPostgresRuntime(url);
}
