# XanxitoSpA V0.7 — Internal Creative Pipeline

Status: **locally verified / four-lens APPROVED / public CI pending**
Date: 2026-08-21

## Decision

Creative generation is internal company work, not chat rendering.

```text
chat / intent
   ↓
CreativeMission queued durably
   ↓
Creative Supervisor — GPT-5.6 Sol/xhigh
   ↓
COMPETE concept workers — GPT-5.6 Sol/xhigh
   ↓  blind + parallel
native image_generation render jobs
   ↓  bounded parallelism (default max 2)
CompanyAsset candidates — internal-candidate / not-chat-visible
   ↓
VisualFitness evaluators — GPT-5.6 Sol/xhigh
   ↓  bounded parallelism
Creative Supervisor adjudication
   ↓
selected CompanyAsset
   ↓
chat: decision receipt + selected asset ref only
```

Executive GPT-5.6 Sol/max participates only when the creative mission crosses an explicit authority/risk boundary or cannot reach the minimum successful candidate threshold.

## Why

Generating candidate images directly in the conversation makes the UI behave like a workflow engine, interrupts conversational continuity and discards the organizational parallelism that XanxitoSpA is designed to own. Candidate art, prompts, critiques and evaluation traces are company-internal evidence until adjudication.

## Runtime contracts

V0.7 adds:

- `CreativeMission`
- `CreativeStrategyCandidate`
- `CreativeRenderRecord`
- `VisualFitnessEvaluation`
- `CreativeDecision`
- `CreativeSubmissionReceipt`
- `CreativeDecisionReceipt`
- `submitCreativeMission()`
- `runCreativeMission()`

`submitCreativeMission()` writes a `creative.mission` `ScheduledJob` and returns immediately with `chatMode=decision-only`.

`runCreativeMission()` reuses existing `RuntimeStore`, `ScheduledJob` and `CompanyAsset` primitives. No Redis, Kafka or new workflow service is introduced.

## Parallelism

Defaults:

```text
concept workers       up to 4
image render jobs     up to 2
VisualFitness evals   up to 2
supervisor decision   1
Executive escalation  only when required
```

A failed render is isolated; it cannot cancel successful siblings and cannot be selected. If too few candidates survive, the mission escalates rather than pretending COMPETE succeeded.

## Chat boundary

Default chat-visible data:

```text
missionId
status
owner
selectedAssetRefs
rationaleSummary
escalationRequired
```

Not chat-visible by default:

```text
candidate prompts
candidate images
cross-critiques
raw evaluator traces
failed render internals
```

Candidates can be explicitly exposed later for a human review workflow, but that is a separate deliberate read surface.
