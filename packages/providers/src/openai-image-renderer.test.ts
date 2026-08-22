import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { CreativeMission, CreativeStrategyCandidate } from "../../contracts/src/index.js";
import { OpenAIResponsesImageRenderer, type ImageArtifactSink, type OpenAIApiKeyPort } from "./openai-image-renderer.js";

function mission(): CreativeMission {
  return {
    id: randomUUID(), companyId: randomUUID(), workId: randomUUID(), supervisorPrincipal: "creative-supervisor",
    briefRef: "brief:character", evidenceSnapshotRef: "evidence:dna", candidateCount: 2, requiredSuccessfulCandidates: 2,
    executiveEscalationRequired: false, createdAt: new Date().toISOString(),
  };
}

function candidate(m: CreativeMission): CreativeStrategyCandidate {
  return {
    id: `${m.id}:candidate:0`, missionId: m.id, strategyOverlay: "silhouette-first", prompt: "Original premium character art",
    rationale: "test", evidenceRefs: [], cost: 0, model: "gpt-5.6-sol", reasoningEffort: "xhigh",
  };
}

describe("OpenAIResponsesImageRenderer", () => {
  it("keeps credential and raw image bytes outside renderer result", async () => {
    const secret = "sk-test-THIS-IS-NOT-A-REAL-KEY-123456789";
    let seenAuthorization = "";
    let seenBody: Record<string, unknown> | undefined;
    let storedBytes = 0;
    const apiKey: OpenAIApiKeyPort = {
      async isConfigured() { return true; },
      async withApiKey<T>(use: (value: string) => Promise<T>) { return use(secret); },
    };
    const sink: ImageArtifactSink = {
      async put(input) { storedBytes = input.bytes.length; return { artifactRef: "asset://character/test.png", evidenceRefs: ["sink:test"] }; },
    };
    const raw = Buffer.alloc(128, 7).toString("base64");
    const renderer = new OpenAIResponsesImageRenderer({
      apiKey, sink, endpoint: "http://127.0.0.1:9999/v1/responses",
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        seenAuthorization = headers.get("authorization") ?? "";
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "resp_test", output: [{ type: "image_generation_call", result: raw }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const m = mission();
    const result = await renderer.render({ mission: m, candidate: candidate(m) });
    expect(storedBytes).toBe(128);
    expect(seenAuthorization).toBe(`Bearer ${secret}`);
    expect(seenBody?.model).toBe("gpt-5.6-sol");
    expect((seenBody?.reasoning as { effort?: string }).effort).toBe("xhigh");
    expect(seenBody?.parallel_tool_calls).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(raw);
    expect(result.artifactRef).toBe("asset://character/test.png");
  });

  it("reports staged availability when runtime credential is absent", async () => {
    const renderer = new OpenAIResponsesImageRenderer({
      apiKey: { async isConfigured() { return false; }, async withApiKey() { throw new Error("should not run"); } },
      sink: { async put() { throw new Error("should not run"); } },
    });
    await expect(renderer.availability()).resolves.toEqual({ available: false, reason: "openai-runtime-credential-missing" });
  });
});
