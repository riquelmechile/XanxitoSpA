import type { BusinessCapabilityCriticality, DiscoveryRevision } from "../../contracts/src/index.js";
import type { BusinessSignalAdapter } from "./signal-source.js";
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
  grantsAuthority: false;
  grantsBudget: false;
  grantsCapabilities: false;
  executesWork: false;
}

export interface BusinessSystemConnector {
  readonly id: string;
  discover(): Promise<DiscoveredBusinessSystem>;
  signalAdapter(): BusinessSignalAdapter | null;
}

export interface BusinessSystemManifest {
  id: string;
  label: string;
  kind: string;
  confidence: number;
  signalCapabilities: DiscoveredSignalCapability[];
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

export class ManifestBusinessSystemConnector implements BusinessSystemConnector {
  readonly id: string;
  private readonly manifest: BusinessSystemManifest;
  private readonly adapter: BusinessSignalAdapter | null;

  constructor(manifest: BusinessSystemManifest, adapter: BusinessSignalAdapter | null = null) {
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
    this.adapter = adapter;
  }

  async discover(): Promise<DiscoveredBusinessSystem> {
    return { ...structuredClone(this.manifest), grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
  }

  signalAdapter(): BusinessSignalAdapter | null { return this.adapter; }
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
