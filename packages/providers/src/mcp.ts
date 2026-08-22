import { Ajv2020 } from "ajv/dist/2020.js";
import type {
  CapabilityRequest,
  CapabilityResult,
  ProviderAdapterDescriptor,
} from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import { McpToolTrustRegistry } from "./mcp-trust.js";
import {
  ProviderAdapterError,
  SemanticCapabilityRegistry,
  type ProviderAdapter,
  type ProviderAdapterExecutionContext,
} from "./adapters.js";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface McpRequestMetadata {
  headers?: Record<string, string>;
}

export interface McpToolCallResult {
  ok: boolean;
  content: unknown;
  isError?: boolean;
  evidenceRefs?: string[];
  cost?: number;
}

export interface McpTransport {
  readonly id: string;
  listTools(metadata?: McpRequestMetadata): Promise<McpToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>, metadata?: McpRequestMetadata): Promise<McpToolCallResult>;
}

export class McpTransportError extends Error {
  constructor(
    message: string,
    public readonly requestSent: boolean,
  ) {
    super(message);
    this.name = "McpTransportError";
  }
}

export interface McpCredentialBinding {
  secretName: string;
  headerName: string;
  prefix?: string;
}

export interface McpCapabilityMapping {
  capability: string;
  tool: string;
  credentialBindings?: McpCredentialBinding[];
}

export interface FakeMcpTool {
  descriptor: McpToolDescriptor;
  handler: (args: Record<string, unknown>, metadata: McpRequestMetadata) => McpToolCallResult | Promise<McpToolCallResult>;
}

export class FakeMcpTransport implements McpTransport {
  readonly calls: Array<{ tool: string; args: Record<string, unknown>; headerNames: string[] }> = [];
  private readonly tools = new Map<string, FakeMcpTool>();

  constructor(public readonly id: string) {}

  register(tool: FakeMcpTool): void {
    if (!tool.descriptor.name.trim()) throw new DomainError("fake MCP tool name required");
    this.tools.set(tool.descriptor.name, tool);
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    return [...this.tools.values()].map((entry) => structuredClone(entry.descriptor));
  }

  async callTool(name: string, args: Record<string, unknown>, metadata: McpRequestMetadata = {}): Promise<McpToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new McpTransportError(`MCP tool unavailable: ${name}`, false);
    this.calls.push({ tool: name, args: structuredClone(args), headerNames: Object.keys(metadata.headers ?? {}).sort() });
    return tool.handler(structuredClone(args), metadata);
  }
}

function jsonSafeRecord(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("MCP capability payload must be a JSON object");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new DomainError("MCP capability payload must be JSON-serializable");
  }
  if (!serialized) throw new DomainError("MCP capability payload serialization failed");
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new DomainError("MCP capability payload must remain an object");
  return parsed as Record<string, unknown>;
}

function normalizeToolResult(result: McpToolCallResult, sideEffect: boolean, providerId: string, tool: string): CapabilityResult {
  let safeContent: unknown;
  try {
    const serialized = JSON.stringify(result.content);
    safeContent = serialized === undefined ? null : JSON.parse(serialized);
  } catch {
    throw new ProviderAdapterError("MCP tool result is not JSON-serializable", sideEffect);
  }
  const failed = result.ok === false || result.isError === true;
  return {
    ok: !failed,
    sideEffectApplied: failed ? sideEffect : sideEffect,
    result: {
      data: safeContent,
      provenance: { source: "mcp", trust: "external-data", instructionsTrusted: false, providerId, tool },
    },
    evidenceRefs: [...(result.evidenceRefs ?? []), `mcp:${providerId}:${tool}`],
    cost: result.cost ?? 0,
  };
}

function validateToolArguments(tool: McpToolDescriptor, args: Record<string, unknown>): void {
  if (!tool.inputSchema) return;
  let schemaText: string;
  try { schemaText = JSON.stringify(tool.inputSchema); } catch { throw new ProviderAdapterError("MCP tool input schema is not JSON-serializable", false); }
  if (schemaText.length > 65_536) throw new ProviderAdapterError("MCP tool input schema exceeds local validation limit", false);
  try {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(tool.inputSchema as object);
    if (!validate(args)) throw new ProviderAdapterError(`MCP payload rejected by discovered schema for tool ${tool.name}`, false);
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    throw new ProviderAdapterError(`MCP tool input schema could not be validated for ${tool.name}`, false);
  }
}

