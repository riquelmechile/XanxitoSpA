// Read-only external audit; never creates workers, tokens, deployments or grants.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint = new URL(process.env.XSPA_AUDIT_MCP_URL || "https://xspa-mcp-staging.up.railway.app/mcp");
if (endpoint.protocol !== "https:") throw Error("Audit requires HTTPS");
const base = endpoint.origin;
const report = { target: endpoint.href, timestamp: new Date().toISOString(), checks: {}, blockers: [] };
async function check(name, task) {
  try { report.checks[name] = await task(); }
  catch (e) { report.checks[name] = { error: e instanceof Error ? e.message : String(e) }; }
}
await check("health", async () => {
  const r = await fetch(base + "/health", { signal: AbortSignal.timeout(15000) });
  const body = r.ok ? await r.json() : null;
  return { http: r.status, ok: r.status === 200 && body?.ok === true, version: body?.version };
});
await check("oauthAuthorizationMetadata", async () => {
  const r = await fetch(base + "/.well-known/oauth-authorization-server", { signal: AbortSignal.timeout(15000) });
  return { http: r.status, available: r.ok };
});
await check("oauthProtectedResourceMetadata", async () => {
  const r = await fetch(base + "/.well-known/oauth-protected-resource/mcp", { signal: AbortSignal.timeout(15000) });
  return { http: r.status, available: r.ok };
});
await check("a2aAgentCard", async () => {
  const r = await fetch(base + "/.well-known/agent-card.json", { signal: AbortSignal.timeout(15000) });
  return { http: r.status, available: r.ok };
});
await check("mcp", async () => {
  const client = new Client({ name: "xspa-readiness-auditor", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StreamableHTTPClientTransport(endpoint);
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map(item => item.name);
    const status = await client.callTool({ name: "xspa_status", arguments: {} });
    const raw = status.content?.find(x => x.type === "text")?.text || "";
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch {}
    const denied = await client.callTool({ name: "xspa_worker_register", arguments: { host_hint: "audit-no-auth", capabilities: [] } });
    return { negotiated: client.getProtocolEra?.(), tools: names, statusToolOk: !status.isError,
      anonymousWorkerRegistrationDenied: denied.isError === true,
      access: parsed.access || {}, database: parsed.database || {}, companyOs: parsed.companyOs || {},
      workforce: parsed.workforce || {}, modelLaw: parsed.modelLaw || {} };
  } finally { await client.close(); }
});
const health = report.checks.health;
const mcp = report.checks.mcp;
if (!health?.ok) report.blockers.push("Public HTTPS health not responding 200");
if (!mcp?.statusToolOk) report.blockers.push("MCP status tool unusable");
if (!mcp?.anonymousWorkerRegistrationDenied) report.blockers.push("CRITICAL: anonymous registration not denied");
if (!report.checks.oauthAuthorizationMetadata?.available) report.blockers.push("No self-hosted OAuth authorization-server metadata");
if (!report.checks.oauthProtectedResourceMetadata?.available) report.blockers.push("No OAuth resource metadata");
if (!report.checks.a2aAgentCard?.available) report.blockers.push("No A2A Agent Card");
if (!mcp?.access?.oauthConfigured) report.blockers.push("Authenticated Company tools are not enabled");
report.readyForAccountConnection = report.blockers.length === 0;
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--require-ready") && !report.readyForAccountConnection) process.exitCode = 1;
