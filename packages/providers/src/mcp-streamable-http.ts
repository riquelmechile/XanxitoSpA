import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { DomainError } from "../../domain/src/index.js";
import type { McpRequestMetadata, McpToolCallResult, McpToolDescriptor, McpTransport } from "./mcp.js";
import { McpTransportError } from "./mcp.js";

const MAX_RESULT_BYTES = 2 * 1024 * 1024;

function cloneJson<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new DomainError("MCP SDK result is not JSON-serializable");
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESULT_BYTES) throw new DomainError("MCP SDK result exceeds local result-size limit");
  return JSON.parse(serialized) as T;
}

function normalizeAnnotations(value: { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined } | undefined): McpToolDescriptor["annotations"] | undefined {
  if (!value) return undefined;
  const normalized: NonNullable<McpToolDescriptor["annotations"]> = {};
  if (typeof value.readOnlyHint === "boolean") normalized.readOnlyHint = value.readOnlyHint;
  if (typeof value.destructiveHint === "boolean") normalized.destructiveHint = value.destructiveHint;
  if (typeof value.idempotentHint === "boolean") normalized.idempotentHint = value.idempotentHint;
  if (typeof value.openWorldHint === "boolean") normalized.openWorldHint = value.openWorldHint;
  return Object.keys(normalized).length ? normalized : undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export class StreamableHttpMcpTransport implements McpTransport {
  readonly id: string;
  private readonly url: URL;

  constructor(input: { id: string; url: string | URL }) {
    if (!input.id.trim()) throw new DomainError("MCP transport id required");
    const url = input.url instanceof URL ? new URL(input.url.toString()) : new URL(input.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new DomainError("MCP Streamable HTTP URL must use http or https");
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) throw new DomainError("remote MCP Streamable HTTP endpoints must use https");
    this.id = input.id;
    this.url = url;
  }

  private createClient(metadata?: McpRequestMetadata): { client: Client; transport: StreamableHTTPClientTransport } {
    const requestHeaders = metadata?.headers ? { ...metadata.headers } : undefined;
    const transport = new StreamableHTTPClientTransport(new URL(this.url.toString()), {
      requestInit: {
        redirect: "error",
        ...(requestHeaders ? { headers: requestHeaders } : {}),
      },
    });
    const client = new Client({ name: `xanxitospa-${this.id}`, version: "0.4.0" });
    return { client, transport };
  }

  private async withClient<T>(metadata: McpRequestMetadata | undefined, use: (client: Client) => Promise<T>): Promise<T> {
    const { client, transport } = this.createClient(metadata);
    try {
      await client.connect(transport as unknown as Transport);
      return await use(client);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async listTools(metadata?: McpRequestMetadata): Promise<McpToolDescriptor[]> {
    try {
      return await this.withClient(metadata, async (client) => {
        const result = await client.listTools();
        return result.tools.map((tool) => {
          const annotations = normalizeAnnotations(tool.annotations);
          return {
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            inputSchema: cloneJson(tool.inputSchema),
            ...(annotations ? { annotations } : {}),
          };
        });
      });
    } catch (error) {
      throw new McpTransportError(error instanceof Error ? error.message : "MCP listTools failed", false);
    }
  }

  async callTool(name: string, args: Record<string, unknown>, metadata?: McpRequestMetadata): Promise<McpToolCallResult> {
    const { client, transport } = this.createClient(metadata);
    try {
      try {
        await client.connect(transport as unknown as Transport);
      } catch (error) {
        throw new McpTransportError(error instanceof Error ? error.message : "MCP connect failed", false);
      }

      try { await client.listTools(); } catch (error) {
        throw new McpTransportError(error instanceof Error ? error.message : "MCP pre-call discovery failed", false);
      }
      let result;
      try {
        result = await client.callTool({ name, arguments: cloneJson(args) });
      } catch (error) {
        throw new McpTransportError(error instanceof Error ? error.message : "MCP callTool failed", true);
      }
      if ('toolResult' in result) throw new McpTransportError("task-based MCP tool results are not supported in V1.4", true);
      return {
        ok: result.isError !== true,
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
        content: cloneJson(result.structuredContent ?? result.content),
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
