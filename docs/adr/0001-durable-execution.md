# ADR-0001 — Durable execution: DBOS before a larger custom workflow engine

Status: **accepted for staged adoption**
Date: 2026-08-21

## Context

XanxitoSpA V1.2 implemented PostgreSQL-backed leases, fencing, scheduler state, idempotency and orphan reconciliation directly. Those primitives are useful and tested, but durable workflow execution is not a unique product differentiator.

DBOS provides TypeScript durable workflows backed by PostgreSQL, checkpointed steps, exactly-once database transactions and incremental integration into an existing application. Temporal provides mature durable execution as a separate orchestration service/worker architecture.

Primary references:

- https://docs.dbos.dev/typescript/integrating-dbos
- https://docs.dbos.dev/typescript/tutorials/workflow-tutorial
- https://docs.dbos.dev/typescript/tutorials/transaction-tutorial
- https://temporal.io/

## Decision

**Do not build a general-purpose Temporal clone inside XanxitoSpA.**

1. The Company State, Business Event Ledger, Authority Grants, Budget Envelopes, Company Assets, Outcomes, Corporate Genes and their business invariants remain XanxitoSpA-owned domain state.
2. Existing V1.2 coordination code remains supported while the kernel stabilizes; deleting it immediately would mix a workflow-engine migration with business-kernel development.
3. **DBOS is the preferred candidate for the next durable workflow implementation**, because it matches the existing TypeScript + PostgreSQL architecture and supports incremental adoption.
4. The first migration target is Mission/Work execution and durable waits/retries, not business authority or economic state.
5. Temporal is retained as the scale-out alternative if future requirements need a separately operated orchestration plane, cross-language workers or operational characteristics that DBOS/PostgreSQL cannot meet.

## Migration gate

DBOS may replace custom coordination only after a spike proves all of the following against PostgreSQL 18:

- crash/restart resumes from the last committed business-safe step;
- transaction + checkpoint atomicity works with current Company RLS boundaries;
- external side effects preserve XanxitoSpA's `unknown → reconcile` rule rather than being blindly retried;
- Company isolation remains provable;
- OpenTelemetry and BusinessReceipt evidence remain intact;
- Company Gym does not lose an invariant.

Until that evidence exists, the README must say **"DBOS staged-adoption decision"**, not "DBOS runtime".

## Consequence

The project spends engineering time on what is unique — company constitution, authority, economics, competitive branching and organizational learning — while deliberately delegating generic durable workflow machinery when a proven library satisfies the invariants.
