import { describe, expect, it } from "vitest";
import type { PrincipalPolicy } from "../../contracts/src/index.js";
import { buildGptHostPlan, getCreativeCapabilityAvailability } from "./gpt-host-plan.js";

function policy(): PrincipalPolicy {
  return {
    role: "executive-principal",
    mode: "pinned",
    model: "gpt-5.6-sol",
    reasoningEffort: "max",
    subordinateModel: "gpt-5.6-sol",
    subordinateReasoningEffort: "xhigh",
    maxReservedForExecutive: true,
    allowSecondaryModelProviders: false,
    branchOrchestration: "xanxitospa-mission-graph",
    allowProviderManagedMultiAgent: false,
    allowModelFallback: false,
    capabilityProvidersReplaceable: true,
    creativePolicy: { providerFamily: "chatgpt-host-only", imageGeneration: "host-native-image-tool", videoGeneration: "staged-unavailable", allowLegacyVideo: false },
  };
}

describe("ChatGPT-hosted V1 model law", () => {
  it("reserves max for executive and uses xhigh for every subordinate role", () => {
    const executive = buildGptHostPlan(policy(), "executive", { prompt: "decide" });
    expect(executive.model).toBe("gpt-5.6-sol");
    expect(executive.reasoning.effort).toBe("max");
    expect(executive.transport).toBe("mcp-host");
    expect(executive.modelProviderApiAllowed).toBe(false);
    for (const role of ["supervisor", "worker", "critic", "verifier"] as const) {
      const branch = buildGptHostPlan(policy(), role, { prompt: "work" });
      expect(branch.model).toBe("gpt-5.6-sol");
      expect(branch.reasoning.effort).toBe("xhigh");
    }
  });

  it("requests only a host-native image tool when enabled", () => {
    const plain = buildGptHostPlan(policy(), "worker", { prompt: "analyze" });
    expect(plain.tools).toEqual([]);
    const image = buildGptHostPlan(policy(), "worker", { prompt: "create an original company character", enableImageGeneration: true });
    expect(image.tools).toEqual([{ type: "host_image_generation" }]);
  });

  it("keeps final video generation staged", () => {
    const state = getCreativeCapabilityAvailability(policy().creativePolicy, "creative.video.generate");
    expect(state.available).toBe(false);
    expect(state.reason).toContain("staged");
  });
});
