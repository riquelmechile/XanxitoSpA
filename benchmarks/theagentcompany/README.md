# TheAgentCompany external benchmark adapter

XanxitoSpA treats TheAgentCompany as an **external wind tunnel**, not as architecture. The benchmark may test the company harness; it must never replace the company harness.

## Current status

- Adapter contract: **defined**.
- Host readiness check: **implemented**.
- Architecture dependency: **none**.
- Official 175-task run: **not yet executed**.
- Published score: **none**.

Do not convert `Company Gym 66/66` into a claim about workplace task completion. The two measurements answer different questions.

## Why keep it

The official benchmark provides 175 professional tasks in a simulated company environment and explicitly documents how platforms other than OpenHands can run an agent under test. Tasks interact with services such as GitLab, Plane, ownCloud and RocketChat and are graded by `/utils/eval.py` inside each task image.

The benchmark also uses a separate **environment LLM** for NPC coworkers and some LLM-based evaluators. That model belongs to the simulated environment. It is not a XanxitoSpA worker, branch or principal.

## Architecture preservation law

The agent under test remains XanxitoSpA:

```text
PrincipalPolicy = gpt-5.6-sol
        │
        ▼
Business Preflight
        │
        ├─ DIRECT
        ├─ FAN-OUT
        ├─ COMPETE
        ├─ COLLABORATE
        ├─ CHALLENGE / bounded DEBATE
        └─ ESCALATE
        │
        ▼
governed semantic capabilities
```

No additional reasoning model is introduced to improve a benchmark score. Strategy diversity comes from branch overlays and scoped roles, not model substitution.

## The useful experiment: same GPT, two execution profiles

A single leaderboard score cannot tell us whether XanxitoSpA's architecture adds value over the foundation model. The preferred experiment is paired.

### `DIRECT`

Same GPT-5.6 Sol principal, same task and same governed capabilities, with cognitive branching disabled except where required for safety.

### `XANXITOSPA`

Same GPT-5.6 Sol principal, but native Business Preflight may choose FAN-OUT, COMPETE, collaboration or bounded challenge/debate.

The two arms must share:

- benchmark version and task image;
- starting environment state;
- environment LLM configuration;
- XanxitoSpA commit SHA;
- GPT PrincipalPolicy;
- capability/authority policy.

Then compare official evaluator score **and** cost, latency, tool calls, reconciliation events, human interventions and branch count. That tests the original thesis: whether bounded organizational reasoning beats direct execution using the same model.

See [`docs/adr/0004-external-benchmarking.md`](../../docs/adr/0004-external-benchmarking.md).

## What it does not validate

TheAgentCompany is useful for digital professional execution. It does **not** by itself validate XanxitoSpA's:

- constitutional authority model;
- BudgetEnvelope semantics;
- asset ownership;
- multi-company isolation;
- progressive autonomy;
- Corporate Evolution correctness.

Those remain Company Gym/integration/production-outcome concerns.

## Readiness

```bash
pnpm run benchmark:theagentcompany:check
```

The check reports:

- Docker daemon availability;
- at least 30 GiB free disk, matching the benchmark's published prerequisite;
- whether the environment-LLM variables required by the official evaluator/NPC setup are configured.

The script does **not** download the benchmark, modify Docker permissions or invent a score.

## Full-run threshold

Do not spend days on all 175 tasks immediately. First run a representative pilot with both `DIRECT` and `XANXITOSPA` profiles. A full run is justified only if:

1. the adapter runs XanxitoSpA itself rather than OpenHands or another agent runtime;
2. both profiles are reproducible from the same initial state;
3. official evaluators grade real trajectories;
4. the comparison gives useful signal beyond the Company Gym.

Until then the public state is **benchmark-ready**, not **benchmarked**.
