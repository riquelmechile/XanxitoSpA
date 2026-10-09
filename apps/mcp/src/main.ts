import { assertMcpDeploymentAuth, loadXspaOAuthConfig } from "./oauth.js";
import { createEnvironmentXspaAppOperations } from "./runtime.js";
import { listenXspaMcp } from "./server.js";
import { SelfHostedOAuth } from "./self-oauth.js";
import type { JWK } from "jose";

const { operations, close, oauthDb } = await createEnvironmentXspaAppOperations();
const port = Number(process.env.PORT ?? process.env.XSPA_MCP_PORT ?? 3211);
const host = process.env.XSPA_MCP_HOST?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN?.trim() || process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const publicStatusOnly = process.env.XSPA_PUBLIC_STATUS_ONLY === "true";
const ownerHash=process.env.XSPA_SELF_OAUTH_OWNER_PASSWORD_HASH?.trim();
const signingJson=process.env.XSPA_SELF_OAUTH_SIGNING_JWK?.trim();
const ownerSubject=process.env.XSPA_SELF_OAUTH_OWNER_SUBJECT?.trim() || ("owner:"+(process.env.XSPA_COMPANY_ID?.trim()||""));
const selfRequested=Boolean(ownerHash||signingJson||process.env.XSPA_SELF_OAUTH_ENABLED==="true");
if(selfRequested && (publicStatusOnly||!ownerHash||!signingJson||!process.env.XSPA_PUBLIC_URL||!oauthDb||!process.env.XSPA_COMPANY_ID)){
 await close();throw new Error("SELF_OAUTH_BOOTSTRAP_INCOMPLETE_OR_STATUS_ONLY");
}
let oauthIssuer:SelfHostedOAuth|undefined;
if(selfRequested){
 try{oauthIssuer=new SelfHostedOAuth({db:oauthDb!,companyId:process.env.XSPA_COMPANY_ID!.trim(),resource:process.env.XSPA_PUBLIC_URL!.trim(),ownerPasswordHash:ownerHash!,signingJwk:JSON.parse(signingJson!) as JWK,ownerSubject});}
 catch(error){await close();throw error;}
}
const oauth=oauthIssuer?.config ?? loadXspaOAuthConfig();
if (publicStatusOnly && (oauth || process.env.XSPA_AUTHORITY_TRUST_ANCHORS_JSON)) {
  await close();
  throw new Error("PUBLIC_STATUS_ONLY forbids OAuth/authority-root config; Company storage may be initialized but business tools stay blocked");
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
  ...(oauthIssuer ? { oauthIssuer } : {}),
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
