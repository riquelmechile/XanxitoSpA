import { randomUUID } from "node:crypto";
import type {
  BootstrapPlan,
  BootstrapRequirement,
  BootstrapStep,
  CompanyAsset,
} from "../../contracts/src/index.js";

export interface BootstrapPlannerInput {
  companyId: string;
  mode: "new" | "existing";
  requirements: BootstrapRequirement[];
  existingAssets: CompanyAsset[];
  autonomousCapabilities: string[];
}

function reusableAsset(companyId: string, requirement: BootstrapRequirement, assets: CompanyAsset[]): CompanyAsset | undefined {
  return assets.find((asset) =>
    asset.companyId === companyId &&
    asset.status === "active" &&
    asset.capability === requirement.capability &&
    asset.kind === requirement.assetKind &&
    asset.department === requirement.department,
  );
}

export function planCompanyBootstrap(input: BootstrapPlannerInput): BootstrapPlan {
  const steps: BootstrapStep[] = [];
  const reusedAssetIds: string[] = [];
  const approvalBoundaries: Array<{ requirementId: string; reason: string }> = [];

  for (const requirement of input.requirements) {
    const existing = reusableAsset(input.companyId, requirement, input.existingAssets);
    if (existing) {
      reusedAssetIds.push(existing.id);
      steps.push({
        id: randomUUID(),
        action: "reuse",
        requirementId: requirement.id,
        capability: requirement.capability,
        assetId: existing.id,
        approvalRequired: false,
        dependsOn: [],
      });
      continue;
    }

    const boundaryApproval = requirement.humanBoundary !== "none";
    const spendNeedsApproval = requirement.estimatedCost > 0 && !input.autonomousCapabilities.includes(requirement.capability);
    const approvalRequired = boundaryApproval || spendNeedsApproval;
    let approvalStepId: string | undefined;

    if (approvalRequired) {
      const reason = boundaryApproval
        ? `human boundary: ${requirement.humanBoundary}`
        : `new spend outside autonomous bootstrap capability: ${requirement.capability}`;
      approvalBoundaries.push({ requirementId: requirement.id, reason });
      approvalStepId = randomUUID();
      steps.push({
        id: approvalStepId,
        action: "request-approval",
        requirementId: requirement.id,
        capability: requirement.capability,
        approvalRequired: true,
        approvalReason: reason,
        dependsOn: [],
      });
    }

    const provisionStepId = randomUUID();
    const provision: BootstrapStep = {
      id: provisionStepId,
      action: "provision",
      requirementId: requirement.id,
      capability: requirement.capability,
      approvalRequired,
      dependsOn: approvalStepId ? [approvalStepId] : [],
    };
    const preferred = requirement.preferredProviderIds?.[0];
    if (preferred) provision.providerId = preferred;
    steps.push(provision);
    steps.push({
      id: randomUUID(),
      action: "verify",
      requirementId: requirement.id,
      capability: requirement.capability,
      approvalRequired: false,
      dependsOn: [provisionStepId],
    });
  }

  return {
    companyId: input.companyId,
    mode: input.mode,
    steps,
    reusedAssetIds,
    requestedCapabilities: [...new Set(input.requirements.map((requirement) => requirement.capability))],
    approvalBoundaries,
  };
}
