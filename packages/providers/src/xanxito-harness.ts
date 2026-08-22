import type { KASTMemoryRecord } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { EngramMemoryPort } from "../../kernel/src/kast-law.js";
import type { McpRequestMetadata, McpToolCallResult, McpToolDescriptor, McpTransport } from "./mcp.js";

export interface XanxitoHarnessToolNames {
  memSearch: string;
  memSave: string;
  sddStatus: string;
  reviewStatus: string;
}

export const DEFAULT_XANXITO_HARNESS_TOOLS: XanxitoHarnessToolNames = {
  memSearch: "mem_search",
  memSave: "mem_save",
  sddStatus: "sdd_status",
  reviewStatus: "review_status",
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function maybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try { return JSON.parse(trimmed) as unknown; } catch { return value; }
}

function unwrapMcpContent(value: unknown): unknown {
  if (typeof value === "string") return maybeJson(value);
  if (Array.isArray(value)) {
    if (value.length === 1) return unwrapMcpContent(value[0]);
    const textParts = value.flatMap((part) => {
      const obj = asObject(part);
      return obj && obj.type === "text" && typeof obj.text === "string" ? [obj.text] : [];
    });
    if (textParts.length === value.length && textParts.length > 0) return maybeJson(textParts.join("\n"));
    return value.map(unwrapMcpContent);
  }
  const obj = asObject(value);
  if (!obj) return value;
  if ("result" in obj) return unwrapMcpContent(obj.result);
  if (obj.type === "text" && typeof obj.text === "string") return maybeJson(obj.text);
  return value;
}

function collectMemoryRecords(value: unknown): KASTMemoryRecord[] {
  const unwrapped = unwrapMcpContent(value);
  const candidates = Array.isArray(unwrapped) ? unwrapped : (() => {
    const obj = asObject(unwrapped);
    if (!obj) return [];
    const list = obj.memories ?? obj.results ?? obj.items ?? obj.observations;
    return Array.isArray(list) ? list : [obj];
  })();
  const records: KASTMemoryRecord[] = [];
  for (const candidate of candidates) {
    const obj = asObject(candidate);
    if (!obj) continue;
    const summaryValue = obj.summary ?? obj.content ?? obj.text ?? obj.memory;
    if (typeof summaryValue !== "string" || !summaryValue.trim()) continue;
    const titleValue = typeof obj.title === "string" ? obj.title : "Engram memory";
    const topicValue = obj.topicKey ?? obj.topic_key ?? obj.topic ?? obj.id;
    const evidence = Array.isArray(obj.evidenceRefs ?? obj.evidence_refs) ? (obj.evidenceRefs ?? obj.evidence_refs) as unknown[] : [];
    records.push({
      topicKey: typeof topicValue === "string" || typeof topicValue === "number" ? String(topicValue) : `engram:${records.length}`,
      title: titleValue,
      summary: summaryValue,
      evidenceRefs: evidence.map(String),
      outcome: "remembered",
    });
  }
  return records;
}

export class XanxitoMcpToolClient {
  private trustedDescriptors = new Map<string, string>();
  constructor(
    private readonly transport: McpTransport,
    private readonly metadata?: McpRequestMetadata,
  ) {}

  private descriptorFingerprint(tool: McpToolDescriptor): string {
    return JSON.stringify({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema ?? null, annotations: tool.annotations ?? null });
  }

  async call(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const tools = await this.transport.listTools(this.metadata);
    const descriptor = tools.find((tool) => tool.name === toolName);
    if (!descriptor) throw new DomainError(`Xanxito harness tool not discovered: ${toolName}`);
    const fingerprint = this.descriptorFingerprint(descriptor);
    const trusted = this.trustedDescriptors.get(toolName);
    if (trusted && trusted !== fingerprint) throw new DomainError(`Xanxito harness tool descriptor drift: ${toolName}`);
    this.trustedDescriptors.set(toolName, fingerprint);
    const result: McpToolCallResult = await this.transport.callTool(toolName, structuredClone(args), this.metadata);
    if (!result.ok || result.isError === true) throw new DomainError(`Xanxito harness tool failed: ${toolName}`);
    return unwrapMcpContent(result.content);
  }
}

export class McpEngramMemoryPort implements EngramMemoryPort {
  constructor(
    private readonly client: XanxitoMcpToolClient,
    private readonly tools: XanxitoHarnessToolNames = DEFAULT_XANXITO_HARNESS_TOOLS,
  ) {}

  async search(query: string): Promise<KASTMemoryRecord[]> {
    if (!query.trim()) return [];
    const result = await this.client.call(this.tools.memSearch, { query: query.trim(), limit: 8 });
    return collectMemoryRecords(result).slice(0, 8);
  }

  async save(record: KASTMemoryRecord): Promise<string> {
    const result = await this.client.call(this.tools.memSave, {
      title: record.title,
      content: record.summary,
      type: "kast",
      project: "xanxitospa",
      topic_key: record.topicKey,
    });
    const obj = asObject(result);
    const explicit = obj?.observation_id ?? obj?.id ?? obj?.topicKey ?? obj?.topic_key;
    return explicit !== undefined ? String(explicit) : record.topicKey;
  }
}

export interface HarnessWorkflowEvidence {
  sddComplete: boolean;
  sddRef: string;
  reviewApproved: boolean;
  fourRRefs: string[];
  reviewRef: string;
}

function stringifySafe(value: unknown): string {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export class XanxitoMcpWorkflowEvidencePort {
  constructor(
    private readonly client: XanxitoMcpToolClient,
    private readonly tools: XanxitoHarnessToolNames = DEFAULT_XANXITO_HARNESS_TOOLS,
  ) {}

  async inspect(input: { sddChange: string; reviewTarget: string }): Promise<HarnessWorkflowEvidence> {
    const [sdd, review] = await Promise.all([
      this.client.call(this.tools.sddStatus, { change: input.sddChange }),
      this.client.call(this.tools.reviewStatus, { target: input.reviewTarget }),
    ]);
    const sddText = stringifySafe(sdd).toLowerCase();
    const reviewText = stringifySafe(review).toLowerCase();
    const sddComplete = ["explore", "proposal", "spec", "design", "tasks", "apply", "verify", "archive"].every((phase) => sddText.includes(phase));
    const reviewApproved = reviewText.includes("approved") && !reviewText.includes("verdict\":\"rejected") && !reviewText.includes("verdict: rejected");
    const fourRRefs = ["risk", "readability", "reliability", "resilience"].filter((lens) => reviewText.includes(lens)).map((lens) => `review:${lens}:${input.reviewTarget}`);
    return {
      sddComplete,
      sddRef: `sdd:${input.sddChange}`,
      reviewApproved,
      fourRRefs,
      reviewRef: `review:${input.reviewTarget}`,
    };
  }
}
