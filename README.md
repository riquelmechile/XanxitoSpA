<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/hero-real-mobile.jpg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/hero-real.jpg" alt="XanxitoSpA — Generic Company OS with real raster Company Deck" width="100%" />
  </picture>
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
Version                  1.0.0
Runtime                  Node.js 24 + TypeScript strict
Authoritative store      PostgreSQL 18 contract + real adapter
Company Gym              123 / 123 PASS (local) + production-evidence meta guard
MCP                      provider bridge + ChatGPT app Streamable HTTP + OAuth
Observability            OpenTelemetry / GenAI schema 1.42.0, content off
External benchmark       TheAgentCompany adapter-ready; no score published
External provider secrets none committed
Durability direction      DBOS staged adoption (ADR-0001)
Model law                Sol/max executive · Sol/xhigh branches · no model fallback
Creative model policy     OpenAI-only V1 · native image tool · video staged
Release state             candidate · local gates PASS · review/CI pending
```

---

<a id="the-company-deck"></a>
## The Company Deck

Stable functions are not disposable prompt personas. They are durable scopes with their own KPIs, authority, memory, processes and capability grants. Workers beneath them are temporary.

<p align="center">
  <picture>
    <source media="(max-width: 700px)" srcset="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/company-deck-real-mobile.jpg" />
    <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/company-deck-real.jpg" alt="The Company Deck — eight raster XanxitoSpA business-function identities" width="100%" />
  </picture>
</p>

The public GitHub deck now uses the committed **Raster Roster V1**: eight synthetic human visual identities rendered as real image assets, with Executive visually primary and every function carrying its own accent and archetype. [Character DNA v2](assets/characters/character-dna.json) remains the canonical art-direction and role-identity specification; [the raster roster](assets/characters/roster-v1/) is the public delivery layer. A face or card never grants authority, budget, credentials, employment status or runtime capability — those remain governed by Company OS contracts, Work, Delegation and explicit grants.

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

## Company OS planes

### Company Formation / Adoption

The primary product path is now explicit in the runtime: **Company intake → operating model → governed bootstrap/adoption**. The kernel does not infer an industry-specific org chart from vibes; the Executive supplies discovery evidence and proposed optional structure, while deterministic Company OS logic validates universal functional coverage, preserves existing sources of truth, integrates Skill/Capability requirements and produces a stable operating-model fingerprint.

```text
NEW COMPANY                         EXISTING COMPANY
purpose + business model            observed departments/processes/assets
objectives + constraints             evidence + current sources of truth
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
              xspa_company_plan
                       ↓
      business functions + departments
      processes + skills + capabilities
      asset/bootstrap requirements
                       ↓
              fingerprinted plan
                       ↓
              xspa_company_apply
                       ↓
        Company-owned operating model
                       ↓
       explicit xspa_work_create boundary
                       ↓
 Mission Graph / governed execution / outcomes
```

`NEW` mode establishes minimum coverage for Executive & Strategy, Commercial & Revenue, Finance, Operations, Customer, and Administration & Risk, then adds optional functions justified by the business. `EXISTING` mode maps observed departments and processes first, preserves them, and only fills uncovered functions; an unmatched process becomes a Company-local learning/skill candidate rather than being replaced automatically.

Applying an operating model **does not** provision providers, create Work, invoke KAST, grant authority, create budget, expose credentials or enable capabilities. It persists a Company-owned snapshot and returns a recommended bootstrap Work descriptor; external action remains behind the normal Work/Delegation/Capability guards. `xspa_company_status` reads the latest deployment-scoped operating model.

### Company Data Plane

Operational facts are not LLM memory.

```text
Company State          → current authoritative projection
Business Event Ledger  → what happened
Data Plane              → operational/application/analytics data
Institutional Memory   → distilled reusable knowledge
```


### Supporting harness layer: KAST

KAST is **not the Company OS** and is not part of ordinary Company formation, operation or Business Learning. It exists to improve the shared harness/runtime itself. KAST is now **Kernel Adaptation & Self-Tuning**: a direct GPT-controlled harness primitive, not a maintainer ticket queue. A meaningful session may end with a tiny reflection: `NOOP`, `REMEMBER`, or `IMPROVE`. `REMEMBER` stores a sanitized lesson in Engram. `IMPROVE` restores prior Engram context, generates two blind Sol/xhigh variants by default, verifies them, lets the Sol/max Executive owner adjudicate, and only adopts a winner after SDD + TDD/regression + RDD/four-lens evidence passes.

```text
experience → KAST → Engram
                  ├─ NOOP
                  ├─ REMEMBER
                  └─ IMPROVE → A/B Sol/xhigh → COMPETE → verify → Sol/max owner
                                              → SDD/TDD/RDD → adopt/reject → Engram
