/** Deprecated compatibility boundary. Provider-managed character reasoning is disabled. */
export function modelProviderCharacterRuntimeDisabled(): never {
  throw new Error("MODEL_PROVIDER_API_DISABLED: creative reasoning belongs to the ChatGPT MCP host");
}
