# MCP security model

MCP is a capability transport, not a trust boundary.

## Threat model

External MCP servers can attempt to influence an agent through tool names, descriptions, schemas, defaults, examples, annotations or returned content. XanxitoSpA therefore treats every discovered tool descriptor and every tool result as **untrusted external data**.

The design is informed by public MCP poisoning research including MCPTox and later implicit/multi-tool poisoning work. Model obedience is not a security control.

## Registration workflow

An MCP tool may execute only when all of these hold:

1. the Company has an explicit semantic `capability → tool` mapping;
2. the tool is discovered under the expected provider;
3. metadata passes conservative poisoning analysis;
4. the Company/provider/tool descriptor has an explicitly approved SHA-256 registration fingerprint;
5. the descriptor rediscovered at execution time matches that fingerprint;
6. semantic side-effect policy is compatible with MCP annotations;
7. request payload passes the discovered JSON schema locally;
8. AuthorityGrant/BudgetEnvelope checks have already passed;
9. credentials remain scoped to the adapter callback;
10. remote Streamable HTTP uses TLS (loopback HTTP only for local development).

Any descriptor drift is a **pre-effect denial**, not an automatic re-registration.

## Metadata is not instruction

Tool descriptions are never used to grant authority, choose the semantic capability, change side-effect classification or override Company policy. Routing is based on the trusted semantic catalog and Company configuration.

## Returned content

Normalized tool output is wrapped with:

```text
trust = external-data
instructionsTrusted = false
```

A downstream reasoning worker may analyze that data for the Work it was given, but content embedded inside it cannot create a new Work, grant, budget or capability by itself.

## Failure semantics

- discovery/schema/trust failure before request send → safe failure; fallback may be allowed;
- external write may have been sent → state becomes unknown/reconciliation required; no blind fallback;
- descriptor drift → fail closed before side effect;
- suspicious metadata → quarantine/registration rejected.

## What this does not claim

Static metadata analysis cannot prove a server is safe. The stronger controls are explicit mapping, least privilege, fingerprint registration, runtime drift checks, side-effect semantics and trace-based evidence.


## OAuth identity is not constitutional authority

The ChatGPT-facing MCP app uses OAuth scopes such as `xspa.read` and `xspa.write` to authenticate callers and authorize transport-level tool access. Those scopes do **not** prove that the caller is a Company Founder, Owner, Board member or constitutional delegate.

```text
OAuth authentication ≠ Company ownership
xspa.write ≠ constitutional authority
```

Owner/constitutional authority is a separate fail-closed trust domain. XanxitoSpA verifies signed `authority.mandate.1` envelopes against public-key trust anchors configured outside ordinary MCP writes. A caller cannot submit a replacement trust root through `xspa_authority_mandate_verify` or `xspa_authority_mandate_apply`.

The mandate verifier checks company binding, canonical payload hash, Ed25519 signature, issuer trust/delegation chain, time window, requested scope, revocation and supersession. Only an active verified mandate may resolve `owner-confirmation` or `constitutional-mandate` discovery unknowns.

Private signing keys are never accepted by the ordinary MCP surface. `xspa_authority_mandate_status` exposes only sanitized mandate state and does not return trust-anchor key material.

When no Company root is configured, authority verification/application fails closed and status reports `trustConfigured=false`. The absence of a root is never repaired by falling back to OAuth identity or `xspa.write`.
