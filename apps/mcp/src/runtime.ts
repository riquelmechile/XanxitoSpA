import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { AuthorityMandate, BusinessEvent, CompanyAsset, CompanyPrincipalTrustAnchor, WakeAccumulatorState, CompanyOperatingModelPlan, CompanyOperatingModelSnapshot, CorporateGene, CreativeDecisionReceipt, CreativeMission, DiscoveryRevision, ScheduledJob, SkillDefinition, Work } from "../../../packages/contracts/src/index.js";
import { PostgresCompanyStore, PostgresDatabase, PostgresRuntimeStore, type CompanyStore, type RuntimeStore } from "../../../packages/database/src/index.js";
import { buildCompanySkillGene, buildDiscoveryRevision, companyOperatingModelFromAsset, companySkillDefinitionFromAsset, createCompanyOperatingModelAsset, createCompanySkillDefinitionAsset, createDiscoveryAsset, createFileSystemSkillRegistry, createWakeProposalAsset, createWakeStateAsset, createSkillInstallationAsset, planCompanyOperatingModel, planCompanySkillBootstrap, projectCompanyConstitution, resolveCompanySkillMatches, skillDefinitionRef, skillInstallationFromAsset, submitCreativeMission, wakeStateFromAsset, applyVerifiedMandateToDiscovery, deriveActiveMandates, GenericDiscoveryOrchestrator, GovernedWakeEngine, GovernedObservedSignalScheduler, GovernedObservedSignalDaemon, BusinessSystemConnectorRegistry, CsvSignalSource, ManifestBusinessSystemConnector, canonicalRootEnrollmentPayload, createRootEnrollmentChallenge, verifyRootEnrollmentProof, verifyAuthorityMandate, type BusinessSystemConnector, type SkillRegistry } from "../../../packages/kernel/src/index.js";
import type { AuthorityMandateInput, AuthorityRootEnrollmentPrepareInput, AuthorityRootEnrollmentVerifyInput, AutoskillProposeInput, CompanyApplyInput, CompanyDiscoveryApplyInput, CompanyDiscoveryOrchestrateInput, CompanyDiscoveryPlanInput, CompanyPlanInput, CompanyWakeEvaluateInput, CompanySkillPlanInput, CreativeSubmitInput, GlobalSkillPromotionInput, KastReflectInput, SkillGetRequest, SkillInstallInput, SkillSearchRequest, WorkCreateInput, XspaAppOperations, XspaAppStatus, XspaRequestContext } from "./server.js";

const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;
const PROTECTED = new Set(["model-law", "constitution", "authority-root", "secret-isolation", "kast-law", "review-law", "memory-law", "human-reserved-boundary"]);

const FORBIDDEN_MANDATE_SECRET_KEYS = new Set(["privatekey", "private_key", "password", "secret", "token", "apikey", "api_key"]);
function mandateContainsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mandateContainsSecretField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => FORBIDDEN_MANDATE_SECRET_KEYS.has(key.toLowerCase()) || mandateContainsSecretField(child));
}
function assertMandatePublicSafe(mandate: AuthorityMandate): void {
  const serialized = JSON.stringify(mandate);
  if (SECRET_LIKE.test(serialized) || mandateContainsSecretField(mandate)) throw new Error("AUTHORITY_MANDATE_SECRET_MATERIAL_REJECTED");
}

function discoveryRequirement(unknown: { category: string; resolutionRequirement?: string }): string {
  if (unknown.resolutionRequirement) return unknown.resolutionRequirement;
  if (unknown.category === "governance") return "constitutional-mandate";
  if (unknown.category === "finance" || unknown.category === "organization") return "owner-confirmation";
  return "operator-confirmation";
}

function assertUntrustedDiscoveryWriteSafe(input: CompanyDiscoveryApplyInput, parent: DiscoveryRevision | null): void {
  for (const fact of input.facts) {
    if (fact.status !== "owner-confirmed") continue;
    const inherited = parent?.facts.some((prior) => prior.id === fact.id && prior.status === "owner-confirmed" && prior.statement === fact.statement && prior.provenance === fact.provenance);
    if (!inherited) throw new Error("OWNER_IDENTITY_REQUIRED:owner_confirmed_fact");
  }
  for (const unknown of input.unknowns) {
    const requirement = discoveryRequirement(unknown);
    if (requirement !== "owner-confirmation" && requirement !== "constitutional-mandate") continue;
    const prior = parent?.unknowns.find((item) => item.id === unknown.id);
    const changedToNonOpen = unknown.status !== "open" && (!prior || prior.status !== unknown.status || prior.resolutionRef !== unknown.resolutionRef);
    if (changedToNonOpen) throw new Error(`OWNER_IDENTITY_REQUIRED:${requirement}:${unknown.id}`);
  }
}

function materiality(severity: KastReflectInput["severity"]): ScheduledJob["materiality"] {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function isReceipt(value: unknown): value is CreativeDecisionReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.missionId === "string" && typeof obj.status === "string" && typeof obj.decisionOwner === "string" && Array.isArray(obj.selectedAssetRefs);
}

function extractReceipt(value: unknown): CreativeDecisionReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (isReceipt(obj.receipt)) return structuredClone(obj.receipt);
  return null;
}

