# MCP v2 migration — 2026-10-08

## Implemented in staging candidate

The MCP HTTP serving path now uses the stable TypeScript SDK v2 `@modelcontextprotocol/server@2.3.1`, `@modelcontextprotocol/node@2.1.1` and `@modelcontextprotocol/express@2.0.2`. It creates a fresh low-level Server per authenticated request via `createMcpHandler` and forwards an already-parsed Express JSON body to the Node adapter.

It serves **2026-07-28** stateless `server/discover` and request envelopes and keeps the **2025-11-25** stateless `initialize` compatibility path. Both run through the existing Company Work, auth, authority, and workforce handlers. The v1 client SDK remains installed only for legacy client integration code/smoke tests; migration of consumer transports is a separate compatibility phase.

Security boundaries are unchanged: JWT bearer authorization validated before issuing a handler, immutable per-request auth context, workforce bound to signed sub/client_id, Company RLS, no provider model API. A modern MCP handshake does **not** grant Company Owner authority, approvals, wake scheduling, or agent host execution.

## Evidence expected per exact SHA

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run mcp:modern:smoke` : v2 pinned 2026-07-28 and auto-negotiated connection, discovery and tool call
- `pnpm run mcp:app:smoke` : previous v1 client against v2 HTTP server
- `pnpm run mcp:app:oauth:smoke` and `pnpm run mcp:multihost:oauth:smoke` : JWT scope and workforce boundaries
- `pnpm run pg:smoke` : PostgreSQL 18 RLS and fenced assignments in CI
- `pnpm audit --prod --audit-level=moderate`

## Remaining release gates

Actual ChatGPT/Claude/Grok platform connections and observed host-driven execution, A2A v1.0 task bridge, external wake with replay-safe delivery and DLQ, Railway staging with configured OAuth issuer/audience/JWKS/Owner trust ceremony, tested restore, required branch review and runner coherence. No production release without these gates.
