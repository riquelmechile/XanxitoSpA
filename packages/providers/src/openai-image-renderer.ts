import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CreativeMission, CreativeStrategyCandidate } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { NativeImageRenderer } from "../../kernel/src/creative-pipeline.js";

export interface OpenAIApiKeyPort {
  isConfigured(): Promise<boolean>;
  withApiKey<T>(use: (apiKey: string) => Promise<T>): Promise<T>;
}

export interface ImageArtifactSink {
  put(input: {
    companyId: string;
    missionId: string;
    candidateId: string;
    bytes: Uint8Array;
    contentType: "image/png";
  }): Promise<{ artifactRef: string; evidenceRefs?: string[] }>;
}

export interface OpenAIImageRendererFetch {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

function findImageBase64(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findImageBase64(item);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if ((obj.type === "image_generation_call" || obj.type === "response.image_generation_call") && typeof obj.result === "string" && obj.result.length > 64) return obj.result;
  if (typeof obj.image_base64 === "string" && obj.image_base64.length > 64) return obj.image_base64;
  if (typeof obj.b64_json === "string" && obj.b64_json.length > 64) return obj.b64_json;
  for (const key of ["output", "result", "images", "content", "data"]) {
    if (key in obj) {
      const hit = findImageBase64(obj[key]);
      if (hit) return hit;
    }
  }
  return null;
}

function safeErrorStatus(response: Response): string {
  return `openai-responses-image-http-${response.status}`;
}

export class OpenAIResponsesImageRenderer implements NativeImageRenderer {
  private readonly endpoint: URL;
  private readonly fetchImpl: OpenAIImageRendererFetch;

  constructor(private readonly input: {
    apiKey: OpenAIApiKeyPort;
    sink: ImageArtifactSink;
    fetchImpl?: OpenAIImageRendererFetch;
    endpoint?: string | URL;
  }) {
    this.endpoint = input.endpoint instanceof URL ? new URL(input.endpoint.toString()) : new URL(input.endpoint ?? "https://api.openai.com/v1/responses");
    if (this.endpoint.protocol !== "https:" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(this.endpoint.hostname)) {
      throw new DomainError("OpenAI Responses image endpoint must use HTTPS unless loopback testing");
    }
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async availability(): Promise<{ available: boolean; reason: string }> {
    return (await this.input.apiKey.isConfigured())
      ? { available: true, reason: "openai-runtime-credential-configured" }
      : { available: false, reason: "openai-runtime-credential-missing" };
  }

  async render({ mission, candidate }: { mission: CreativeMission; candidate: CreativeStrategyCandidate }): Promise<{ artifactRef: string; mimeType: string; evidenceRefs: string[]; cost: number }> {
    if (!candidate.prompt.trim()) throw new DomainError("OpenAI image renderer requires candidate prompt");
    return this.input.apiKey.withApiKey(async (apiKey) => {
      if (apiKey.trim().length < 20) throw new DomainError("OpenAI runtime credential unavailable");
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.6-sol",
          reasoning: { effort: "xhigh" },
          input: candidate.prompt,
          tools: [{ type: "image_generation" }],
          tool_choice: { type: "image_generation" },
          max_tool_calls: 1,
          parallel_tool_calls: false,
          store: false,
          metadata: {
            xspa_company_id: mission.companyId,
            xspa_mission_id: mission.id,
            xspa_candidate_id: candidate.id,
          },
        }),
      });
      if (!response.ok) throw new DomainError(safeErrorStatus(response));
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 48 * 1024 * 1024) throw new DomainError("OpenAI image response exceeds local limit");
      let payload: unknown;
      try { payload = JSON.parse(text) as unknown; } catch { throw new DomainError("OpenAI image response was not JSON"); }
      const b64 = findImageBase64(payload);
      if (!b64) throw new DomainError("OpenAI Responses image_generation result missing");
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length < 64 || bytes.length > 32 * 1024 * 1024) throw new DomainError("OpenAI generated image size outside allowed bounds");
      const stored = await this.input.sink.put({
        companyId: mission.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        bytes,
        contentType: "image/png",
      });
      if (!stored.artifactRef.trim()) throw new DomainError("image artifact sink returned empty reference");
      return {
        artifactRef: stored.artifactRef,
        mimeType: "image/png",
        evidenceRefs: [...(stored.evidenceRefs ?? []), `openai:responses:image_generation:${mission.id}:${candidate.id}`],
        cost: 0,
      };
    });
  }
}

export class EnvironmentOpenAIApiKeyPort implements OpenAIApiKeyPort {
  constructor(private readonly envName = "OPENAI_API_KEY") {}
  async isConfigured(): Promise<boolean> { return Boolean(process.env[this.envName]?.trim()); }
  async withApiKey<T>(use: (apiKey: string) => Promise<T>): Promise<T> {
    const value = process.env[this.envName];
    if (!value) throw new DomainError(`OpenAI runtime credential not configured:${this.envName}`);
    return use(value);
  }
}


function safeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new DomainError("image artifact path segment invalid");
  return normalized.slice(0, 120);
}

export class FileSystemImageArtifactSink implements ImageArtifactSink {
  constructor(private readonly root: string) {}
  async put(input: { companyId: string; missionId: string; candidateId: string; bytes: Uint8Array; contentType: "image/png" }): Promise<{ artifactRef: string; evidenceRefs?: string[] }> {
    const company = safeSegment(input.companyId);
    const mission = safeSegment(input.missionId);
    const candidate = safeSegment(input.candidateId);
    const dir = path.resolve(this.root, company, mission);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${candidate}.png`);
    await writeFile(file, input.bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      throw new DomainError("image artifact already exists; reconcile before overwrite");
    });
    return { artifactRef: `file://${file}`, evidenceRefs: [`file:${company}/${mission}/${candidate}.png`] };
  }
}
