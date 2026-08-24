import { describe, expect, test } from "vitest";
import {
  runPlaneAuthExpiryArm,
  runPlaneControlArm,
  runPlaneLostAckArm,
  runPlaneStaleWriterArm,
  type PlaneIssuePort,
} from "./tac-plane-fault.js";

class FakePlanePort implements PlaneIssuePort {
  state = "Todo";
  writes = 0;
  constructor(private readonly authorized = true) {}
  async setState(_projectId: string, _issueId: string, stateName: string): Promise<void> {
    if (!this.authorized) throw new Error("Plane HTTP 401");
    this.state = stateName;
    this.writes += 1;
  }
  async getState(_projectId: string, _issueId: string): Promise<string> { return this.state; }
}

const input = { projectId: "project", issueId: "issue", targetState: "In Progress" };

describe("TAC Plane stateful v4 execution", () => {
  test("control applies one transition in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const port = new FakePlanePort();
      const result = await runPlaneControlArm(mode, input, port);
      expect(result.completed).toBe(true);
      expect(result.finalState).toBe("In Progress");
      expect(result.writeCount).toBe(1);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("lost ACK duplicates write in DIRECT but XSPA reconciles", async () => {
    const directPort = new FakePlanePort();
    const direct = await runPlaneLostAckArm("direct", input, directPort);
    expect(direct.writeCount).toBe(2);
    expect(direct.duplicateSideEffects).toBe(1);
    expect(direct.integrityPreserved).toBe(false);

    const xspaPort = new FakePlanePort();
    const xspa = await runPlaneLostAckArm("xanxitospa", input, xspaPort);
    expect(xspa.writeCount).toBe(1);
    expect(xspa.duplicateSideEffects).toBe(0);
    expect(xspa.recoverySuccess).toBe(true);
    expect(xspa.integrityPreserved).toBe(true);
  });

  test("auth expiry causes zero writes and safe halt", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const oracle = new FakePlanePort();
      const result = await runPlaneAuthExpiryArm(mode, input, new FakePlanePort(false), oracle);
      expect(result.completed).toBe(false);
      expect(result.writeCount).toBe(0);
      expect(result.safeHalt).toBe(true);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("stale owner cannot settle over takeover in XSPA", async () => {
    const directPort = new FakePlanePort();
    const direct = await runPlaneStaleWriterArm("direct", input, directPort);
    expect(direct.staleSettlementAccepted).toBe(true);
    expect(direct.integrityPreserved).toBe(false);

    const xspaPort = new FakePlanePort();
    const xspa = await runPlaneStaleWriterArm("xanxitospa", input, xspaPort);
    expect(xspa.staleSettlementAccepted).toBe(false);
    expect(xspa.finalState).toBe("In Progress");
    expect(xspa.integrityPreserved).toBe(true);
  });
});
