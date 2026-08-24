import { describe, expect, test } from "vitest";
import {
  runRocketChatAuthExpiryArm,
  runRocketChatConcurrentDuplicateArm,
  runRocketChatControlArm,
  runRocketChatLostAckArm,
  type RocketChatPort,
  type RocketChatSessionPort,
} from "./tac-rocketchat-fault.js";

class FakeRocketChatPort implements RocketChatPort, RocketChatSessionPort {
  messages: Array<{ target: string; text: string }> = [];
  expired = false;
  async postMessage(targetName: string, text: string): Promise<void> {
    if (this.expired) throw new Error("session expired");
    this.messages.push({ target: targetName, text });
  }
  async countOwnMessages(targetName: string, text: string): Promise<number> {
    return this.messages.filter((message) => message.target === targetName && message.text === text).length;
  }
  async primeSession(): Promise<void> { this.expired = false; }
  async expireSession(): Promise<void> { this.expired = true; }
}

describe("TAC RocketChat stateful v4 execution", () => {
  test("control produces exactly one message in DIRECT and XSPA", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const port = new FakeRocketChatPort();
      const result = await runRocketChatControlArm(mode, { targetName: "Chen Xinyi", text: "control" }, port);
      expect(result.completed).toBe(true);
      expect(result.messageCount).toBe(1);
      expect(result.duplicateSideEffects).toBe(0);
      expect(result.integrityPreserved).toBe(true);
    }
  });

  test("DIRECT blind retry duplicates committed message after lost ACK", async () => {
    const port = new FakeRocketChatPort();
    const result = await runRocketChatLostAckArm("direct", { targetName: "Chen Xinyi", text: "lost-ack" }, port);
    expect(result.completed).toBe(true);
    expect(result.messageCount).toBe(2);
    expect(result.duplicateSideEffects).toBe(1);
    expect(result.integrityPreserved).toBe(false);
  });

  test("XSPA reconciles lost ACK without duplicate message", async () => {
    const port = new FakeRocketChatPort();
    const result = await runRocketChatLostAckArm("xanxitospa", { targetName: "Chen Xinyi", text: "lost-ack" }, port);
    expect(result.completed).toBe(true);
    expect(result.messageCount).toBe(1);
    expect(result.duplicateSideEffects).toBe(0);
    expect(result.recoverySuccess).toBe(true);
    expect(result.integrityPreserved).toBe(true);
  });

  test("expired session causes zero external effects in both arms", async () => {
    for (const mode of ["direct", "xanxitospa"] as const) {
      const port = new FakeRocketChatPort();
      const result = await runRocketChatAuthExpiryArm(mode, { targetName: "Chen Xinyi", text: "auth-expiry" }, port);
      expect(result.completed).toBe(false);
      expect(result.messageCount).toBe(0);
      expect(result.sideEffects).toBe(0);
      expect(result.integrityPreserved).toBe(true);
      expect(result.safeHalt).toBe(true);
    }
  });

  test("concurrent duplicate intent duplicates in DIRECT but is fenced/contended in XSPA", async () => {
    const directPort = new FakeRocketChatPort();
    const direct = await runRocketChatConcurrentDuplicateArm("direct", { targetName: "Chen Xinyi", text: "concurrent" }, directPort);
    expect(direct.messageCount).toBe(2);
    expect(direct.duplicateSideEffects).toBe(1);
    expect(direct.integrityPreserved).toBe(false);

    const xspaPort = new FakeRocketChatPort();
    const xspa = await runRocketChatConcurrentDuplicateArm("xanxitospa", { targetName: "Chen Xinyi", text: "concurrent" }, xspaPort);
    expect(xspa.messageCount).toBe(1);
    expect(xspa.duplicateSideEffects).toBe(0);
    expect(xspa.integrityPreserved).toBe(true);
    expect(xspa.auditEvents.some((event) => event.includes("contended") || event.includes("replay"))).toBe(true);
  });
});
