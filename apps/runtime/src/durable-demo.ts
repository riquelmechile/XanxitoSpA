import { randomUUID } from "node:crypto";
import type { BootstrapRequirement, CompanyAsset, ProviderDescriptor } from "../../../packages/contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../../packages/database/src/runtime-store.js";
import { HeartbeatEngine, planCompanyBootstrap } from "../../../packages/kernel/src/index.js";
import { ProviderRegistry } from "../../../packages/providers/src/index.js";

export async function runHeartbeatDemo() {
  const companyId = randomUUID();
  const store = new InMemoryRuntimeStore();
  const wakeLog: string[] = [];
  const engine = new HeartbeatEngine(
    store,
    { eventTypes: ["sales.material"], minimumJobMateriality: "medium" },
    async ({ events, jobs, lease }) => {
      wakeLog.push(`wake:${events.length}:${jobs.length}:fence-${lease.fencingToken}`);
    },
  );
  const now = new Date();
  await store.appendEvent({
    id: randomUUID(), companyId, type: "sales.material", occurredAt: now.toISOString(), actorPrincipal: "commerce",
    correlationId: randomUUID(), idempotencyKey: `demo:${randomUUID()}`, payload: { materiality: "high" }, sensitivity: "internal", evidenceRefs: ["demo:sale"],
  });
  const first = await engine.tick(companyId, "runtime-demo", now);
  const second = await engine.tick(companyId, "runtime-demo", new Date(now.getTime() + 1));
  return { companyId, first, second, wakeLog };
}

export function runProviderRoutingDemo() {
  const companyId = randomUUID();
  const registry = new ProviderRegistry();
  const providers: ProviderDescriptor[] = [
    { id: "fast", companyId, capabilities: ["image.generate"], regions: ["CL"], inputFormats: ["text"], outputFormats: ["png"], estimatedCost: 2, latencyP50Ms: 80, latencyP95Ms: 140, reliability: 0.96, quality: 0.86, privacyScore: 0.9, maxSensitivity: "restricted", health: "healthy", credentialsRef: "secret://fast", metadata: {} },
    { id: "quality", companyId, capabilities: ["image.generate"], regions: ["CL"], inputFormats: ["text"], outputFormats: ["png"], estimatedCost: 4, latencyP50Ms: 150, latencyP95Ms: 300, reliability: 0.99, quality: 0.97, privacyScore: 0.95, maxSensitivity: "restricted", health: "healthy", credentialsRef: "secret://quality", metadata: {} },
  ];
  providers.forEach((provider) => registry.register(provider));
  return registry.route({ companyId, capability: "image.generate", region: "CL", inputFormat: "text", outputFormat: "png", maxCost: 5, minQuality: 0.8, minReliability: 0.9, sensitivity: "internal", requireCredentials: true, mode: "balanced" });
}

export function runBootstrapDemo() {
  const companyId = randomUUID();
  const now = new Date().toISOString();
  const assets: CompanyAsset[] = [
    { id: randomUUID(), companyId, kind: "database", capability: "data.query", department: "operations", cost: 0, currency: "USD", status: "active", grantRefs: [], restrictions: [], metadata: {}, createdAt: now, updatedAt: now },
  ];
  const requirements: BootstrapRequirement[] = [
    { id: "data", capability: "data.query", assetKind: "database", department: "operations", estimatedCost: 0, currency: "USD", humanBoundary: "none" },
    { id: "email", capability: "email.send", assetKind: "mailbox", department: "commercial", estimatedCost: 8, currency: "USD", humanBoundary: "contract", preferredProviderIds: ["workspace"] },
  ];
  return planCompanyBootstrap({ companyId, mode: "existing", requirements, existingAssets: assets, autonomousCapabilities: ["data.query"] });
}
