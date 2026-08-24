import { describe, expect, test } from "vitest";
import {
  runOwnCloudAuthExpiryArm,
  runOwnCloudConcurrentRevisionArm,
  runOwnCloudControlArm,
  runOwnCloudLostAckArm,
  type OwnCloudObjectPort,
} from "./tac-owncloud-fault.js";

class FakeOwnCloudPort implements OwnCloudObjectPort {
  value: Uint8Array | null = null;
  writes = 0;
  constructor(private readonly writable = true) {}
  async put(_path: string, body: Uint8Array): Promise<void> {
    if (!this.writable) throw new Error("401 Unauthorized");
    this.value = new Uint8Array(body);
    this.writes += 1;
  }
  async get(_path: string): Promise<Uint8Array | null> { return this.value ? new Uint8Array(this.value) : null; }
}

const input = { path: "/Documents/v4-reconciled.csv", body: new TextEncoder().encode("v4-revision-b\n") };

describe("TAC OwnCloud stateful v4 execution", () => {
  test("control stores exactly the designated revision in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const port = new FakeOwnCloudPort();
      const result = await runOwnCloudControlArm(mode, input, port);
      expect(result.integrityPreserved).toBe(true);
      expect(result.writeCount).toBe(1);
    }
  });

  test("lost ACK preserves object state and XSPA reconciles without a second PUT", async () => {
    const directPort = new FakeOwnCloudPort();
    const direct = await runOwnCloudLostAckArm("direct", input, directPort);
    expect(direct.integrityPreserved).toBe(true);
    expect(direct.writeCount).toBe(2);
    const xspaPort = new FakeOwnCloudPort();
    const xspa = await runOwnCloudLostAckArm("xanxitospa", input, xspaPort);
    expect(xspa.integrityPreserved).toBe(true);
    expect(xspa.writeCount).toBe(1);
    expect(xspa.reconciliationRequired).toBe(true);
    expect(xspa.recoverySuccess).toBe(true);
  });

  test("credential expiry causes zero writes and safe halt", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const result = await runOwnCloudAuthExpiryArm(mode, input, new FakeOwnCloudPort(false), new FakeOwnCloudPort());
      expect(result.writeCount).toBe(0);
      expect(result.safeHalt).toBe(true);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("conflicting stale revision overwrites in DIRECT but fencing blocks it in XSPA", async () => {
    const stale = new TextEncoder().encode("v4-stale-revision-a\n");
    const directPort = new FakeOwnCloudPort();
    const direct = await runOwnCloudConcurrentRevisionArm("direct", input, stale, directPort);
    expect(direct.integrityPreserved).toBe(false);
    expect(direct.staleWriteAccepted).toBe(true);
    expect(direct.writeCount).toBe(2);
    const xspaPort = new FakeOwnCloudPort();
    const xspa = await runOwnCloudConcurrentRevisionArm("xanxitospa", input, stale, xspaPort);
    expect(xspa.integrityPreserved).toBe(true);
    expect(xspa.staleWriteAccepted).toBe(false);
    expect(xspa.writeCount).toBe(1);
    expect(xspa.recoverySuccess).toBe(true);
  });
});
