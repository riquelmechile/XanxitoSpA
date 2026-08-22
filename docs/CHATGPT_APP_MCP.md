# XanxitoSpA as a ChatGPT MCP app

## Decision

The primary human control surface for XanxitoSpA V1 is a **remote MCP app used from ChatGPT**. CLI scripts and the Fastify demo API remain development/operations surfaces; they are not the intended user interface.

V1 uses a **tool-only MCP app**. No widget is required to operate the company. A visual control plane can be added later without changing the business tools.

## Endpoint

The production process is:

```text
pnpm run mcp:app:start
```

It serves:

```text
POST /mcp       Streamable HTTP MCP
GET  /health    deployment health
```

The service binds to Railway's `PORT` variable and is designed to run behind Railway HTTPS.

## Tool surface

### `xspa_status`

Read-only. Returns only readiness and policy metadata:

- runtime version;
- One Model Law (`Sol/max` Executive, `Sol/xhigh` branches, no fallback);
- MCP readiness;
- database readiness;
- creative readiness;
- KAST readiness.

It never returns credentials or database connection data.

### `xspa_work_create`

Idempotent write. Creates one Company-scoped `Work` record before material execution. The caller supplies `work_id`, owner, objective and scope, but never `company_id`. Creating Work **does not grant authority or budget**; those remain separate kernel primitives. Reusing a Work identity with changed content fails closed as an idempotency conflict.

### `xspa_work_get`

Read-only. Reads one Work record from the deployment Company only. A Work ID from another Company resolves as `not-found`; the tool cannot select a tenant.

### `xspa_creative_submit`

Idempotent write. Queues a background Creative Mission.

The caller supplies mission/work identity and references to the brief/evidence, but **never `company_id`**. The deployment owns one Company scope through `XSPA_COMPANY_ID`.

The tool returns only queue/decision metadata. It does not return:

- Candidate A/B prompts;
- candidate image bytes/base64;
- losing candidate asset references;
- evaluator private traces.

### `xspa_creative_status`

Read-only. Returns queue/running/reconciliation/completed state. When completed, only the selected `CreativeDecisionReceipt` is exposed.

### `xspa_kast_reflect`

Idempotent write for the KAST Law:

```text
NOOP | REMEMBER | IMPROVE
```

`NOOP` ends immediately. `REMEMBER`/`IMPROVE` create governed work in the Company runtime. If an IMPROVE request declares a constitutional surface, the MCP tool returns `founder-required` and does not enqueue automatic self-modification.

KAST never accepts raw conversation or secrets through this surface.

### Company Skill Registry tools

`xspa_skills_list` returns Company-domain global catalog metadata, Company-local definitions and active installations for the deployment Company. `xspa_skills_search` separates executable installed matches from reusable catalog suggestions. Neither loads complete skill bodies. `xspa_skill_get` performs progressive disclosure for one **installed** Company skill; an uninstalled global catalog skill is not executable merely because it exists in the catalog. `xspa_skills_health` validates the shared definition registry.

### `xspa_skill_install`

Idempotent Company write that installs one active reusable `company`-domain skill returned by the planner/catalog. The installation is a Company-owned `skill-installation` asset. Installing procedural knowledge does **not** grant authority, budget, credentials or the underlying semantic capabilities; those still require their normal adapters/grants/bootstrap. Uninstalled catalog skills remain suggestions and `xspa_skill_get` refuses to treat them as executable.

### `xspa_company_skill_plan`

Read-only Company bootstrap/adoption planner. In `new` mode it selects the smallest reusable skill set that covers requested Company capabilities and emits explicit gaps/company-local creation candidates. In `existing` mode it maps observed processes first, reuses what already works, and preserves unmatched working processes as Company-local skill candidates rather than replacing them by default.

### `xspa_autoskill_propose`

Idempotent Company Business-Learning write. It creates one sanitized `company-skill-definition` CompanyAsset, one `skill-installation` CompanyAsset and one candidate `CorporateGene(type=skill)`. It does **not** mutate the shared catalog and does **not** invoke KAST. Replays with the same proposal identity are idempotent; changed payload under the same identity fails closed.

### `xspa_skill_global_promotion_propose`

Separate system-change boundary. It is available only for a Company-local SkillGene already marked `champion`; non-champion variants are rejected. A valid request creates a KAST `IMPROVE` proposal on the shared `skill` surface. The MCP tool never writes the global catalog directly.