async function withCredentialHeaders<T>(
  context: ProviderAdapterExecutionContext,
  bindings: McpCredentialBinding[],
  index: number,
  headers: Record<string, string>,
  use: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  const binding = bindings[index];
  if (!binding) return use(headers);
  if (!binding.secretName.trim() || !binding.headerName.trim()) throw new ProviderAdapterError("invalid MCP credential binding", false);
  return context.withCredential(binding.secretName, async (value) => {
    const next = { ...headers, [binding.headerName]: `${binding.prefix ?? ""}${value}` };
    return withCredentialHeaders(context, bindings, index + 1, next, use);
  });
}

export class McpProviderAdapter implements ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  private readonly mappings = new Map<string, McpCapabilityMapping>();

  constructor(input: {
    companyId: string;
    providerId: string;
    transport: McpTransport;
    semantics: SemanticCapabilityRegistry;
    trust: McpToolTrustRegistry;
    mappings: McpCapabilityMapping[];
  }) {
    if (input.mappings.length === 0) throw new DomainError("MCP provider adapter requires at least one capability mapping");
    for (const mapping of input.mappings) {
      if (!mapping.capability.includes(".")) throw new DomainError("MCP mapping requires semantic capability name");
      if (!mapping.tool.trim()) throw new DomainError("MCP mapping tool required");
      input.semantics.get(mapping.capability);
      if (this.mappings.has(mapping.capability)) throw new DomainError(`duplicate MCP capability mapping: ${mapping.capability}`);
      this.mappings.set(mapping.capability, structuredClone(mapping));
    }
    this.transport = input.transport;
    this.semantics = input.semantics;
    this.trust = input.trust;
    const credentialNames = [...new Set(input.mappings.flatMap((mapping) => (mapping.credentialBindings ?? []).map((binding) => binding.secretName)))];
    this.descriptor = {
      companyId: input.companyId,
      providerId: input.providerId,
      capabilities: input.mappings.map((mapping) => mapping.capability),
      credentialNames,
    };
  }

  private readonly transport: McpTransport;
  private readonly semantics: SemanticCapabilityRegistry;
  private readonly trust: McpToolTrustRegistry;

  async execute(request: CapabilityRequest, context: ProviderAdapterExecutionContext): Promise<CapabilityResult> {
    if (request.companyId !== this.descriptor.companyId || context.companyId !== this.descriptor.companyId) {
      throw new ProviderAdapterError("MCP adapter company mismatch", false);
    }
    if (context.providerId !== this.descriptor.providerId) throw new ProviderAdapterError("MCP adapter provider mismatch", false);
    const mapping = this.mappings.get(request.action);
    if (!mapping) throw new ProviderAdapterError(`MCP capability mapping unavailable: ${request.action}`, false);
    if (context.capability !== mapping.capability) throw new ProviderAdapterError("MCP adapter capability mismatch", false);
    const args = jsonSafeRecord(request.payload);
    const semantic = this.semantics.get(mapping.capability);
    const sideEffect = semantic.sideEffectClass !== "none";
    const bindings = mapping.credentialBindings ?? [];

    return withCredentialHeaders(context, bindings, 0, {}, async (headers) => {
      let tools: McpToolDescriptor[];
      try {
        tools = await this.transport.listTools(Object.keys(headers).length ? { headers } : undefined);
      } catch (error) {
        if (error instanceof McpTransportError) throw new ProviderAdapterError(error.message, error.requestSent);
        throw new ProviderAdapterError(error instanceof Error ? error.message : "MCP discovery failed", false);
      }
      const discoveredTool = tools.find((tool) => tool.name === mapping.tool);
      if (!discoveredTool) {
        throw new ProviderAdapterError(`mapped MCP tool not discovered: ${mapping.tool}`, false);
      }
      if (semantic.sideEffectClass === "none" && (discoveredTool.annotations?.destructiveHint === true || discoveredTool.annotations?.readOnlyHint === false)) {
        throw new ProviderAdapterError(`MCP tool annotations contradict read-only semantic capability: ${mapping.tool}`, false);
      }
      try {
        this.trust.assertTrusted(this.descriptor.companyId, this.descriptor.providerId, discoveredTool);
      } catch (error) {
        throw new ProviderAdapterError(error instanceof Error ? error.message : `MCP tool trust validation failed: ${mapping.tool}`, false);
      }
      validateToolArguments(discoveredTool, args);

      let result: McpToolCallResult;
      try {
        result = await this.transport.callTool(mapping.tool, args, Object.keys(headers).length ? { headers } : undefined);
      } catch (error) {
        if (error instanceof McpTransportError) {
          throw new ProviderAdapterError(error.message, error.requestSent && sideEffect);
        }
        throw new ProviderAdapterError(error instanceof Error ? error.message : "MCP tool call failed", sideEffect);
      }
      return normalizeToolResult(result, sideEffect, this.descriptor.providerId, mapping.tool);
    });
  }
}
