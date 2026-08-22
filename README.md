<p align="center">
  <img src="https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/assets/brand/hero.svg" alt="XanxitoSpA — autonomous company harness" width="100%" />
</p>

<p align="center">
  <strong>A governed harness for forming, adopting, operating and evolving companies.</strong><br/>
  GPT is the principal. Business functions coordinate and compete. Verified outcomes teach the organization how to work better.
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
Version                  0.3.0
Runtime                  Node.js 24 + TypeScript strict
Authoritative store      PostgreSQL 18 contract + real adapter
Company Gym              51 / 51 PASS
Review                    reliability + resilience APPROVED
External provider secrets none committed
Current layer             Secure Capability Plane V1.3
Next increment            Generic MCP Provider Bridge V1.4
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

External models and services are **tools**, never principals. GPT remains the decision-making principal of the company.

### Secret boundary

Workers do not receive raw API keys or passwords. A `SecretHandle` identifies a scoped credential; only the trusted provider adapter can resolve material inside an ephemeral callback. Credential material is rejected if it appears in returned results, events or control catalogs.

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

GPT directs the creative task; specialist generation systems remain replaceable capability providers.

Semantic surfaces include:

```text
creative.image.generate
creative.vector.generate
creative.video.generate
creative.model3d.generate
creative.cad.generate
document.render
```

This lets a future provider registry choose the best available image/video/3D/CAD engine without changing the company kernel.

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
| [`VISUAL_SYSTEM.md`](docs/VISUAL_SYSTEM.md) | The Company Deck visual language |
| [`CHARACTER_ART_DIRECTION.md`](docs/CHARACTER_ART_DIRECTION.md) | Character DNA, raster+SVG pipeline and originality rules |
| [assets/characters/character-dna.json](assets/characters/character-dna.json) | Provider-neutral briefs/prompts for the 8 archetypes |
| [`skills/svg-craft/SKILL.md`](skills/svg-craft/SKILL.md) | Project-local SVG/card/mobile delivery skill |
| [`skills/character-art/SKILL.md`](skills/character-art/SKILL.md) | Project-local premium original character-art skill |

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
Providers are replaceable. Policy stays in the kernel.
```

<p align="center">
  <sub>XanxitoSpA is an independent project. Xanxittoo is used as its development harness, not modified as part of this repository.</sub>
</p>
