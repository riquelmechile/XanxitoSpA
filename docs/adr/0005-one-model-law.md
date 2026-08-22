# ADR-0005 — One Model Law: Sol/max executive, Sol/xhigh branches

Status: **accepted**
Date: 2026-08-21

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

The active V1 creative model policy is OpenAI-only under the same account/connection family.

### Images

`gpt-5.6-sol` can invoke the built-in `image_generation` tool in the Responses API. From XanxitoSpA's perspective the branch remains GPT-5.6 Sol/xhigh or Executive Sol/max; image rendering is a tool call, not a second principal. The current specialized image backend is GPT Image 2, but the Company Manifest does not need to select or reason as that model.

### Vector/documents/code-derived design

SVG, diagrams, document structure, HTML/CSS and other deterministic design artifacts remain GPT-authored code/content plus deterministic renderers.

### Video

Final video generation is **staged/unavailable in V1**. GPT-5.6 Sol does not currently expose a stable native video-generation tool. OpenAI's current `/v1/videos` models (`sora-2`, `sora-2-pro`) are Legacy/Deprecated as of this decision, so V1 does not make them a kernel dependency.

GPT may still create video briefs, scripts, shot lists, storyboards and image keyframes. Final rendering becomes enabled only after a stable supported OpenAI video tool passes the Company Gym and cost/quality evaluation.

## Why not provider-managed Multi-agent beta?

It could be useful as an execution optimization later, but adopting it today would move branch ownership outside the Company Kernel. XanxitoSpA must decide when to DIRECT, FAN-OUT, COMPETE, COLLABORATE, CHALLENGE or DEBATE. The provider executes bounded requests; it does not own the organizational graph.

## What remains replaceable

This ADR does **not** remove provider-neutral business capabilities. Email, calendar, phone, databases, payments, CAD engines, hosting and MCP servers remain adapters behind semantic capabilities.

The restriction applies to **cognitive/generative model providers**, not ordinary enterprise tools.

## Evidence basis — August 2026

Official OpenAI documentation confirms:

- `gpt-5.6-sol` supports reasoning efforts through `max`;
- the Responses API is the recommended interface for reasoning/tool workflows;
- GPT-5.6 Sol supports the built-in Image generation tool;
- GPT Image 2 is the current state-of-the-art OpenAI image model;
- GPT-5.6 has a Multi-agent beta, intentionally disabled by this ADR;
- GPT-5.6 Sol itself has no video output;
- current OpenAI video endpoints use Sora 2 / Sora 2 Pro, both marked Legacy/Deprecated.

This ADR must be re-evaluated when OpenAI exposes a stable non-legacy video-generation tool or when Company Gym evidence proves a different compute hierarchy is materially better.
