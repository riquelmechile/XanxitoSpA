import type { Express } from "express";
import type { XspaOAuthConfig } from "./oauth.js";
import { JwtOAuthVerifier, hasScope, oauthChallenge } from "./oauth.js";
import type { XspaAppOperations, XspaRequestContext } from "./server.js";

type Message = { messageId: string; role: string; parts: Array<{ text?: string }>; metadata?: Record<string, unknown> };
type Rpc = { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const success = (id: Rpc["id"], result: object) => ({ jsonrpc: "2.0", id, result });
const value = (v: unknown, max = 2000) => typeof v === "string" ? v.slice(0, max) : "";
function a2aTask(id: string, contextId: string, state: string, text?: string) {
  const states: Record<string, string> = { pending: "TASK_STATE_SUBMITTED", running: "TASK_STATE_WORKING", completed: "TASK_STATE_COMPLETED", failed: "TASK_STATE_FAILED" };
  return { id, contextId, status: { state: states[state] || "TASK_STATE_UNKNOWN", timestamp: new Date().toISOString() },
    artifacts: text ? [{ artifactId: "result-" + id, parts: [{ text, mediaType: "text/plain" }] }] : [] };
}
export function installXspaA2a(app: Express, input: { operations: XspaAppOperations; oauth: XspaOAuthConfig }) {
  const verifier = new JwtOAuthVerifier(input.oauth);
  const origin = new URL(input.oauth.resource).origin;
  app.get("/.well-known/agent-card.json", (_req, res) => res.json({
    name: "XanxitoSpA Workforce Gateway", description: "Company-scoped durable delegation and task retrieval. No server-side LLM execution.",
    version: "1.0.0", supportedInterfaces: [{ url: origin + "/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"],
    skills: [{ id: "company-delegation", name: "Company Workforce delegation", description: "Submit authorized durable Company Work to a registered worker", tags: ["workforce", "delegation"] }],
    securitySchemes: { xspaOauth: { oauth2SecurityScheme: { flows: { authorizationCode: {
      authorizationUrl: input.oauth.issuer.replace(/\/$/, "") + "/authorize",
      tokenUrl: input.oauth.issuer.replace(/\/$/, "") + "/token",
      scopes: { [input.oauth.readScope]: "Read own tasks", [input.oauth.writeScope]: "Submit work" },
      pkceRequired: true } } } } },
    securityRequirements: [{ schemes: { xspaOauth: { list: [input.oauth.readScope] } } }],
  }));
  app.post("/a2a", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await verifier.authenticate(req.header("authorization"));
    if (!auth.authenticated || !auth.subject || !auth.clientId) {
      res.set("WWW-Authenticate", oauthChallenge(input.oauth, input.oauth.readScope));
      res.status(401).json({ error: "unauthorized" }); return;
    }
    const rpc = (req.body || {}) as Rpc;
    const id = rpc.id;
    if (rpc.jsonrpc !== "2.0" || (typeof id !== "string" && typeof id !== "number") ||
      typeof rpc.method !== "string" || !rpc.params || typeof rpc.params !== "object") {
      res.status(400).json(err(id, -32600, "Invalid Request")); return;
    }
    if (req.header("a2a-version") !== "1.0") {
      res.status(400).json(err(id, -32600, "A2A-Version: 1.0 required")); return;
    }
    const ctx: XspaRequestContext = { principal: auth.subject, clientId: auth.clientId, authenticated: true, scopes: auth.scopes };
    try {
      if (rpc.method === "GetTask") {
        if (!hasScope(auth, input.oauth.readScope)) { res.status(403).json(err(id, -32600, "read scope required")); return; }
        const taskId = value(rpc.params.id, 120);
        if (!taskId) { res.json(err(id, -32602, "task id required")); return; }
        const receipt = await input.operations.workforceReceipt(taskId, ctx) as { delegationId?: string; state: string; workId?: string; resultText?: string };
        if (!receipt.delegationId) { res.json(err(id, -32602, "task not found")); return; }
        res.json(success(id, { task: a2aTask(receipt.delegationId, receipt.workId || "", receipt.state, receipt.resultText) })); return;
      }
      if (rpc.method === "SendMessage") {
        if (!hasScope(auth, input.oauth.writeScope)) { res.status(403).json(err(id, -32600, "write scope required")); return; }
        const msg = rpc.params.message as Message | undefined;
        const route = msg?.metadata?.xspa as Record<string, unknown> | undefined;
        const text = msg?.parts?.filter(part => typeof part.text === "string").map(part => part.text).join("\n") || "";
        if (msg?.role !== "ROLE_USER" || !Array.isArray(msg.parts) || !text || text.length > 20000 || !route) {
          res.json(err(id, -32602, "Message with text and metadata.xspa route required")); return;
        }
        const sourceWorkerId = value(route.sourceWorkerId, 120);
        const targetWorkerId = value(route.targetWorkerId, 120);
        const workId = value(route.workId, 120);
        const idempotencyKey = value(route.idempotencyKey, 200) || value(msg.messageId, 200);
        if (!sourceWorkerId || !targetWorkerId || !workId || !idempotencyKey) {
          res.json(err(id, -32602, "sourceWorkerId, targetWorkerId, workId and idempotencyKey required")); return;
        }
        const out = await input.operations.workforceDelegate({ sourceWorkerId, targetWorkerId, workId, instruction: text, idempotencyKey }, ctx) as { delegationId: string; state: string };
        res.json(success(id, { task: a2aTask(out.delegationId, workId, out.state) })); return;
      }
      res.json(err(id, -32601, "Method not found"));
    } catch {
      res.status(403).json(err(id, -32603, "Operation denied or unavailable"));
    }
  });
}
