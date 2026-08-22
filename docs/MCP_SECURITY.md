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
