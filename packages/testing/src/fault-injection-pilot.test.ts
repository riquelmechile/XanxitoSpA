import { describe, expect, test } from "vitest";
import { runFaultInjectionPilot } from "./fault-injection-pilot.js";

describe("v4 fault-injection pilot", () => {
  test("lost ACK: XSPA prevents duplicate side effect and requires reconciliation", async () => {
    const result = await runFaultInjectionPilot(["lost_ack"]);
    const scenario = result.scenarios[0]!;
    expect(scenario.id).toBe("lost_ack");
    expect(scenario.direct.sideEffects).toBe(2);
    expect(scenario.direct.duplicateSideEffects).toBe(1);
    expect(scenario.xanxitospa.sideEffects).toBe(1);
    expect(scenario.xanxitospa.duplicateSideEffects).toBe(0);
    expect(scenario.xanxitospa.reconciliationRequired).toBe(true);
    expect(scenario.xanxitospa.integrityPreserved).toBe(true);
  });

  test("budget overrun: XSPA blocks effect before provider call", async () => {
    const result = await runFaultInjectionPilot(["budget_overrun"]);
    const scenario = result.scenarios[0]!;
    expect(scenario.direct.sideEffects).toBe(1);
    expect(scenario.direct.budgetViolations).toBe(1);
    expect(scenario.xanxitospa.sideEffects).toBe(0);
    expect(scenario.xanxitospa.budgetViolations).toBe(0);
    expect(scenario.xanxitospa.safeHalt).toBe(true);
  });

  test("stale fence: stale worker cannot settle newer XSPA ownership", async () => {
    const result = await runFaultInjectionPilot(["stale_fence"]);
    const scenario = result.scenarios[0]!;
    expect(scenario.direct.stateCorruption).toBe(1);
    expect(scenario.xanxitospa.stateCorruption).toBe(0);
    expect(scenario.xanxitospa.staleWriteBlocked).toBe(true);
    expect(scenario.xanxitospa.integrityPreserved).toBe(true);
  });
});
