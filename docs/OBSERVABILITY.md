# Observability

XanxitoSpA keeps two distinct evidence surfaces:

1. **Business Event Ledger / Receipts / Outcomes** — authoritative business/audit facts owned by the Company kernel.
2. **OpenTelemetry** — interoperable operational traces for debugging, latency, provider/tool execution and future model calls.

OpenTelemetry never replaces the business ledger.

## GenAI semantic conventions

Instrumentation is pinned to:

```text
https://opentelemetry.io/schemas/gen-ai/1.42.0
```

The GenAI conventions moved to their own OpenTelemetry repository in 2026 and remain fast-moving. XanxitoSpA therefore pins the schema URL instead of silently following `latest`.

## Privacy default

**Content capture is off.**

By default spans record metadata such as:

- operation name;
- agent/function name and version;
- model/provider identifier when applicable;
- Company/Work correlation IDs;
- capability/provider identifier;
- status, timing and error class.

They do **not** record prompt bodies, tool payloads, MCP response bodies, raw conversation content, passwords, API keys or secret values.

The runtime sets:

```text
xanxitospa.content.capture = false
```

## Enabling OTLP

Without `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, the sink is a no-op.

To export traces:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces
```

Use TLS for non-loopback collectors in production deployments.

## MCP boundary

MCP responses are tagged as:

```json
{
  "provenance": {
    "source": "mcp",
    "trust": "external-data",
    "instructionsTrusted": false
  }
}
```

This means observability may record that a tool call happened, but the tool response is not elevated into trusted instructions or copied into telemetry by default.
