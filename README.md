<p align="center">
  <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/hero.svg" alt="XanxitoSpA — autonomous company harness" width="100%" />
</p>

<p align="center">
  <strong>A governed harness for forming, adopting, operating and evolving companies.</strong><br/>
  V1 uses one cognitive model: GPT-5.6 Sol. Executive reasoning is `max`; every supervisor/worker/critic/verifier branch is the same Sol model at `xhigh`. Business functions coordinate and compete; verified outcomes and sanitized traces teach the organization how to work better.
</p>

<p align="center">
  <img alt="CI" src="https://github.com/riquelmechile/XanxitoSpA/actions/workflows/ci.yml/badge.svg" />
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-D6B56B" />
  <img alt="release" src="https://img.shields.io/github/v/release/riquelmechile/XanxitoSpA?display_name=tag" />
</p>

<p align="center">
  <a href="#the-company-deck">Company Deck</a> ·
  <a href="#competitive-branching">COMPETE</a> ·
  <a href="#corporate-evolution">Evolution</a> ·
  <a href="#the-kernel">Kernel</a> ·
  <a href="#run-it">Run it</a> ·
  <a href="docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md">Architecture</a>
</p>

---

## What XanxitoSpA is

Most agent systems try to make one model do more work. **XanxitoSpA models the company itself.**

A Company has a constitution, stable business functions, temporary workers, authority grants, budget envelopes, a durable event/state plane, semantic capabilities and an institutional learning loop. The runtime decides whether a mission should execute directly, fan out, collaborate, challenge, debate, **COMPETE**, escalate or do nothing.

The core operating loop is:

```text
signal → heartbeat → restore state → business preflight
       → mission graph → delegation → governed execution
       → verification → outcome/receipt → learning → sleep
```

**Silence costs zero model calls.**

### Current verified state

```text
Version                  0.7.0
Runtime                  Node.js 24 + TypeScript strict
Authoritative store      PostgreSQL 18 contract + real adapter
Company Gym              79 / 79 PASS (local)
MCP                      Streamable HTTP bridge + trust fingerprinting
Observability            OpenTelemetry / GenAI schema 1.42.0, content off
External benchmark       TheAgentCompany adapter-ready; no score published
External provider secrets none committed
Durability direction      DBOS staged adoption (ADR-0001)
Model law                Sol/max executive · Sol/xhigh branches · no model fallback
Creative model policy     OpenAI-only V1 · native image tool · video staged
Release state             four-lens APPROVED · public CI PASS · released
```

---

<a id="the-company-deck"></a>
## The Company Deck

Stable functions are not disposable prompt personas. They are durable scopes with their own KPIs, authority, memory, processes and capability grants. Workers beneath them are temporary.

<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/company-deck-mobile.svg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/company-deck.svg" alt="The Company Deck — eight original XanxitoSpA function character concepts" width="100%" />
  </picture>
</p>

The public deck now uses **Character Concept V2**: full-body, role-specific silhouettes, poses, props and environments instead of repeated geometric busts. These vector concepts lock the roster DNA and mobile composition. The final painterly/splash-art layer is provider-neutral and specified in [assets/characters/character-dna.json](assets/characters/character-dna.json); it can replace the concept layer later without changing the card system.

| Function | Archetype | Visual read |
| --- | --- | --- |
| Executive | **The Sovereign** | vertical authority · open decision gesture |
| Commercial | **The Hunter** | forward diagonal · opportunity lens |
| Finance | **The Keeper** | grounded symmetry · ledger/vault rings |
| Operations | **The Forge** | broad work silhouette · industrial tool |
| Customer | **The Envoy** | open gesture · signal scarf |
| Admin & Risk | **The Sentinel** | shield-plane · verify/stop gesture |
| Data | **The Oracle** | elongated observer · evidence prism |
| Creative | **The Shaper** | twisting motion · transforming surface |

> **Competition of ideas. Cooperation in execution.** Departments do not fight for status; strategies compete for evidence.

---

<a id="competitive-branching"></a>
## Competitive branching

`FAN-OUT` gives different work to different branches. `COMPETE` gives **the same problem and the same evidence** to independent workers with distinct strategy overlays.

<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/compete-mobile.svg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/compete.svg" alt="COMPETE — blind competitive branching and owner adjudication" width="100%" />
  </picture>
</p>

The default protocol is deliberately bounded:

