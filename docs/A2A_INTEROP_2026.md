# XanxitoSpA A2A 1.0 Workforce bridge

## Implementation

`apps/mcp/src/a2a.ts` provides an A2A JSON-RPC 1.0 bridge over the same Company Workforce implementation used by MCP.

- Public discovery at `/.well-known/agent-card.json` advertises one durable task skill and an OAuth 2.1 security requirement.
- `POST /a2a` requires the `A2A-Version: 1.0` header and a signed JWT bearing both `sub` and `client_id` (or signed `azp`). No trust in host-reported identity.
- `SendMessage` translates text plus explicit `message.metadata.xspa` routing (`sourceWorkerId`, `targetWorkerId`, `workId`, `idempotencyKey`) into `workforceDelegate`. The caller must have `xspa.write`. The source actor must belong to the authenticated identity; the target must consent unless same owner; Company Work must exist.
- `GetTask` translates `workforceReceipt` into A2A task state. It requires `xspa.read`, and source/target receipt privacy checks still apply.
- `TASK_STATE_SUBMITTED` means durable assignment, **not observed host wake or execution**. `TASK_STATE_COMPLETED` means a stored receipt, not independently verified model execution. `provider_api_calls=0` and `server_side_model_workers=0` remain policy.
- Push, cancellation, streaming and generic agent-to-agent prompt execution are NOT advertised.

## Deployment restriction

The A2A routes are only mounted when the OAuth verifier is configured **and** `XSPA_PUBLIC_STATUS_ONLY` is false. Existing public ChatGPT diagnostic staging never exposes the Agent Card or A2A mutation surface. Do not remove the public-status safety gate to demonstrate an endpoint.

Live enablement requires owner-authenticated OAuth issuance, Company trust anchors, an authenticated GPT client connection and real host receipts. The repo's existing JWT resource verifier does not issue tokens, and the initial password-based issuer prototype is neither audited nor committed. Do not use a test issuer or a self-declared host hint as production authorization.

## Verified tests

`packages/testing/src/xspa-app-oauth-smoke.ts` exercises the actual HTTP server with test-signed OAuth tokens, A2A discovery, anonymous rejection (401), `SendMessage`, `GetTask` and mandatory protocol-version rejection. This is **a simulated host test**. `packages/testing/src/xspa-public-status-smoke.ts` retains the public diagnostic gate. GitHub CI for head `cad41d0370ff38ad8a2bd0b42247fc83a76b4f4a` completed successfully.

Reference: `skills-library/skills/mcp-a2a-expert/references/a2a-spec.md` pinned by `config/skills-library.lock.json`.
