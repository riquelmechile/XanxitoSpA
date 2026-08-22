import { describe, expect, it } from "vitest";
import { runCompanyGym } from "./gym.js";

describe("XanxitoSpA Company Gym", () => {
  it("passes all V1 invariants", async () => {
    const result = await runCompanyGym();
    expect(result.cases.length).toBeGreaterThanOrEqual(15);
    expect(result.ok, result.cases.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("\n")).toBe(true);
  });
});