```

The constitutional core — Model Law, Constitution, authority root, secret isolation, KAST/review/memory laws and human-reserved boundaries — is never auto-adopted. Those changes return `founder-required`. V0.8 KAST tables and `SessionCloseReceipt` remain as optional audit/telemetry; **KAST Law itself runs without PostgreSQL**. V1.0 wires the law to a real MCP Engram/workflow adapter plus isolated Git worktrees: the actual diff determines touched surfaces, tests/review bind to an exact source commit, and `GitAdoptionPort` refuses a moved/dirty base or protected surface. See [`RUNTIME_V10_SELF_IMPROVEMENT_AND_CHARACTERS_2026-08-22.md`](docs/RUNTIME_V10_SELF_IMPROVEMENT_AND_CHARACTERS_2026-08-22.md).

### Company Skills + AutoSkills + Skill Registry

XanxitoSpA is a **generic Company OS**. The Skill Registry is therefore part of the Company runtime, not merely a KAST self-improvement feature. It supports both `NEW COMPANY` bootstrap and `EXISTING COMPANY` adoption while keeping the global catalog lightweight through progressive disclosure.

```text
GLOBAL COMPANY SKILL REGISTRY
(metadata only: identity/version/domain/triggers/scopes/capabilities/departments/risk)
                    ↓
NEW COMPANY                    EXISTING COMPANY
purpose + requirements         observed systems/processes
        ↓                              ↓
match reusable skills          map what already works
        ↓                              ↓
install + capability gaps      reuse + preserve unmatched processes
        └──────────────┬───────────────┘
                       ↓
              Company Skill Profile
                       ↓
            Work / Mission matching
                       ↓
              verified outcomes
                       ↓
          CorporateGene(type=skill)
 candidate → challenger → champion / silent / quarantine / retired
```

Global `skill.json` definitions are Company-agnostic and contain no Company outcome counters. A deployment installs skills through Company-owned `skill-installation` assets. Company-specific processes are stored as `company-skill-definition` assets and evolve through the existing `CorporateGene(type=skill)` fitness/evidence lifecycle. This avoids a second learning system.

`xspa_skill_install` applies reusable catalog choices as Company-owned installations without granting capabilities/authority. `xspa_autoskill_propose` creates a **Company-local** skill definition + installation + candidate SkillGene and does **not** invoke KAST. If a Company-local SkillGene later becomes a proven `champion` and appears reusable across Companies, `xspa_skill_global_promotion_propose` crosses the separate KAST boundary to propose a shared catalog change. KAST never governs ordinary Company learning.

Registry list/search remain metadata-only. `xspa_skill_get` loads one installed skill body after matching. Registry health fails closed on invalid definitions, duplicate active versions or missing file-backed bodies; trigger overlap is surfaced as a review warning. Skills describe execution procedures but never grant authority, budget, credentials or legal capacity.

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

OpenAI's current specialized image backend is treated as a renderer behind the tool — not a worker or principal. `OpenAIResponsesImageRenderer` stores raw image bytes only through an internal asset sink; base64 never enters the chat receipt. Concept branches, visual evaluators and the Creative Supervisor are all GPT-5.6 Sol/xhigh. Final video generation stays disabled in V1. See [`adr/0005-one-model-law.md`](docs/adr/0005-one-model-law.md).

---

## Company lifecycle

The same kernel can form a new company or adopt an existing one:

`BOOTSTRAP · OPERATE · IMPROVE · GROW · EXPAND · RECOVER · EXIT`

For an existing company, XanxitoSpA discovers state, systems, processes, assets, KPIs and authority **before** attempting to reorganize it.

For new businesses, competing theses can be evaluated before bootstrap and launch. New brands, channels, countries or business units can later be spawned as governed pilots; legal entities, debt and reserved actions remain Founder/Board boundaries.

---

<a id="run-it"></a>
## ChatGPT app / MCP control surface

XanxitoSpA V1 is operated primarily as a **remote MCP app from ChatGPT**. The human-facing app does not become the workflow engine: it submits governed company work and reads sanitized receipts while execution stays behind the runtime.

```text
ChatGPT app
    ↓ MCP
