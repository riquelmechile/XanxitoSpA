import { DomainError } from "../../domain/src/index.js";
import type { OpenAIApiKeyPort } from "./openai-image-renderer.js";

export interface OpenAIResponsesRuntimeFetch {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new DomainError("OpenAI Responses text payload invalid");
  const obj = payload as Record<string, unknown>;
  if (typeof obj.output_text === "string" && obj.output_text.trim()) return obj.output_text.trim();
  const output = Array.isArray(obj.output) ? obj.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if ((p.type === "output_text" || p.type === "text") && typeof p.text === "string") texts.push(p.text);
    }
  }
  const joined = texts.join("\n").trim();
  if (!joined) throw new DomainError("OpenAI Responses output_text missing");
  return joined;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed) as unknown; } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)) as unknown; } catch { /* fall through */ }
    }
  }
  throw new DomainError("OpenAI Responses JSON output invalid");
}

export class OpenAIResponsesRuntimeClient {
  private readonly endpoint: URL;
  private readonly fetchImpl: OpenAIResponsesRuntimeFetch;

  constructor(private readonly input: { apiKey: OpenAIApiKeyPort; fetchImpl?: OpenAIResponsesRuntimeFetch; endpoint?: string | URL }) {
    this.endpoint = input.endpoint instanceof URL ? new URL(input.endpoint.toString()) : new URL(input.endpoint ?? "https://api.openai.com/v1/responses");
    if (this.endpoint.protocol !== "https:" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(this.endpoint.hostname)) throw new DomainError("OpenAI Responses runtime endpoint must use HTTPS unless loopback testing");
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async availability(): Promise<{ available: boolean; reason: string }> {
    return (await this.input.apiKey.isConfigured()) ? { available: true, reason: "openai-runtime-credential-configured" } : { available: false, reason: "openai-runtime-credential-missing" };
  }

  async complete(input: { prompt: string; effort: "xhigh" | "max"; imageDataUrl?: string; metadata?: Record<string, string> }): Promise<string> {
    if (!input.prompt.trim()) throw new DomainError("OpenAI Responses prompt required");
    return this.input.apiKey.withApiKey(async (apiKey) => {
      if (apiKey.trim().length < 20) throw new DomainError("OpenAI runtime credential unavailable");
      const responseInput = input.imageDataUrl
        ? [{ role: "user", content: [{ type: "input_text", text: input.prompt }, { type: "input_image", image_url: input.imageDataUrl }] }]
        : input.prompt;
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.6-sol", reasoning: { effort: input.effort }, input: responseInput, store: false, parallel_tool_calls: false, metadata: input.metadata ?? {} }),
      });
      if (!response.ok) throw new DomainError(`openai-responses-http-${response.status}`);
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) throw new DomainError("OpenAI Responses text result exceeds local limit");
      let payload: unknown;
      try { payload = JSON.parse(text) as unknown; } catch { throw new DomainError("OpenAI Responses text result was not JSON"); }
      return extractOutputText(payload);
    });
  }

  async completeJson<T>(input: { prompt: string; effort: "xhigh" | "max"; imageDataUrl?: string; metadata?: Record<string, string> }): Promise<T> {
    return extractJson(await this.complete(input)) as T;
  }
}
