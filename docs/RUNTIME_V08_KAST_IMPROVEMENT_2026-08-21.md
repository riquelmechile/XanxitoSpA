# XanxitoSpA v0.8 — KAST Harness Improvement Loop

Status: released / review approved / public CI green

## Thesis

XanxitoSpA now has two independent learning loops:

```text
BUSINESS LEARNING
verified BusinessOutcome → fitness → CorporateGene

HARNESS IMPROVEMENT
session/trace → KAST → triage/dedupe → improvement Work → governed maintainer flow → verified closure
```

The separation is constitutional. Runtime bugs, missing capabilities, developer friction and repeated workarounds must never be promoted into business genes.

## KAST

KAST means **Kernel Anomalies, Suggestions & Tasks**.

Each KAST entry carries sanitized reproduction/evidence, affected paths/capabilities, recurrence, recommendation and verification plan. Entries are deduplicated by canonical SHA-256 fingerprint and retain their occurrence/session evidence.

Default promotion policy:

- critical/security: immediate;
- high: 2 occurrences;
- medium: 3;
- low: 4.

Promotion creates ordinary `Work` owned by `harness-maintenance`; it never edits code or policy directly.

## Session Close Law

Every meaningful harness session must emit a `SessionCloseReceipt` before it is considered complete.

The close receipt separates destinations:

- PostgreSQL / Business Event Ledger: operational truth;
- Engram candidates: durable sanitized institutional summaries;
- artifacts/traces: large evidence;
- business memory candidates: company learning;
- KAST: harness learning;
- unresolved Work: incomplete business/harness commitments;
- next-session hints: continuation state.

Raw conversations and raw secrets are forbidden in both KAST observations and session close receipts.

## Safe maintainer handoff

`HarnessImprovementHandoff` is intentionally narrow. It carries only sanitized issue metadata and evidence references and declares:

```text
mayReadRawConversation = false
mayReadRawSecrets      = false
maySelfModify          = false
requiredFlow           = preflight-review-verify
```

This allows Xanxittoo or another maintainer harness to consume the backlog without granting it hidden authority or exposing user conversations.

## Database

Migration `0004_kast_improvement.sql` adds:

- `session_close_receipts`;
- `kast_entries`;
- `kast_occurrences`;
- company-scoped RLS and uniqueness constraints.

Engram remains a memory surface, not the operational source of truth.

## Verified closure

A KAST entry may become `verified` only when both are recorded:

- regression guard refs;
- verification evidence refs.

This prevents “fixed” from meaning merely “someone changed code.”
