import { assertMcpDeploymentAuth, loadXspaOAuthConfig } from "./oauth.js";
import { createEnvironmentXspaAppOperations } from "./runtime.js";
import { listenXspaMcp } from "./server.js";

const { operations, close } = await createEnvironmentXspaAppOperations();
const port = Number(process.env.PORT ?? process.env.XSPA_MCP_PORT ?? 3211);
const host = process.env.XSPA_MCP_HOST?.trim() || "0.0.0.0";
const oauth = loadXspaOAuthConfig();
const internalAuthToken = process.env.XSPA_MCP_INTERNAL_BEARER?.trim();
try {
  assertMcpDeploymentAuth({ host, oauth, ...(internalAuthToken ? { internalAuthToken } : {}) });
} catch (error) {
  await close();
  throw error;
}

const server = await listenXspaMcp({
  operations,
  ...(oauth ? { oauth } : {}),
  ...(internalAuthToken ? { authToken: internalAuthToken } : {}),
  host,
  port,
});

console.log(`XanxitoSpA MCP listening on ${host}:${port}/mcp`);

async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await close();
}

process.on("SIGTERM", () => { void shutdown().then(() => process.exit(0)); });
process.on("SIGINT", () => { void shutdown().then(() => process.exit(0)); });
