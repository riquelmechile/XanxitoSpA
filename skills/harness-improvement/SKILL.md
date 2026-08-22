# Harness Improvement — Session Close + KAST

## Purpose

Turn operational friction, bugs and repeated workarounds into evidence-backed harness improvements without contaminating business learning or allowing uncontrolled self-modification.

## Core split

```text
Business Outcome → CorporateGene
= how the company learns to operate better

Session/Trace → KAST
= how the harness learns what should be improved
```

Never place a runtime bug, missing tool or developer workaround into a business `CorporateGene`.

## KAST

**KAST = Kernel Anomalies, Suggestions & Tasks.**

Categories include bugs, friction, missing capabilities, policy ambiguity, performance, security, repeated workarounds, test gaps, documentation drift, developer experience and recommendations.

Every observation must contain a sanitized summary, reproduction, affected paths/capabilities, evidence references, recommendation and verification plan. Raw conversation and raw secret material are forbidden.

## Mandatory session close

Every meaningful harness session must finish with `SessionCloseReceipt`.

Route information deliberately:

- operational facts → PostgreSQL / Business Event Ledger;
- durable institutional summaries → Engram candidate;
- large evidence → artifact/trace refs;
- company learning → Business Memory / CorporateGene path;
- harness defects/recommendations → KAST;
- unfinished business action → Work;
- continuation state → next-session hints.

Do not use Engram as the operational database. Do not dump transcripts into Engram.

## Deduplication and promotion

KAST fingerprints canonical issue identity from category + normalized title + affected paths/capabilities. Recurrence merges evidence rather than creating duplicate issues.

Default promotion policy:

- critical or security → immediate improvement Work;
- high → promote after 2 occurrences;
- medium → after 3;
- low → after 4.

Thresholds are defaults, not permission to bypass risk review.

## No self-modification

KAST may create **improvement Work**, never patches.

The maintainer harness must execute:

```text
KAST handoff
→ work_preflight
→ SDD/change workflow when required
→ implementation
→ tests
→ independent review
→ verification
→ mark KAST verified
```

A verified KAST item must retain both regression-guard refs and verification evidence.

## Maintainer handoff

Export only sanitized:

- ID / fingerprint;
- category/severity;
- summary;
- reproduction;
- affected paths/capabilities;
- evidence refs;
- recommendation;
- verification plan;
- recurrence and status.

The handoff contract explicitly forbids raw conversation, raw secrets and direct self-modification.
