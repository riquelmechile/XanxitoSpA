import type { CompanyAsset, ProviderDescriptor, SemanticCapabilityDescriptor } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { RuntimeStore } from "../../database/src/runtime-store.js";
import type { ProviderRegistry } from "../../providers/src/index.js";
import type { SemanticCapabilityRegistry } from "../../providers/src/adapters.js";

export interface PublicProviderDescriptor extends Omit<ProviderDescriptor, "credentialsRef" | "metadata"> {
  metadataKeys: string[];
  credentialConfigured: boolean;
}

export interface PublicCompanyAsset extends Omit<CompanyAsset, "credentialsRef" | "grantRefs" | "metadata"> {
  metadataKeys: string[];
  grantCount: number;
  credentialConfigured: boolean;
}

export interface ControlCatalogSnapshot {
  companyId: string;
  capabilities: SemanticCapabilityDescriptor[];
  providers: PublicProviderDescriptor[];
  assets: PublicCompanyAsset[];
}

function sanitizeProvider(provider: ProviderDescriptor): PublicProviderDescriptor {
  const { credentialsRef, metadata, ...safe } = provider;
  return {
    ...safe,
    metadataKeys: Object.keys(metadata).sort(),
    credentialConfigured: Boolean(credentialsRef),
  };
}

function sanitizeAsset(asset: CompanyAsset): PublicCompanyAsset {
  const { credentialsRef, grantRefs, metadata, ...safe } = asset;
  return {
    ...safe,
    metadataKeys: Object.keys(metadata).sort(),
    grantCount: grantRefs.length,
    credentialConfigured: Boolean(credentialsRef),
  };
}

export async function buildControlCatalog(input: {
  companyId: string;
  semantics: SemanticCapabilityRegistry;
  providers: ProviderRegistry;
  runtime: RuntimeStore;
}): Promise<ControlCatalogSnapshot> {
  if (!input.companyId) throw new DomainError("company id required for control catalog");
  const providers = input.providers.list(input.companyId);
  const assets = await input.runtime.listAssets(input.companyId);
  if (providers.some((provider) => provider.companyId !== input.companyId) || assets.some((asset) => asset.companyId !== input.companyId)) {
    throw new DomainError("control catalog tenant isolation violation");
  }
  return {
    companyId: input.companyId,
    capabilities: input.semantics.list(),
    providers: providers.map(sanitizeProvider),
    assets: assets.map(sanitizeAsset),
  };
}