1. two candidates receive the same frozen evidence snapshot;
2. they work blind — neither sees the other's answer;
3. one cross-critique round is allowed;
4. the responsible business owner chooses A, B or a synthesis;
5. the winner is executed only inside authority/budget/risk boundaries;
6. real outcomes feed learning later.

No majority voting. No free-form swarm chat. No endless debate.

---

<a id="corporate-evolution"></a>
## Corporate evolution

XanxitoSpA does not mutate the foundation model. It evolves **the organization around the model**.

<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/evolution-mobile.svg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/evolution.svg" alt="Corporate Genes and Pareto evolution" width="100%" />
  </picture>
</p>

Versioned `CorporateGene` variants can represent:

- strategies;
- business processes;
- skills;
- team compositions;
- provider-routing policies.

Only **verified outcomes** affect fitness. Selection is multi-objective/Pareto-first rather than a single “maximize profit” score. A losing variant can become `silent` instead of being deleted, preserving negative evidence so the company does not blindly repeat old failures.

```text
candidate → challenger → champion
             │             │
             ├─ silent     ├─ mutate/explore
             └─ quarantine └─ institutionalize
```

---

<a id="the-kernel"></a>
## The kernel

<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/kernel-planes-mobile.svg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/diagrams/kernel-planes.svg" alt="XanxitoSpA company kernel and enterprise planes" width="100%" />
  </picture>
</p>

The kernel owns business policy. Providers stay replaceable.

### Business Preflight

Before material work, the runtime resolves:

```text
objective · materiality · risk · owner · authority · budget
process · skills · departments · dependencies · evidence
rollback · terminal condition · escalation condition
```

It then chooses one bounded route:

`noop · direct · fan_out · collaborate · challenge · debate · compete · escalate`

### Authority and money

`Work ≠ Authority.` A task never grants permission by itself.

- authority is deny-by-default;
- invalid/expired grants fail closed;
- spending is zero by default until a `BudgetEnvelope` exists;
- budget is reserved before an external effect;
- idempotency/fencing prevent duplicate and stale execution;
- human/constitutional boundaries remain explicit.

### Durable runtime

V1.2/V1.3 include real PostgreSQL-backed contracts for:

- Companies and Work;
- append-only Business Events;
- scheduler jobs and heartbeat cursors;
- leases + monotonic fencing tokens;
- durable idempotency + orphan reconciliation;
- Business Outcomes + Receipts;
- Corporate Genes and evolution hypotheses;
- Company-owned assets and provider descriptors;
- Row Level Security by `company_id`.

---

## Universal Capability Plane

Business logic speaks in semantic capabilities, never vendor names.

```text
email.send             data.query                payment.execute
calendar.create        data.provision            creative.image.generate
phone.sms.send         document.render           creative.video.generate
notification.send      web.search                creative.model3d.generate
asset.provision        domain.dns.update         creative.cad.generate
```

Routing is:

```text
semantic capability
      ↓
hard eligibility filters
      ↓
quality / cost / latency / balanced
      ↓
provider adapter
      ↓
opaque secret handle
      ↓
external capability
```

Business services behind semantic capabilities are **tools**, never principals. Capability providers such as email, databases, payments, hosting and CAD engines remain replaceable. Cognitive/generative model routing is stricter in V1: the Executive is GPT-5.6 Sol/max, every subordinate reasoning branch is GPT-5.6 Sol/xhigh, secondary model providers are forbidden, and provider-managed multi-agent orchestration is disabled. XanxitoSpA owns FAN-OUT/COMPETE through its Mission Graph.

### Secret boundary

Workers do not receive raw API keys or passwords. A `SecretHandle` identifies a scoped credential; only the trusted provider adapter can resolve material inside an ephemeral callback. Credential material is rejected if it appears in returned results, events or control catalogs.

### MCP trust boundary

Mapped MCP tools require explicit Company/provider registration. Their descriptor is fingerprinted, poisoning-sensitive metadata is quarantined, and the descriptor is rediscovered and revalidated before every execution. Descriptor drift is a pre-effect denial. MCP output is marked `external-data` with `instructionsTrusted=false`. See [`MCP_SECURITY.md`](docs/MCP_SECURITY.md).

### Observability

OpenTelemetry spans are emitted alongside — never instead of — Business Events/Receipts. GenAI semantic conventions are pinned to schema `1.42.0` and prompt/tool body capture is disabled by default. See [`OBSERVABILITY.md`](docs/OBSERVABILITY.md).

