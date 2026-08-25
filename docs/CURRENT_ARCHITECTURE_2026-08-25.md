# XanxitoSpA — Current architecture state (2026-08-25)

This document is the concise source of truth for the architecture that is implemented today. Historical runtime notes remain useful as evolution records, but this file describes the current composition.

## Core thesis

XanxitoSpA models a company rather than a single agent. The runtime separates perception, attention, authority and execution so that an autonomous company can discover how an existing business works, maintain durable objectives while sleeping, wake when evidence warrants attention, and still fail closed when authority is absent.

The current top-level flow is:

```text
existing or new company
        ↓
discover systems and evidence
        ↓
infer facts / capabilities / unknowns
        ↓
ask evidence-driven questions
        ↓
readiness by scope
        ↓
verified constitutional / owner mandates
        ↓
organization + durable objectives
        ↓
continuous connector polling
        ↓
subscription + urgency
        ↓
wake proposal
        ↓
Work + adjudication
        ↓
kernel execution + verification
        ↓
outcome / receipt / learning / sleep
```

![Current Company OS architecture](../assets/diagrams/company-os-current.svg)

## 1. Company discovery

`GenericDiscoveryOrchestrator` adopts an existing company without assuming an industry-specific organization chart.

Discovery separates:

- `BusinessEvidence`: what was actually observed and where it came from;
- `BusinessFact`: observed, inferred or cryptographically owner-confirmed statements;
- `BusinessUnknown`: unresolved questions with explicit resolution requirements;
- `BusinessCapability`: business functions/capabilities inferred from evidence;
- `DiscoveryRevision`: immutable revision lineage with deterministic fingerprinting.

The important invariant is:

```text
capability ≠ department
```

The system discovers business capabilities first. Departments are a later organizational projection that preserves observed ownership/process structure before proposing missing coverage.

## 2. One connector, two modes

`BusinessSystemConnector` is the single external-system abstraction:

```ts
interface BusinessSystemConnector {
  id: string
  describe(): Promise<DiscoveredBusinessSystem>
  poll(cursor: SignalCursor): Promise<SignalPollResult>
}
```

`describe()` reads the shape of a system for discovery. `poll()` reads ongoing business events. This prevents discovery adapters and signal adapters from drifting into separate registries.

`CsvSignalSource` is the deterministic no-network reference implementation used to test replay, cursoring, wake logic and thresholds.

## 3. Readiness is scoped, not global

XanxitoSpA does not attempt to reach a fictional state where it understands an entire company forever. Discovery readiness is evaluated by scope, currently including:

- governance;
- commercial;
- finance;
- operations;
- organization.

A scope reports whether evidence is sufficient, which unknowns block it, and a confidence signal. This allows one process/domain to become operable while unrelated areas remain under discovery.

System existence never proves truth or authority. Detecting a ledger, for example, supplies candidate evidence and can lower question priority, but the question “is this the trusted and current financial source of truth?” remains open until the required confirmation exists.

## 4. Resolution requirements

`BusinessUnknown` carries one of four trust requirements:

```text
evidence
operator-confirmation
owner-confirmation
constitutional-mandate
```

Only `evidence` unknowns may close from system observation alone. Ordinary `xspa.write` access cannot create owner-confirmed facts or resolve owner/constitutional unknowns.

## 5. Verified owner / Founder authority

Authentication and constitutional authority are intentionally different systems:

```text
OAuth identity ≠ company ownership
xspa.write ≠ owner authority
```

The current authority root uses server-configured public-key trust anchors for Founder/Owner/Board principals. Private signing keys are never accepted through the ordinary MCP surface.

A signed `authority.mandate.1` envelope binds:

- company;
- issuer principal;
- subject;
- effect (`assert`, `delegate`, `revoke`);
- scopes;
- claims;
- constraints;
- issued/not-before/expiry timestamps;
- supersession/revocation references;
- canonical payload hash;
- Ed25519 signature and key id.

