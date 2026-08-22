# ADR-0004 — External benchmarks are wind tunnels, not architecture

Status: Accepted
Date: 2026-08-21

## Context

XanxitoSpA is intentionally built around one cognitive principal policy in V1: `gpt-5.6-sol` with bounded internal composition (`DIRECT`, `FAN-OUT`, `COMPETE`, collaboration, challenge/debate). External benchmarks can be useful only if they measure this system without replacing its runtime or importing a second agent architecture.

TheAgentCompany 1.0.0 is useful because it exposes 175 consequential digital-work tasks and explicitly supports agents other than OpenHands. Its environment also uses a separate LLM for NPC coworkers and LLM-based evaluators. That environment LLM is part of the benchmark world, not part of the agent under test.

## Decision

TheAgentCompany is an **optional external evaluation harness**. It is not a dependency, provider, runtime, organizational model, or source of business policy for XanxitoSpA.

XanxitoSpA must enter the benchmark unchanged as the agent under test:

- PrincipalPolicy remains `gpt-5.6-sol` in V1.
- Mission Graph and Business Preflight remain XanxitoSpA-owned.
- `FAN-OUT` and `COMPETE` may be used internally when Preflight selects them.
- OpenHands is not required for the agent-under-test path.
- The benchmark environment/NPC/evaluator LLM is recorded separately and must never be counted as a XanxitoSpA worker or principal.
- No benchmark-specific capability may bypass authority, budgets, semantic capability routing, evidence, or reconciliation.

## Primary experiment

The most valuable external experiment is paired, not a single leaderboard score.

For the same benchmark version, task, environment state, environment LLM, XanxitoSpA commit and GPT principal:

### Arm A — DIRECT

`task -> GPT-5.6 Sol -> governed capabilities -> result`

Business Preflight is still applied, but competitive/parallel cognitive branching is disabled unless required for safety.

### Arm B — XANXITOSPA

`task -> Business Preflight -> DIRECT/FAN-OUT/COMPETE/... -> GPT-5.6 Sol branches -> owner adjudication -> governed capabilities -> result`

No other reasoning model is introduced. Branch diversity comes from strategy overlays, role scope and independent evidence processing, not from switching foundation models.

## Metrics

The official evaluator completion score remains the external task-quality authority. XanxitoSpA additionally records:

- task completion / evaluator score;
- model invocations and estimated model cost;
- capability/tool calls and external cost;
- wall-clock latency;
- failed/unknown/reconciled side effects;
- human intervention count;
- branch count and route selected;
- whether COMPETE changed the final decision;
- verified outcome/trace refs.

A higher benchmark score purchased with materially worse cost, latency or reliability is not automatically a better company policy. Results are interpreted as a Pareto comparison.

## Anti-Goodhart rules

1. Do not change the Company Constitution to improve a benchmark.
2. Do not add benchmark-only hidden tools to the production capability vocabulary.
3. Do not train/prompt on encrypted evaluator logic or task answers.
4. Do not claim that TheAgentCompany validates budgets, authority, asset ownership or Corporate Evolution; it primarily measures digital professional task execution.
5. Company Gym remains the invariant/security suite; TheAgentCompany remains external operational evidence.
6. Publish the exact commit, benchmark version, environment LLM and execution profile with every score.

## Value threshold

A full 175-task run is justified only after a representative pilot demonstrates that the adapter can execute XanxitoSpA itself without architecture substitution and that the resulting traces are comparable across DIRECT and XANXITOSPA profiles.

Before that point, status is `benchmark-ready`, not `benchmarked`.

## Consequences

This preserves the original product thesis: one GPT principal, bounded branching, evidence-driven adjudication and governed capabilities. The benchmark becomes a way to falsify or support that thesis rather than a framework we conform to.