### Durable execution direction

V1.2's PostgreSQL coordination remains verified, but generic workflow durability is not the moat. ADR-0001 selects **DBOS for staged adoption** before adding more custom workflow-engine machinery; Temporal remains the scale-out alternative. This is a decision/roadmap state, not a claim that DBOS already runs the runtime.

---

## External evidence

`Company Gym` is an internal invariant suite. It is **not** a workplace-completion benchmark. TheAgentCompany 1.0.0 is kept only as an **external wind tunnel**; it is not a dependency or architecture source. Its separate environment LLM serves simulated NPCs/evaluators and is never counted as a XanxitoSpA principal or worker.

The preferred experiment holds the principal constant and tests the architecture itself:

```text
same GPT-5.6 Sol + same task + same environment
                 │
        ┌────────┴────────┐
        ▼                 ▼
      DIRECT         XANXITOSPA
                       │
             Preflight / FAN-OUT /
             COMPETE / collaboration
        │                 │
        └────────┬────────┘
                 ▼
official score + cost + latency + reliability
```

No completion score is published until the official evaluator grades real trajectories. A full 175-task run is deferred until a representative paired pilot proves the adapter measures XanxitoSpA itself rather than another runtime.

```bash
pnpm run benchmark:theagentcompany:check
```

See [`benchmarks/theagentcompany/`](benchmarks/theagentcompany/), [`adr/0004-external-benchmarking.md`](docs/adr/0004-external-benchmarking.md) and [`EXTERNAL_REVIEW_2026-08-21.md`](docs/EXTERNAL_REVIEW_2026-08-21.md).

---

## Data and Creative planes

### Company Data Plane

Operational facts are not LLM memory.

```text
Company State          → current authoritative projection
Business Event Ledger  → what happened
Data Plane              → operational/application/analytics data
Institutional Memory   → distilled reusable knowledge
```

### Creative Plane

Creative generation is **internal company work, not chat rendering**. Chat submits a durable Creative Mission and immediately receives a `decision-only` receipt; Sol/xhigh workers COMPETE on concepts, native image-generation jobs render candidates in bounded parallelism, the outputs are stored as internal CompanyAssets, independent Sol/xhigh evaluators score VisualFitness, and the Creative Supervisor adjudicates. Executive Sol/max appears only when authority/risk requires escalation.

V1 deliberately uses the **same GPT-5.6 Sol cognitive flow** for creative work. The Creative Supervisor and competing candidates are Sol/xhigh branches; only the Executive owner uses Sol/max.

```text
brief / BrandDNA / CharacterDNA
        ↓
Sol/xhigh creative branches
        ↓ optional COMPETE
owner decision
        ↓
image_generation tool / deterministic renderer / business tool
```

Active V1 surfaces:

```text
creative.image.generate   → Responses built-in image_generation tool
creative.image.edit       → same native image tool path
creative.vector.generate  → GPT-authored deterministic SVG/code
document.render           → GPT structure + deterministic renderer
creative.video.generate   → STAGED / fail-closed in V1
creative.model3d.generate → only via approved non-model/procedural tool seam
creative.cad.generate     → approved CAD engine as a tool, not another cognitive model
```

OpenAI's current specialized image backend is GPT Image 2, but it is treated as a renderer behind the tool — not a worker or principal. Final video generation stays disabled because GPT-5.6 Sol has no stable native video tool and the currently documented Sora 2 APIs are Legacy/Deprecated. GPT can still create scripts, shot lists, storyboards and image keyframes. See [`adr/0005-one-model-law.md`](docs/adr/0005-one-model-law.md).

---

## Company lifecycle

The same kernel can form a new company or adopt an existing one:

`BOOTSTRAP · OPERATE · IMPROVE · GROW · EXPAND · RECOVER · EXIT`

For an existing company, XanxitoSpA discovers state, systems, processes, assets, KPIs and authority **before** attempting to reorganize it.

For new businesses, competing theses can be evaluated before bootstrap and launch. New brands, channels, countries or business units can later be spawned as governed pilots; legal entities, debt and reserved actions remain Founder/Board boundaries.

---

<a id="run-it"></a>
## Run it

Requirements:

- Node.js 24+
- pnpm 10+

```bash
pnpm install
pnpm run typecheck
pnpm run test
pnpm run gym
pnpm run build
pnpm run visuals:check
pnpm run mcp:smoke
pnpm run benchmark:theagentcompany:check
pnpm run dev
```

