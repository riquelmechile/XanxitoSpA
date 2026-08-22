import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalReceipt,
  BootstrapExecutionState,
  BootstrapPlan,
  BootstrapRequirement,
  BootstrapStep,
  BootstrapStepExecutionState,
  CapabilityPlaneRequest,
  CompanyAsset,
} from "../../contracts/src/index.js";
import type { RuntimeStore } from "../../database/src/runtime-store.js";
import { DomainError } from "../../domain/src/index.js";
import type { CapabilityPlane, CapabilityPlaneGuardContext } from "../../providers/src/adapters.js";

export interface BootstrapExecutorInput {
  plan: BootstrapPlan;
  requirements: BootstrapRequirement[];
  approvals: ApprovalReceipt[];
  guard: CapabilityPlaneGuardContext;
  state?: BootstrapExecutionState;
  requestFactory(step: BootstrapStep, requirement: BootstrapRequirement): CapabilityPlaneRequest;
}

export interface BootstrapTrustBoundary {
  verifyApproval(receipt: ApprovalReceipt, step: BootstrapStep, requirement: BootstrapRequirement): Promise<boolean>;
  verifyAsset(asset: CompanyAsset, requirement: BootstrapRequirement): Promise<{ ok: boolean; evidenceRefs: string[] }>;
}

