# External architecture review — resolution log

Date: 2026-08-21

This document records how XanxitoSpA handled an external review. It deliberately separates **verified findings** from attractive but unsupported claims.

| Review point | Decision | Resolution |
| --- | --- | --- |
| No LICENSE / CI / release | Adopt now | MIT license, GitHub Actions CI, first release after all gates pass. |
| Custom durability reinvents workflow machinery | Substantially valid | ADR-0001 selects DBOS for staged adoption; business ledger/authority/economics remain domain-owned. Temporal remains scale-out alternative. |
| Company Gym is not an external benchmark | Correct, with boundary | Keep Gym as invariant suite. TheAgentCompany remains an optional external wind tunnel, never architecture. Preferred experiment is paired `DIRECT` vs `XANXITOSPA` using the same GPT-5.6 Sol principal, task, environment and commit. |
| Quoted TheAgentCompany 30.3% comparison | Not accepted as sourced | Official paper used here reports 24% for its strongest original baseline; repo currently defines 175 tasks. We do not repeat an unsourced number. |
| Authority should interoperate with external standards | Valid direction | ADR-0003 keeps internal canonical grants and defines future AP2/W3C VC proof adapter seam; no false compliance claim. |
| No standard observability | Correct | OpenTelemetry traces added alongside Business Event Ledger, schema pinned to GenAI 1.42.0, content capture off by default. |
| Secret handling alone misses MCP tool poisoning | Correct | Explicit tool registration fingerprint, metadata quarantine, runtime descriptor-drift check, exact capability mapping, external-data provenance and existing least-privilege checks. |
| CorporateGene needs richer experience than score only | Correct | Sanitized structured execution-trace references can feed learning only after verified outcomes; secrets/raw conversations remain excluded. |
| "Providers replaceable" contradicts GPT principal | Wording/abstraction issue | ADR-0002: capability providers are replaceable; PrincipalPolicy is a separate constitutional policy and is intentionally pinned to GPT-5.6 Sol in V1. |
| Microsoft Agent Framework invalidates thesis | No | It validates production agent/workflow infrastructure as a competitive field, but XanxitoSpA differentiation is company constitution, economic authority, asset ownership, competitive branching and outcome-driven organizational learning. |

## TheAgentCompany boundary

The benchmark is retained only because its official docs explicitly permit agents/platforms other than OpenHands. XanxitoSpA remains the agent under test. The environment LLM used for NPC coworkers and LLM-based evaluators is recorded as benchmark infrastructure and is not counted as a XanxitoSpA principal, worker or branch.

The preferred external experiment is not simply "get the highest leaderboard score". It is:

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

This can falsify the core architecture: if bounded branching does not improve the Pareto result over direct execution with the same model, XanxitoSpA should reduce or retune its branching policy rather than optimize prompts for the benchmark.

See ADR-0004.

## Primary sources used

- TheAgentCompany: https://github.com/TheAgentCompany/TheAgentCompany and https://arxiv.org/abs/2412.14161
- DBOS TypeScript: https://docs.dbos.dev/typescript/integrating-dbos
- Temporal: https://temporal.io/
- OpenTelemetry GenAI semantic conventions: https://github.com/open-telemetry/semantic-conventions-genai
- AP2 overview: https://developers.googleblog.com/en/developers-guide-to-ai-agent-protocols/
- MCPTox: https://arxiv.org/abs/2508.14925
- Darwin Gödel Machine: https://arxiv.org/abs/2505.22954
- Meta-Harness: https://arxiv.org/abs/2603.28052
- Microsoft Agent Framework: https://github.com/microsoft/agent-framework

## Claim discipline

README states are classified as one of:

- **implemented** — code exists;
- **verified** — automated/local integration evidence exists;
- **benchmark-ready** — adapter/setup exists but official run is pending;
- **roadmap / staged adoption** — explicit future decision, not current capability.

That vocabulary is intended to prevent documentation from moving materially ahead of the runtime again.