The local control API exposes sandbox/demo surfaces including:

```text
GET /health
GET /gym
GET /demo
GET /runtime/heartbeat/demo
GET /providers/route/demo
GET /bootstrap/demo
GET /capabilities/catalog/demo
GET /bootstrap/execution/demo
```

### PostgreSQL smoke

Use an isolated local PostgreSQL 18 instance:

```bash
pnpm run pg:smoke -- <postgres-test-url>
```

The smoke test rejects non-loopback hosts unless explicitly enabled for an isolated CI database.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [`XANXITOSPA_ARQUITECTURA_INICIAL_2026.md`](docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md) | Canonical company architecture and laws |
| [`RUNTIME_V1_ESTADO_2026-08-21.md`](docs/RUNTIME_V1_ESTADO_2026-08-21.md) | First executable kernel |
| [`RUNTIME_V12_DURABLE_2026-08-21.md`](docs/RUNTIME_V12_DURABLE_2026-08-21.md) | PostgreSQL, heartbeat, leases, providers, assets |
| [`RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md`](docs/RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md) | Secure semantic Capability Plane |
| [`RUNTIME_V15_ENTERPRISE_HARDENING_2026-08-21.md`](docs/RUNTIME_V15_ENTERPRISE_HARDENING_2026-08-21.md) | MCP trust, OTel, trace learning, external evidence and release hardening |
| [`RUNTIME_V06_MODEL_LAW_2026-08-21.md`](docs/RUNTIME_V06_MODEL_LAW_2026-08-21.md) | One Model Law + GPT-only creative execution |
| [`MCP_SECURITY.md`](docs/MCP_SECURITY.md) | MCP registration, poisoning and external-data trust boundary |
| [`OBSERVABILITY.md`](docs/OBSERVABILITY.md) | OpenTelemetry + GenAI semantic convention policy |
| [`EXTERNAL_REVIEW_2026-08-21.md`](docs/EXTERNAL_REVIEW_2026-08-21.md) | Resolution of external architecture review |
| [`adr/0001-durable-execution.md`](docs/adr/0001-durable-execution.md) | DBOS/Temporal durability decision |
| [`adr/0002-principal-policy.md`](docs/adr/0002-principal-policy.md) | Principal vs capability-provider boundary |
| [`adr/0003-authority-interoperability.md`](docs/adr/0003-authority-interoperability.md) | AP2/VC interoperability seam |
| [`adr/0005-one-model-law.md`](docs/adr/0005-one-model-law.md) | Sol/max executive, Sol/xhigh branches and GPT-only creative law |
| [`adr/0004-external-benchmarking.md`](docs/adr/0004-external-benchmarking.md) | External wind-tunnel policy; same-GPT DIRECT vs XANXITOSPA comparison |
| [`VISUAL_SYSTEM.md`](docs/VISUAL_SYSTEM.md) | The Company Deck visual language |
| [`CHARACTER_ART_DIRECTION.md`](docs/CHARACTER_ART_DIRECTION.md) | Character DNA, raster+SVG pipeline and originality rules |
| [assets/characters/character-dna.json](assets/characters/character-dna.json) | Provider-neutral briefs/prompts for the 8 archetypes |
| [`skills/svg-craft/SKILL.md`](skills/svg-craft/SKILL.md) | Project-local SVG/card/mobile delivery skill |
| [`skills/character-art/SKILL.md`](skills/character-art/SKILL.md) | Project-local premium original character-art skill |
| [`skills/design-competition/SKILL.md`](skills/design-competition/SKILL.md) | Creative COMPETE + VisualFitness adjudication |
| [`skills/gpt-creative/SKILL.md`](skills/gpt-creative/SKILL.md) | One-model creative execution + native image tool policy |

---

## Design laws

```text
Company owns assets. Roles receive grants. Workers receive temporary scope.
Work is not authority.
Silence costs zero model calls.
Operational data is not memory.
Only verified outcomes teach the company.
Competition of ideas; cooperation in execution.
Browser is a last resort.
Business capability providers are replaceable. Cognitive model law is Sol-only. PrincipalPolicy and branch orchestration stay in the kernel.
```

<p align="center">
  <sub>XanxitoSpA is an independent project. Xanxittoo is used as its development harness, not modified as part of this repository.</sub>
</p>