## Company boundary

One deployed MCP service is bound to one Company:

```text
XSPA_COMPANY_ID=<uuid>
```

The MCP caller cannot select another Company. This avoids a tool-call argument becoming a tenant-switch primitive.

## Runtime variables

Required for durable company operations:

```text
XSPA_DATABASE_URL
XSPA_COMPANY_ID
```

Required for an authenticated ChatGPT MCP app:

```text
XSPA_PUBLIC_URL=https://<public-domain>
XSPA_OAUTH_ISSUER=https://<authorization-server>
XSPA_OAUTH_JWKS_URL=https://<authorization-server>/<jwks>
XSPA_OAUTH_AUDIENCE=<resource audience; defaults to XSPA_PUBLIC_URL>
XSPA_OAUTH_READ_SCOPE=xspa.read        # optional override
XSPA_OAUTH_WRITE_SCOPE=xspa.write      # optional override
```

The MCP server acts as an OAuth 2.1 **resource server**. It publishes `/.well-known/oauth-protected-resource`, advertises per-tool `securitySchemes`, verifies JWT signature/issuer/audience/expiry through the IdP JWKS, and enforces read/write scopes. The authorization server itself should be an established IdP; it is intentionally not implemented inside XanxitoSpA.

`XSPA_MCP_INTERNAL_BEARER` exists only for loopback/internal smoke clients. It is **not** a ChatGPT authentication mechanism and the production entrypoint refuses to expose it on a non-loopback bind. Remote app mode requires OAuth.

Required only when native image rendering is enabled:

```text
OPENAI_API_KEY
```

The server never returns any of these values.

## Creative execution

If `OPENAI_API_KEY` is absent, creative image generation remains staged. There is no fallback to Gemini/Grok/Runway or to ChatGPT's visible image tool.

When configured, the creative worker uses:

```text
GPT-5.6 Sol/xhigh
  → Responses image_generation
  → internal CompanyAsset
  → VisualFitness
  → Creative Supervisor
  → selected receipt
```

The chat/app surface remains `decision-only`.

## ChatGPT authentication

ChatGPT authenticated MCP apps use OAuth 2.1. The resource server exposes:

```text
GET /.well-known/oauth-protected-resource
```

and protected tools declare:

```text
xspa_work_get         → xspa.read
xspa_work_create      → xspa.write
xspa_creative_status  → xspa.read
xspa_creative_submit  → xspa.write
xspa_kast_reflect     → xspa.write
```

`xspa_status` is intentionally public/noauth and contains only non-secret readiness metadata.

For missing/insufficient authorization, tool results include the MCP `mcp/www_authenticate` challenge so ChatGPT can initiate linking. The server verifies the resulting bearer access token locally against issuer/audience/JWKS and never trusts an unverified token.

Use an established OAuth provider that supports the MCP authorization requirements (authorization-code + PKCE/S256, appropriate client registration method, discovery metadata, resource/audience propagation, and refresh-token behavior when needed).

## ChatGPT setup

Once the service has a public HTTPS domain, use the MCP endpoint:

```text
https://<xanxitospa-domain>/mcp
```

In a ChatGPT workspace/account where custom MCP apps and Developer Mode are enabled:

1. Open **Settings / Workspace Settings → Apps → Create**.
2. Enter the XanxitoSpA MCP endpoint.
3. Select/configure OAuth and complete the authorization flow against the configured IdP.
4. Choose **Scan Tools**.
5. Confirm the six XanxitoSpA tools and their read/write annotations.
6. Create/enable the app.

Write/modify MCP actions are subject to the ChatGPT plan/workspace controls in effect for that account.

## Validation

```text
pnpm run mcp:app:smoke
pnpm run mcp:app:oauth:smoke
```

The smoke test uses the official MCP SDK client/server path and verifies:

- bearer authentication;
- tool discovery;
- One Model Law visibility;
- Company-scoped Work create/get with no implicit authority or budget;
- background creative queue contract;
- no candidate-art leakage;
- sanitized creative status;
- KAST invocation;
- no auth-token leakage.

## Deployment

`railway.json` configures Railpack build, `pnpm run mcp:app:start`, `/health`, and restart policy. The MCP service is an **independent XanxitoSpA deployment**; it is not deployed inside or coupled to Xanxittoo.
