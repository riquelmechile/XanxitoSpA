import { describe, expect, it } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { GENAI_SEMCONV_SCHEMA_URL, NoopTelemetrySink, OpenTelemetrySink, createTelemetryFromEnv, safeGenAiAttributes } from "./index.js";

describe("observability", () => {
  it("emits schema-pinned spans without prompt/tool body capture", async () => {
    const exporter = new InMemorySpanExporter();
    const sink = new OpenTelemetrySink(exporter);
    const secretPrompt = "DO_NOT_CAPTURE_THIS_PROMPT";
    const attributes = safeGenAiAttributes({
      operationName: "invoke_agent",
      agentName: "executive",
      agentVersion: "0.5.0",
      model: "gpt-5.6-sol",
      companyId: "company-a",
      workId: "work-a",
    });
    await sink.withSpan("invoke_agent executive", attributes, async () => secretPrompt.length);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.instrumentationScope.schemaUrl).toBe(GENAI_SEMCONV_SCHEMA_URL);
    expect(JSON.stringify(spans[0]?.attributes)).not.toContain(secretPrompt);
    expect(spans[0]?.attributes["xanxitospa.content.capture"]).toBe(false);
    await sink.shutdown();
  });

  it("is no-op when OTLP endpoint is absent", async () => {
    const sink = createTelemetryFromEnv({});
    expect(sink).toBeInstanceOf(NoopTelemetrySink);
    await expect(sink.withSpan("demo", {}, async () => 7)).resolves.toBe(7);
  });
});
