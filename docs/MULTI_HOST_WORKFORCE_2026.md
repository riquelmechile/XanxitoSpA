# Multi-host Workforce Mesh (MCP) — rollout contract

**Status:** implemented behind the existing authenticated MCP surface, **not yet live host-verified or production-deployed**.

## Design

XanxitoSpA is one Company OS and one persistence/authority boundary. It can expose a single remotely accessible MCP endpoint to ChatGPT, Claude, Grok, Gemini, Spark, Kimi or other hosts **only to the extent that their products actually support remote MCP connections**. No provider model APIs, client impersonation, model keys, or server-side LLM workers are used.

Each connected host authenticates with OAuth resource-server credentials. The verified `iss` and `aud` are enforced by the existing JWT verifier; the signed JWT subject and, if present, its client identifier bind owned workforce actors. A host label is **self-reported** metadata and is not identity proof. Actor IDs are random UUIDs; their owner keys are hashed. Agents are available for delegation only after an authenticated host registers them.

This is **host-delivered work**, not model invocation. A pending delegation does not launch Claude/Grok/ChatGPT. An actual host must poll `xspa_workforce_pickup`, or a separately authenticated wake mechanism must open a supported host session. There is intentionally no unverified "always-on LLM" claim.

## Operations exposed through MCP

| Tool | Required permission | Purpose |
| --- | --- | --- |
| `xspa_worker_register` | Authenticated `xspa.write` | Register a new opaque worker ID, a descriptive host hint and skills/capabilities |
| `xspa_worker_list` | Authenticated `xspa.read` | Discover Company workers; `owned` tells the caller which worker IDs it can operate |
| `xspa_work_create` | `xspa.write` | Create durable Company Work; does not grant authority |
| `xspa_workforce_allow_source` | Authenticated `xspa.write` and target-worker ownership | Target explicitly opts in to receive requests from a registered source worker |
| `xspa_workforce_delegate` | Authenticated `xspa.write` and source-worker ownership | Store a work assignment to a registered target; immutable idempotency fingerprint |
| `xspa_workforce_pickup` | Authenticated `xspa.write` and target-worker ownership | Exclusively claim one pending/expired delegation for a 30-minute lease |
| `xspa_workforce_renew` | Authenticated `xspa.write`, current owner and lease generation | Extend active lease without reassigning ownership |
| `xspa_workforce_complete` | Authenticated `xspa.write`, current owner and lease generation | Settle success/failure and store result |
| `xspa_workforce_receipt` | Authenticated `xspa.read`, source or target owner | Recover stored result; not accessible to uninvolved clients |

Workers cannot select arbitrary Companies: `XSPA_COMPANY_ID` owns the deployment. PostgreSQL enforces Company-bound row-level security. Claiming is serialized using `FOR UPDATE SKIP LOCKED`; old lease generations cannot submit results after reassignment. Worker assignments and results are durable in PostgreSQL, not MCP transport sessions or ephemeral chat messages.

## Example handshake for a compatible host

1. In the host's MCP connector settings, configure the XanxitoSpA HTTPS `/mcp` URL; finish OAuth on that platform. The resource server must expose path-correct PRM, validate issuer/audience and deny unauthorized requests.
2. Call `xspa_worker_register` with `host_hint` such as `chatgpt`, `claude` or `grok`. Persist the returned `workerId` in the host's connected workspace or retrieve `owned` actors through `xspa_worker_list`. Never use the hint as proof that a vendor model connected.
3. Target host first calls `xspa_workforce_allow_source` for a source worker it intends to trust. Otherwise cross-owner delegation fails closed as `WORKFORCE_SENDER_NOT_ACCEPTED`. This is sender consent, not an authority or budget grant.
4. Source host creates `xspa_work_create` with Company scope, then calls `xspa_workforce_delegate` with its owned `source_worker_id`, registered target `target_worker_id`, existing `work_id`, immutable instruction and unique `idempotency_key`.
5. Recipient host calls `xspa_workforce_pickup` and receives the real durable instruction **only after authenticated ownership validation**. It executes using its own host-provided capabilities and permissions.
6. Recipient renews as needed and submits `xspa_workforce_complete` with the current `lease_generation`. The requester retrieves the result through `xspa_workforce_receipt`.

An MCP wake from GitHub/Gmail/Cloudflare/A2A must be a **notification or pointer only**, never an instruction or permission authority. Later adapters should authenticate emitters, deduplicate, queue, and look up the durable delegation before dispatching to a host that has *observed* support for background activation. No static PR-comment hook is treated as an LLM execution guarantee.

## Operator checklist before production

- Confirm OAuth JWT issuer, resource audience, JWKS and scopes with at least two **actual** LLM hosts and two distinct JWT subjects/client claims.
- Verify cross-Company RLS on PostgreSQL with the restricted application role; verify expired leases, replay, idempotency conflicts, and no-op retry.
- Enforce branch review and exact-SHA CI, compatible MCP 2026-07-28 implementation and 2025 compatibility testing. The dependency patch to SDK v1.31.0 is a security patch, **not** this migration.
- Provision isolated Railway staging+production, founder authorization root, encryption, secrets, backups with tested restore, monitoring, and runbook.
- Start live data collection and operator-supervised pilots. Do not activate autonomous spending, contracts, personal-data exports, or workflow side effects through a workforce delegation itself.
- Pilot supported host wake/adapters independently, with a disabled-by-default feature switch and observable delivery receipts. If a host offers only interactive MCP sessions, use polling/manual activation rather than invent background wake.

## Invariants

Work ≠ authorization. A2A task handoff ≠ authority transfer. Host label ≠ authenticated model identity. A successful MCP tool call ≠ proof that a specific LLM ran. Deleting an MCP transport session ≠ losing a work item.
