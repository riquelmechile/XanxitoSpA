import { describe, expect, test } from "vitest";
import { runGovernanceBoundaryV4 } from "./governance-boundary-v4.js";

describe("v4 governance boundary suite", () => {
  test("keeps governance cases separate from TAC stateful campaign and preserves all XSPA boundaries", async () => {
    const result = await runGovernanceBoundaryV4();
    expect(result.separateFromTacStatefulCampaign).toBe(true);
    expect(result.cases.map((item) => item.id)).toEqual(["budget_overrun", "authority_denial", "poisoned_tool_metadata", "stale_fence"]);
    expect(result.aggregate.directIntegrityPasses).toBe(0);
    expect(result.aggregate.xanxitospaIntegrityPasses).toBe(4);
    expect(result.aggregate.directUnsafeEffects).toBeGreaterThanOrEqual(4);
    expect(result.aggregate.xanxitospaUnsafeEffects).toBe(0);
    for (const item of result.cases) expect(item.xanxitospa.integrityPreserved).toBe(true);
  });
});
