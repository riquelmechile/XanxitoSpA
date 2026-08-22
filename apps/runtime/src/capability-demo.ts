import { randomUUID } from "node:crypto";
import type { ApprovalReceipt, AuthorityGrant, BootstrapRequirement, CapabilityPlaneRequest, CompanyAsset, ProviderDescriptor, SemanticCapabilityDescriptor } from "../../../packages/contracts/src/index.js";
import { InMemoryRuntimeStore } from "../../../packages/database/src/runtime-store.js";
import { BootstrapExecutor, buildControlCatalog, planCompanyBootstrap } from "../../../packages/kernel/src/index.js";
import { ProviderRegistry } from "../../../packages/providers/src/index.js";
import { CapabilityPlane, ProviderAdapterRegistry, SemanticCapabilityRegistry } from "../../../packages/providers/src/adapters.js";
import { InMemorySecretResolver } from "../../../packages/providers/src/secrets.js";

function capability(name: string, credentialRequired: boolean): SemanticCapabilityDescriptor {
  return { name, risk: "low", maxSensitivity: "restricted", sideEffectClass: "external", inputFormats: ["json"], outputFormats: ["json"], credentialRequired, description: `demo ${name}` };
}

function provider(companyId: string, id: string, capabilityName: string, credentialsRef?: string): ProviderDescriptor {
  return {
    id, companyId, capabilities: [capabilityName], regions: ["CL"], inputFormats: ["json"], outputFormats: ["json"], estimatedCost: 1,
    latencyP50Ms: 50, latencyP95Ms: 100, reliability: 0.99, quality: 0.9, privacyScore: 0.95, maxSensitivity: "restricted",
    health: "healthy", ...(credentialsRef ? { credentialsRef } : {}), metadata: { adapter: "demo" },
  };
}

function grant(companyId: string, action: string): AuthorityGrant {
  return { id: randomUUID(), companyId, principal: "worker-demo", actions: [action], scopes: ["bootstrap"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" };
}

export async function runCapabilityCatalogDemo() {
  const companyId = randomUUID();
  const semantics = new SemanticCapabilityRegistry();
  semantics.register(capability("email.send", true));
  semantics.register(capability("data.query", false));
  const providers = new ProviderRegistry();
  providers.register(provider(companyId, "mail-demo", "email.send", `secret://${companyId}/mail-demo`));
  providers.register(provider(companyId, "postgres-demo", "data.query"));
  const runtime = new InMemoryRuntimeStore();
  const now = new Date().toISOString();
  const asset: CompanyAsset = {
    id: randomUUID(), companyId, kind: "mailbox", providerId: "mail-demo", capability: "email.send", department: "commercial", cost: 1, currency: "USD", status: "active",
    credentialsRef: `secret://${companyId}/mail-demo`, grantRefs: ["grant:internal-demo"], restrictions: [], metadata: { address: "sales@example.test", internalAccountId: "hidden-demo" }, createdAt: now, updatedAt: now,
  };
  await runtime.saveAsset(asset);
  return buildControlCatalog({ companyId, semantics, providers, runtime });
}

export async function runBootstrapExecutionDemo() {
  const fixedNow = new Date("2026-08-21T12:00:00.000Z");
  const companyId = randomUUID();
  const capabilityName = "phone.sms";
  const requirement: BootstrapRequirement = { id: "phone", capability: capabilityName, assetKind: "phone-number", department: "customer", estimatedCost: 0, currency: "USD", humanBoundary: "kyc", preferredProviderIds: ["sms-demo"] };
  const plan = planCompanyBootstrap({ companyId, mode: "new", requirements: [requirement], existingAssets: [], autonomousCapabilities: [capabilityName] });
  const semantics = new SemanticCapabilityRegistry(); semantics.register(capability(capabilityName, false));
  const providers = new ProviderRegistry(); providers.register(provider(companyId, "sms-demo", capabilityName));
  const adapters = new ProviderAdapterRegistry();
  adapters.register({ descriptor: { companyId, providerId: "sms-demo", capabilities: [capabilityName], credentialNames: [] }, execute: async () => ({ ok: true, sideEffectApplied: true, result: { numberRef: "phone:demo" }, evidenceRefs: ["phone:allocated"], cost: 1 }) });
  const runtime = new InMemoryRuntimeStore();
  const plane = new CapabilityPlane(semantics, providers, adapters, new InMemorySecretResolver(), runtime, () => fixedNow);
  const executor = new BootstrapExecutor(plane, runtime, { verifyApproval: async (receipt) => receipt.approvedBy === "founder", verifyAsset: async () => ({ ok: true, evidenceRefs: ["phone:verified"] }) }, () => fixedNow);
  const requestFactory = (): CapabilityPlaneRequest => ({
    capabilityRequest: { companyId, principal: "worker-demo", action: capabilityName, scope: "bootstrap", idempotencyKey: "bootstrap:demo:phone", payload: { country: "CL" } },
    selection: { companyId, capability: capabilityName, region: "CL", inputFormat: "json", outputFormat: "json", minQuality: 0.5, minReliability: 0.9, minPrivacyScore: 0.9, sensitivity: "internal", requireCredentials: false, mode: "balanced" },
    executionOwner: "worker-demo", allowFallback: true, maxAttempts: 1, staleAfterMs: 60_000,
  });
  const guard = { principal: "worker-demo", grants: [grant(companyId, capabilityName)], budgets: [] };
  const paused = await executor.execute({ plan, requirements: [requirement], approvals: [], guard, requestFactory });
  const approval: ApprovalReceipt = { id: randomUUID(), companyId, requirementId: requirement.id, planFingerprint: paused.planFingerprint, approvedBy: "founder", approvedAt: fixedNow.toISOString() };
  const completed = await executor.execute({ plan, requirements: [requirement], approvals: [approval], guard, state: paused, requestFactory });
  const catalog = await buildControlCatalog({ companyId, semantics, providers, runtime });
  return { companyId, paused, completed, catalog };
}
