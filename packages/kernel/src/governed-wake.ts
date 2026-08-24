import { createHash } from "node:crypto";
import type {
  AgentSubscription,
  BusinessEvent,
  CompanyAsset,
  CompanyConstitution,
  GovernedWakeResult,
  WakeAccumulatorState,
  WakeDecision,
  WakeWorkProposal,
} from "../../contracts/src/index.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  const variant = Number.parseInt(hex[16] ?? "0", 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function payloadObject(event: BusinessEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}


function validateSubscription(subscription: AgentSubscription): void {
  const policy = subscription.urgencyPolicy;
  if (!Number.isFinite(subscription.threshold) || subscription.threshold <= 0 || subscription.threshold > 1) throw new Error(`wake subscription threshold invalid:${subscription.id}`);
  if (!Number.isFinite(subscription.accumulationCap) || subscription.accumulationCap <= 0 || subscription.accumulationCap > 1 || subscription.accumulationCap < subscription.threshold) throw new Error(`wake subscription accumulation cap invalid:${subscription.id}`);
  if (!Number.isFinite(subscription.accumulationWindowSeconds) || subscription.accumulationWindowSeconds <= 0) throw new Error(`wake subscription accumulation window invalid:${subscription.id}`);
  if (!Number.isFinite(policy.opportunityCostWeight) || policy.opportunityCostWeight < 0 || !Number.isFinite(policy.actionWindowWeight) || policy.actionWindowWeight < 0 || policy.opportunityCostWeight + policy.actionWindowWeight <= 0) throw new Error(`wake subscription urgency weights invalid:${subscription.id}`);
  if (!Number.isFinite(policy.defaultOpportunityCost) || policy.defaultOpportunityCost < 0 || policy.defaultOpportunityCost > 1) throw new Error(`wake subscription default opportunity cost invalid:${subscription.id}`);
  if (!Number.isFinite(policy.defaultActionWindowMinutes) || policy.defaultActionWindowMinutes <= 0) throw new Error(`wake subscription action window invalid:${subscription.id}`);
}

function matches(subscription: AgentSubscription, event: BusinessEvent): boolean {
  const payload = payloadObject(event);
  const sourceId = typeof payload.sourceId === "string" ? payload.sourceId : undefined;
  if (sourceId && sourceId !== subscription.signalSourceId) return false;
  const topic = typeof payload.topic === "string" ? payload.topic : event.type;
  const capability = typeof payload.capability === "string" ? payload.capability : undefined;
  const topicMatch = subscription.match.topics.length === 0 || subscription.match.topics.includes(topic);
  const capabilityMatch = subscription.match.capabilityScopes.length === 0 || Boolean(capability && subscription.match.capabilityScopes.includes(capability));
  return topicMatch && capabilityMatch;
}

function eventUrgency(subscription: AgentSubscription, event: BusinessEvent, now: Date): number {
  const payload = payloadObject(event);
  const opportunityCost = typeof payload.opportunityCost === "number"
    ? clamp01(payload.opportunityCost)
    : clamp01(subscription.urgencyPolicy.defaultOpportunityCost);
  const actionWindowMinutes = typeof payload.actionWindowMinutes === "number" && payload.actionWindowMinutes > 0
    ? payload.actionWindowMinutes
    : subscription.urgencyPolicy.defaultActionWindowMinutes;
  const ageMinutes = typeof payload.ageMinutes === "number" && payload.ageMinutes >= 0
    ? payload.ageMinutes
    : Math.max(0, (now.getTime() - Date.parse(event.occurredAt)) / 60_000);
  const actionWindowPressure = actionWindowMinutes > 0 ? clamp01(ageMinutes / actionWindowMinutes) : 1;
  const opportunityWeight = Math.max(0, subscription.urgencyPolicy.opportunityCostWeight);
  const actionWindowWeight = Math.max(0, subscription.urgencyPolicy.actionWindowWeight);
  const totalWeight = opportunityWeight + actionWindowWeight;
  if (totalWeight === 0) return 0;
  return clamp01(((opportunityCost * opportunityWeight) + (actionWindowPressure * actionWindowWeight)) / totalWeight);
}

function resetIfExpired(state: WakeAccumulatorState, subscription: AgentSubscription, now: Date): WakeAccumulatorState {
  const elapsed = now.getTime() - Date.parse(state.windowStartedAt);
  if (elapsed <= subscription.accumulationWindowSeconds * 1000) return state;
  return { subscriptionId: subscription.id, windowStartedAt: now.toISOString(), score: 0, processedEventKeys: [], pendingEventIds: [], pendingEvidenceRefs: [] };
}

function initialState(subscription: AgentSubscription, now: Date): WakeAccumulatorState {
  return { subscriptionId: subscription.id, windowStartedAt: now.toISOString(), score: 0, processedEventKeys: [], pendingEventIds: [], pendingEvidenceRefs: [] };
}


function boundedKeys(keys: string[]): string[] {
  return keys.slice(-256);
}

function proposalFor(input: { companyId: string; subscription: AgentSubscription; eventIds: string[]; evidenceRefs: string[]; urgency: number; now: Date }): WakeWorkProposal {
  const evidenceRefs = [...new Set([...input.evidenceRefs, ...input.eventIds.map((eventId) => `signal-event:${eventId}`), `subscription:${input.subscription.id}`])];
  return {
    id: deterministicUuid(`${input.companyId}:${input.subscription.id}:${input.eventIds.join(":")}`),
    companyId: input.companyId,
    subscriptionId: input.subscription.id,
    targetDepartment: input.subscription.targetDepartment,
    targetRole: input.subscription.targetRole,
    owner: input.subscription.targetRole,
    objective: input.subscription.objective,
    scope: `wake-proposal:${input.subscription.targetDepartment}:${input.subscription.id}`,
    eventIds: input.eventIds,
    evidenceRefs,
    urgency: input.urgency,
    createdAt: input.now.toISOString(),
    grantsAuthority: false,
    grantsBudget: false,
    grantsCapabilities: false,
    executesWork: false,
  };
}

