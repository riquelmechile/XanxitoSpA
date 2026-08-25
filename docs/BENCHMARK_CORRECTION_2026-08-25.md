# Benchmark interpretation correction — 2026-08-25

The public TheAgentCompany evidence was re-audited after V5 publication. The audit found that several v4/v5 DIRECT and XANXITOSPA paths do not share exactly the same mutation/recovery sequence or oracle, and two historical DIRECT cases effectively encode the failing integrity result. Because those branches are deterministic, repeated identical 8/0/12 outputs are reproducibility checks, not statistically independent replications.

Accordingly, XanxitoSpA withdraws the former interpretation of `p = 0.0078125` as prospective statistical confirmation of an architectural effect. The preregistration, raw outputs and commit chronology remain untouched because they are evidence of what was actually done. The p-values remain in historical artifacts as preregistered calculations, not as current evidential strength.

V6 fixes the comparison contract rather than deleting inconvenient history:

- competent DIRECT with bounded retry and read/probe-before-retry;
- identical action plan, external mutation intent, fault injection and oracle across arms;
- no literal outcome flags or arm-specific integrity formulas;
- PostgreSQL durable store for crash/takeover/fencing claims;
- exact clean SUT commit and lockfile hash pinned in every result;
- deterministic scenario measurements as the primary output, without a sampling p-value;
- a separate future model-in-the-loop adversarial governance experiment for the mechanism that Company OS uniquely adds.

V3 is likewise described as “no directional difference detected in this sample”, not proof of capability equivalence. A future equivalence claim requires a preregistered margin and adequate paired power.