xspa_status
xspa_company_plan       → NEW/EXISTING Company intake + operating-model plan
xspa_company_apply      → persist Company-owned model (no Work/authority/budget)
xspa_company_status     → current deployment-scoped operating model
xspa_work_create        → explicit Company Work boundary
xspa_work_get           → Company-scoped Work lookup
xspa_skills_search/get  → installed Company procedural knowledge
xspa_creative_submit    → background CreativeMission
xspa_creative_status    → selected receipt only
xspa_kast_reflect       → supporting harness self-maintenance only
    ↓
XanxitoSpA runtime / Postgres / workers / Engram
```

One MCP deployment is scoped to one Company server-side; callers cannot switch `company_id`. Candidate prompts/images and losing creative assets stay internal. See [`CHATGPT_APP_MCP.md`](docs/CHATGPT_APP_MCP.md).

---

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
pnpm run character:check
pnpm run mcp:smoke
pnpm run mcp:app:smoke
pnpm run mcp:app:oauth:smoke
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
| [`RUNTIME_V11_COMPANY_OS_INTAKE_2026-08-22.md`](docs/RUNTIME_V11_COMPANY_OS_INTAKE_2026-08-22.md) | NEW/EXISTING Company intake, operating-model planning and governed apply/status path |
| [`RUNTIME_V10_SELF_IMPROVEMENT_AND_CHARACTERS_2026-08-22.md`](docs/RUNTIME_V10_SELF_IMPROVEMENT_AND_CHARACTERS_2026-08-22.md) | Real MCP/Engram + Git KAST runtime and GPT-only character production pipeline |
| [`RUNTIME_V1_ESTADO_2026-08-21.md`](docs/RUNTIME_V1_ESTADO_2026-08-21.md) | First executable kernel |
| [`RUNTIME_V12_DURABLE_2026-08-21.md`](docs/RUNTIME_V12_DURABLE_2026-08-21.md) | PostgreSQL, heartbeat, leases, providers, assets |
| [`RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md`](docs/RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md) | Secure semantic Capability Plane |
| [`RUNTIME_V15_ENTERPRISE_HARDENING_2026-08-21.md`](docs/RUNTIME_V15_ENTERPRISE_HARDENING_2026-08-21.md) | MCP trust, OTel, trace learning, external evidence and release hardening |
| [`CHATGPT_APP_MCP.md`](docs/CHATGPT_APP_MCP.md) | Primary ChatGPT remote-MCP control surface |
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
| [`skills/autoskill-creator/SKILL.md`](skills/autoskill-creator/SKILL.md) | Company-local AutoSkill creation backed by CompanyAsset + SkillGene learning |
| [`skills/company-bootstrap/SKILL.md`](skills/company-bootstrap/SKILL.md) | NEW/EXISTING Company bootstrap with skill mapping, reuse and gap creation |

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
