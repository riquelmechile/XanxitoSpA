import { SpanStatusCode, type Attributes } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BasicTracerProvider, SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base";

export const GENAI_SEMCONV_SCHEMA_URL = "https://opentelemetry.io/schemas/gen-ai/1.42.0";
export const XSPA_INSTRUMENTATION_NAME = "xanxitospa";

export type TelemetryAttribute = string | number | boolean | readonly string[] | readonly number[] | readonly boolean[];
export type TelemetryAttributes = Record<string, TelemetryAttribute>;

export interface TelemetrySink {
  withSpan<T>(name: string, attributes: TelemetryAttributes, operation: () => Promise<T>): Promise<T>;
  shutdown(): Promise<void>;
}

export class NoopTelemetrySink implements TelemetrySink {
  async withSpan<T>(_name: string, _attributes: TelemetryAttributes, operation: () => Promise<T>): Promise<T> {
    return operation();
  }
  async shutdown(): Promise<void> {}
}

function toOtelAttributes(attributes: TelemetryAttributes): Attributes {
  return attributes as Attributes;
}

export class OpenTelemetrySink implements TelemetrySink {
  private readonly provider: BasicTracerProvider;
  private readonly tracer: ReturnType<BasicTracerProvider["getTracer"]>;

  constructor(exporter: SpanExporter) {
    this.provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    this.tracer = this.provider.getTracer(XSPA_INSTRUMENTATION_NAME, "0.5.0", { schemaUrl: GENAI_SEMCONV_SCHEMA_URL });
  }

  async withSpan<T>(name: string, attributes: TelemetryAttributes, operation: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(name, { attributes: toOtelAttributes(attributes) });
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error) span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}

export interface TelemetryEnvOptions {
  endpointEnv?: string;
}

export function createTelemetryFromEnv(env: NodeJS.ProcessEnv = process.env, options: TelemetryEnvOptions = {}): TelemetrySink {
  const key = options.endpointEnv ?? "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT";
  const endpoint = env[key];
  if (!endpoint?.trim()) return new NoopTelemetrySink();
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("OTLP trace endpoint must use http or https");
  return new OpenTelemetrySink(new OTLPTraceExporter({ url: url.toString() }));
}

export function safeGenAiAttributes(input: {
  operationName: string;
  agentName: string;
  agentVersion: string;
  model?: string;
  providerName?: string;
  companyId?: string;
  workId?: string;
}): TelemetryAttributes {
  return {
    "gen_ai.operation.name": input.operationName,
    "gen_ai.agent.name": input.agentName,
    "gen_ai.agent.version": input.agentVersion,
    ...(input.model ? { "gen_ai.request.model": input.model } : {}),
    ...(input.providerName ? { "gen_ai.provider.name": input.providerName } : {}),
    ...(input.companyId ? { "xanxitospa.company.id": input.companyId } : {}),
    ...(input.workId ? { "xanxitospa.work.id": input.workId } : {}),
    "xanxitospa.content.capture": false,
  };
}
