import { createHash } from "node:crypto";
import type { BusinessCapabilityCriticality, DiscoveryRevision, SignalCursor, SignalPollResult } from "../../contracts/src/index.js";
import { buildDiscoveryRevision } from "./company-discovery.js";

export interface DiscoveredSignalCapability {
  name: string;
  description: string;
  criticality: BusinessCapabilityCriticality;
  confidence: number;
}

export interface DiscoveredBusinessSystem {
  id: string;
  label: string;
  kind: string;
  confidence: number;
  signalCapabilities: DiscoveredSignalCapability[];
  signalPolling: "live" | "unavailable";
  grantsAuthority: false;
  grantsBudget: false;
  grantsCapabilities: false;
  executesWork: false;
}

/** Canonical business-system boundary: describe its shape once, poll its events continuously. */
export interface BusinessSystemConnector {
  readonly id: string;
  readonly capabilities: readonly string[];
  describe(): Promise<DiscoveredBusinessSystem>;
  poll(cursor: SignalCursor): Promise<SignalPollResult>;
}

export interface BusinessSystemManifest {
  id: string;
  label: string;
  kind: string;
  confidence: number;
  signalCapabilities: DiscoveredSignalCapability[];
}

export interface BusinessSystemPoller {
  poll(cursor: SignalCursor): Promise<SignalPollResult>;
}

function confidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("connector confidence invalid");
  return value;
}

function clean(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} required`);
  return result;
}

/** Neutral manifest connector. It can describe any system; polling is available only when a poller is injected. */
export class ManifestBusinessSystemConnector implements BusinessSystemConnector {
  readonly id: string;
  readonly capabilities: readonly string[];
  private readonly manifest: BusinessSystemManifest;
  private readonly poller: BusinessSystemPoller | null;

  constructor(manifest: BusinessSystemManifest, poller: BusinessSystemPoller | null = null) {
    this.id = clean(manifest.id, "connector id");
    const byName = new Map<string, DiscoveredSignalCapability>();
    for (const raw of manifest.signalCapabilities) {
      const item = { ...raw, name: clean(raw.name, "signal capability"), description: clean(raw.description, "signal capability description"), confidence: confidence(raw.confidence) };
      const prior = byName.get(item.name);
      if (!prior || item.confidence > prior.confidence) byName.set(item.name, item);
    }
    this.manifest = {
      id: this.id,
      label: clean(manifest.label, "connector label"),
      kind: clean(manifest.kind, "connector kind"),
      confidence: confidence(manifest.confidence),
      signalCapabilities: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
    this.capabilities = this.manifest.signalCapabilities.map((item) => item.name);
    this.poller = poller;
  }

  async describe(): Promise<DiscoveredBusinessSystem> {
    return { ...structuredClone(this.manifest), signalPolling: this.poller ? "live" : "unavailable", grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
  }

  async poll(cursor: SignalCursor): Promise<SignalPollResult> {
    if (cursor.sourceId !== this.id) throw new Error("business system cursor source mismatch");
    if (!this.poller) throw new Error(`SIGNAL_POLL_UNAVAILABLE:${this.id}`);
    return this.poller.poll(cursor);
  }
}


export async function pollObservedBusinessSystem(input: { connector: BusinessSystemConnector; companyId: string; cursor: SignalCursor }): Promise<SignalPollResult> {
  const { connector, companyId, cursor } = input;
  if (cursor.sourceId !== connector.id) throw new Error("business system cursor source mismatch");
  const result = await connector.poll(cursor);
  if (result.cursor.sourceId !== connector.id) throw new Error("business system poll returned foreign cursor");
  const events = result.events.map((event) => {
    if (event.companyId !== companyId) throw new Error(`business system event company mismatch:${event.id}`);
    const topic = event.signal?.topic?.trim() || event.type;
    const capability = event.signal?.capability?.trim();
    if (capability && !connector.capabilities.includes(capability)) throw new Error(`business system event capability not declared:${capability}`);
    const attestationRef = `connector-attestation:${createHash("sha256").update(JSON.stringify({ sourceId: connector.id, eventId: event.id, occurredAt: event.occurredAt, cursorBefore: cursor.position, cursorAfter: result.cursor.position })).digest("hex")}`;
    return {
      ...structuredClone(event),
      signal: { provenance: "observed" as const, sourceId: connector.id, topic, ...(capability ? { capability } : {}), attestationRef },
      evidenceRefs: [...new Set([...event.evidenceRefs, attestationRef])],
    };
  });
  return { events, cursor: structuredClone(result.cursor) };
}

function stableId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, ""); }

export function projectBusinessSystemDiscoveries(input: { companyId: string; discoveries: DiscoveredBusinessSystem[]; prior?: DiscoveryRevision | null }, now = new Date()): DiscoveryRevision {
  const prior = input.prior ?? null;
  const systems = new Map(input.discoveries.map((item) => [item.id, item]));
  const evidence = [...(prior?.evidence ?? [])];
  const facts = [...(prior?.facts.map(({ revisionId: _revisionId, ...fact }) => fact) ?? [])];
  const capabilities = [...(prior?.capabilities ?? [])];
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const factIds = new Set(facts.map((item) => item.id));
  const capabilityNames = new Set(capabilities.map((item) => item.name));

  for (const system of [...systems.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    confidence(system.confidence);
    const evidenceId = `connector-evidence:${stableId(system.id)}`;
    if (!evidenceIds.has(evidenceId)) {
      evidence.push({ id: evidenceId, source: { id: system.id, kind: "integration", label: system.label }, kind: "business-system-discovery", observedAt: now.toISOString(), statement: `Business system observed: ${system.label} (${system.kind})`, confidenceCeiling: system.confidence });
      evidenceIds.add(evidenceId);
    }
    const factId = `connector-fact:${stableId(system.id)}`;
    if (!factIds.has(factId)) {
      facts.push({ id: factId, statement: `${system.label} is an observed business system of kind ${system.kind}.`, status: "observed", confidence: system.confidence, evidenceRefs: [evidenceId], provenance: system.id });
      factIds.add(factId);
    }
    for (const signal of system.signalCapabilities) {
      if (capabilityNames.has(signal.name)) continue;
      capabilities.push({ id: `connector-capability:${stableId(system.id)}:${stableId(signal.name)}`, name: signal.name, description: signal.description, criticality: signal.criticality, confidence: Math.min(system.confidence, confidence(signal.confidence)), factRefs: [factId], evidenceRefs: [evidenceId] });
      capabilityNames.add(signal.name);
    }
  }
  return buildDiscoveryRevision({ companyId: input.companyId, parent: prior, evidence, facts, unknowns: structuredClone(prior?.unknowns ?? []), capabilities }, now);
}
