# Production-readiness ledger — 2026-10-08

Status: **BLOCKED**. This file is evidence for an incremental rollout; it is not permission to deploy.

## Verified baseline and provenance

- GitHub `main` SHA: `0307e9c763cc24f61229a0eb9a7af327e39b929e` (2026-08-26). CI run `32920075406` completed successfully for that SHA.
- Baseline on the isolated PC checkout (2026-10-08): TypeScript typecheck PASS, build PASS, Vitest **122 PASS / 1 SKIP**, skill registry **18 indexed / 17 active**, Company Gym PASS; MCP, OAuth and Streamable HTTP smoke PASS. These are local execution results, not a production E2E proof.
- `skills-library` pinned development source SHA: `95c8577f8008613c4bc1ab4d9152cb4502eb386a`; library CI run `37859671380` PASS.
- GitHub branch protection: `main` not protected at inspection time.
- Railway workspace query: no XanxitoSpA project/service in the accessible project list. Do not assume that an unrelated service is the target.
- Live Founder/Owner public trust root: not evidenced. Project architecture documents that `trustConfigured=false` blocks owner mandates until out-of-band enrollment.
- Existing runtime uses `@modelcontextprotocol/sdk@1.30.0` (pre-2026 MCP) and `railway.json`. The current 2026-07-28 protocol requires a separately validated migration path. The external Railway skill warns about railway.json retirement on 2026-12-01; verify the date in Railway release docs during migration.

## Critical gates before enabling full business operation

| Gate | Current | Required evidence |
| --- | --- | --- |
| G1 MCP 2026 compatibility | BLOCKED | v2 server/client packages, protocol tests for 2026-07-28 AND backward compatibility 2025-11-25, fresh instances, tools/OAuth/PRM |
| G2 Signed owner authority | BLOCKED | Out-of-band Founder/Owner enrollment; verified Ed25519 active root; signed mandate and revocation/rotation test |
| G3 Railway deployment | BLOCKED | isolated project/environments with Postgres18 and persistent storage, verified URL/OAuth config, exact-SHA release + healthy MCP endpoints |
| G4 Restore/DR | BLOCKED | encrypted backups, periodicity/retention, tested point-in-time restore, audit of tenant isolation |
| G5 GitHub supply chain | BLOCKED | protected main, reviewed PR, CI required, lockfile/advisory and dependency scanning, least privilege |
| G6 A2A and wake | BLOCKED | authenticated Agent Card, actor/scope checks, signed event ingress, durable dedupe/queue, DLQ, no payload-as-instruction |
| G7 PC tunnel | NOT REQUIRED for baseline cloud launch | conditional on a local-only capability, Cloudflare named tunnel + Access and JWT checks + health/restart/host allowlisting |
| G8 Operations/metrics | BLOCKED | budget guard, heartbeat/signal daemon, read/write tests, error budgets, paging, routine smoke, rollback drill |

## External skills adoption

External Agent Skills are **developer/operations instructions** only, pinned in `config/skills-library.lock.json`; they are not Company Skill Registry installations, trusted tool descriptions, executable grants or background model invocations. Load from private upstream with explicit GitHub permissions and validate evidence before reusing templates.

- `mcp-a2a-expert`: design and conformance suites for MCP 2026 + optional A2A bridge; maintain 2025 compatibility.
- `webhook-agent-wake` + `github-webhooks`: verify raw-body HMAC, replay, durable queue/DLQ, source re-fetch; activate only after auth and queue verification.
- `railway` + `cloudflare`: service discovery, plan/apply IaC, separate environments, TLS and Access.
- `gmail-push`: optional mailbox signals, never authority.
- `dev-stack` + `cachyos`: development host inventory; do not make PC a single point of failure for always-on production.

This repository's Model Law forbids direct model-provider API calls. **Do not copy** provider API invocation examples from external wake skills into XanxitoSpA; use the host's capabilities or controlled A2A work handoffs when available.

## Ordered implementation and acceptance

1. **P0 secure baseline**: pin skills and enforce private-skill trust boundary (this PR); enable main branch protection, update reviewed CI, audit secrets/dependencies.
2. **P0 MCP migration**: build v2 transport/auth side-by-side in feature branch; test stateless core, discovery, negotiated extensions and 2025 fallback before cutover.
3. **P0 resilient operations**: PostgreSQL migration/backup+restore automation, admin root ceremony, capability allowlists, error monitoring and idempotency under replay.
4. **P1 Company OS actual autonomy**: observed business connectors beyond CSV, owner-scoped objectives, wake subscriptions, Work/Delegation execution, measured outcomes; do not count demo as real operation.
5. **P1 production launch**: Railway IaC plan + staging, exhaustive smoke/fault/security/recovery, four-lens independent review, exact-SHA release gate, production canary and rollback check.
6. **P2 A2A/PC integration**: bounded additive transport, signed Agent Cards and task handoffs; PC tunnel only for work actually needing PC/GPU/browser.

## Prohibited shortcuts

No direct-main code changes; no production deploy on historical tests alone; no model API keys; no secret leakage in artifacts; no silently generated owner mandates; no claiming 4R or subagent review without independent fresh host evidence.

## References

- https://modelcontextprotocol.io/specification/2026-07-28
- https://github.com/riquelmechile/skills-library/tree/95c8577f8008613c4bc1ab4d9152cb4502eb386a
- https://github.com/riquelmechile/XanxitoSpA/blob/main/docs/CURRENT_ARCHITECTURE_2026-08-25.md