export class GovernedWakeEngine {
  evaluate(input: {
    companyId: string;
    constitution: CompanyConstitution;
    events: BusinessEvent[];
    priorState: WakeAccumulatorState[];
    now?: Date;
  }): GovernedWakeResult {
    const now = input.now ?? new Date();
    if (input.constitution.companyId !== input.companyId) throw new Error("company mismatch in wake constitution");
    if (input.events.some((event) => event.companyId !== input.companyId)) throw new Error("company mismatch in wake events");

    const stateBySubscription = new Map(input.priorState.map((state) => [state.subscriptionId, structuredClone(state)]));
    const decisions: WakeDecision[] = [];
    const proposals: WakeWorkProposal[] = [];

    for (const subscription of input.constitution.subscriptions) {
      validateSubscription(subscription);
      let state = resetIfExpired(stateBySubscription.get(subscription.id) ?? initialState(subscription, now), subscription, now);
      const matched = input.events.filter((event) => matches(subscription, event));
      if (matched.length === 0) {
        decisions.push({ subscriptionId: subscription.id, state: "sleep", urgency: 0, accumulatedUrgency: state.score, reason: "no matching event" });
        stateBySubscription.set(subscription.id, state);
        continue;
      }

      let emitted = false;
      for (const event of matched) {
        const eventKey = `${subscription.id}:${event.id}`;
        if (state.processedEventKeys.includes(eventKey)) {
          decisions.push({ subscriptionId: subscription.id, state: "sleep", eventId: event.id, urgency: 0, accumulatedUrgency: state.score, reason: "duplicate event suppressed" });
          continue;
        }
        const urgency = eventUrgency(subscription, event, now);
        const nextScore = Math.min(subscription.accumulationCap, state.score + urgency);
        const pendingEventIds = [...state.pendingEventIds, event.id];
        const pendingEvidenceRefs = [...new Set([...state.pendingEvidenceRefs, ...event.evidenceRefs])];
        state = { ...state, score: nextScore, processedEventKeys: boundedKeys([...state.processedEventKeys, eventKey]), pendingEventIds, pendingEvidenceRefs };
        if (nextScore >= subscription.threshold) {
          const proposal = proposalFor({ companyId: input.companyId, subscription, eventIds: pendingEventIds, evidenceRefs: pendingEvidenceRefs, urgency: nextScore, now });
          proposals.push(proposal);
          decisions.push({ subscriptionId: subscription.id, state: "wake", eventId: event.id, urgency, accumulatedUrgency: nextScore, reason: "wake threshold reached; proposal requires governed Work/authority path" });
          state = { ...state, score: 0, pendingEventIds: [], pendingEvidenceRefs: [] };
          emitted = true;
        } else {
          decisions.push({ subscriptionId: subscription.id, state: "accumulate", eventId: event.id, urgency, accumulatedUrgency: nextScore, reason: "below wake threshold; accumulated and remain asleep" });
        }
      }
      if (!emitted && matched.length > 0 && decisions.filter((decision) => decision.subscriptionId === subscription.id).every((decision) => decision.state === "sleep")) {
        stateBySubscription.set(subscription.id, state);
      } else {
        stateBySubscription.set(subscription.id, state);
      }
    }

    return {
      decisions,
      proposals,
      state: [...stateBySubscription.values()].sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId)),
      grantsAuthority: false,
      grantsBudget: false,
      grantsCapabilities: false,
      executesWork: false,
    };
  }
}


export function createWakeStateAsset(input: { companyId: string; evaluationId: string; state: WakeAccumulatorState[] }, now = new Date()): CompanyAsset {
  return {
    id: deterministicUuid(`wake-state:${input.companyId}`),
    companyId: input.companyId,
    kind: "company-wake-state",
    capability: "company.attention",
    department: "executive",
    cost: 0,
    currency: "N/A",
    status: "active",
    grantRefs: [],
    restrictions: ["attention-only", "no-authority", "no-auto-work"],
    metadata: { schemaVersion: 1, evaluationId: input.evaluationId, state: structuredClone(input.state) },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function wakeStateFromAsset(asset: CompanyAsset): WakeAccumulatorState[] {
  if (asset.kind !== "company-wake-state") throw new Error("not a company wake state asset");
  const state = asset.metadata.state;
  if (!Array.isArray(state)) throw new Error("company wake state asset missing state");
  return structuredClone(state as WakeAccumulatorState[]);
}

export function createWakeProposalAsset(proposal: WakeWorkProposal, evaluationId: string, now = new Date()): CompanyAsset {
  return {
    id: proposal.id,
    companyId: proposal.companyId,
    kind: "company-wake-proposal",
    capability: "company.attention.propose-work",
    department: proposal.targetDepartment,
    cost: 0,
    currency: "N/A",
    status: "active",
    grantRefs: [],
    restrictions: ["proposal-only", "requires-work-create", "requires-authority-adjudication"],
    metadata: { schemaVersion: 1, evaluationId, proposal: structuredClone(proposal) },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
