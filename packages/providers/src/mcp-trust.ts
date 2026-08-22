import { createHash } from "node:crypto";
import { DomainError } from "../../domain/src/index.js";

export interface McpToolDescriptorLike {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface McpMetadataFinding {
  code: "instruction-override" | "covert-action" | "secret-exfiltration" | "cross-tool-steering" | "metadata-too-large";
  severity: "high" | "critical";
  detail: string;
}

export interface McpToolRegistration {
  companyId: string;
  providerId: string;
  toolName: string;
  fingerprint: string;
  approvedAt: string;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  if (value === undefined) return null;
  return String(value);
}

function metadataText(tool: McpToolDescriptorLike): string {
  let schema = "";
  try { schema = JSON.stringify(canonicalize(tool.inputSchema ?? {})); }
  catch { throw new DomainError(`MCP metadata not serializable: ${tool.name}`); }
  return `${tool.description ?? ""}\n${schema}`;
}

export function analyzeMcpToolMetadata(tool: McpToolDescriptorLike): McpMetadataFinding[] {
  if (!tool.name.trim()) throw new DomainError("MCP tool name required for trust analysis");
  const text = metadataText(tool);
  const findings: McpMetadataFinding[] = [];
  if (text.length > 65_536) findings.push({ code: "metadata-too-large", severity: "high", detail: "tool metadata exceeds 64 KiB trust-analysis limit" });
  const checks: Array<[McpMetadataFinding["code"], McpMetadataFinding["severity"], RegExp, string]> = [
    ["instruction-override", "critical", /\b(ignore|disregard|override|bypass)\b.{0,80}\b(previous|prior|system|developer|user)\b.{0,40}\b(instruction|message|prompt|rule)s?\b/is, "metadata attempts to override higher-priority instructions"],
    ["covert-action", "critical", /\b(secretly|silently|without (?:the )?user|do not (?:tell|inform)|hide (?:this|it) from)\b/is, "metadata requests covert behavior"],
    ["secret-exfiltration", "critical", /\b(send|upload|post|forward|exfiltrat\w*)\b.{0,100}\b(api[ _-]?key|token|credential|password|secret)\b/is, "metadata requests secret exfiltration"],
    ["cross-tool-steering", "high", /\b(must|always|first|next|then)\b.{0,80}\b(call|invoke|use|execute)\b.{0,40}\b(tool|function|payment|shell|terminal|filesystem)\b/is, "metadata attempts to steer execution into another capability"],
  ];
  for (const [code, severity, pattern, detail] of checks) if (pattern.test(text)) findings.push({ code, severity, detail });
  return findings;
}

export function fingerprintMcpTool(tool: McpToolDescriptorLike): string {
  const normalized = canonicalize({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? {},
    annotations: tool.annotations ?? {},
  });
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export class McpToolTrustRegistry {
  private readonly approved = new Map<string, McpToolRegistration>();

  approve(companyId: string, providerId: string, tool: McpToolDescriptorLike, approvedAt = new Date().toISOString()): McpToolRegistration {
    if (!companyId.trim() || !providerId.trim()) throw new DomainError("MCP trust registration requires company and provider");
    const findings = analyzeMcpToolMetadata(tool);
    if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
      throw new DomainError(`MCP tool metadata quarantined: ${tool.name}:${findings.map((f) => f.code).join(",")}`);
    }
    const registration: McpToolRegistration = {
      companyId,
      providerId,
      toolName: tool.name,
      fingerprint: fingerprintMcpTool(tool),
      approvedAt,
    };
    this.approved.set(this.key(companyId, providerId, tool.name), registration);
    return structuredClone(registration);
  }

  assertTrusted(companyId: string, providerId: string, tool: McpToolDescriptorLike): McpToolRegistration {
    const findings = analyzeMcpToolMetadata(tool);
    if (findings.length > 0) throw new DomainError(`MCP tool metadata failed runtime trust analysis: ${tool.name}:${findings.map((f) => f.code).join(",")}`);
    const registration = this.approved.get(this.key(companyId, providerId, tool.name));
    if (!registration) throw new DomainError(`MCP tool not explicitly registered: ${providerId}/${tool.name}`);
    const current = fingerprintMcpTool(tool);
    if (current !== registration.fingerprint) throw new DomainError(`MCP tool descriptor drift detected: ${providerId}/${tool.name}`);
    return structuredClone(registration);
  }

  has(companyId: string, providerId: string, toolName: string): boolean {
    return this.approved.has(this.key(companyId, providerId, toolName));
  }

  private key(companyId: string, providerId: string, toolName: string): string {
    return `${companyId}:${providerId}:${toolName}`;
  }
}
