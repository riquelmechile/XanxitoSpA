# ADR-0003 — Authority interoperability: internal grants first, AP2/VC projection seam

Status: **accepted**
Date: 2026-08-21

## Context

`AuthorityGrant` and `BudgetEnvelope` currently enforce authority inside XanxitoSpA. External commerce/payment ecosystems increasingly need portable cryptographic proof of delegated authority.

Google's Agent Payments Protocol (AP2) defines typed mandates that prove intent/authorization and bind payment execution to guardrails; W3C Verifiable Credentials provide a general credential envelope.

Primary reference:

- https://developers.googleblog.com/en/developers-guide-to-ai-agent-protocols/

## Decision

1. XanxitoSpA keeps `AuthorityGrant`/`BudgetEnvelope` as its canonical business-domain authorization state.
2. Add a future **AuthorityProof adapter seam** that can project a scoped grant into an externally verifiable proof such as a W3C VC/AP2 mandate and verify inbound proofs against Company policy.
3. Do **not** make AP2, ACP/UCP, x402 or any payment network a kernel dependency.
4. Do **not** claim AP2 compliance until a real payment adapter creates/verifies mandates and passes integration/e2e tests.
5. Payment execution remains reserved behind `payment.execute`, explicit authority, budget, beneficiary/category constraints, idempotency and reconciliation.

## Why

This preserves the unique Company authority model while giving it a clean interoperability path. Protocols can change without changing the constitution or the semantics of internal authority.
