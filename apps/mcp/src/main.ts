import { assertMcpDeploymentAuth, loadXspaOAuthConfig } from "./oauth.js";
import { createEnvironmentXspaAppOperations } from "./runtime.js";
import { listenXspaMcp } from "./server.js";

const { operations, close } = await createEnvironmentXspaAppOperations();
const port = Number(process.env.PORT ?? process.env.XSPA_MCP_PORT ?? 3211);
const host = process.env.XSPA_MCP_HOST?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN?.trim() || process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const oauth = loadXspaOAuthConfig();
const publicStatusOnly = process.env.XSPA_PUBLIC_STATUS_ONLY === "true";
if (publicStatusOnly && (oauth || process.env.XSPA_COMPANY_ID || process.env.XSPA_CREATIVE_COMPANY_ID || process.env.XSPA_AUTHORITY_TRUST_ANCHORS_JSON)) {
  await close();
  throw new Error("PUBLIC_STATUS_ONLY requires an unbound Company and no OAuth/authority root");
}
const allowedHosts = [...new Set([
  ...(process.env.XSPA_MCP_ALLOWED_HOSTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
  ...(process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ? [process.env.RAILWAY_PUBLIC_DOMAIN.trim()] : []),
  ...(oauth ? [new URL(oauth.resource).hostname] : []),
])];
const internalAuthToken = process.env.XSPA_MCP_INTERNAL_BEARER?.trim();
try {
  assertMcpDeploymentAuth({ host, oauth, ...(internalAuthToken ? { internalAuthToken } : {}), ...(publicStatusOnly ? { publicStatusOnly: true } : {}) });
} catch (error) {
  await close();
  throw error;
}

const server = await listenXspaMcp({
  operations,
  ...(oauth ? { oauth } : {}),
  ...(publicStatusOnly ? { publicStatusOnly: true } : {}),
  ...(internalAuthToken ? { authToken: internalAuthToken } : {}),
  host,
  ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
  port,
});

console.log(`XanxitoSpA MCP listening on ${host}:${port}/mcp`);

async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await close();
}

process.on("SIGTERM", () => { void shutdown().then(() => process.exit(0)); });
process.on("SIGINT", () => { void shutdown().then(() => process.exit(0)); });
