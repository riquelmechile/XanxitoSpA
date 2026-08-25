import { readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve("assets/characters/character-missions.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { missions?: unknown[]; execution?: Record<string, unknown> };
const execute = process.env.XSPA_CREATIVE_EXECUTE === "1";

const handoff = {
  state: execute ? "host-execution-required" : "staged",
  controlBoundary: "chatgpt-mcp-host",
  model: "gpt-5.6-sol",
  modelProviderApiAllowed: false,
  modelApiCredentialRequired: false,
  renderer: manifest.execution?.renderer ?? "host-native-image-tool",
  missionCount: Array.isArray(manifest.missions) ? manifest.missions.length : 0,
  instruction: "Submit and execute these governed creative missions through the ChatGPT host and XanxitoSpA MCP boundary. This local script never calls a model-provider API.",
};

console.log(JSON.stringify(handoff, null, 2));
if (execute) {
  console.error("HOST_EXECUTION_REQUIRED: local character-roster model execution is disabled by the MCP-only Model Law");
  process.exit(3);
}
