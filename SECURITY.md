# Security Policy

XanxitoSpA is pre-1.0 and should not be used for irreversible financial/legal actions without independent controls and deployment-specific review.

## Reporting

Please report suspected security issues privately through GitHub's **Security → Report a vulnerability** flow when available. Do not publish credentials, exploit payloads against third-party services, or real Company data in a public issue.

## Security invariants

The project treats the following as release-blocking boundaries:

- deny-by-default authority;
- Work does not grant authority;
- budget reservation before external spend;
- idempotency/fencing around external effects;
- raw secrets never enter worker context/results;
- Company isolation;
- MCP metadata/results are untrusted external data;
- mapped MCP descriptors require registration and drift validation;
- external writes with uncertain outcome reconcile instead of blind retry;
- only verified, sanitized evidence may become institutional learning.

See [`docs/MCP_SECURITY.md`](docs/MCP_SECURITY.md) for the MCP threat model.
