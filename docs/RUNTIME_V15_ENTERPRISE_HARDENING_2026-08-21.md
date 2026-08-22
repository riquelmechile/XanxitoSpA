# XanxitoSpA V1.5 — Enterprise hardening

Date: 2026-08-21
Status: **released; four-lens review APPROVED + public GitHub Actions CI PASS**

## Scope

V1.5 closes the gap between XanxitoSpA's architecture narrative and externally inspectable engineering evidence. It folds the V1.4 MCP Provider Bridge into a hardened runtime and adds observability, external benchmark readiness, richer learning evidence and public repository hygiene.

## Implemented

### MCP Provider Bridge

- `EnvironmentSecretResolver` — server-side environment-backed secret handles;
- semantic capability → explicit MCP tool mapping;
- official MCP SDK 1.30.0 Streamable HTTP client transport;
- real loopback client/server smoke test;
- local JSON Schema argument validation via AJV;
- HTTPS required for non-loopback Streamable HTTP;
- no blind fallback after an external write may have been sent.

### MCP trust / poisoning defense

- tool names/descriptions/schemas/annotations treated as untrusted external metadata;
- conservative metadata poisoning analysis;
- explicit Company/provider/tool approval;
- canonical SHA-256 descriptor fingerprint;
- rediscovery + fingerprint validation before every call;
- descriptor drift fails before side effect;
- semantic side-effect class remains kernel-owned;
- MCP result normalized as `external-data` with `instructionsTrusted=false`.

This is defense-in-depth, not a claim that static metadata analysis can prove an MCP server safe.

### PrincipalPolicy

The executive principal and capability providers are now separate concepts.

V1 is intentionally pinned:

```text
role                 executive-principal
mode                 pinned
model                gpt-5.6-sol
reasoning effort     max
model fallback       false
```

Capability providers remain replaceable. Changing the principal is a constitutional/evaluation decision rather than ProviderRegistry routing.

### Learning evidence

`CorporateGene` now retains `experienceRefs` to sanitized `ExecutionTraceSummary` artifacts.

A trace can influence institutional learning only when:

- the associated `BusinessOutcome` is verified;
- Company and Work identities match;
- the trace is explicitly sanitized;
- it contains no raw secrets;
- it contains no raw conversation transcript.

The trace explains execution; it does not replace outcome evidence or grant authority.

Migration `0003_learning_evidence.sql` persists `experience_refs` in PostgreSQL.

### OpenTelemetry

- optional provider-neutral `TelemetrySink`;
- OTLP/HTTP exporter when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is configured;
- no-op otherwise;
- GenAI semantic-convention schema pinned to `https://opentelemetry.io/schemas/gen-ai/1.42.0`;
- capability spans emitted alongside Business Events;
- `xanxitospa.content.capture=false` by default;
- prompt/tool bodies and secret material are not recorded by default.

### TheAgentCompany external benchmark seam

- benchmark adapter contract included;
- host readiness tool included;
- official evaluator remains scoring authority;
- no completion score published yet.

Local readiness at verification time:

```text
Docker daemon            PASS (29.7.2)
Free disk                PASS (50.7 GiB; benchmark documents 30+ GiB)
Evaluator LLM env        NOT CONFIGURED
Platform ready           true
Evaluator ready          false
Score published          false
```

### Durability decision

ADR-0001 selects **DBOS for staged evaluation/adoption** before investing further in generic custom workflow-engine machinery. Existing V1.2 coordination is retained until a DBOS spike proves crash recovery, RLS/company isolation, unknown→reconcile external-effect semantics and evidence parity.

Temporal remains a future scale-out alternative, not a current dependency.

### Authority interoperability

ADR-0003 defines a future AuthorityProof seam for AP2/W3C Verifiable Credential projections while keeping `AuthorityGrant` and `BudgetEnvelope` canonical inside XanxitoSpA. No AP2 compliance is claimed.

### Public engineering hygiene

- MIT license;
- `SECURITY.md`;
- GitHub Actions CI with PostgreSQL 18 service;
- Node 24 / pnpm 10.33;
- first release planned only after public CI + four-lens review.

### Design system skills

Project-local, without modifying Xanxittoo:

- `skills/svg-craft/SKILL.md`;
- `skills/character-art/SKILL.md`;
- `skills/design-competition/SKILL.md`.

`design-competition` applies `COMPETE` to creative work using blind candidates, one cross-critique and a named owner, with explicit `VisualFitness` dimensions rather than vibes-only voting.

## Local evidence

Fresh local evidence before review:

```text
visuals:check             PASS — 17 well-formed SVGs
TypeScript typecheck      PASS
Vitest                    PASS
Company Gym               66 / 66 PASS
Build                     PASS
MCP SDK loopback smoke    PASS
PostgreSQL 18 incremental PASS — 0003 applied
PostgreSQL 18 fresh       PASS — 0001 + 0002 + 0003
pnpm audit --prod         PASS — no known vulnerabilities
credential pattern scan   PASS — only explicit local test Bearer fixtures
Git diff whitespace check PASS
TheAgentCompany host      platform-ready; evaluator-not-configured; no score
```

## Claims deliberately not made

V1.5 does **not** claim:

- a completed TheAgentCompany score;
- that DBOS currently runs the runtime;
- AP2/x402/ACP/UCP compliance;
- that MCP metadata analysis makes arbitrary servers safe;
- replaceability of the V1 principal model through normal provider routing;
- production readiness for irreversible legal/financial actions.

Those distinctions are intentional release criteria, not missing marketing copy.
