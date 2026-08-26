import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { XspaAppOperations } from "../../../apps/mcp/src/server.js";
import { listenXspaMcp } from "../../../apps/mcp/src/server.js";
import { assertMcpDeploymentAuth, type XspaOAuthConfig } from "../../../apps/mcp/src/oauth.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function verifyXspaAppOAuth(): Promise<void> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "xspa-test-key";
  jwk.use = "sig";
  jwk.alg = "RS256";

  const jwksServer = createServer((req, res) => {
    if (req.url === "/jwks") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404; res.end();
  });
  jwksServer.listen(0, "127.0.0.1");
  await once(jwksServer, "listening");
  const jwksAddress = jwksServer.address() as AddressInfo;
  const issuer = `http://127.0.0.1:${jwksAddress.port}`;
  const resource = "http://127.0.0.1:45678";
  const oauth: XspaOAuthConfig = {
    resource,
    issuer,
    audience: resource,
    jwksUrl: `${issuer}/jwks`,
    readScope: "xspa.read",
    writeScope: "xspa.write",
  };

  assertMcpDeploymentAuth({ host: "127.0.0.1", oauth: null, internalAuthToken: "loopback-only" });
  assertMcpDeploymentAuth({ host: "0.0.0.0", oauth });
  let remoteBearerRejected = false;
  try { assertMcpDeploymentAuth({ host: "0.0.0.0", oauth: null, internalAuthToken: "must-not-be-remote" }); } catch { remoteBearerRejected = true; }
  assert(remoteBearerRejected, "remote internal bearer deployment was not rejected");
  let remoteNoAuthRejected = false;
  try { assertMcpDeploymentAuth({ host: "0.0.0.0", oauth: null }); } catch { remoteNoAuthRejected = true; }
  assert(remoteNoAuthRejected, "remote unauthenticated deployment was not rejected");

  const operations: XspaAppOperations = {
    status: async () => ({ version: "1.0.0", modelLaw: { executive: "gpt-5.6-sol/max", branches: "gpt-5.6-sol/xhigh", fallback: false }, mcp: { ready: true, mode: "streamable-http" }, database: { configured: true }, companyOs: { ready: true, intakeModes: ["new", "existing"], lifecycleModes: ["bootstrap", "operate", "improve", "grow", "expand", "recover", "exit"] }, creative: { configured: false, renderer: "chatgpt-host-native-tooling", chatMode: "mcp-host-only", video: "staged" }, kast: { configured: true, execution: "queued" }, skills: { configured: true, healthy: true, indexed: 1, activeCompanyCatalog: 1 } }),
    workCreate: async (input, context) => ({ workId: input.workId, status: "created", principal: context.principal }),
    workGet: async (workId, context) => ({ workId, state: "found", principal: context.principal }),
    companyDiscoveryPlan: async (_input, context) => ({ revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyDiscoveryApply: async (input, context) => ({ discoveryId: input.discoveryId, assetId: input.discoveryId, revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, status: "applied", principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyDiscoveryStatus: async (context) => ({ state: "found", revision: { revisionId: "22222222-2222-4222-8222-222222222222", fingerprint: "d".repeat(64), sequence: 1 }, principal: context.principal, grantsAuthority: false }),
    companyDiscoveryOrchestrate: async (_input, context) => ({ revision: { revisionId: "22222222-2222-4222-8222-222222222222", unknowns: [] }, questions: [{ id: "question:governance", unknownId: "unknown:authority-boundaries", category: "governance", priority: "critical" }], discoveryComplete: false, readyForOrganizationSynthesis: false, principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false }),
    authorityRootEnrollmentPrepare: async () => ({ trustActivated: false, requiresOutOfBandProvisioning: true }),
    authorityRootEnrollmentVerify: async () => ({ valid: false, trustActivated: false, requiresOutOfBandProvisioning: true }),
    authorityRootEnrollmentStatus: async () => ({ trustConfigured: false, historyPresent: false, challenges: [], trustActivated: false }),
    authorityMandateVerify: async (input, context) => ({ verification: { valid: false, mandateId: input.mandate.id, active: false, reasons: ["AUTHORITY_TRUST_NOT_CONFIGURED"] }, principal: context.principal, trustConfigured: false, companyScoped: true }),
    authorityMandateApply: async (input, context) => ({ mandateId: input.mandate.id, status: "applied", principal: context.principal, verification: { valid: true, mandateId: input.mandate.id, active: true }, companyScoped: true, grantsAuthority: false }),
    authorityMandateStatus: async (context) => ({ trustConfigured: false, mandates: [], principal: context.principal, companyScoped: true }),
    companyWakeEvaluate: async (input, context) => ({ evaluationId: input.evaluationId, status: "evaluated", decisions: [], proposals: [], state: [], principal: context.principal, companyScoped: true, workCreated: false, requiresAuthorityAdjudication: false, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false }),
    companyWakeStatus: async (context) => ({ state: "found", accumulatorState: [], proposals: [], principal: context.principal, companyScoped: true, workCreated: false, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false }),
    companyPlan: async (input, context) => ({ plan: { fingerprint: "a".repeat(64), mode: input.intake.mode, departments: [{ id: "executive" }], recommendedWork: { owner: "executive" } }, principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyApply: async (input, context) => ({ formationId: input.formationId, assetId: input.formationId, fingerprint: "a".repeat(64), status: "applied", principal: context.principal, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false }),
    companyStatus: async (context) => ({ state: "found", operatingModel: { companyId: "deployment-company", mode: "new" }, principal: context.principal }),
    kastStatus: async (reflectionId, context) => ({ reflectionId, state: "queued", principal: context.principal }),
    assetGet: async (assetId, context) => ({ assetId, state: "found", principal: context.principal }),
    creativeSubmit: async (input, context) => ({ missionId: input.missionId, status: "queued", principal: context.principal }),
    creativeStatus: async (missionId, context) => ({ missionId, state: "queued", principal: context.principal }),
    skillsList: async (context) => ({ catalog: [], companyLocal: [], installations: [], principal: context.principal, fullBodiesLoaded: false }),
    skillsSearch: async (_input, context) => ({ installedMatches: [], catalogSuggestions: [], principal: context.principal, fullBodiesLoaded: false }),
    skillGet: async (input, context) => ({ state: "found", skillId: input.skillId, principal: context.principal }),
    skillInstall: async (input, context) => ({ installationId: input.installationId, skillRef: input.skillRef, status: "installed", principal: context.principal }),
    skillsHealth: async (context) => ({ ok: true, indexed: 1, active: 1, companySkills: 1, harnessSkills: 0, issues: [], principal: context.principal }),
    companySkillPlan: async (input, context) => ({ plan: { mode: input.mode, install: [], reuse: [], gaps: [], createCandidates: [] }, principal: context.principal }),
    autoskillPropose: async (input, context) => ({ proposalId: input.proposalId, skillId: input.skillId, status: "candidate", directGlobalWrite: false, kastUsed: false, principal: context.principal }),
    globalSkillPromotionPropose: async (input, context) => ({ proposalId: input.proposalId, skillId: input.skillId, globalWriteDirect: false, principal: context.principal }),
    kastReflect: async (input, context) => ({ reflectionId: input.reflectionId, status: "queued", principal: context.principal }),
  };

  const appServer = await listenXspaMcp({ operations, oauth, authToken: "loopback-internal-token", host: "127.0.0.1", port: 0 });
  const appAddress = appServer.address() as AddressInfo;
  const endpoint = new URL(`http://127.0.0.1:${appAddress.port}/mcp`);
  const metadataUrl = `http://127.0.0.1:${appAddress.port}/.well-known/oauth-protected-resource`;

  try {
    const metadataResponse = await fetch(metadataUrl);
    assert(metadataResponse.ok, "OAuth protected-resource metadata endpoint unavailable");
    const metadata = await metadataResponse.json() as Record<string, unknown>;
    assert(metadata.resource === resource && Array.isArray(metadata.authorization_servers), "protected-resource metadata invalid");

    const anonymousClient = new Client({ name: "xspa-oauth-anon", version: "1" });
    const anonymousTransport = new StreamableHTTPClientTransport(endpoint);
    await anonymousClient.connect(anonymousTransport as unknown as Transport);
    const list = await anonymousClient.listTools();
    const submitDescriptor = list.tools.find((tool) => tool.name === "xspa_creative_submit") as unknown as Record<string, unknown> | undefined;
    const directSchemes = submitDescriptor?.securitySchemes as Array<{ type?: string; scopes?: string[] }> | undefined;
    const metaSchemes = (submitDescriptor?._meta as Record<string, unknown> | undefined)?.securitySchemes as Array<{ type?: string; scopes?: string[] }> | undefined;
    const schemes = directSchemes ?? metaSchemes;
    assert(Array.isArray(schemes) && schemes.some((scheme) => scheme.type === "oauth2" && scheme.scopes?.includes("xspa.write")), "write tool did not advertise oauth2 securitySchemes");
    const wakeDescriptor = list.tools.find((tool) => tool.name === "xspa_company_wake_evaluate") as unknown as Record<string, unknown> | undefined;
    const wakeSchemes = ((wakeDescriptor?.securitySchemes as Array<{ type?: string; scopes?: string[] }> | undefined) ?? ((wakeDescriptor?._meta as Record<string, unknown> | undefined)?.securitySchemes as Array<{ type?: string; scopes?: string[] }> | undefined));
    assert(Array.isArray(wakeSchemes) && wakeSchemes.some((scheme) => scheme.type === "oauth2" && scheme.scopes?.includes("xspa.write")), "wake evaluate did not advertise xspa.write OAuth scope");
    const unauthorized = await anonymousClient.callTool({ name: "xspa_creative_submit", arguments: { mission_id: "11111111-1111-4111-8111-111111111111", work_id: "22222222-2222-4222-8222-222222222222", brief_ref: "brief:test", evidence_snapshot_ref: "evidence:test" } });
    assert(unauthorized.isError === true, "unauthenticated OAuth write tool was not rejected");
    const challenge = (unauthorized as unknown as { _meta?: Record<string, unknown> })._meta?.["mcp/www_authenticate"];
    assert(Array.isArray(challenge) && JSON.stringify(challenge).includes("oauth-protected-resource"), "OAuth tool error did not expose MCP auth challenge");
    await anonymousClient.close();

    const token = await new SignJWT({ scope: "xspa.read xspa.write" })
      .setProtectedHeader({ alg: "RS256", kid: "xspa-test-key" })
      .setIssuer(issuer).setAudience(resource).setSubject("user:test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const client = new Client({ name: "xspa-oauth-auth", version: "1" });
    const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    await client.connect(transport as unknown as Transport);
    const result = await client.callTool({ name: "xspa_kast_reflect", arguments: { reflection_id: "33333333-3333-4333-8333-333333333333", session_ref: "session:oauth", mode: "improve", category: "friction", severity: "medium", summary: "OAuth authenticated improvement request.", evidence_refs: ["trace:oauth"], recurrence: 2, affected_surfaces: ["developer-experience"], strategy_overlays: ["simplify-first", "reliability-first"] } });
    assert(result.isError !== true && JSON.stringify(result).includes("user:test"), "valid OAuth JWT did not reach app operation with subject context");
    await client.close();
  } finally {
    await closeServer(appServer);
    await closeServer(jwksServer);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await verifyXspaAppOAuth();
  console.log("PASS XanxitoSpA ChatGPT app OAuth resource server");
}
