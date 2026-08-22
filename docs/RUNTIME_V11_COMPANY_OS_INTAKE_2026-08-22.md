# XanxitoSpA V1.1 — Generic Company OS Intake

**Date:** 2026-08-22
**Status:** verified; exact-state four-lens review approved
**Change:** `xspa-company-os-intake-v1`

## Purpose

This increment recenters the runtime on XanxitoSpA's primary product thesis: **form, adopt, model and operate Companies**. KAST remains supporting harness self-maintenance and is not part of ordinary Company formation or Business Learning.

The missing bridge was between the canonical Company architecture and the already-implemented asset/skill bootstrap pieces. Before this increment, the runtime could plan infrastructure assets and Company skills, but the caller had to already know the Company departments and operating structure.

V1.1 adds a first-class Company intake and operating-model layer.

```text
NEW Company / EXISTING Company evidence
                ↓
        Company OS intake
                ↓
      operating-model plan
                ↓
functions · departments · processes
skills · semantic capabilities · assets
                ↓
fingerprinted Company-owned snapshot
                ↓
explicit Work boundary
                ↓
Mission Graph / governed execution
```

## Contracts

New Company OS contracts represent:

- the six universal core business functions;
- observed and proposed departments;
- proposed processes;
- `CompanyIntakeInput`;
- department/process blueprints;
- `CompanyOperatingModelPlan`;
- `CompanyOperatingModelSnapshot`;
- a recommended bootstrap Work descriptor.

The separation remains constitutional:

```text
PROCESS    = when / why the Company acts
SKILL      = how the Company solves the class of problem
CAPABILITY = with what authorized tool the Company acts
```

## NEW Company semantics

`mode=new` starts from founder/Executive input and optional proposed structure, then guarantees minimum functional coverage for:

- Executive & Strategy;
- Commercial & Revenue;
- Finance;
- Operations;
- Customer;
- Administration & Risk.

Additional functions/departments remain extensible and Company-specific.

The kernel does not invent an industry-specific business model from prose. GPT/Executive performs discovery/reasoning and supplies structured evidence/proposals; deterministic Company OS code validates and normalizes the resulting operating model.

## EXISTING Company semantics

`mode=existing` is deliberately preservation-first:

```text
observed departments/processes/assets
→ preserve + map current sources of truth
→ detect uncovered universal functions
→ add only missing coverage
→ map reusable skills where evidence supports it
→ unmatched working process remains Company-local candidate
```

Observed working processes are never marked for replacement simply because the shared Skill Registry has no match.

## Skill integration

The operating-model planner derives final departments and capability ownership, then feeds the existing Company Skill OS.

The skill planner now accepts explicit `capabilityDepartments` so a capability can map to the department that actually owns the function in an adopted Company rather than assuming canonical department names.

Company-local learning still uses `CorporateGene(type=skill)` and verified Business Outcomes. KAST is not invoked.

## Asset/bootstrap integration

Semantic `BootstrapRequirement` inputs are passed to the existing asset bootstrap planner.

Rules remain:

- reuse current Company assets before provisioning;
- never reuse another Company's asset;
- human/KYC/contract/financial boundaries remain explicit;
- planning does not execute a provider;
- applying the operating model does not provision infrastructure.

Random internal BootstrapStep UUIDs are deliberately excluded from the Company operating-model fingerprint. The same semantic intake + Company state therefore produces the same fingerprint.

## Durable Company-owned operating model

`xspa_company_apply` persists one `CompanyAsset(kind="company-operating-model")` snapshot.

The asset:

- belongs to the deployment Company;
- carries no credentials;
- has no grant refs;
- has zero cost;
- explicitly records no-authority/no-budget/no-capability restrictions;
- stores a plan fingerprint and structured snapshot;
- rejects secret-like material before persistence.

`formation_id` is the caller-visible durable idempotency identity; the persisted CompanyAsset receives a separate internal UUID so callers cannot control a globally unique asset primary key. Reusing the same formation ID with changed semantic content fails with `IDEMPOTENCY_CONFLICT`.

If the caller supplies `expected_fingerprint`, apply fails closed when Company state or the proposed plan drifted after preview.

## MCP surface

The ChatGPT app now exposes the primary Company OS path:

```text
xspa_company_plan
  read-only NEW/EXISTING Company operating-model planning

xspa_company_apply
  persist approved Company-owned operating model
  no Work, authority, budget, capability or KAST side effect

xspa_company_status
  latest deployment-scoped operating model
```

The deployment continues to bind `company_id` server-side. Callers cannot switch tenants through tool arguments.

`xspa_work_create` remains a separate explicit boundary. `company_apply` only returns a recommended Work descriptor.

## Company status

`xspa_status` now includes a first-class `companyOs` capability summary with:

- `NEW` and `EXISTING` intake modes;
- the full lifecycle vocabulary: `BOOTSTRAP`, `OPERATE`, `IMPROVE`, `GROW`, `EXPAND`, `RECOVER`, `EXIT`.

This keeps the public runtime identity centered on the Company OS rather than KAST.

## Verification evidence

At the point this document was created:

```text
focused Company OS kernel tests   4 / 4 PASS
TypeScript typecheck              PASS
Company Gym                       120 / 120 PASS
ChatGPT app MCP smoke             PASS
ChatGPT app OAuth smoke           PASS
```

Full test/build/PostgreSQL/registry/four-lens evidence is recorded during final SDD verification.