function planFingerprint(plan: BootstrapPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function initialState(plan: BootstrapPlan, now: Date): BootstrapExecutionState {
  return {
    executionId: randomUUID(),
    companyId: plan.companyId,
    planFingerprint: planFingerprint(plan),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    steps: plan.steps.map((step) => ({ stepId: step.id, status: "pending", evidenceRefs: [] })),
    completed: false,
  };
}

function stateFor(state: BootstrapExecutionState, stepId: string): BootstrapStepExecutionState {
  const found = state.steps.find((entry) => entry.stepId === stepId);
  if (!found) throw new DomainError(`bootstrap execution state missing step ${stepId}`);
  return found;
}

function validApproval(companyId: string, requirementId: string, planFingerprintValue: string, approvals: ApprovalReceipt[], now: Date): ApprovalReceipt | undefined {
  return approvals.find((receipt) => {
    if (receipt.companyId !== companyId || receipt.requirementId !== requirementId || receipt.planFingerprint !== planFingerprintValue) return false;
    const approvedAt = Date.parse(receipt.approvedAt);
    if (!Number.isFinite(approvedAt) || approvedAt > now.getTime()) return false;
    if (receipt.expiresAt) {
      const expiresAt = Date.parse(receipt.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
    }
    return true;
  });
}

function assetForRequirement(assets: CompanyAsset[], companyId: string, requirement: BootstrapRequirement): CompanyAsset | undefined {
  return assets.find((asset) =>
    asset.companyId === companyId &&
    asset.capability === requirement.capability &&
    asset.kind === requirement.assetKind &&
    asset.department === requirement.department &&
    asset.metadata.bootstrapRequirementId === requirement.id &&
    asset.status !== "retired",
  );
}

export class BootstrapExecutor {
  constructor(
    private readonly plane: CapabilityPlane,
    private readonly runtime: RuntimeStore,
    private readonly trust: BootstrapTrustBoundary,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: BootstrapExecutorInput): Promise<BootstrapExecutionState> {
    const now = this.clock();
    const state = structuredClone(input.state ?? initialState(input.plan, now));
    if (state.companyId !== input.plan.companyId) throw new DomainError("bootstrap execution company mismatch");
    if (state.planFingerprint !== planFingerprint(input.plan)) throw new DomainError("bootstrap execution plan mismatch");
    const requirementMap = new Map(input.requirements.map((requirement) => [requirement.id, requirement]));
    if (requirementMap.size !== input.requirements.length) throw new DomainError("duplicate bootstrap requirement id");
    for (const step of input.plan.steps) if (!requirementMap.has(step.requirementId)) throw new DomainError(`bootstrap requirement missing: ${step.requirementId}`);

    delete state.pausedAtStepId;
    const assets = await this.runtime.listAssets(input.plan.companyId);

    for (const step of input.plan.steps) {
      const stepState = stateFor(state, step.id);
      if (stepState.status === "completed") continue;
      if (step.dependsOn.some((dependencyId) => stateFor(state, dependencyId).status !== "completed")) continue;
      const requirement = requirementMap.get(step.requirementId);
      if (!requirement) throw new DomainError(`bootstrap requirement missing: ${step.requirementId}`);
      stepState.status = "running";
      delete stepState.error;

      if (step.action === "request-approval") {
        const approval = validApproval(input.plan.companyId, requirement.id, state.planFingerprint, input.approvals, now);
        const approvalVerified = approval ? await this.trust.verifyApproval(approval, step, requirement) : false;
        if (!approval || !approvalVerified) {
          stepState.status = "paused";
          stepState.error = step.approvalReason ?? "approval required";
          state.pausedAtStepId = step.id;
          state.updatedAt = now.toISOString();
          state.completed = false;
          return state;
        }
        stepState.status = "completed";
        stepState.evidenceRefs = [`approval:${approval.id}`];
        continue;
      }

      if (step.action === "reuse") {
        if (!step.assetId) throw new DomainError("reuse step missing asset id");
        const asset = assets.find((candidate) => candidate.companyId === input.plan.companyId && candidate.id === step.assetId && candidate.status === "active");
        if (!asset) throw new DomainError("reuse asset unavailable or belongs to another Company");
        stepState.assetId = asset.id;
        stepState.status = "completed";
        stepState.evidenceRefs = [`asset:${asset.id}`];
        continue;
      }

      if (step.action === "provision") {
        const existing = assetForRequirement(assets, input.plan.companyId, requirement);
        if (existing) {
          stepState.assetId = existing.id;
          stepState.status = "completed";
          stepState.evidenceRefs = [`asset:${existing.id}`, "bootstrap:recovered-existing-provision"];
          continue;
        }
        const request = input.requestFactory(step, requirement);
        request.capabilityRequest.idempotencyKey = `${request.capabilityRequest.idempotencyKey}:plan:${state.planFingerprint}`;
        if (request.capabilityRequest.companyId !== input.plan.companyId || request.selection.companyId !== input.plan.companyId) throw new DomainError("bootstrap capability request company mismatch");
        if (request.selection.capability !== requirement.capability || request.capabilityRequest.action !== requirement.capability) throw new DomainError("bootstrap capability mismatch");
        const result = await this.plane.execute(request, input.guard);
        if (result.reconciliationRequired) {
          stepState.status = "paused";
          stepState.error = "capability result requires reconciliation";
          stepState.evidenceRefs = result.result.evidenceRefs;
          state.pausedAtStepId = step.id;
          state.updatedAt = this.clock().toISOString();
          state.completed = false;
          return state;
        }
        if (!result.result.ok || !result.providerId) {
          stepState.status = "failed";
          stepState.error = "provisioning failed safely";
          stepState.evidenceRefs = result.result.evidenceRefs;
          state.updatedAt = this.clock().toISOString();
          state.completed = false;
          return state;
        }
        const createdAt = this.clock().toISOString();
        const asset: CompanyAsset = {
          id: randomUUID(),
          companyId: input.plan.companyId,
          kind: requirement.assetKind,
          providerId: result.providerId,
          capability: requirement.capability,
          department: requirement.department,
          cost: result.result.cost,
          currency: requirement.currency,
          status: "planned",
          grantRefs: [],
          restrictions: [],
          metadata: {
            bootstrapRequirementId: requirement.id,
            bootstrapExecutionId: state.executionId,
            providerEvidenceRefs: result.result.evidenceRefs,
          },
          createdAt,
          updatedAt: createdAt,
        };
        await this.runtime.saveAsset(asset);
        assets.push(structuredClone(asset));
        stepState.assetId = asset.id;
        stepState.status = "completed";
        stepState.evidenceRefs = [...result.result.evidenceRefs, `asset:${asset.id}`];
        continue;
      }

      if (step.action === "verify") {
        const relatedStep = [...input.plan.steps].reverse().find((candidate) =>
          candidate.requirementId === step.requirementId &&
          (candidate.action === "provision" || candidate.action === "reuse") &&
          stateFor(state, candidate.id).assetId,
        );
        const assetId = relatedStep ? stateFor(state, relatedStep.id).assetId : undefined;
        if (!assetId) throw new DomainError("verify step has no provisioned/reused asset");
        const asset = assets.find((candidate) => candidate.companyId === input.plan.companyId && candidate.id === assetId);
        if (!asset) throw new DomainError("verify asset unavailable");
        const verification = await this.trust.verifyAsset(structuredClone(asset), requirement);
        if (!verification.ok) {
          stepState.status = "failed";
          stepState.assetId = asset.id;
          stepState.evidenceRefs = [...verification.evidenceRefs];
          stepState.error = "asset verification failed";
          state.updatedAt = this.clock().toISOString();
          state.completed = false;
          return state;
        }
        asset.status = "active";
        asset.updatedAt = this.clock().toISOString();
        await this.runtime.saveAsset(asset);
        const index = assets.findIndex((candidate) => candidate.id === asset.id && candidate.companyId === asset.companyId);
        if (index >= 0) assets[index] = structuredClone(asset);
        stepState.assetId = asset.id;
        stepState.status = "completed";
        stepState.evidenceRefs = [...verification.evidenceRefs, `asset:${asset.id}:verified`];
        continue;
      }

      if (step.action === "configure") {
        stepState.status = "failed";
        stepState.error = "configure execution is not enabled in V1.3";
        state.updatedAt = this.clock().toISOString();
        state.completed = false;
        return state;
      }
    }

    state.updatedAt = this.clock().toISOString();
    state.completed = state.steps.every((step) => step.status === "completed");
    return state;
  }
}
