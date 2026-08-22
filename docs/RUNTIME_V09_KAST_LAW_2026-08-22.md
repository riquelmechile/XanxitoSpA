# XanxitoSpA V0.9 — KAST Law

## Status

Four-lens review APPROVED. Public CI PASS. Released as v0.9.0.

## Why V0.9 exists

V0.8 introduced useful KAST persistence, deduplication and session-close receipts, but the architecture centered too much on backlog/maintainer workflow. The intended Xanxito-style harness is simpler: GPT should be able to invoke one direct self-improvement primitive just as it invokes SDD/TDD/RDD.

## KAST

**KAST = Kernel Adaptation & Self-Tuning.**

```text
experience
  ↓
KAST reflection
  ├─ NOOP
  ├─ REMEMBER → Engram
  └─ IMPROVE
       ↓
   restore Engram
       ↓
  A/B blind variants
  Sol/xhigh in parallel
       ↓
  verify / regression evidence
       ↓
  Sol/max owner adjudication
       ↓
  SDD + TDD + RDD gate
       ↓
  adopt / reject
       ↓
      Engram
```

## Seven harness laws

1. **Model Law** — Executive uses GPT-5.6 Sol/max; subordinate reasoning uses the same Sol/xhigh; no cognitive-model fallback.
2. **Preflight Law** — material work is classified before execution.
3. **SDD Law** — durable ambiguity is specified before implementation.
4. **TDD Law** — behavior changes need executable regression evidence.
5. **RDD Law** — review depth scales with risk and blocking findings prevent adoption.
6. **KAST Law** — harness friction/errors/opportunities may trigger verified self-improvement.
7. **Memory Law** — restore/checkpoint/Engram/handoff preserve durable knowledge without raw transcript dumping.

## KAST is not a database feature

`KastEngine` depends on an `EngramMemoryPort`, model-policy guards, proposal/verification/adjudication ports and an optional governed adoption port. It does **not** depend on PostgreSQL or `KastStore`.

The V0.8 tables (`kast_entries`, `kast_occurrences`, `session_close_receipts`) remain useful for audit/telemetry and compatibility, but deleting/disabling that persistence does not disable KAST Law.

## Bounded self-improvement

Default improvement experiment:

- 2 blind variants;
- maximum 4 variants;
- proposers use Sol/xhigh;
- verifiers use Sol/xhigh;
- Executive owner uses Sol/max;
- variants are isolated from one another;
- no worker spawns another worker;
- no direct mutation of `main`.

## Evidence gate

A selected variant is adoptable only when all of the following are true:

- isolated change reference exists;
- no direct-main mutation occurred;
- SDD is complete;
- regression/TDD refs exist;
- RDD review is approved;
- four review-lens refs exist;
- verification evidence exists;
- no blocking finding remains.

The `AdoptionPort` is the only place that may apply a verified candidate. Successful adoption must return an exact immutable adoption reference.

## Constitutional core

KAST cannot auto-adopt changes to:

- Model Law;
- Constitution;
- authority root;
- secret isolation;
- KAST Law itself;
- review law;
- memory law;
- human-reserved boundaries.

A trigger that touches those surfaces returns `founder-required` before variant generation.

## Engram

KAST queries Engram before improvement. Successful and failed experiments both write distilled results back to Engram. Failed hypotheses remain valuable because they prevent blind repetition.

Raw conversations, private keys, bearer tokens, passwords and API secrets are forbidden in KAST triggers, variant descriptions and memory records.

## Relationship to business learning

```text
BusinessOutcome → CorporateGene
                    improves company behavior

Harness experience → KAST
                    improves XanxitoSpA itself
```

These loops remain separate.
