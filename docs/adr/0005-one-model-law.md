# ADR-0005 — One Model Law: Sol/max executive, Sol/xhigh branches

Status: **accepted, amended**
Date: 2026-08-21
Amended: 2026-08-25 — canonical runtime is MCP-hosted and model-provider API calls are forbidden

## Problem

XanxitoSpA was designed around one cognitive principal and bounded internal branching, but the Creative Plane and model policy still left room for a future implementation to drift into a multi-model swarm or provider-managed subagent architecture. GPT-5.6 also exposes a provider-side Multi-agent beta, while the product thesis requires Business Preflight, Mission Graph and COMPETE to remain company-owned orchestration.

## Decision

V1 uses one foundation model only:

```text
Executive principal     gpt-5.6-sol / max
Supervisor              gpt-5.6-sol / xhigh
Worker                  gpt-5.6-sol / xhigh
Critic                   gpt-5.6-sol / xhigh
Verifier                 gpt-5.6-sol / xhigh
COMPETE candidate        gpt-5.6-sol / xhigh
Model fallback           forbidden
Secondary model provider forbidden
Provider multi-agent     forbidden
Branch orchestration     XanxitoSpA Mission Graph
```

`max` is an executive resource. A subordinate cannot request it directly; when a branch needs an executive-level decision it returns evidence and escalates to the Executive rather than silently increasing its reasoning tier.

This is stricter than treating `max` as an automatic quality setting. It gives the hierarchy a measurable compute boundary and keeps the branch cost predictable.

## Creative execution

The canonical runtime is **MCP-only for cognitive/generative model control**. GPT-5.6 Sol runs in the ChatGPT host. XanxitoSpA exposes governed state, missions, evidence and actions through MCP; it does not call the OpenAI Responses API, does not call another model-provider API, and does not consume a model API key.

### Images

When the ChatGPT host exposes a native image-generation/editing tool, GPT may invoke it as a host capability while XanxitoSpA remains the governance/evidence substrate. The image backend is not selected, authenticated or called by XanxitoSpA itself. If the host does not expose an approved tool, rendering stays staged/fail-closed.

### Vector/documents/code-derived design

SVG, diagrams, document structure, HTML/CSS and other deterministic design artifacts remain GPT-authored code/content plus deterministic renderers.

### Video

Final video generation remains staged unless the ChatGPT host exposes an approved native tool. XanxitoSpA does not add a provider API client to compensate for a missing host capability. GPT may still create briefs, scripts, shot lists, storyboards and image keyframes.

### Legacy/experimental provider adapters

Provider-specific model API adapters may remain temporarily as historical/experimental source while being removed or migrated, but they are **not part of the canonical MCP runtime**. `apps/mcp` is guarded against importing them or referencing model API credentials/endpoints.

## Why not provider-managed Multi-agent beta?

It could be useful as an execution optimization later, but adopting it today would move branch ownership outside the Company Kernel. XanxitoSpA must decide when to DIRECT, FAN-OUT, COMPETE, COLLABORATE, CHALLENGE or DEBATE. The provider executes bounded requests; it does not own the organizational graph.

## What remains replaceable

This ADR does **not** remove provider-neutral business capabilities. Email, calendar, phone, databases, payments, CAD engines, hosting and MCP servers remain adapters behind semantic capabilities.

The restriction applies to **cognitive/generative model providers**, not ordinary enterprise tools.

## Architecture invariant

The Company Kernel never owns the model session. The ChatGPT host owns GPT execution; XanxitoSpA owns business governance, durable state, authority boundaries and MCP tools. This separation is intentional and testable: the canonical MCP source must contain no model-provider API key, endpoint or provider-specific model client import.
