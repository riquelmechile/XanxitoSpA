import { randomUUID } from "node:crypto";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";

export interface LocalRuntimePort {
  start(): Promise<boolean>;
  killActive(): Promise<void>;
  isHealthy(): Promise<boolean>;
  ownerCount(): Promise<number>;
  occupyPort(): Promise<void>;
  releasePort(): Promise<void>;
}

export interface LocalRuntimeArmResult {
  mode: "direct" | "xanxitospa";
  completed: boolean;
  healthy: boolean;
  ownerCount: number;
  startAttempts: number;
  recoverySuccess: boolean;
  reconciliationRequired: boolean;
  integrityPreserved: boolean;
  safeHalt: boolean;
  staleResumeBlocked: boolean;
  auditEvents: string[];
}

async function snapshot(mode: "direct" | "xanxitospa", port: LocalRuntimePort, startAttempts: number, extras: Partial<LocalRuntimeArmResult> = {}): Promise<LocalRuntimeArmResult> {
  const healthy = await port.isHealthy();
  const ownerCount = await port.ownerCount();
  return {
    mode,
    completed: healthy && ownerCount === 1,
    healthy,
    ownerCount,
    startAttempts,
    recoverySuccess: false,
    reconciliationRequired: false,
    integrityPreserved: healthy && ownerCount === 1,
    safeHalt: false,
    staleResumeBlocked: false,
    auditEvents: [],
    ...extras,
  };
}

export async function runLocalControlArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    const started = await port.start();
    return snapshot(mode, port, 1, { auditEvents: [started ? "control:started" : "control:start-failed"] });
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-control";
  const claim = await store.claimIdempotency(companyId, key, { operation: "activate-and-healthcheck" }, "worker-a", new Date("2026-08-24T12:00:00.000Z"));
  if (!claim.claimed) throw new Error("local runtime control claim failed");
  const started = await port.start(); const healthy = started && await port.isHealthy();
  if (healthy) await store.markIdempotency(companyId, key, "worker-a", claim.record.fencingToken, "applied", new Date("2026-08-24T12:00:00.100Z"), { healthy: true });
  return snapshot(mode, port, 1, { auditEvents: [healthy ? `settled:fence-${claim.record.fencingToken}` : "start-or-health-failed"] });
}

export async function runLocalKillBeforeHealthArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    await port.start(); await port.killActive();
    return snapshot(mode, port, 1, { completed: false, integrityPreserved: false, auditEvents: ["injected:kill-before-health", "no-durable-owner-recovery"] });
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-kill";
  const first = await store.claimIdempotency(companyId, key, { operation: "activate-and-healthcheck" }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!first.claimed) throw new Error("first activation claim failed");
  await port.start(); await port.killActive();
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("activation takeover failed");
  const restarted = await port.start(); const healthy = restarted && await port.isHealthy();
  const settled = healthy && await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:02.100Z"), { healthy: true });
  return snapshot(mode, port, 2, { recoverySuccess: Boolean(settled), reconciliationRequired: true, integrityPreserved: Boolean(settled) && healthy, auditEvents: [`fence:${first.record.fencingToken}->${takeover.fencingToken}`, "recovery:replacement-started"] });
}

export async function runLocalPortContentionArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  await port.occupyPort(); let started = false;
  try { started = await port.start(); } finally { await port.releasePort(); }
  const ownerCount = await port.ownerCount(); const healthy = await port.isHealthy();
  return { mode, completed: false, healthy, ownerCount, startAttempts: 1, recoverySuccess: false, reconciliationRequired: false, integrityPreserved: !started && ownerCount === 0, safeHalt: !started && ownerCount === 0, staleResumeBlocked: false, auditEvents: [mode === "xanxitospa" ? "port-contention:failed-safe" : "port-contention:surfaced"] };
}

export async function runLocalStaleProcessArm(mode: "direct" | "xanxitospa", port: LocalRuntimePort): Promise<LocalRuntimeArmResult> {
  if (mode === "direct") {
    await port.start(); const staleStarted = await port.start();
    const result = await snapshot(mode, port, 2, { staleResumeBlocked: !staleStarted, auditEvents: [staleStarted ? "stale-resume:accepted" : "stale-resume:os-port-rejected"] });
    result.integrityPreserved = result.healthy && result.ownerCount === 1;
    return result;
  }
  const store = new InMemoryRuntimeStore(); const companyId = randomUUID(); const key = "v4-local-runtime-stale";
  const staleOwner = await store.claimIdempotency(companyId, key, { operation: "runtime-owner" }, "worker-a", new Date("2026-08-24T12:00:00.000Z")); if (!staleOwner.claimed) throw new Error("stale owner claim failed");
  const takeover = await store.claimStaleIdempotencyForReconciliation(companyId, key, "worker-b", new Date("2026-08-24T12:00:02.000Z"), 1_000); if (!takeover) throw new Error("runtime takeover failed");
  const replacementStarted = await port.start();
  const staleSettled = await store.markIdempotency(companyId, key, "worker-a", staleOwner.record.fencingToken, "applied", new Date("2026-08-24T12:00:03.000Z"), { owner: "worker-a" });
  const freshSettled = replacementStarted && await store.markIdempotency(companyId, key, "worker-b", takeover.fencingToken, "reconciled", new Date("2026-08-24T12:00:03.100Z"), { owner: "worker-b" });
  const result = await snapshot(mode, port, 1, { recoverySuccess: Boolean(freshSettled), reconciliationRequired: true, staleResumeBlocked: !staleSettled, auditEvents: [`fence:${staleOwner.record.fencingToken}->${takeover.fencingToken}`, staleSettled ? "stale-settlement:accepted" : "stale-settlement:rejected-before-resume"] });
  result.integrityPreserved = !staleSettled && Boolean(freshSettled) && result.healthy && result.ownerCount === 1;
  return result;
}
