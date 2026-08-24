import { describe, expect, test } from "vitest";
import {
  runGitLabControlArm,
  runGitLabCredentialExpiryArm,
  runGitLabLostAckArm,
  runGitLabServiceRestartArm,
  type GitLabIssuePort,
} from "./tac-gitlab-fault.js";

class FakeGitLabIssuePort implements GitLabIssuePort {
  readonly issues: Array<{ projectPath: string; title: string; description: string }> = [];
  constructor(private readonly credentialValid = true) {}
  async createIssue(projectPath: string, title: string, description: string): Promise<void> {
    if (!this.credentialValid) throw new Error("GitLab HTTP 401: invalid_token");
    this.issues.push({ projectPath, title, description });
  }
  async countIssuesByTitle(projectPath: string, title: string): Promise<number> {
    return this.issues.filter((issue) => issue.projectPath === projectPath && issue.title === title).length;
  }
}

const input = { projectPath: "root/api-server", title: "V4 GitLab", description: "v4 only" };

describe("TAC GitLab stateful v4 execution", () => {
  test("control creates exactly one issue in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const port = new FakeGitLabIssuePort();
      const result = await runGitLabControlArm(mode, input, port);
      expect(result.completed).toBe(true);
      expect(result.issueCount).toBe(1);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("DIRECT blind retry creates duplicate issue after lost ACK", async () => {
    const port = new FakeGitLabIssuePort();
    const result = await runGitLabLostAckArm("direct", input, port);
    expect(result.completed).toBe(true);
    expect(result.issueCount).toBe(2);
    expect(result.duplicateSideEffects).toBe(1);
    expect(result.integrityPreserved).toBe(false);
  });

  test("XSPA reconciles committed issue and replays without duplicate", async () => {
    const port = new FakeGitLabIssuePort();
    const result = await runGitLabLostAckArm("xanxitospa", input, port);
    expect(result.completed).toBe(true);
    expect(result.issueCount).toBe(1);
    expect(result.duplicateSideEffects).toBe(0);
    expect(result.reconciliationRequired).toBe(true);
    expect(result.recoverySuccess).toBe(true);
    expect(result.integrityPreserved).toBe(true);
  });

  test("credential expiry before write causes zero issues in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const writePort = new FakeGitLabIssuePort(false);
      const oraclePort = new FakeGitLabIssuePort();
      const result = await runGitLabCredentialExpiryArm(mode, input, writePort, oraclePort);
      expect(result.completed).toBe(false);
      expect(result.issueCount).toBe(0);
      expect(result.sideEffects).toBe(0);
      expect(result.safeHalt).toBe(true);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("service restart after commit duplicates in DIRECT but XSPA reconciles", async () => {
    const directPort = new FakeGitLabIssuePort();
    const direct = await runGitLabServiceRestartArm("direct", input, directPort, async () => undefined);
    expect(direct.issueCount).toBe(2);
    expect(direct.duplicateSideEffects).toBe(1);
    expect(direct.integrityPreserved).toBe(false);

    const xspaPort = new FakeGitLabIssuePort();
    const xspa = await runGitLabServiceRestartArm("xanxitospa", input, xspaPort, async () => undefined);
    expect(xspa.issueCount).toBe(1);
    expect(xspa.reconciliationRequired).toBe(true);
    expect(xspa.recoverySuccess).toBe(true);
    expect(xspa.integrityPreserved).toBe(true);
  });
});
