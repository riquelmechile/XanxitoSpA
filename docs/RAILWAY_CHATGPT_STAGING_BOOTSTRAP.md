# Railway staging connection bootstrap (2026-10-08)

The temporary `XSPA_PUBLIC_STATUS_ONLY=true` switch is **for connecting the ChatGPT MCP transport before an OAuth identity provider has been configured**. It is not a Workforce connection or a substitute for authentication.

- Remote binds refuse startup without a valid OAuth config unless this explicit flag is on.
- With the flag on, `tools/list` advertises **only** `xspa_status` and every other `tools/call` fails with `PUBLIC_STATUS_ONLY`, including unadvertised direct calls.
- Startup refuses status-only mode alongside a Company ID, authority roots or OAuth settings. The readiness metadata never contains secrets or Company records.
- Full business tools and `xspa_worker_register` remain unavailable until the service is restarted with `XSPA_PUBLIC_STATUS_ONLY` **unset**, complete OAuth 2.1 issuer/JWKS/audience configuration, Company binding and verified trust anchors.
- For the initial custom ChatGPT MCP plugin choose **No authentication** and name it `XanxitoSpA (conexión inicial)`. Do not describe this as a registered GPT worker.
- Once authenticated infrastructure is ready, update the existing plugin connection to OAuth and refresh tools. Do not loosen the OAuth checks to save clicks.
- `pnpm run mcp:public-status:smoke` verifies real modern MCP transport, public status tool availability, direct forbidden write failure, and rejection of unauthenticated unrestricted remote startup.
