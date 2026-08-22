# ADR-0002 — Principal role is constitutional policy, not a capability provider

Status: **accepted**
Date: 2026-08-21

## Problem

The README previously said both "providers are replaceable" and "GPT is the principal". Without a sharper boundary this sounds like hidden vendor coupling.

## Decision

Separate two concepts:

### Principal Policy

The principal is the cognitive role that owns executive reasoning under the Company Constitution. Its model policy is explicit configuration/constitutional policy.

V1 policy is intentionally:

```text
role                 executive-principal
mode                 pinned
model                gpt-5.6-sol
reasoning effort     max
subordinate model    gpt-5.6-sol
subordinate effort   xhigh
max scope             executive only
secondary models     forbidden
provider multi-agent forbidden
branch orchestration XanxitoSpA Mission Graph
model fallback       false
```

This is a deliberate product law, not an accidental adapter dependency.

### Capability Providers

Email, data, phone, payment, search, databases, CAD engines, hosting, MCP servers and other external systems live behind semantic capabilities. Those business/tool providers remain replaceable/routable. V1 cognitive and generative model selection is intentionally stricter: GPT-5.6 Sol is the sole model family, with native image generation and no secondary model-provider routing.

Therefore the correct claim is:

> **Capability providers are replaceable. The principal model is explicit constitutional policy.**

If a future Company chooses a portable principal policy, that is a Company-level constitutional change with evaluation and approval, not a normal ProviderRegistry routing decision.
