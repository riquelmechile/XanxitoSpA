# KAST — Kernel Adaptation & Self-Tuning

KAST is a harness law, not a ticket system.

Use it when GPT detects a bug, friction, repeated workaround, performance problem, test gap, or a concrete opportunity to improve XanxitoSpA itself.

## Law

`experience → reflection → Engram → improve? → parallel variants → COMPETE → SDD/TDD/RDD → adopt/reject → Engram`

### Modes

- `NOOP`: nothing durable is worth recording or changing.
- `REMEMBER`: preserve a sanitized harness lesson in Engram.
- `IMPROVE`: run a bounded self-improvement experiment.

## Model law

- Executive/owner: `gpt-5.6-sol` / `max`.
- Variant proposers: `gpt-5.6-sol` / `xhigh`.
- Verifiers/critics: `gpt-5.6-sol` / `xhigh`.
- No secondary cognitive model.
- XanxitoSpA owns branching; provider-managed multi-agent execution is forbidden.

## Improvement protocol

1. Restore relevant Engram knowledge before proposing a change.
2. Produce two blind variants by default; never exceed four.
3. Every variant must target an isolated change context. Never write directly to `main`.
4. Compare variants through evidence, not majority voting.
5. The Executive owner selects a candidate or rejects all.
6. A selected variant is not adoptable unless:
   - SDD is complete when the change is durable/ambiguous;
   - TDD/regression evidence exists;
   - RDD/four-lens review is approved;
   - verification evidence exists;
   - there are no blocking findings;
   - the candidate was produced in isolation.
7. Adoption occurs only through a governed `AdoptionPort` and must return an exact adoption reference (commit/change receipt).
8. Save the result—especially failed hypotheses—to Engram so future cycles do not blindly repeat them.

## Constitutional core

KAST may detect and recommend changes to these surfaces but may never auto-adopt them:

- Model Law
- Constitution
- authority root
- secret isolation
- KAST Law itself
- review law
- memory law
- human-reserved boundaries

These require an explicit Founder/Board upgrade.

## Memory law

Engram receives only distilled, sanitized harness knowledge and evidence references. Never store raw conversations, passwords, API keys, bearer tokens, private keys, or raw tool output that may contain secrets.

PostgreSQL KAST tables are optional audit/telemetry. KAST must remain operational if that persistence layer is absent.

## Parallelism

Parallelism is useful only for independent alternatives:

```text
same trigger + same prior Engram context
          │
      ┌───┴───┐
      ▼       ▼
 variant A  variant B
 Sol/xhigh  Sol/xhigh
    blind      blind
      │         │
      └────┬────┘
           ▼
       verification
           ▼
      Sol/max owner
           ▼
      adopt / reject
```

Do not create nested swarms. Workers do not spawn workers.

## Session reflection

At meaningful session close, ask only:

- What failed?
- What repeated?
- What workaround cost time?
- What capability or test was missing?
- What can be simplified?
- Is this worth NOOP, REMEMBER, or IMPROVE?

If the answer is `IMPROVE`, invoke KAST directly. Do not create a separate maintainer bureaucracy first.
