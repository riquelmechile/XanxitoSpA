> **Superseded runtime note (2026-08-25):** any model-provider API/client references below are historical design evidence only. The current XanxitoSpA runtime is MCP-only: GPT runs exclusively in the ChatGPT host, with no model API key or model-provider HTTP client in XanxitoSpA.

# XanxitoSpA V0.6 — One Model Law

Date: 2026-08-21
Status: **released — local verification + four-lens APPROVED + public CI PASS**

## Decision

V1/V0.6 uses one cognitive model only.

```text
Executive principal       gpt-5.6-sol / max
Department supervisor     gpt-5.6-sol / xhigh
Worker                    gpt-5.6-sol / xhigh
Critic                    gpt-5.6-sol / xhigh
Verifier                  gpt-5.6-sol / xhigh
COMPETE branch            gpt-5.6-sol / xhigh
Secondary model provider  forbidden
Model fallback             forbidden
Provider-managed agents    forbidden
Branch owner               XanxitoSpA Mission Graph
```

`max` is reserved for the Executive. A subordinate escalates evidence instead of silently increasing compute tier.

## OpenAI-only generative flow

The active generative-model policy is OpenAI-only.

### Images

GPT-5.6 Sol uses the built-in Responses API `image_generation` tool. The current specialized OpenAI image backend is GPT Image 2; it is a renderer/tool, not a second principal.

### Vector / documents

GPT authors deterministic SVG/code/document structure and deterministic renderers produce the final artifact.

### Video

Final video rendering is staged/unavailable. GPT-5.6 Sol does not currently expose stable native video output/tool and the documented Sora 2 / Sora 2 Pro API models are Legacy/Deprecated. GPT may still create scripts, shot lists, storyboards and keyframes.

### 3D/CAD

Traditional CAD/3D engines may remain business tools. Introducing another generative model provider requires a new explicit architecture decision; it is not ordinary provider routing.

## Runtime guards

Implemented guards:

- `PrincipalPolicy` must be pinned;
- Executive must be `gpt-5.6-sol/max`;
- subordinate model must be `gpt-5.6-sol/xhigh`;
- secondary model providers denied;
- provider-managed multi-agent denied;
- Mission Graph remains branch owner;
- creative model family is OpenAI-only;
- image generation is `responses-image-generation`;
- legacy video is disabled;
- staged semantic capabilities fail before provider routing.

## Why provider Multi-agent beta is disabled

GPT-5.6 exposes a Multi-agent beta in Responses API. V1 intentionally does not use it because XanxitoSpA's thesis is that the Company Kernel decides DIRECT/FAN-OUT/COMPETE/COLLABORATE/CHALLENGE/DEBATE. OpenAI executes bounded model calls; it does not own the organizational graph.

## Evidence

Official OpenAI documentation checked for August 2026 confirms GPT-5.6 Sol, `max` effort, Responses API image generation support, GPT Image 2 as the current image model, and the current legacy state of Sora 2 / Sora 2 Pro video models.

Canonical ADR: `docs/adr/0005-one-model-law.md`.

## Verification status

```text
visuals:check  PASS
typecheck      PASS
unit tests     PASS
Company Gym   70/70 PASS
build          PASS
MCP smoke      PASS
PostgreSQL 18  PASS
pnpm audit     no known vulnerabilities
review #337    APPROVED (risk/readability/reliability/resilience)
```
