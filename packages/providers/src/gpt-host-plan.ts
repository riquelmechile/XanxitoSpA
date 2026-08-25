import type { CreativePolicy, PrincipalPolicy, ReasoningRole } from "../../contracts/src/index.js";
import { DomainError, resolveModelLawProfile } from "../../domain/src/index.js";

export interface CreativeCapabilityAvailability {
  available: boolean;
  reason: string;
}

export interface GptHostPlan {
  host: "chatgpt";
  transport: "mcp-host";
  model: "gpt-5.6-sol";
  reasoning: { effort: "max" | "xhigh" };
  input: string;
  tools: Array<{ type: "host_image_generation" }>;
  modelProviderApiAllowed: false;
}

export function getCreativeCapabilityAvailability(
  policy: CreativePolicy,
  capability: "creative.image.generate" | "creative.image.edit" | "creative.video.generate",
): CreativeCapabilityAvailability {
  if (policy.providerFamily !== "chatgpt-host-only") throw new DomainError("V1 creative policy must remain ChatGPT-host-only");
  if (capability === "creative.video.generate") {
    return { available: false, reason: "staged: no approved host-native video tool in V1" };
  }
  if (policy.imageGeneration !== "host-native-image-tool") {
    return { available: false, reason: "host-native image generation disabled by creative policy" };
  }
  return { available: true, reason: "ChatGPT host-native image tool when exposed by the host" };
}

export function buildGptHostPlan(
  policy: PrincipalPolicy,
  role: ReasoningRole,
  input: { prompt: string; enableImageGeneration?: boolean },
): GptHostPlan {
  if (!input.prompt.trim()) throw new DomainError("GPT host prompt required");
  const profile = resolveModelLawProfile(policy, role);
  const tools: Array<{ type: "host_image_generation" }> = [];
  if (input.enableImageGeneration) {
    const availability = getCreativeCapabilityAvailability(policy.creativePolicy, "creative.image.generate");
    if (!availability.available) throw new DomainError(availability.reason);
    tools.push({ type: "host_image_generation" });
  }
  return {
    host: "chatgpt",
    transport: "mcp-host",
    model: profile.model,
    reasoning: { effort: profile.reasoningEffort },
    input: input.prompt,
    tools,
    modelProviderApiAllowed: false,
  };
}