Verification fails closed on company mismatch, untrusted issuer, invalid signature/hash, invalid time window, insufficient scope, revocation or supersession.

Delegation is itself signed and scoped. A delegated public key becomes trusted only for the scopes granted by an active owner/root mandate; revoking or superseding that delegation removes derived authority without rewriting history.

Owner/constitutional discovery questions may be resolved only when an active verified mandate carries the corresponding scope. Resulting evidence retains `mandate:<id>` provenance.

### Production enrollment state

The mandate machinery is deployed, but the first real trust root is intentionally provisioned out of band through `XSPA_AUTHORITY_TRUST_ANCHORS_JSON`. When no real root is enrolled, production reports `trustConfigured=false` and applies no owner authority. This is a safety property, not an error fallback.

## 6. Perception and governed wake

The constitution projects durable objectives, signal sources and `AgentSubscription`s. Subscriptions match business events and calculate urgency using the first two DAWN-style components implemented in V1:

- opportunity cost of inaction;
- pressure from the optimal action window.

Below threshold, signal pressure accumulates durably and the company keeps sleeping. Above threshold, the runtime emits a `WakeWorkProposal`.

```text
wake ≠ Work
wake ≠ authority
```

Replay protection uses durable event/subscription accounting plus bounded defensive caching. Heartbeat cursor/fencing remains the timing boundary rather than introducing a second scheduler.

## 7. Execution boundary

A wake proposal still cannot execute material work. The execution path remains:

```text
WakeWorkProposal
      ↓
Work
      ↓
Business Preflight
      ↓
authority + budget + risk adjudication
      ↓
mission graph / delegation
      ↓
capability execution
      ↓
verification
      ↓
BusinessOutcome + BusinessReceipt
```

Core invariants:

```text
observation ≠ truth
truth confirmation ≠ execution authority
wake ≠ authority
Work ≠ authority
mandate ≠ unlimited permission
```

## 8. MCP control surface

The remote ChatGPT MCP app now exposes the generic Company OS, discovery/wake and authority surfaces. Relevant current tools include:

```text
xspa_company_discovery_plan
xspa_company_discovery_apply
xspa_company_discovery_status
xspa_company_discovery_orchestrate

xspa_authority_mandate_verify
xspa_authority_mandate_apply
xspa_authority_mandate_status

xspa_company_wake_evaluate
xspa_company_wake_status

xspa_company_plan
xspa_company_apply
xspa_company_status
```

One deployment remains scoped to one Company. Callers cannot supply `company_id` to switch tenants.

## 9. External benchmark evidence

The external paired benchmark is maintained separately so its preregistration/history are independently inspectable:

- Public repository: <https://github.com/riquelmechile/xspa-theagentcompany-benchmark>
- v3: capability-neutral comparison;
- v4: execution-integrity discovery campaign;
- v5: prospectively preregistered replication.

The primary v5 prospective analysis (rep2 + rep3, scenario-blocked) is 8 XSPA wins, 0 DIRECT wins and 12 ties, exact two-sided sign-test `p = 0.0078125`. The pooled 60-pair result is descriptive rather than the primary inferential result.

The stated limitation remains that DIRECT was not specifically prompted for resilience. The benchmark therefore supports the narrower claim that the XanxitoSpA kernel preserves execution integrity under the tested faults where direct execution did not, not that DIRECT represents the strongest possible resilience prompt.

## 10. Current verified repository state

At commit `cce3fce` the owner-authority block passed:

```text
TypeScript typecheck                 PASS
Unit/integration suite               88 PASS
Local PostgreSQL integration         1 skipped by local environment
Company Gym                          PASS
MCP Streamable HTTP smoke            PASS
ChatGPT app MCP smoke                PASS
OAuth resource-server smoke          PASS
PostgreSQL 18 CI smoke               PASS
4R review                            #381 approved
Exact-head GitHub Actions CI          PASS
```

The next architectural block is the secure first-root enrollment ceremony: establish a real Founder/Owner public-key trust anchor without allowing ordinary `xspa.write` callers to create or replace the authority root.
