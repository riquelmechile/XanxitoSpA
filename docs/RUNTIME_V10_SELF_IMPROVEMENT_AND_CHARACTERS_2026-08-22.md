# XanxitoSpA V1.0 — Real KAST Runtime + Character Production Pipeline

Status: implementation candidate, pending four-lens review/public CI at document creation.

## Why V1.0 exists

V0.9 made KAST a small harness law. V1.0 connects that law to real execution boundaries without turning it back into a large subsystem.

## Real KAST path

```text
KAST trigger
  ↓
EngramMemoryPort
  ↓
MCP-backed Xanxito Engram search
  ↓
2 blind Sol/xhigh variants
  ↓
Git worktrees from exact base SHA
  ↓
mutation executor
  ↓
commit per variant
  ↓
real changed-path classification
  ↓
SDD status + tests + four-lens review + verification
  ↓
Sol/max adjudication
  ↓
GitAdoptionPort
  ↓
exact source commit cherry-pick / reject
  ↓
Engram outcome
```

### Invariants

- KAST still runs without PostgreSQL.
- Engram is accessed through a generic MCP transport; the kernel does not import Xanxittoo internals.
- worktree administration is serialized while mutation work can proceed concurrently.
- every experiment starts from one exact base SHA.
- the proposer cannot decide which constitutional surfaces it touched: surfaces are derived from the actual Git diff.
- `model-law`, `constitution`, `authority-root`, `secret-isolation`, `kast-law`, `review-law`, `memory-law`, and human-reserved boundaries cannot be auto-adopted.
- verification binds to the exact source commit.
- adoption also binds to the exact source commit and refuses a moved/dirty base.
- a failed cherry-pick aborts and returns a rejected adoption result.
- selected and rejected KAST outcomes are written back through the Engram port.

## Harness MCP adapter

`McpEngramMemoryPort` maps KAST memory search/save to discovered MCP tools. `XanxitoMcpWorkflowEvidencePort` reads SDD and review state through MCP. Tool descriptor drift is rejected after first trust establishment.

The adapter is project-local and provider-neutral at the kernel boundary. Xanxittoo is not modified.

## Real Git smoke

The Company Gym creates disposable Git repositories and proves:

- a worktree mutation does not touch the base before adoption;
- two mutation branches can execute concurrently;
- a safe skill change can be verified and adopted;
- a candidate that claims to be harmless but actually changes `kast-law` is classified from the Git diff and rejected;
- the adopter binds `verifiedChangeRef == sourceChangeRef`.

## Character production V2

The Company Deck now has a production mission pack:

- `assets/characters/character-dna.json` schema v2;
- `assets/characters/character-missions.json` with 8 roles × 2 blind directions;
- `archetype-motion` and `human-material` as default COMPETE overlays;
- shared style lock for skin, materials, contrast, camera, depth, crop and visual world;
- role-specific identity anchors preventing pose/face/prop cloning;
- selected outputs target `assets/characters/final/<role>.png`.

### GPT-only creative runtime

```text
Sol/xhigh concept A ─┐
                     ├─ native Responses image_generation ─┐
Sol/xhigh concept B ─┘                                     │
                                                            ├─ internal CompanyAssets
Sol/xhigh visual evaluator A ──────────────────────────────┤
Sol/xhigh visual evaluator B ──────────────────────────────┘
                          ↓
                  Creative Supervisor Sol/xhigh
                          ↓
                    selected final asset
```

The image backend is a renderer behind GPT's native image tool, not a second employee/model principal.

### No chat rendering fallback

`NativeImageRenderer` now has an optional availability gate. `processCreativeMissionJob` checks it before claiming a job. If runtime image credentials are absent, the job remains pending with zero attempts consumed and reports `STAGED:creative_renderer_unavailable`.

The current development PC readiness check on 2026-08-22 found no `OPENAI_API_KEY`, so the 8 character missions / 16 candidate renders were prepared but not executed. No secondary model and no ChatGPT-visible image generation was used as a fallback.

## OpenAI runtime adapters

- `OpenAIResponsesImageRenderer`: invokes Responses with `gpt-5.6-sol`, `reasoning.effort=xhigh`, one native `image_generation` tool call, and saves only bytes to an injected `ImageArtifactSink`.
- raw base64 and API keys are excluded from renderer results.
- `OpenAIResponsesRuntimeClient`: text/vision reasoning client for concept branches, visual evaluators and supervisor adjudication.
- `OpenAICharacterConceptWorker`: one blind direction per branch.
- `OpenAICharacterEvaluator`: scores visual evidence; image content is explicitly treated as untrusted data, not instructions.
- `OpenAICharacterAdjudicator`: selects only among successful candidate IDs using evaluator evidence.
- `FileSystemImageArtifactSink`: internal candidate files under a configured asset root.
- `scripts/run-character-roster.ts`: gated batch runner; requires DB, Company ID, OpenAI runtime credential and explicit `XSPA_CREATIVE_EXECUTE=1`.

## Verification targets

- TypeScript strict
- Vitest
- Company Gym
- real Git worktree/adoption smoke in Gym
- MCP Streamable HTTP smoke
- PostgreSQL 18 smoke
- SVG + character mission validation
- production dependency audit
- four-lens review
- public GitHub CI before release


## ChatGPT app entrypoint

V1.0's primary human control surface is the first-party remote MCP server in `apps/mcp`. ChatGPT submits governed work through `/mcp`; CLI/demo HTTP routes remain engineering surfaces.

App tools are deliberately small:

```text
xspa_status
xspa_work_create
xspa_work_get
xspa_creative_submit
xspa_creative_status
xspa_kast_reflect
```

The server binds Company identity from deployment configuration, never from a tool argument. Work creation is idempotent and explicitly grants neither authority nor budget. Creative submissions remain `decision-only`, KAST constitutional changes are `founder-required`, and missing durable runtime configuration fails staged rather than silently falling back to in-memory state. Remote binds require OAuth; the internal bearer is loopback-only. The OAuth resource server publishes protected-resource metadata, advertises per-tool read/write scopes, validates issuer/audience/signature through JWKS, and preserves OAuth even when a loopback internal token is also configured. See `CHATGPT_APP_MCP.md`.
