import type {
  ProviderDescriptor,
  ProviderSelectionRequest,
  ProviderSelectionResult,
} from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";

const sensitivityRank = { public: 0, internal: 1, restricted: 2 } as const;

function normalizedInverse(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return 1 - ((value - min) / (max - min));
}

function eligible(provider: ProviderDescriptor, request: ProviderSelectionRequest): boolean {
  if (provider.companyId !== request.companyId) return false;
  if (provider.health === "unavailable") return false;
  if (!provider.capabilities.includes(request.capability)) return false;
  if (!(provider.regions.includes("*") || provider.regions.includes(request.region))) return false;
  if (request.inputFormat && !provider.inputFormats.includes(request.inputFormat)) return false;
  if (request.outputFormat && !provider.outputFormats.includes(request.outputFormat)) return false;
  if (request.maxCost !== undefined && provider.estimatedCost > request.maxCost) return false;
  if (request.minQuality !== undefined && provider.quality < request.minQuality) return false;
  if (request.minReliability !== undefined && provider.reliability < request.minReliability) return false;
  if (request.minPrivacyScore !== undefined && provider.privacyScore < request.minPrivacyScore) return false;
  if (sensitivityRank[provider.maxSensitivity] < sensitivityRank[request.sensitivity]) return false;
  if (request.requireCredentials && !provider.credentialsRef) return false;
  return true;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderDescriptor>();

  register(provider: ProviderDescriptor): void {
    if (provider.quality < 0 || provider.quality > 1) throw new DomainError("provider quality must be 0..1");
    if (provider.reliability < 0 || provider.reliability > 1) throw new DomainError("provider reliability must be 0..1");
    if (provider.privacyScore < 0 || provider.privacyScore > 1) throw new DomainError("provider privacyScore must be 0..1");
    if (provider.estimatedCost < 0 || provider.latencyP50Ms < 0 || provider.latencyP95Ms < 0) throw new DomainError("provider cost/latency cannot be negative");
    if (provider.latencyP95Ms < provider.latencyP50Ms) throw new DomainError("provider p95 latency cannot be lower than p50");
    this.providers.set(`${provider.companyId}:${provider.id}`, structuredClone(provider));
  }

  list(companyId: string): ProviderDescriptor[] {
    return [...this.providers.values()]
      .filter((provider) => provider.companyId === companyId)
      .map((provider) => structuredClone(provider));
  }

  route(request: ProviderSelectionRequest): ProviderSelectionResult {
    const candidates = this.list(request.companyId).filter((provider) => eligible(provider, request));
    if (candidates.length === 0) throw new DomainError(`no eligible provider for capability ${request.capability}`);

    const costs = candidates.map((provider) => provider.estimatedCost);
    const latencies = candidates.map((provider) => provider.latencyP95Ms);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    const score = (provider: ProviderDescriptor): number => {
      if (request.mode === "quality") return provider.quality;
      if (request.mode === "cost") return normalizedInverse(provider.estimatedCost, minCost, maxCost);
      if (request.mode === "latency") return normalizedInverse(provider.latencyP95Ms, minLatency, maxLatency);
      return (
        (provider.quality * 0.35) +
        (provider.reliability * 0.25) +
        (provider.privacyScore * 0.15) +
        (normalizedInverse(provider.estimatedCost, minCost, maxCost) * 0.15) +
        (normalizedInverse(provider.latencyP95Ms, minLatency, maxLatency) * 0.10)
      );
    };

    const ranked = candidates
      .map((provider) => ({ provider, score: score(provider) }))
      .sort((a, b) => b.score - a.score || b.provider.reliability - a.provider.reliability || a.provider.estimatedCost - b.provider.estimatedCost || a.provider.id.localeCompare(b.provider.id));
    const winner = ranked[0];
    if (!winner) throw new DomainError("provider routing invariant failed");

    return {
      providerId: winner.provider.id,
      mode: request.mode,
      score: winner.score,
      eligibleProviderIds: ranked.map((entry) => entry.provider.id),
      rationale: `${request.mode}: selected ${winner.provider.id} from ${ranked.length} eligible provider(s) after hard filters`,
    };
  }
}
