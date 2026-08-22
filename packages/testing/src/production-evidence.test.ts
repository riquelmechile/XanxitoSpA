import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStore } from "../../database/src/runtime-store.js";
import { runProductionBackedCase } from "./production-evidence.js";

describe("Gym dynamic production evidence", () => {
  it("accepts a callback that executes production runtime code", async () => {
    const result = await runProductionBackedCase("production", () => {
      const store = new InMemoryRuntimeStore();
      expect(store.jobs.size).toBe(0);
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a callback that passes without executing production runtime code", async () => {
    const result = await runProductionBackedCase("literal-only", () => {
      const configuredMaxRounds = 2;
      expect(configuredMaxRounds).toBe(2);
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("NO_PRODUCTION_EVIDENCE");
  });
});
