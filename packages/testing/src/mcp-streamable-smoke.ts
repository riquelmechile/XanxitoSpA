import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHttpMcpTransport } from "../../providers/src/mcp-streamable-http.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createServer(authConfigured: boolean): Server {
  const server = new Server(
    { name: "xspa-local-mcp-smoke", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "echo_business_event",
      description: "Echoes a local test payload",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "echo_business_event") throw new Error("unknown tool");
    const message = typeof request.params.arguments?.message === "string" ? request.params.arguments.message : "";
    return {
      content: [{ type: "text", text: message }],
      structuredContent: { message, authConfigured },
    };
  });
  return server;
}

export async function verifyStreamableMcpBridge(): Promise<void> {
  const app = createMcpExpressApp();
  app.post("/mcp", async (req: any, res: any) => {
    const server = createServer(Boolean(req.header("authorization")));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
    try {
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });
  app.get("/mcp", (_req: any, res: any) => { res.status(405).end(); });
  app.delete("/mcp", (_req: any, res: any) => { res.status(405).end(); });

  const httpServer = app.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address() as AddressInfo;
  const transport = new StreamableHttpMcpTransport({ id: "local-smoke", url: `http://127.0.0.1:${address.port}/mcp` });
  try {
    const tools = await transport.listTools({ headers: { Authorization: "Bearer local-ephemeral-test" } });
    assert(tools.some((tool) => tool.name === "echo_business_event"), "Streamable HTTP listTools did not discover local tool");
    const result = await transport.callTool(
      "echo_business_event",
      { message: "hello-mcp" },
      { headers: { Authorization: "Bearer local-ephemeral-test" } },
    );
    assert(result.ok, "Streamable HTTP callTool failed");
    const content = result.content as { message?: unknown; authConfigured?: unknown };
    assert(content.message === "hello-mcp", "Streamable HTTP tool payload mismatch");
    assert(content.authConfigured === true, "Streamable HTTP request headers were not delivered to local MCP server");
    assert(!JSON.stringify(result).includes("local-ephemeral-test"), "Streamable HTTP result leaked request header material");
  } finally {
    await new Promise<void>((resolve, reject) => httpServer.close((error?: Error) => error ? reject(error) : resolve()));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await verifyStreamableMcpBridge();
  console.log("PASS local MCP Streamable HTTP SDK bridge");
}