function deterministicCompanyAssetId(companyId: string, namespace: string): string {
  const hex = createHash("sha256").update(`${namespace}:${companyId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

function authorityLedgerHead(mandates: AuthorityMandate[]): { count: number; headHash: string } {
  const entries = [...mandates]
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id))
    .map((mandate) => ({ id: mandate.id, payloadHash: mandate.payloadHash }));
  return { count: entries.length, headHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex") };
}

interface AuthorityKeyringEntry {
  principalId: string;
  keyId: string;
  publicKeyHash: string;
  role: CompanyPrincipalTrustAnchor["role"];
  validFrom: string | null;
  validUntil: string | null;
}

function authorityKeyringEntries(anchors: CompanyPrincipalTrustAnchor[]): AuthorityKeyringEntry[] {
  return anchors.map((anchor) => ({
    principalId: anchor.principalId,
    keyId: anchor.keyId,
    publicKeyHash: createHash("sha256").update(anchor.publicKeyPem).digest("hex"),
    role: anchor.role,
    validFrom: anchor.validFrom ?? null,
    validUntil: anchor.validUntil ?? null,
  })).sort((a, b) => a.principalId.localeCompare(b.principalId) || a.keyId.localeCompare(b.keyId));
}

function authorityKeyringHead(entries: AuthorityKeyringEntry[]): { count: number; headHash: string } {
  return { count: entries.length, headHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex") };
}

function delegatedKeyIdentities(mandates: AuthorityMandate[]): Set<string> {
  const result = new Set<string>();
  for (const mandate of mandates) {
    for (const claim of mandate.claims) {
      if (claim.type !== "delegation" || !claim.value || typeof claim.value !== "object" || Array.isArray(claim.value)) continue;
      const value = claim.value as Record<string, unknown>;
      const principalId = String(value.principalId ?? value.principal_id ?? "").trim();
      const keyId = String(value.keyId ?? value.key_id ?? "").trim();
      if (principalId && keyId) result.add(`${principalId}:${keyId}`);
    }
  }
  return result;
}

export interface ConfiguredObservedConnector {
  connector: BusinessSystemConnector;
  enabled: boolean;
}

const CONNECTOR_SECRET_KEYS = new Set(["privatekey", "private_key", "password", "secret", "token", "apikey", "api_key", "authorization"]);
function connectorConfigContainsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(connectorConfigContainsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => CONNECTOR_SECRET_KEYS.has(key.toLowerCase()) || connectorConfigContainsSecret(child));
}

export function parseObservedConnectorConfig(raw: string | undefined, context: { companyId: string; signalRoot: string }): ConfiguredObservedConnector[] {
  if (!context.companyId.trim()) throw new Error("OBSERVED_CONNECTOR_COMPANY_REQUIRED");
  if (!context.signalRoot.trim()) throw new Error("OBSERVED_CONNECTOR_SIGNAL_ROOT_REQUIRED");
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("OBSERVED_CONNECTOR_CONFIG_INVALID_JSON"); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new Error("OBSERVED_CONNECTOR_CONFIG_INVALID");
  if (connectorConfigContainsSecret(parsed) || SECRET_LIKE.test(JSON.stringify(parsed))) throw new Error("OBSERVED_CONNECTOR_SECRET_MATERIAL_REJECTED");
  const root = path.resolve(context.signalRoot);
  const ids = new Set<string>();
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`OBSERVED_CONNECTOR_CONFIG_INVALID:${index}`);
    const obj = entry as Record<string, unknown>;
    if (obj.type !== "csv") throw new Error(`OBSERVED_CONNECTOR_TYPE_UNSUPPORTED:${index}`);
    const id = String(obj.id ?? "").trim();
    if (!id) throw new Error(`OBSERVED_CONNECTOR_ID_REQUIRED:${index}`);
    if (ids.has(id)) throw new Error(`OBSERVED_CONNECTOR_DUPLICATE:${id}`);
    ids.add(id);
    const capabilitiesRaw = obj.capabilities;
    if (!Array.isArray(capabilitiesRaw) || capabilitiesRaw.length < 1 || capabilitiesRaw.length > 64 || capabilitiesRaw.some((value) => typeof value !== "string" || !value.trim())) throw new Error(`OBSERVED_CONNECTOR_CAPABILITIES_INVALID:${id}`);
    const relativePath = String(obj.relativePath ?? obj.relative_path ?? "").trim();
    if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`OBSERVED_CONNECTOR_PATH_OUTSIDE_SIGNAL_ROOT:${id}`);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`OBSERVED_CONNECTOR_PATH_OUTSIDE_SIGNAL_ROOT:${id}`);
    const enabled = obj.enabled === undefined ? true : obj.enabled;
    if (typeof enabled !== "boolean") throw new Error(`OBSERVED_CONNECTOR_ENABLED_INVALID:${id}`);
    return {
      connector: new CsvSignalSource({ id, companyId: context.companyId, capabilities: [...new Set(capabilitiesRaw.map((value) => String(value).trim()))], path: resolved }),
      enabled,
    };
  });
}

export class EnvironmentXspaAppOperations implements XspaAppOperations {
  constructor(
    private readonly input: {
      store?: RuntimeStore;
      workStore?: Pick<CompanyStore, "saveWork" | "getWork" | "saveGene" | "listGenes">;
      companyId?: string;
      databaseConfigured: boolean;
      creativeConfigured: boolean;
      kastConfigured: boolean;
      skillRegistry?: SkillRegistry;
      creativeSupervisorPrincipal?: string;
      authorityTrustAnchors?: CompanyPrincipalTrustAnchor[];
    },
  ) {}

  async status(): Promise<XspaAppStatus> {
    const skillHealth = this.input.skillRegistry ? await this.input.skillRegistry.health() : undefined;
    return {
      version: "1.0.0",
      modelLaw: { executive: "gpt-5.6-sol/max", branches: "gpt-5.6-sol/xhigh", fallback: false },
      mcp: { ready: true, mode: "streamable-http" },
      database: { configured: this.input.databaseConfigured },
      companyOs: { ready: Boolean(this.input.store && this.input.companyId), intakeModes: ["new", "existing"], lifecycleModes: ["bootstrap", "operate", "improve", "grow", "expand", "recover", "exit"] },
      creative: {
        configured: this.input.creativeConfigured,
        renderer: "chatgpt-host-native-tooling",
        chatMode: "mcp-host-only",
        video: "staged",
      },
      kast: {
        configured: this.input.kastConfigured,
        execution: this.input.kastConfigured ? "queued" : "staged",
      },
      skills: {
        configured: Boolean(this.input.skillRegistry),
        healthy: skillHealth?.ok ?? false,
        indexed: skillHealth?.indexed ?? 0,
        activeCompanyCatalog: this.input.skillRegistry ? this.input.skillRegistry.list({ domain: "company" }).length : 0,
      },
    };
  }

  private requireRuntime(): { store: RuntimeStore; companyId: string } {
    if (!this.input.store || !this.input.companyId) throw new Error("XanxitoSpA runtime store/company is not configured");
    return { store: this.input.store, companyId: this.input.companyId };
  }

  private requireWorkRuntime(): { store: RuntimeStore; workStore: Pick<CompanyStore, "saveWork" | "getWork" | "saveGene" | "listGenes">; companyId: string } {
    const { store, companyId } = this.requireRuntime();
    if (!this.input.workStore) throw new Error("XanxitoSpA Work store is not configured");
    return { store, workStore: this.input.workStore, companyId };
  }

  async workCreate(input: WorkCreateInput, context: XspaRequestContext): Promise<unknown> {
    const { store, workStore, companyId } = this.requireWorkRuntime();
    const now = new Date();
    const intent = { owner: input.owner, objective: input.objective, scope: input.scope };
    const fingerprint = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
    const idemKey = `work:create:${input.workId}`;
    const idemOwner = `mcp:work:${input.workId}`;
    const claim = await store.claimIdempotency(companyId, idemKey, { fingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const prior = claim.record.intent as { fingerprint?: unknown };
      if (prior.fingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:work_changed:${input.workId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { workId: input.workId, status: "contended", created: false };
      throw new Error(`Work creation requires reconciliation:${input.workId}`);
    }
    const work: Work = {
      id: input.workId,
      companyId,
      owner: input.owner,
      objective: input.objective,
      scope: input.scope,
      createdAt: now.toISOString(),
    };
    try {
      await workStore.saveWork(work);
      await store.appendEvent({
        id: randomUUID(),
        companyId,
        type: "work.created",
        occurredAt: now.toISOString(),
        actorPrincipal: context.principal,
        correlationId: input.workId,
        idempotencyKey: `work:created:${input.workId}:${fingerprint}`,
        payload: { workId: input.workId, owner: input.owner, objective: input.objective, scope: input.scope },
        sensitivity: "internal",
        evidenceRefs: [],
      });
      const result = { work, status: "created", companyScoped: true, grantsAuthority: false, grantsBudget: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Work creation idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Work creation failed");
      throw error;
    }
  }

  async workGet(workId: string, _context: XspaRequestContext): Promise<unknown> {
    const { workStore, companyId } = this.requireWorkRuntime();
    const work = await workStore.getWork(companyId, workId);
    return work ? { work, state: "found", companyScoped: true } : { workId, state: "not-found", companyScoped: true };
  }

  private discoveryFromAsset(asset: CompanyAsset): DiscoveryRevision {
    const snapshot = asset.metadata.snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("company discovery asset snapshot missing");
    return structuredClone(snapshot as DiscoveryRevision);
  }

  private async discoveryByRevisionId(revisionId: string): Promise<DiscoveryRevision | null> {
    const { store, companyId } = this.requireRuntime();
    for (const asset of await store.listAssets(companyId)) {
      if (asset.kind !== "company-discovery" || asset.status !== "active") continue;
      const revision = this.discoveryFromAsset(asset);
      if (revision.revisionId === revisionId) return revision;
    }
    return null;
  }

  private async latestDiscovery(): Promise<DiscoveryRevision | null> {
    const { store, companyId } = this.requireRuntime();
    const assets = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-discovery" && asset.status === "active");
    if (assets.length === 0) return null;
    const revisions = assets.map((asset) => ({ asset, revision: this.discoveryFromAsset(asset) }));
    revisions.sort((a, b) => b.revision.sequence - a.revision.sequence || b.revision.createdAt.localeCompare(a.revision.createdAt) || b.asset.updatedAt.localeCompare(a.asset.updatedAt));
    return revisions[0]!.revision;
  }

  private async latestOperatingModelSnapshot(): Promise<CompanyOperatingModelSnapshot | null> {
    const { store, companyId } = this.requireRuntime();
    const assets = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-operating-model" && asset.status === "active");
    if (assets.length === 0) return null;
    const snapshots = assets.map((asset) => ({ asset, snapshot: companyOperatingModelFromAsset(asset) }));
    snapshots.sort((a, b) => b.snapshot.appliedAt.localeCompare(a.snapshot.appliedAt) || b.asset.updatedAt.localeCompare(a.asset.updatedAt));
    return snapshots[0]!.snapshot;
  }

  private async latestWakeState(): Promise<{ state: WakeAccumulatorState[]; version: number }> {
    const { store, companyId } = this.requireRuntime();
    const assets = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-wake-state" && asset.status === "active");
    if (assets.length === 0) return { state: [], version: 0 };
    assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { state: wakeStateFromAsset(assets[0]!), version: assets[0]!.version ?? 0 };
  }

  private authorityTrustAnchors(): CompanyPrincipalTrustAnchor[] {
    return structuredClone(this.input.authorityTrustAnchors ?? []);
  }

  private async authorityMandates(): Promise<AuthorityMandate[]> {
    const { store, companyId } = this.requireRuntime();
    const assets = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-authority-mandate" && asset.status === "active");
    return assets.flatMap((asset) => {
      const raw = asset.metadata.mandate;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      return [structuredClone(raw) as AuthorityMandate];
    });
  }

  private async verifiedAuthorityLedger(): Promise<{ mandates: AuthorityMandate[]; headAsset: CompanyAsset | null; count: number; headHash: string }> {
    const { store, companyId } = this.requireRuntime();
    const assets = await store.listAssets(companyId);
    const mandates = assets.filter((asset) => asset.kind === "company-authority-mandate" && asset.status === "active").flatMap((asset) => {
      const raw = asset.metadata.mandate;
      return raw && typeof raw === "object" && !Array.isArray(raw) ? [structuredClone(raw) as AuthorityMandate] : [];
    });
    const headAssets = assets.filter((asset) => asset.kind === "company-authority-ledger-head" && asset.status === "active");
    if (headAssets.length > 1) throw new Error("AUTHORITY_LEDGER_MULTIPLE_HEADS");
    const headAsset = headAssets[0] ?? null;
    const computed = authorityLedgerHead(mandates);
    if (mandates.length === 0 && !headAsset) return { mandates, headAsset: null, ...computed };
    if (!headAsset) throw new Error("AUTHORITY_LEDGER_HEAD_MISSING");
    const count = Number(headAsset.metadata.count);
    const headHash = typeof headAsset.metadata.headHash === "string" ? headAsset.metadata.headHash : "";
    if (!Number.isInteger(count) || count < 0 || !/^[a-f0-9]{64}$/.test(headHash) || count !== computed.count || headHash !== computed.headHash) {
      throw new Error("AUTHORITY_LEDGER_INCOMPLETE");
    }
    return { mandates, headAsset, count, headHash };
  }

  private authorityLedgerHeadAsset(mandates: AuthorityMandate[], priorHead: CompanyAsset | null, now: Date): CompanyAsset {
    const { companyId } = this.requireRuntime();
    const computed = authorityLedgerHead(mandates);
    return {
      id: deterministicCompanyAssetId(companyId, "authority-ledger-head"),
      companyId, kind: "company-authority-ledger-head", capability: "company.authority.ledger", department: "executive",
      cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: ["append-only-head", "fail-closed"],
      metadata: { schemaVersion: 1, count: computed.count, headHash: computed.headHash },
      createdAt: priorHead?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
    };
  }

  private async verifiedAuthorityKeyring(trustAnchors: CompanyPrincipalTrustAnchor[], mandates: AuthorityMandate[]): Promise<{ headAsset: CompanyAsset | null; entries: AuthorityKeyringEntry[] }> {
    const { store, companyId } = this.requireRuntime();
    const assets = await store.listAssets(companyId);
    const headAssets = assets.filter((asset) => asset.kind === "company-authority-keyring-head" && asset.status === "active");
    if (headAssets.length > 1) throw new Error("AUTHORITY_KEYRING_MULTIPLE_HEADS");
    const headAsset = headAssets[0] ?? null;
    const configured = authorityKeyringEntries(trustAnchors);
    const configuredByIdentity = new Map(configured.map((entry) => [`${entry.principalId}:${entry.keyId}`, entry]));

    if (headAsset) {
      const rawEntries = headAsset.metadata.entries;
      if (!Array.isArray(rawEntries)) throw new Error("AUTHORITY_KEYRING_INCOMPLETE");
      const persisted = rawEntries as AuthorityKeyringEntry[];
      const persistedHead = authorityKeyringHead(persisted);
      const count = Number(headAsset.metadata.count);
      const headHash = typeof headAsset.metadata.headHash === "string" ? headAsset.metadata.headHash : "";
      if (count !== persistedHead.count || headHash !== persistedHead.headHash) throw new Error("AUTHORITY_KEYRING_INCOMPLETE");
      for (const entry of persisted) {
        const current = configuredByIdentity.get(`${entry.principalId}:${entry.keyId}`);
        if (!current || current.publicKeyHash !== entry.publicKeyHash || current.role !== entry.role) throw new Error("AUTHORITY_KEYRING_INCOMPLETE");
      }
    }

    // Migration/backstop: any historical signer not introduced by a delegation claim
    // must still exist in the externally provisioned root keyring.
    const delegated = delegatedKeyIdentities(mandates);
    for (const mandate of mandates) {
      const identity = `${mandate.issuerPrincipalId}:${mandate.signature.keyId}`;
      if (delegated.has(identity)) continue;
      const configuredEntry = configuredByIdentity.get(identity);
      const configuredAnchor = trustAnchors.find((anchor) => `${anchor.principalId}:${anchor.keyId}` === identity);
      if (!configuredEntry || !configuredAnchor) throw new Error("AUTHORITY_KEYRING_INCOMPLETE");
      const issuedAt = Date.parse(mandate.issuedAt);
      const validFrom = configuredAnchor.validFrom ? Date.parse(configuredAnchor.validFrom) : Number.NEGATIVE_INFINITY;
      const validUntil = configuredAnchor.validUntil ? Date.parse(configuredAnchor.validUntil) : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(issuedAt) || issuedAt < validFrom || issuedAt >= validUntil) throw new Error("AUTHORITY_KEYRING_INCOMPLETE");
    }
    return { headAsset, entries: configured };
  }

  private authorityKeyringHeadAsset(entries: AuthorityKeyringEntry[], priorHead: CompanyAsset | null, now: Date): CompanyAsset {
    const { companyId } = this.requireRuntime();
    const computed = authorityKeyringHead(entries);
    return {
      id: deterministicCompanyAssetId(companyId, "authority-keyring-head"),
      companyId, kind: "company-authority-keyring-head", capability: "company.authority.keyring", department: "executive",
      cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: ["append-only-key-history", "fail-closed"],
      metadata: { schemaVersion: 1, count: computed.count, headHash: computed.headHash, entries: structuredClone(entries) },
      createdAt: priorHead?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
    };
  }

  async authorityRootEnrollmentPrepare(input: AuthorityRootEnrollmentPrepareInput, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    if (this.authorityTrustAnchors().length > 0) throw new Error("AUTHORITY_ROOT_ALREADY_CONFIGURED");
    if ((await this.authorityMandates()).length > 0) throw new Error("AUTHORITY_ROOT_HISTORY_EXISTS");
    const now = new Date();
    const challenge = createRootEnrollmentChallenge({ companyId, ...input, now });
    const canonical = canonicalRootEnrollmentPayload(challenge);
    const asset: CompanyAsset = {
      id: challenge.challengeId, companyId, kind: "company-authority-root-enrollment-challenge", capability: "company.authority.root-enrollment", department: "executive",
      cost: 0, currency: "N/A", status: "active", grantRefs: [], restrictions: ["one-time", "proof-of-possession", "no-authority-grant"],
      metadata: { challenge: structuredClone(challenge), challengeHash: canonical.hash, consumed: false }, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    if (!(await store.saveAsset(asset, 0))) throw new Error("AUTHORITY_ROOT_ENROLLMENT_CHALLENGE_CONFLICT");
    return { challenge, trustActivated: false, requiresOutOfBandProvisioning: true, companyScoped: true };
  }

  async authorityRootEnrollmentVerify(input: AuthorityRootEnrollmentVerifyInput, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    if (this.authorityTrustAnchors().length > 0) throw new Error("AUTHORITY_ROOT_ALREADY_CONFIGURED");
    if ((await this.authorityMandates()).length > 0) throw new Error("AUTHORITY_ROOT_HISTORY_EXISTS");
    const issued = (await store.listAssets(companyId)).find((asset) => asset.id === input.proof.challenge.challengeId && asset.kind === "company-authority-root-enrollment-challenge");
    if (!issued) throw new Error("AUTHORITY_ROOT_ENROLLMENT_CHALLENGE_NOT_ISSUED");
    if (issued.status !== "active" || issued.metadata.consumed === true) throw new Error("AUTHORITY_ROOT_ENROLLMENT_CHALLENGE_CONSUMED");
    const canonical = canonicalRootEnrollmentPayload(input.proof.challenge);
    if (issued.metadata.challengeHash !== canonical.hash) throw new Error("AUTHORITY_ROOT_ENROLLMENT_CHALLENGE_MISMATCH");
    const verification = verifyRootEnrollmentProof({ proof: input.proof, companyId });
    if (!verification.valid) return { ...verification, trustActivated: false, companyScoped: true };
    const now = new Date();
    const consumed: CompanyAsset = { ...issued, status: "retired", metadata: { ...issued.metadata, consumed: true, consumedAt: now.toISOString(), proofHash: createHash("sha256").update(input.proof.signature.value).digest("hex") }, updatedAt: now.toISOString() };
    if (!(await store.saveAsset(consumed, issued.version ?? 0))) throw new Error("AUTHORITY_ROOT_ENROLLMENT_CHALLENGE_CONSUMPTION_CONFLICT");
    return { ...verification, trustActivated: false, companyScoped: true };
  }

  async authorityRootEnrollmentStatus(_context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const anchors = this.authorityTrustAnchors();
    const historyPresent = (await this.authorityMandates()).length > 0;
    const challenges = (await store.listAssets(companyId))
      .filter((asset) => asset.kind === "company-authority-root-enrollment-challenge")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((asset) => {
        const challenge = asset.metadata.challenge as Record<string, unknown> | undefined;
        return {
          challengeId: asset.id,
          state: asset.status === "active" ? "issued" : asset.metadata.consumed === true ? "consumed" : asset.status,
          principalId: typeof challenge?.principalId === "string" ? challenge.principalId : null,
          role: typeof challenge?.role === "string" ? challenge.role : null,
          keyId: typeof challenge?.keyId === "string" ? challenge.keyId : null,
          publicKeySha256: typeof challenge?.publicKeySha256 === "string" ? challenge.publicKeySha256 : null,
          issuedAt: typeof challenge?.issuedAt === "string" ? challenge.issuedAt : asset.createdAt,
          expiresAt: typeof challenge?.expiresAt === "string" ? challenge.expiresAt : null,
          consumedAt: typeof asset.metadata.consumedAt === "string" ? asset.metadata.consumedAt : null,
        };
      });
    return { trustConfigured: anchors.length > 0, historyPresent, challenges, companyScoped: true, grantsAuthority: false, trustActivated: false };
  }

  async authorityMandateVerify(input: AuthorityMandateInput, _context: XspaRequestContext): Promise<unknown> {
    assertMandatePublicSafe(input.mandate);
    const { companyId } = this.requireRuntime();
    const trustAnchors = this.authorityTrustAnchors();
    if (trustAnchors.length === 0) return { verification: { valid: false, mandateId: input.mandate.id, active: false, reasons: ["AUTHORITY_TRUST_NOT_CONFIGURED"] }, trustConfigured: false, companyScoped: true, grantsAuthority: false };
    const ledgerSnapshot = await this.verifiedAuthorityLedger();
    await this.verifiedAuthorityKeyring(trustAnchors, ledgerSnapshot.mandates);
    const verification = verifyAuthorityMandate({ mandate: input.mandate, companyId, trustAnchors, ledger: ledgerSnapshot.mandates });
    return { verification, trustConfigured: true, companyScoped: true, grantsAuthority: false };
  }

  async authorityMandateApply(input: AuthorityMandateInput, context: XspaRequestContext): Promise<unknown> {
    assertMandatePublicSafe(input.mandate);
    const { store, companyId } = this.requireRuntime();
    const trustAnchors = this.authorityTrustAnchors();
    if (trustAnchors.length === 0) throw new Error("AUTHORITY_TRUST_NOT_CONFIGURED");
    const now = new Date();
    const fingerprint = createHash("sha256").update(JSON.stringify(input.mandate)).digest("hex");
    const reconcileDiscovery = async (mandate: AuthorityMandate, verification: ReturnType<typeof verifyAuthorityMandate>): Promise<DiscoveryRevision | null> => {
      if (!verification.valid || !mandate.claims.some((claim) => claim.type === "discovery-resolution" && claim.unknownId)) return null;
      const prior = await this.latestDiscovery();
      const claimIds = new Set(mandate.claims.filter((claim) => claim.type === "discovery-resolution").map((claim) => claim.unknownId).filter(Boolean));
      if (!prior?.unknowns.some((unknown) => unknown.status === "open" && claimIds.has(unknown.id))) return null;
      const revision = applyVerifiedMandateToDiscovery(prior, mandate, verification, now);
      const discoveryAsset = createDiscoveryAsset({ companyId, revision }, now);
      discoveryAsset.metadata.authorityMandateId = mandate.id;
      await store.saveAsset(discoveryAsset);
      return revision;
    };

    const existingSnapshot = await this.verifiedAuthorityLedger();
    await this.verifiedAuthorityKeyring(trustAnchors, existingSnapshot.mandates);
    const existing = existingSnapshot.mandates;
    const sameId = existing.find((item) => item.id === input.mandate.id);
    if (sameId) {
      const existingFingerprint = createHash("sha256").update(JSON.stringify(sameId)).digest("hex");
      if (existingFingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:authority_mandate_changed:${input.mandate.id}`);
      const verification = verifyAuthorityMandate({ mandate: sameId, companyId, trustAnchors, ledger: existing, now });
      const discoveryRevision = await reconcileDiscovery(sameId, verification);
      return { mandateId: sameId.id, status: "already-applied", verification, discoveryRevision, companyScoped: true, grantsAuthority: false, executesWork: false };
    }

    const idemKey = `company:authority-mandate:${input.mandate.id}`;
    const idemOwner = `mcp:authority-mandate:${input.mandate.id}`;
    const claim = await store.claimIdempotency(companyId, idemKey, { requestFingerprint: fingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const priorIntent = claim.record.intent as { requestFingerprint?: unknown };
      if (priorIntent.requestFingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:authority_mandate_changed:${input.mandate.id}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { mandateId: input.mandate.id, status: "contended", companyScoped: true, grantsAuthority: false, executesWork: false };
      throw new Error(`Authority mandate requires reconciliation:${input.mandate.id}`);
    }

    let assetPersisted = false;
    try {
      const asset: CompanyAsset = {
        id: input.mandate.id,
        companyId,
        kind: "company-authority-mandate",
        capability: "company.authority.mandate",
        department: "executive",
        cost: 0,
        currency: "USD",
        status: "active",
        grantRefs: [],
        restrictions: ["append-only", "signed", "no-private-key"],
        metadata: { mandate: structuredClone(input.mandate), payloadHash: input.mandate.payloadHash, issuerPrincipalId: input.mandate.issuerPrincipalId },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      let verification: ReturnType<typeof verifyAuthorityMandate> | undefined;
      let persisted = false;
      for (let attempt = 0; attempt < 3 && !persisted; attempt += 1) {
        const ledgerSnapshot = await this.verifiedAuthorityLedger();
        const ledger = ledgerSnapshot.mandates;
        const keyringSnapshot = await this.verifiedAuthorityKeyring(trustAnchors, ledger);
        verification = verifyAuthorityMandate({ mandate: input.mandate, companyId, trustAnchors, ledger, now });
        if (!verification.valid) throw new Error(`AUTHORITY_MANDATE_INVALID:${verification.reasons.join(",")}`);
        const headAsset = this.authorityLedgerHeadAsset([...ledger, input.mandate], ledgerSnapshot.headAsset, now);
        const keyringHeadAsset = this.authorityKeyringHeadAsset(keyringSnapshot.entries, keyringSnapshot.headAsset, now);
        persisted = await store.saveAssetsAtomically([
          { asset, expectedVersion: 0 },
          { asset: headAsset, expectedVersion: ledgerSnapshot.headAsset?.version ?? 0 },
          { asset: keyringHeadAsset, expectedVersion: keyringSnapshot.headAsset?.version ?? 0 },
        ]);
      }
      if (!persisted || !verification) throw new Error(`AUTHORITY_LEDGER_ATOMIC_CONFLICT:${input.mandate.id}`);
      assetPersisted = true;
      await store.appendEvent({ id: randomUUID(), companyId, type: "company.authority-mandate.applied", occurredAt: now.toISOString(), actorPrincipal: context.principal, correlationId: input.mandate.id, idempotencyKey: `company:authority-mandate:event:${input.mandate.id}:${input.mandate.payloadHash}`, payload: { mandateId: input.mandate.id, issuerPrincipalId: input.mandate.issuerPrincipalId, effect: input.mandate.effect, payloadHash: input.mandate.payloadHash }, sensitivity: "restricted", evidenceRefs: [`mandate:${input.mandate.id}`] });
      const discoveryRevision = await reconcileDiscovery(input.mandate, verification);
      const result = { mandateId: input.mandate.id, status: "applied", verification, discoveryRevision, companyScoped: true, grantsAuthority: false, executesWork: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Authority mandate idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, assetPersisted ? "unknown" : "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Authority mandate apply failed");
      throw error;
    }
  }

  async authorityMandateStatus(_context: XspaRequestContext): Promise<unknown> {
    const { companyId } = this.requireRuntime();
    const trustAnchors = this.authorityTrustAnchors();
    const ledgerSnapshot = await this.verifiedAuthorityLedger();
    const ledger = ledgerSnapshot.mandates;
    if (trustAnchors.length === 0) return { trustConfigured: false, mandates: [], companyScoped: true };
    await this.verifiedAuthorityKeyring(trustAnchors, ledger);
    const state = deriveActiveMandates(ledger, companyId, trustAnchors);
    return { trustConfigured: true, mandates: ledger.map((mandate) => ({ id: mandate.id, issuerPrincipalId: mandate.issuerPrincipalId, subject: mandate.subject, effect: mandate.effect, scopes: mandate.scopes, issuedAt: mandate.issuedAt, expiresAt: mandate.expiresAt ?? null, payloadHash: mandate.payloadHash, verification: state.get(mandate.id) ?? null })), companyScoped: true };
  }

  async companyDiscoveryPlan(input: CompanyDiscoveryPlanInput, _context: XspaRequestContext): Promise<unknown> {
    const { companyId } = this.requireRuntime();
    const parent = input.parentRevisionId ? await this.discoveryByRevisionId(input.parentRevisionId) : null;
    if (input.parentRevisionId && !parent) throw new Error("DISCOVERY_PARENT_NOT_FOUND");
    const revision = buildDiscoveryRevision({ companyId, evidence: input.evidence, facts: input.facts, unknowns: input.unknowns, capabilities: input.capabilities, parent });
    return { revision, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
  }

  async companyDiscoveryApply(input: CompanyDiscoveryApplyInput, context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const now = new Date();
    const idemKey = `company:discovery:${input.discoveryId}`;
    const idemOwner = `mcp:company-discovery:${input.discoveryId}`;
    const requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const claim = await store.claimIdempotency(companyId, idemKey, { requestFingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const prior = claim.record.intent as { requestFingerprint?: unknown };
      if (prior.requestFingerprint !== requestFingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:company_discovery_changed:${input.discoveryId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { discoveryId: input.discoveryId, status: "contended", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false };
      throw new Error(`Company discovery requires reconciliation:${input.discoveryId}`);
    }
    let assetPersisted = false;
    try {
      const parent = input.parentRevisionId ? await this.discoveryByRevisionId(input.parentRevisionId) : null;
      if (input.parentRevisionId && !parent) throw new Error("DISCOVERY_PARENT_NOT_FOUND");
      assertUntrustedDiscoveryWriteSafe(input, parent);
      const revision = buildDiscoveryRevision({ companyId, evidence: input.evidence, facts: input.facts, unknowns: input.unknowns, capabilities: input.capabilities, parent }, now);
      if (input.expectedFingerprint && input.expectedFingerprint !== revision.fingerprint) throw new Error("PLAN_FINGERPRINT_MISMATCH:company_discovery");
      const asset = createDiscoveryAsset({ companyId, revision }, now);
      asset.metadata.discoveryId = input.discoveryId;
      await store.saveAsset(asset);
      assetPersisted = true;
      await store.appendEvent({ id: randomUUID(), companyId, type: "company.discovery.applied", occurredAt: now.toISOString(), actorPrincipal: context.principal, correlationId: input.discoveryId, idempotencyKey: `company:discovery:event:${input.discoveryId}:${revision.fingerprint}`, payload: { discoveryId: input.discoveryId, assetId: asset.id, revisionId: revision.revisionId, parentRevisionId: revision.parentRevisionId, sequence: revision.sequence, fingerprint: revision.fingerprint }, sensitivity: "internal", evidenceRefs: revision.sourceRefs });
      const result = { discoveryId: input.discoveryId, assetId: asset.id, revision, status: "applied", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Company discovery idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, assetPersisted ? "unknown" : "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Company discovery apply failed");
      throw error;
    }
  }

  async companyDiscoveryStatus(_context: XspaRequestContext): Promise<unknown> {
    const revision = await this.latestDiscovery();
    return revision ? { state: "found", revision, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false } : { state: "not-found", companyScoped: true };
  }

  async companyDiscoveryOrchestrate(input: CompanyDiscoveryOrchestrateInput, _context: XspaRequestContext): Promise<unknown> {
    const { companyId } = this.requireRuntime();
    const prior = input.parentRevisionId ? await this.discoveryByRevisionId(input.parentRevisionId) : await this.latestDiscovery();
    if (input.parentRevisionId && !prior) throw new Error("DISCOVERY_PARENT_NOT_FOUND");
    const connectors = input.systems.map((system) => new ManifestBusinessSystemConnector({
      id: system.id, label: system.label, kind: system.kind, confidence: system.confidence, signalCapabilities: system.signalCapabilities,
    }));
    const result = await new GenericDiscoveryOrchestrator().run({ companyId, connectors, prior });
    const organizationReady = result.readiness.find((item) => item.scope === "organization")?.sufficient === true;
    const governanceReady = result.readiness.find((item) => item.scope === "governance")?.sufficient === true;
    return { ...result, companyScoped: true, readyForOrganizationSynthesis: organizationReady && governanceReady };
  }

  createObservedSignalDaemon(connectors: Array<BusinessSystemConnector | ConfiguredObservedConnector>): GovernedObservedSignalDaemon {
    const { store, companyId } = this.requireRuntime();
    const registry = new BusinessSystemConnectorRegistry();
    for (const entry of connectors) {
      if ("connector" in entry) registry.register(entry.connector, { enabled: entry.enabled });
      else registry.register(entry);
    }
    const scheduler = new GovernedObservedSignalScheduler({
      store,
      loadConstitution: async () => {
        const operatingModel = await this.latestOperatingModelSnapshot();
        if (!operatingModel) throw new Error("COMPANY_OPERATING_MODEL_NOT_FOUND");
        return projectCompanyConstitution({ companyId, operatingModel, discovery: await this.latestDiscovery() });
      },
      loadWakeState: async () => this.latestWakeState(),
      persistWakeResult: async (result, _events, expectedVersion, now) => {
        const evaluationId = randomUUID();
        const stateSaved = await store.saveAsset(createWakeStateAsset({ companyId, evaluationId, state: result.state }, now), expectedVersion);
        if (!stateSaved) throw new Error("OBSERVED_SIGNAL_WAKE_STATE_VERSION_CONFLICT");
        for (const proposal of result.proposals) {
          const proposalSaved = await store.saveAsset(createWakeProposalAsset(proposal, evaluationId, now), 0);
          if (!proposalSaved) throw new Error(`OBSERVED_SIGNAL_WAKE_PROPOSAL_CONFLICT:${proposal.id}`);
        }
      },
    });
    return new GovernedObservedSignalDaemon(registry, scheduler);
  }

  async companyWakeEvaluate(input: CompanyWakeEvaluateInput, context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const startedAt = new Date();
    const idemKey = `company:wake:${input.evaluationId}`;
    const idemOwner = `mcp:company-wake:${input.evaluationId}`;
    const requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const existing = await store.getIdempotency(companyId, idemKey);
    if (existing) {
      const prior = existing.intent as { requestFingerprint?: unknown };
      if (prior.requestFingerprint !== requestFingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:company_wake_changed:${input.evaluationId}`);
      if (existing.state === "applied" && existing.result) return structuredClone(existing.result);
      if (existing.state === "intent") return { evaluationId: input.evaluationId, status: "contended", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, workCreated: false };
      throw new Error(`Company wake evaluation requires reconciliation:${input.evaluationId}`);
    }
    const leaseOwner = `mcp:company-wake:${input.evaluationId}`;
    const lease = await store.claimHeartbeatLease(companyId, leaseOwner, startedAt, 30_000);
    if (!lease) return { evaluationId: input.evaluationId, status: "contended", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, workCreated: false };
    try {
      const claim = await store.claimIdempotency(companyId, idemKey, { requestFingerprint }, idemOwner, startedAt);
      if (!claim.claimed) {
        const prior = claim.record.intent as { requestFingerprint?: unknown };
        if (prior.requestFingerprint !== requestFingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:company_wake_changed:${input.evaluationId}`);
        if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
        if (claim.record.state === "intent") return { evaluationId: input.evaluationId, status: "contended", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, workCreated: false };
        throw new Error(`Company wake evaluation requires reconciliation:${input.evaluationId}`);
      }
      let persisted = false;
      try {
        const operatingModel = await this.latestOperatingModelSnapshot();
        if (!operatingModel) throw new Error("COMPANY_OPERATING_MODEL_NOT_FOUND");
        const discovery = await this.latestDiscovery();
        const constitution = projectCompanyConstitution({ companyId, operatingModel, discovery });
        const events = input.events.map((event) => ({ ...event, companyId, signal: { provenance: "asserted" as const, sourceId: event.signal?.sourceId ?? event.actorPrincipal, topic: event.signal?.topic ?? event.type, ...(event.signal?.capability ? { capability: event.signal.capability } : {}) } }));
        const signalClaims: Array<{ key: string; owner: string; fencingToken: number; eventId: string }> = [];
        const settledSignalKeys = new Set<string>();
        const freshEvents: BusinessEvent[] = [];
        for (const event of events) {
          const key = `company:wake:signal:${event.id}`;
          const owner = `${idemOwner}:signal:${event.id}`;
          const eventFingerprint = createHash("sha256").update(JSON.stringify(event)).digest("hex");
          const signalClaim = await store.claimIdempotency(companyId, key, { eventFingerprint }, owner, startedAt);
          if (!signalClaim.claimed) {
            const prior = signalClaim.record.intent as { eventFingerprint?: unknown };
            if (prior.eventFingerprint !== eventFingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:company_wake_signal_changed:${event.id}`);
            if (signalClaim.record.state === "applied") continue;
            throw new Error(`Company wake signal requires reconciliation:${event.id}`);
          }
          signalClaims.push({ key, owner, fencingToken: signalClaim.record.fencingToken, eventId: event.id });
          freshEvents.push(event);
        }
        try {
          const priorWake = await this.latestWakeState();
          const wake = new GovernedWakeEngine().evaluate({ companyId, constitution, events: freshEvents, priorState: priorWake.state, now: startedAt });
          const beforePersist = new Date();
          if (!(await store.isHeartbeatLeaseCurrent(lease, beforePersist))) throw new Error("Company wake stale heartbeat lease before state persistence");
          const stateSaved = await store.saveAsset(createWakeStateAsset({ companyId, evaluationId: input.evaluationId, state: wake.state }, startedAt), priorWake.version);
          if (!stateSaved) throw new Error("Company wake state version conflict");
          persisted = true;
          for (const proposal of wake.proposals) {
            const proposalSaved = await store.saveAsset(createWakeProposalAsset(proposal, input.evaluationId, startedAt), 0);
            if (!proposalSaved) throw new Error(`Company wake proposal already exists:${proposal.id}`);
          }
          await store.appendEvent({
            id: randomUUID(), companyId, type: "company.wake.evaluated", occurredAt: startedAt.toISOString(), actorPrincipal: context.principal, correlationId: input.evaluationId,
            idempotencyKey: `company:wake:event:${input.evaluationId}:${requestFingerprint}`,
            payload: { evaluationId: input.evaluationId, eventCount: events.length, observedEventCount: freshEvents.filter((event) => event.signal?.provenance === "observed").length, assertedEventCount: freshEvents.filter((event) => event.signal?.provenance === "asserted").length, newEventCount: freshEvents.length, duplicateEventCount: events.length - freshEvents.length, decisionCount: wake.decisions.length, proposalIds: wake.proposals.map((proposal) => proposal.id) },
            sensitivity: "internal", evidenceRefs: [...new Set(freshEvents.filter((event) => event.signal?.provenance === "observed").flatMap((event) => event.evidenceRefs))],
          });
          for (const signalClaim of signalClaims) {
            const signalSettled = await store.markIdempotency(companyId, signalClaim.key, signalClaim.owner, signalClaim.fencingToken, "applied", startedAt, { eventId: signalClaim.eventId, evaluationId: input.evaluationId });
            if (!signalSettled) throw new Error(`Company wake signal idempotency fencing lost:${signalClaim.eventId}`);
            settledSignalKeys.add(signalClaim.key);
          }
          const result = { evaluationId: input.evaluationId, status: "evaluated", ...wake, companyScoped: true, workCreated: false, requiresAuthorityAdjudication: wake.proposals.length > 0, duplicateEventCount: events.length - freshEvents.length };
          const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", startedAt, result);
          if (!settled) throw new Error("Company wake idempotency fencing lost");
          return result;
        } catch (error) {
          const failureTime = new Date();
          for (const signalClaim of signalClaims) {
            if (settledSignalKeys.has(signalClaim.key)) continue;
            await store.markIdempotency(companyId, signalClaim.key, signalClaim.owner, signalClaim.fencingToken, persisted ? "unknown" : "failed", failureTime, undefined, error instanceof Error ? error.message.slice(0, 240) : "Company wake signal failed");
          }
          throw error;
        }
      } catch (error) {
        await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, persisted ? "unknown" : "failed", new Date(), undefined, error instanceof Error ? error.message.slice(0, 240) : "Company wake evaluation failed");
        throw error;
      }
    } finally {
      await store.releaseHeartbeatLease(lease, new Date());
    }
  }

  async companyWakeStatus(_context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const assets = await store.listAssets(companyId);
    const stateAssets = assets.filter((asset) => asset.kind === "company-wake-state" && asset.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const proposalAssets = assets.filter((asset) => asset.kind === "company-wake-proposal" && asset.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const state = stateAssets[0] ? wakeStateFromAsset(stateAssets[0]) : [];
    const proposals = proposalAssets.slice(0, 50).map((asset) => asset.metadata.proposal).filter(Boolean);
    return { state: stateAssets.length > 0 ? "found" : "not-found", accumulatorState: state, proposals, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, workCreated: false };
  }

  private async buildCompanyOperatingModel(input: CompanyPlanInput): Promise<CompanyOperatingModelPlan> {
    const { store, companyId } = this.requireRuntime();
    const assets = await store.listAssets(companyId);
    const installations = assets.filter((asset) => asset.kind === "skill-installation" && asset.status === "active").map(skillInstallationFromAsset);
    const localDefinitions = assets.filter((asset) => asset.kind === "company-skill-definition" && asset.status === "active").map(companySkillDefinitionFromAsset);
    const catalog = [...(this.input.skillRegistry?.list({ domain: "company", companyId }) ?? []), ...localDefinitions];
    const discovery = await this.latestDiscovery();
    return planCompanyOperatingModel({ companyId, intake: input.intake, existingAssets: assets, catalog, existingInstallations: installations, discovery });
  }

  async companyPlan(input: CompanyPlanInput, _context: XspaRequestContext): Promise<unknown> {
    const plan = await this.buildCompanyOperatingModel(input);
    return { plan, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, invokesKast: false };
  }

  async companyApply(input: CompanyApplyInput, context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const now = new Date();
    const idemKey = `company:operating-model:${input.formationId}`;
    const idemOwner = `mcp:company-operating-model:${input.formationId}`;
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ intake: input.intake, expectedFingerprint: input.expectedFingerprint ?? null })).digest("hex");
    const claim = await store.claimIdempotency(companyId, idemKey, { requestFingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const prior = claim.record.intent as { requestFingerprint?: unknown };
      if (prior.requestFingerprint !== requestFingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:company_operating_model_changed:${input.formationId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { formationId: input.formationId, status: "contended", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false };
      throw new Error(`Company operating model requires reconciliation:${input.formationId}`);
    }
    let assetPersisted = false;
    try {
      const plan = await this.buildCompanyOperatingModel(input);
      if (input.expectedFingerprint && input.expectedFingerprint !== plan.fingerprint) throw new Error("PLAN_FINGERPRINT_MISMATCH:company_operating_model");
      const asset = createCompanyOperatingModelAsset({ companyId, formationId: input.formationId, plan }, now);
      await store.saveAsset(asset);
      assetPersisted = true;
      const evidenceRefs = [...new Set([...plan.departments.flatMap((department) => department.evidenceRefs), ...plan.processes.flatMap((process) => process.evidenceRefs)])];
      await store.appendEvent({
        id: randomUUID(), companyId, type: "company.operating-model.applied", occurredAt: now.toISOString(), actorPrincipal: context.principal, correlationId: input.formationId,
        idempotencyKey: `company:operating-model:event:${input.formationId}:${plan.fingerprint}`,
        payload: { formationId: input.formationId, assetId: asset.id, fingerprint: plan.fingerprint, mode: plan.mode, departmentCount: plan.departments.length, processCount: plan.processes.length },
        sensitivity: "internal", evidenceRefs,
      });
      const result = { formationId: input.formationId, assetId: asset.id, fingerprint: plan.fingerprint, mode: plan.mode, status: "applied", recommendedWork: plan.recommendedWork, readinessGaps: plan.readinessGaps, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false, executesWork: false, invokesKast: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Company operating-model idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, assetPersisted ? "unknown" : "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Company operating model apply failed");
      throw error;
    }
  }

  async companyStatus(_context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const assets = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-operating-model" && asset.status === "active");
    if (assets.length === 0) return { state: "not-found", companyScoped: true };
    const snapshots = assets.map((asset) => ({ asset, snapshot: companyOperatingModelFromAsset(asset) }));
    snapshots.sort((a, b) => b.snapshot.appliedAt.localeCompare(a.snapshot.appliedAt) || b.asset.updatedAt.localeCompare(a.asset.updatedAt) || b.asset.id.localeCompare(a.asset.id));
    const current = snapshots[0]!;
    return { state: "found", assetId: current.asset.id, operatingModel: current.snapshot, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false };
  }

  async kastStatus(reflectionId: string, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const record = await store.getIdempotency(companyId, `kast:reflection:${reflectionId}`);
    if (!record) return { reflectionId, state: "not-found", companyScoped: true };
    if (record.state === "unknown") return { reflectionId, state: "reconciliation-required", companyScoped: true };
    if (record.state === "failed") return { reflectionId, state: "failed", companyScoped: true };
    const job = await store.getJob(companyId, reflectionId);
    if (!job) {
      const result = record.result as { status?: unknown } | undefined;
      return { reflectionId, state: typeof result?.status === "string" ? result.status : record.state, companyScoped: true };
    }
    const state = job.state === "pending" ? "queued" : job.state;
    return { reflectionId, state, kind: job.kind, attempts: job.attempts, companyScoped: true };
  }

  async assetGet(assetId: string, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const asset = (await store.listAssets(companyId)).find((item) => item.id === assetId);
    if (!asset) return { assetId, state: "not-found", companyScoped: true };
    const visibility = typeof asset.metadata.visibility === "string" ? asset.metadata.visibility : "";
    if (asset.restrictions.includes("internal-candidate") || asset.restrictions.includes("not-chat-visible") || visibility === "internal-candidate") {
      return { assetId, state: "not-found", companyScoped: true };
    }
    const rawRef = typeof asset.metadata.artifactRef === "string" ? asset.metadata.artifactRef : "";
    const externallyResolvable = rawRef.startsWith("https://") || rawRef.startsWith("asset://");
    return {
      state: "found",
      companyScoped: true,
      asset: {
        id: asset.id, kind: asset.kind, capability: asset.capability, department: asset.department, status: asset.status,
        cost: asset.cost, currency: asset.currency, visibility: visibility || "selected",
        ...(typeof asset.metadata.mimeType === "string" ? { mimeType: asset.metadata.mimeType } : {}),
        ...(typeof asset.metadata.missionId === "string" ? { missionId: asset.metadata.missionId } : {}),
        ...(externallyResolvable ? { artifactRef: rawRef, artifactReady: true } : { artifactReady: false }),
      },
    };
  }

  async creativeSubmit(input: CreativeSubmitInput, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const mission: CreativeMission = {
      id: input.missionId,
      companyId,
      workId: input.workId,
      supervisorPrincipal: this.input.creativeSupervisorPrincipal ?? "creative-supervisor",
      briefRef: input.briefRef,
      evidenceSnapshotRef: input.evidenceSnapshotRef,
      candidateCount: input.candidateCount,
      requiredSuccessfulCandidates: input.requiredSuccessfulCandidates,
      executiveEscalationRequired: input.executiveEscalationRequired,
      createdAt: new Date().toISOString(),
    };
    const receipt = await submitCreativeMission(store, mission);
    return { ...receipt, candidateArtVisible: false, companyScoped: true };
  }

  async creativeStatus(missionId: string, _context: XspaRequestContext): Promise<unknown> {
    const { store, companyId } = this.requireRuntime();
    const completed = await store.getIdempotency(companyId, `creative:mission:${missionId}`);
    if (completed?.state === "applied") {
      const receipt = extractReceipt(completed.result);
      return {
        missionId,
        state: "completed",
        ...(receipt ? { receipt } : {}),
        candidateArtVisible: false,
      };
    }
    if (completed?.state === "unknown") return { missionId, state: "reconciliation-required", candidateArtVisible: false };
    if (completed?.state === "intent") return { missionId, state: "running", candidateArtVisible: false };
    const submitted = await store.getIdempotency(companyId, `creative:submit:${missionId}`);
    if (submitted?.state === "applied") return { missionId, state: "queued", candidateArtVisible: false };
    if (submitted?.state === "failed") return { missionId, state: "submission-failed", candidateArtVisible: false };
    return { missionId, state: "not-found", candidateArtVisible: false };
  }

  private requireSkills(): SkillRegistry {
    if (!this.input.skillRegistry) throw new Error("XanxitoSpA Skill Registry is not configured");
    return this.input.skillRegistry;
  }

  private async companySkillState(): Promise<{ companyId: string; assets: CompanyAsset[]; installations: CompanyAsset[]; definitions: SkillDefinition[]; genes: CorporateGene[] }> {
    const { store, companyId } = this.requireRuntime();
    if (!this.input.workStore) throw new Error("XanxitoSpA Company skill store is not configured");
    const [assets, genes] = await Promise.all([store.listAssets(companyId), this.input.workStore.listGenes(companyId)]);
    const installations = assets.filter((asset) => asset.kind === "skill-installation" && asset.status === "active");
    const definitions = assets.filter((asset) => asset.kind === "company-skill-definition" && asset.status === "active").map(companySkillDefinitionFromAsset);
    return { companyId, assets, installations, definitions, genes };
  }

  async skillsList(_context: XspaRequestContext): Promise<unknown> {
    const registry = this.requireSkills();
    const state = await this.companySkillState();
    const installed = state.installations.map(skillInstallationFromAsset).filter((item) => item.status === "active");
    const installedRefs = new Set(installed.map((item) => item.skillRef));
    const catalog = registry.list({ domain: "company", companyId: state.companyId }).map((skill) => ({ ...skill, installed: installedRefs.has(skillDefinitionRef(skill)) }));
    const local = state.definitions.map((skill) => ({ ...skill, installed: installedRefs.has(skillDefinitionRef({ id: skill.id, version: skill.version })) }));
    return { catalog, companyLocal: local, installations: installed, fullBodiesLoaded: false, progressiveDisclosure: true, companyScoped: true };
  }

  async skillsSearch(input: SkillSearchRequest, _context: XspaRequestContext): Promise<unknown> {
    const registry = this.requireSkills();
    const state = await this.companySkillState();
    const installedMatches = resolveCompanySkillMatches({
      companyId: state.companyId,
      query: input.query,
      ...(input.department ? { department: input.department } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      capabilities: input.capabilities,
      catalog: registry.list({ domain: "company", companyId: state.companyId }),
      installations: state.installations,
      genes: state.genes,
      companyDefinitions: state.definitions,
      limit: input.limit,
    });
    const catalogSuggestions = registry.search({
      query: input.query,
      ...(input.department ? { department: input.department } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      capabilities: input.capabilities,
      domain: "company",
      companyId: state.companyId,
      limit: input.limit,
    });
    return { installedMatches, catalogSuggestions, fullBodiesLoaded: false, progressiveDisclosure: true, companyScoped: true };
  }

  async skillGet(input: SkillGetRequest, _context: XspaRequestContext): Promise<unknown> {
    const registry = this.requireSkills();
    const state = await this.companySkillState();
    const installedRefs = new Set(state.installations.map(skillInstallationFromAsset).filter((item) => item.status === "active").map((item) => item.skillRef));
    const localAsset = state.assets.find((asset) => {
      if (asset.kind !== "company-skill-definition") return false;
      const definition = companySkillDefinitionFromAsset(asset);
      return definition.id === input.skillId && (!input.version || definition.version === input.version);
    });
    if (localAsset) {
      const definition = companySkillDefinitionFromAsset(localAsset);
      const ref = skillDefinitionRef({ id: definition.id, version: definition.version });
      if (!installedRefs.has(ref)) return { state: "not-installed", skillId: input.skillId, companyScoped: true };
      const instructions = typeof localAsset.metadata.instructions === "string" ? localAsset.metadata.instructions : "";
      return { state: "found", skill: { manifest: definition, body: instructions }, progressiveDisclosure: true, companyScoped: true };
    }
    const catalogEntry = registry.list({ domain: "company", companyId: state.companyId }).find((item) => item.id === input.skillId && (!input.version || item.version === input.version));
    if (!catalogEntry) return { state: "not-found", skillId: input.skillId, companyScoped: true };
    if (!installedRefs.has(skillDefinitionRef(catalogEntry))) return { state: "not-installed", skillId: input.skillId, companyScoped: true };
    const loaded = await registry.get(input.skillId, { ...(input.version ? { version: input.version } : {}), domain: "company", companyId: state.companyId });
    return loaded ? { state: "found", skill: loaded, progressiveDisclosure: true, companyScoped: true } : { state: "not-found", skillId: input.skillId, companyScoped: true };
  }

  async skillInstall(input: SkillInstallInput, context: XspaRequestContext): Promise<unknown> {
    const registry = this.requireSkills();
    const { store, companyId } = this.requireRuntime();
    const now = new Date();
    const definition = registry.resolveRef(input.skillRef, { domain: "company", companyId });
    if (!definition) throw new Error(`active Company skill not found:${input.skillRef}`);
    if (definition.ownerCompanyId) throw new Error("Company-local skills are installed through the Company AutoSkill path");
    const stable = { skillRef: input.skillRef, department: input.department, scopes: [...new Set(input.scopes)].sort() };
    const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
    const idemKey = `company:skill-install:${input.installationId}`;
    const idemOwner = `mcp:skill-install:${input.installationId}`;
    const claim = await store.claimIdempotency(companyId, idemKey, { fingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const prior = claim.record.intent as { fingerprint?: unknown };
      if (prior.fingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:skill_install_changed:${input.installationId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { installationId: input.installationId, status: "contended", companyScoped: true };
      throw new Error(`Company skill installation requires reconciliation:${input.installationId}`);
    }
    try {
      const activeInstallations = (await store.listAssets(companyId)).filter((asset) => asset.kind === "skill-installation" && asset.status === "active").map(skillInstallationFromAsset);
      const existing = activeInstallations.find((item) => item.skillRef === input.skillRef && item.department === input.department);
      if (existing) {
        const result = { installationId: existing.assetId, skillRef: input.skillRef, status: "already-installed", companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false };
        const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
        if (!settled) throw new Error("Company skill installation idempotency fencing lost");
        return result;
      }
      const asset = createSkillInstallationAsset({ companyId, skill: definition, department: input.department, scopes: input.scopes, source: "catalog", assetId: input.installationId }, now);
      await store.saveAsset(asset);
      await store.appendEvent({ id: randomUUID(), companyId, type: "company.skill.installed", occurredAt: now.toISOString(), actorPrincipal: context.principal, correlationId: input.installationId, idempotencyKey: `company:skill-installed:${input.installationId}:${fingerprint}`, payload: { installationId: asset.id, skillRef: input.skillRef, department: input.department, scopes: input.scopes }, sensitivity: "internal", evidenceRefs: [] });
      const result = { installationId: asset.id, skillRef: input.skillRef, status: "installed", capabilitiesRequired: definition.capabilities, companyScoped: true, grantsAuthority: false, grantsBudget: false, grantsCapabilities: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Company skill installation idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Company skill installation failed");
      throw error;
    }
  }

  async skillsHealth(_context: XspaRequestContext): Promise<unknown> {
    return this.requireSkills().health();
  }

  async companySkillPlan(input: CompanySkillPlanInput, _context: XspaRequestContext): Promise<unknown> {
    const registry = this.requireSkills();
    const state = await this.companySkillState();
    const plan = planCompanySkillBootstrap({
      companyId: state.companyId,
      mode: input.mode,
      purpose: input.purpose,
      departments: input.departments,
      requiredCapabilities: input.requiredCapabilities,
      catalog: [...registry.list({ domain: "company", companyId: state.companyId }), ...state.definitions],
      existingInstallations: state.installations.map(skillInstallationFromAsset),
      observedProcesses: input.observedProcesses,
    });
    return { plan, companyScoped: true, grantsAuthority: false, grantsBudget: false };
  }

  async autoskillPropose(input: AutoskillProposeInput, context: XspaRequestContext): Promise<unknown> {
    const { store, workStore, companyId } = this.requireWorkRuntime();
    const now = new Date();
    const stable = { skillId: input.skillId, name: input.name, description: input.description, instructions: input.instructions, department: input.department, triggers: [...new Set(input.triggers)].sort(), scopes: [...new Set(input.scopes)].sort(), capabilities: [...new Set(input.capabilities)].sort(), evidenceRefs: [...new Set(input.evidenceRefs)].sort() };
    const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
    const idemKey = `company:autoskill:${input.proposalId}`;
    const idemOwner = `mcp:autoskill:${input.proposalId}`;
    const claim = await store.claimIdempotency(companyId, idemKey, { fingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const prior = claim.record.intent as { fingerprint?: unknown };
      if (prior.fingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:autoskill_changed:${input.proposalId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { proposalId: input.proposalId, status: "contended", companyScoped: true };
      throw new Error(`Company AutoSkill requires reconciliation:${input.proposalId}`);
    }
    try {
      const globalCollision = this.requireSkills().list({ domain: "company", companyId }).find((definition) => definition.id === input.skillId);
      if (globalCollision) throw new Error(`company skill id conflicts with reusable catalog:${input.skillId}`);
      const existingLocal = (await store.listAssets(companyId)).filter((asset) => asset.kind === "company-skill-definition" && asset.status === "active").map(companySkillDefinitionFromAsset).find((definition) => definition.id === input.skillId);
      if (existingLocal) throw new Error(`company skill id already exists:${input.skillId}`);
      const definitionAsset = createCompanySkillDefinitionAsset({ companyId, skillId: input.skillId, name: input.name, description: input.description, instructions: input.instructions, triggers: input.triggers, scopes: input.scopes, capabilities: input.capabilities, department: input.department, evidenceRefs: input.evidenceRefs }, now);
      const definition = companySkillDefinitionFromAsset(definitionAsset);
      const installationAsset = createSkillInstallationAsset({ companyId, skill: definition, department: input.department, scopes: input.scopes, source: "company-local" }, now);
      const gene = buildCompanySkillGene({ companyId, skillId: definition.id, artifactRef: `asset://${definitionAsset.id}`, department: input.department, scopes: input.scopes, capabilities: input.capabilities, evidenceRefs: input.evidenceRefs });
      await store.saveAsset(definitionAsset);
      await store.saveAsset(installationAsset);
      await workStore.saveGene(gene);
      await store.appendEvent({ id: randomUUID(), companyId, type: "company.skill.candidate.created", occurredAt: now.toISOString(), actorPrincipal: context.principal, correlationId: input.proposalId, idempotencyKey: `company:autoskill:event:${input.proposalId}:${fingerprint}`, payload: { proposalId: input.proposalId, skillId: definition.id, definitionAssetId: definitionAsset.id, installationAssetId: installationAsset.id, geneId: gene.id }, sensitivity: "internal", evidenceRefs: input.evidenceRefs });
      const result = { proposalId: input.proposalId, skillId: definition.id, status: "candidate", definitionAssetId: definitionAsset.id, installationAssetId: installationAsset.id, gene: { id: gene.id, type: gene.type, status: gene.status, version: gene.version }, companyScoped: true, directGlobalWrite: false, kastUsed: false };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("Company AutoSkill idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "Company AutoSkill failed");
      throw error;
    }
  }

  async globalSkillPromotionPropose(input: GlobalSkillPromotionInput, context: XspaRequestContext): Promise<unknown> {
    const state = await this.companySkillState();
    const asset = state.assets.find((item) => item.kind === "company-skill-definition" && companySkillDefinitionFromAsset(item).id === input.skillId);
    if (!asset) throw new Error(`company-local skill not found:${input.skillId}`);
    const gene = state.genes.filter((item) => item.type === "skill" && item.artifactRef === `asset://${asset.id}`).sort((a, b) => b.version - a.version)[0];
    if (!gene || gene.status !== "champion") throw new Error("global skill promotion requires a champion Company SkillGene");
    if (gene.fitness.sampleSize < 1 || gene.fitness.riskIncidents > 0) throw new Error("global skill promotion requires verified samples and zero risk incidents");
    const definition = companySkillDefinitionFromAsset(asset);
    const summary = [`Promote proven Company skill ${definition.id} (${definition.name}) to the reusable global Skill Registry.`, input.summary, `Source Company SkillGene: ${gene.id}@${gene.version}; sample_size=${gene.fitness.sampleSize}; confidence=${gene.fitness.confidence}; risk_incidents=${gene.fitness.riskIncidents}.`, "Preserve company-neutral behavior only; remove company-specific data; progressive disclosure and registry health remain mandatory."].join(" ").slice(0, 2000);
    const result = await this.kastReflect({ reflectionId: input.proposalId, sessionRef: input.sessionRef, mode: "improve", category: "opportunity", severity: input.severity, summary, evidenceRefs: [...new Set([...input.evidenceRefs, ...gene.experienceRefs])], recurrence: Math.max(1, gene.fitness.sampleSize), affectedSurfaces: ["skill"], strategyOverlays: ["global-skill-promotion", "skill-registry"] }, context);
    return { proposalId: input.proposalId, skillId: definition.id, sourceGene: { id: gene.id, version: gene.version, status: gene.status }, companyScoped: true, globalWriteDirect: false, kast: result };
  }

  async kastReflect(input: KastReflectInput, context: XspaRequestContext): Promise<unknown> {
    const kastTextFields = [input.sessionRef, input.summary, ...input.evidenceRefs, ...input.strategyOverlays];
    if (kastTextFields.some((value) => SECRET_LIKE.test(value))) throw new Error("KAST reflection contains secret-like material");
    if (input.mode === "noop") return { reflectionId: input.reflectionId, status: "no-op" };
    const { store, companyId } = this.requireRuntime();
    const now = new Date();
    const affected = [...new Set(input.affectedSurfaces)].sort();
    const founderRequired = input.mode === "improve" && affected.some((surface) => PROTECTED.has(surface));
    const stablePayload = {
      id: input.reflectionId,
      companyId,
      sessionRef: input.sessionRef,
      requestedMode: input.mode,
      category: input.category,
      severity: input.severity,
      summary: input.summary,
      evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
      recurrence: input.recurrence,
      affectedSurfaces: affected,
      strategyOverlays: [...new Set(input.strategyOverlays)].slice(0, 4),
      containsRawSecrets: false,
      containsRawConversation: false,
    };
    const payload = { ...stablePayload, observedAt: now.toISOString() };
    const fingerprint = createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
    const idemKey = `kast:reflection:${input.reflectionId}`;
    const idemOwner = `mcp:kast:${input.reflectionId}`;
    const claim = await store.claimIdempotency(companyId, idemKey, { fingerprint }, idemOwner, now);
    if (!claim.claimed) {
      const priorIntent = claim.record.intent as { fingerprint?: unknown };
      if (priorIntent.fingerprint !== fingerprint) throw new Error(`IDEMPOTENCY_CONFLICT:kast_reflection_changed:${input.reflectionId}`);
      if (claim.record.state === "applied" && claim.record.result) return structuredClone(claim.record.result);
      if (claim.record.state === "intent") return { reflectionId: input.reflectionId, status: "contended", queued: false };
      throw new Error(`KAST reflection requires reconciliation:${input.reflectionId}`);
    }
    const event: BusinessEvent = {
      id: randomUUID(),
      companyId,
      type: founderRequired ? "kast.reflection.founder_required" : "kast.reflection.requested",
      occurredAt: now.toISOString(),
      actorPrincipal: context.principal,
      correlationId: input.sessionRef,
      idempotencyKey: `kast:reflection:${input.reflectionId}:${fingerprint}`,
      payload,
      sensitivity: "internal",
      evidenceRefs: payload.evidenceRefs,
    };
    try {
      await store.appendEvent(event);
      if (founderRequired) {
        const result = { reflectionId: input.reflectionId, status: "founder-required", queued: false };
        const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
        if (!settled) throw new Error("KAST reflection idempotency fencing lost");
        return result;
      }

      const job: ScheduledJob<typeof payload> = {
      id: input.reflectionId,
      companyId,
      kind: input.mode === "remember" ? "kast.remember" : "kast.improve",
      payload,
      materiality: materiality(input.severity),
      dueAt: now.toISOString(),
      state: "pending",
      attempts: 0,
      maxAttempts: 3,
      fencingToken: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
      await store.enqueueJob(job);
      const result = { reflectionId: input.reflectionId, status: "queued", kind: job.kind, queued: true };
      const settled = await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "applied", now, result);
      if (!settled) throw new Error("KAST reflection idempotency fencing lost");
      return result;
    } catch (error) {
      await store.markIdempotency(companyId, idemKey, idemOwner, claim.record.fencingToken, "failed", now, undefined, error instanceof Error ? error.message.slice(0, 240) : "KAST reflection failed");
      throw error;
    }
  }
}

export function parseAuthorityTrustAnchors(raw: string | undefined, companyId: string | undefined): CompanyPrincipalTrustAnchor[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("XSPA_AUTHORITY_TRUST_ANCHORS_JSON invalid JSON"); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new Error("XSPA_AUTHORITY_TRUST_ANCHORS_JSON invalid");
  const anchors = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`authority trust anchor[${index}] invalid`);
    const obj = entry as Record<string, unknown>;
    const role = String(obj.role ?? "");
    if (!["founder", "owner", "board"].includes(role)) throw new Error(`authority trust anchor[${index}].role invalid`);
    if (obj.algorithm !== "Ed25519") throw new Error(`authority trust anchor[${index}].algorithm invalid`);
    const anchorCompanyId = String(obj.companyId ?? obj.company_id ?? "");
    if (!anchorCompanyId || (companyId && anchorCompanyId !== companyId)) throw new Error(`authority trust anchor[${index}].companyId mismatch`);
    const publicKeyPem = String(obj.publicKeyPem ?? obj.public_key_pem ?? "");
    if (!publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error(`authority trust anchor[${index}].publicKeyPem invalid`);
    const allowedScopesRaw = obj.allowedScopes ?? obj.allowed_scopes;
    if (!Array.isArray(allowedScopesRaw) || allowedScopesRaw.some((value) => typeof value !== "string")) throw new Error(`authority trust anchor[${index}].allowedScopes invalid`);
    const principalId = String(obj.principalId ?? obj.principal_id ?? "").trim();
    const keyId = String(obj.keyId ?? obj.key_id ?? "").trim();
    if (!principalId || !keyId) throw new Error(`authority trust anchor[${index}] identity invalid`);
    const validFromRaw = obj.validFrom ?? obj.valid_from;
    const validUntilRaw = obj.validUntil ?? obj.valid_until;
    const validFrom = validFromRaw === undefined ? undefined : String(validFromRaw);
    const validUntil = validUntilRaw === undefined ? undefined : String(validUntilRaw);
    if (validFrom && !Number.isFinite(Date.parse(validFrom))) throw new Error(`authority trust anchor[${index}].validFrom invalid`);
    if (validUntil && !Number.isFinite(Date.parse(validUntil))) throw new Error(`authority trust anchor[${index}].validUntil invalid`);
    if (validFrom && validUntil && Date.parse(validFrom) >= Date.parse(validUntil)) throw new Error(`authority trust anchor[${index}] validity window invalid`);
    return { principalId, companyId: anchorCompanyId, role: role as CompanyPrincipalTrustAnchor["role"], keyId, algorithm: "Ed25519" as const, publicKeyPem, allowedScopes: [...new Set(allowedScopesRaw.map((value) => value.trim()).filter(Boolean))], ...(validFrom ? { validFrom: new Date(validFrom).toISOString() } : {}), ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}) };
  });
  const identities = new Set<string>();
  for (const anchor of anchors) {
    const identity = `${anchor.principalId}:${anchor.keyId}`;
    if (identities.has(identity)) throw new Error(`authority trust anchor duplicate key identity:${identity}`);
    identities.add(identity);
  }
  return anchors;
}

export async function createEnvironmentXspaAppOperations(): Promise<{ operations: EnvironmentXspaAppOperations; close(): Promise<void> }> {
  const databaseUrl = process.env.XSPA_DATABASE_URL?.trim();
  const companyId = process.env.XSPA_COMPANY_ID?.trim() ?? process.env.XSPA_CREATIVE_COMPANY_ID?.trim();
  let db: PostgresDatabase | undefined;
  let store: PostgresRuntimeStore | undefined;
  let workStore: PostgresCompanyStore | undefined;
  if (databaseUrl && companyId) {
    db = new PostgresDatabase(databaseUrl);
    await db.migrate();
    const digest = createHash("sha256").update(`xspa:${companyId}:v1`).digest("hex");
    await db.ensureCompany(companyId, process.env.XSPA_COMPANY_NAME?.trim() || "XanxitoSpA Company", digest, 1);
    store = new PostgresRuntimeStore(db);
    workStore = new PostgresCompanyStore(db);
  }
  const skillRegistry = await createFileSystemSkillRegistry(process.env.XSPA_REPO_ROOT?.trim() || process.cwd());
  const authorityTrustAnchors = parseAuthorityTrustAnchors(process.env.XSPA_AUTHORITY_TRUST_ANCHORS_JSON, companyId);
  const observedRaw = process.env.XSPA_BUSINESS_SYSTEM_CONNECTORS_JSON;
  let observedConnectors: ConfiguredObservedConnector[] = [];
  if (observedRaw?.trim()) {
    if (!store || !companyId) throw new Error("OBSERVED_CONNECTOR_RUNTIME_REQUIRED");
    observedConnectors = parseObservedConnectorConfig(observedRaw, { companyId, signalRoot: process.env.XSPA_SIGNAL_ROOT?.trim() ?? "" });
  }
  const operations = new EnvironmentXspaAppOperations({
    ...(store ? { store } : {}),
    ...(workStore ? { workStore } : {}),
    ...(companyId ? { companyId } : {}),
    databaseConfigured: Boolean(store),
    creativeConfigured: Boolean(store),
    kastConfigured: Boolean(store),
    skillRegistry,
    creativeSupervisorPrincipal: process.env.XSPA_CREATIVE_SUPERVISOR_PRINCIPAL?.trim() || "creative-supervisor",
    authorityTrustAnchors,
  });
  let stopObservedDaemon: (() => void) | undefined;
  if (observedConnectors.length > 0 && companyId) {
    const intervalMs = Number(process.env.XSPA_OBSERVED_SIGNAL_INTERVAL_MS?.trim() || "30000");
    if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 3_600_000) throw new Error("OBSERVED_SIGNAL_DAEMON_INTERVAL_INVALID");
    const leaseMs = Number(process.env.XSPA_OBSERVED_SIGNAL_LEASE_MS?.trim() || String(Math.max(30_000, intervalMs * 2)));
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 7_200_000) throw new Error("OBSERVED_SIGNAL_DAEMON_LEASE_INVALID");
    const daemon = operations.createObservedSignalDaemon(observedConnectors);
    stopObservedDaemon = daemon.start({
      companyId,
      workerId: process.env.XSPA_OBSERVED_SIGNAL_WORKER_ID?.trim() || `mcp-observed:${process.pid}`,
      intervalMs,
      leaseMs,
    });
  }
  return { operations, close: async () => { stopObservedDaemon?.(); if (db) await db.close(); } };
}
