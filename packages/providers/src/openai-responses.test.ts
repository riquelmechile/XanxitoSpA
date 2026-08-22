import { describe, expect, it } from "vitest";
import type { PrincipalPolicy } from "../../contracts/src/index.js";
import { buildOpenAIResponsesPlan, getCreativeCapabilityAvailability } from "./openai-responses.js";

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
    creativePolicy: {
      providerFamily: "openai-only",
      imageGeneration: "responses-image-generation",
      videoGeneration: "staged-unavailable",
      allowLegacyVideo: false,
    },
  };
}

describe("OpenAI Responses V1 model law", () => {
  it("reserves max for executive and uses xhigh for every subordinate role", () => {
    const executive = buildOpenAIResponsesPlan(policy(), "executive", { prompt: "decide" });
    expect(executive.model).toBe("gpt-5.6-sol");
    expect(executive.reasoning.effort).toBe("max");

    for (const role of ["supervisor", "worker", "critic", "verifier"] as const) {
      const branch = buildOpenAIResponsesPlan(policy(), role, { prompt: "work" });
      expect(branch.model).toBe("gpt-5.6-sol");
      expect(branch.reasoning.effort).toBe("xhigh");
    }
  });

  it("adds only the native image_generation tool when requested", () => {
    const plain = buildOpenAIResponsesPlan(policy(), "worker", { prompt: "analyze" });
    expect(plain.tools).toEqual([]);

    const image = buildOpenAIResponsesPlan(policy(), "worker", {
      prompt: "create an original company character",
      enableImageGeneration: true,
    });
    expect(image.tools).toEqual([{ type: "image_generation" }]);
  });

  it("keeps final video generation staged", () => {
    const state = getCreativeCapabilityAvailability(policy().creativePolicy, "creative.video.generate");
    expect(state.available).toBe(false);
    expect(state.reason).toContain("staged");
  });
});
