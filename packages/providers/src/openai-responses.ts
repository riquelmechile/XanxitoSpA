import type { CreativePolicy, PrincipalPolicy, ReasoningRole } from "../../contracts/src/index.js";
import { DomainError, resolveModelLawProfile } from "../../domain/src/index.js";

export interface CreativeCapabilityAvailability {
  available: boolean;
  reason: string;
}

export interface OpenAIResponsesPlan {
  provider: "openai";
  endpoint: "responses";
  model: "gpt-5.6-sol";
  reasoning: { effort: "max" | "xhigh" };
  input: string;
  tools: Array<{ type: "image_generation" }>;
}

export function getCreativeCapabilityAvailability(
  policy: CreativePolicy,
  capability: "creative.image.generate" | "creative.image.edit" | "creative.video.generate",
): CreativeCapabilityAvailability {
  if (policy.providerFamily !== "openai-only") throw new DomainError("V1 creative policy must remain OpenAI-only");
  if (capability === "creative.video.generate") {
    return {
      available: false,
      reason: "staged: GPT-5.6 Sol has no stable native video-generation tool in V1; legacy Sora video models are disabled",
    };
  }
  if (policy.imageGeneration !== "responses-image-generation") {
    return { available: false, reason: "image generation disabled by creative policy" };
  }
  return { available: true, reason: "native Responses image_generation tool" };
}

export function buildOpenAIResponsesPlan(
  policy: PrincipalPolicy,
  role: ReasoningRole,
  input: { prompt: string; enableImageGeneration?: boolean },
): OpenAIResponsesPlan {
  if (!input.prompt.trim()) throw new DomainError("OpenAI Responses prompt required");
  const profile = resolveModelLawProfile(policy, role);
  const tools: Array<{ type: "image_generation" }> = [];
  if (input.enableImageGeneration) {
    const availability = getCreativeCapabilityAvailability(policy.creativePolicy, "creative.image.generate");
    if (!availability.available) throw new DomainError(availability.reason);
    tools.push({ type: "image_generation" });
  }
  return {
    provider: "openai",
    endpoint: "responses",
    model: profile.model,
    reasoning: { effort: profile.reasoningEffort },
    input: input.prompt,
    tools,
  };
}
