import { describe, expect, test } from "vitest";
import {
  runLocalControlArm,
  runLocalKillBeforeHealthArm,
  runLocalPortContentionArm,
  runLocalStaleProcessArm,
  type LocalRuntimePort,
} from "./tac-local-runtime-fault.js";

class FakeRuntimePort implements LocalRuntimePort {
  healthy = false;
  owners = 0;
  occupied = false;
  starts = 0;
  async start(): Promise<boolean> {
    this.starts += 1;
    if (this.occupied || this.owners > 0) return false;
    this.owners = 1; this.healthy = true; return true;
  }
  async killActive(): Promise<void> { this.owners = 0; this.healthy = false; }
  async isHealthy(): Promise<boolean> { return this.healthy; }
  async ownerCount(): Promise<number> { return this.owners; }
  async occupyPort(): Promise<void> { this.occupied = true; }
  async releasePort(): Promise<void> { this.occupied = false; }
}

describe("TAC local runtime stateful v4 execution", () => {
  test("control leaves one healthy owner in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const result = await runLocalControlArm(mode, new FakeRuntimePort());
      expect(result.integrityPreserved).toBe(true);
      expect(result.ownerCount).toBe(1);
    }
  });
  test("kill before health fails DIRECT but XSPA recovers through takeover", async () => {
    const direct = await runLocalKillBeforeHealthArm("direct", new FakeRuntimePort());
    expect(direct.integrityPreserved).toBe(false);
    expect(direct.completed).toBe(false);
    const xspa = await runLocalKillBeforeHealthArm("xanxitospa", new FakeRuntimePort());
    expect(xspa.integrityPreserved).toBe(true);
    expect(xspa.recoverySuccess).toBe(true);
    expect(xspa.ownerCount).toBe(1);
  });
  test("port contention causes bounded safe halt without a process storm", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const result = await runLocalPortContentionArm(mode, new FakeRuntimePort());
      expect(result.integrityPreserved).toBe(true);
      expect(result.safeHalt).toBe(true);
      expect(result.ownerCount).toBe(0);
    }
  });
  test("stale resume cannot reclaim the occupied service in either arm; XSPA also rejects stale fencing", async () => {
    const direct = await runLocalStaleProcessArm("direct", new FakeRuntimePort());
    expect(direct.integrityPreserved).toBe(true);
    expect(direct.ownerCount).toBe(1);
    const xspa = await runLocalStaleProcessArm("xanxitospa", new FakeRuntimePort());
    expect(xspa.integrityPreserved).toBe(true);
    expect(xspa.staleResumeBlocked).toBe(true);
    expect(xspa.ownerCount).toBe(1);
  });
});
