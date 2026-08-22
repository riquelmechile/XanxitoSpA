import type { KASTAdjudication, KASTLawResult, KASTLawTrigger, KASTMemoryRecord, PrincipalPolicy } from "../../contracts/src/index.js";
import type { KASTAdjudicationInput, KASTVariantProposalInput } from "./kast-law.js";
import { DomainError } from "../../domain/src/index.js";
import { KastEngine, type EngramMemoryPort } from "./kast-law.js";
import { buildGitVariantVerification, GitAdoptionPort, GitWorktreeExperimentPort, classifyHarnessSurfaces, type GitExperimentWorkspace, type GitHarnessWorkflowEvidence } from "./git-kast.js";

export interface KastMutationExecutor {
  mutate(input: {
    trigger: KASTLawTrigger;
    overlay: string;
    profile: { model: "gpt-5.6-sol"; reasoningEffort: "xhigh" };
    priorMemory: KASTMemoryRecord[];
    workspace: GitExperimentWorkspace;
  }): Promise<{
    summary: string;
    sddChangeRef: string;
    reviewTargetRef: string;
    evidenceRefs: string[];
  }>;
}

export interface KastRegressionRunner {
  run(input: { workspace: GitExperimentWorkspace; trigger: KASTLawTrigger }): Promise<{
    passed: boolean;
    regressionRefs: string[];
    verificationRefs: string[];
    blockingFindings?: string[];
  }>;
}

export interface KastWorkflowEvidencePort {
  inspect(input: { sddChange: string; reviewTarget: string }): Promise<GitHarnessWorkflowEvidence>;
}

interface ExperimentState {
  workspace: GitExperimentWorkspace;
  sddChangeRef: string;
  reviewTargetRef: string;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "kast";
}

export class GitBackedKastRuntime {
  constructor(private readonly input: {
    policy: PrincipalPolicy;
    memory: EngramMemoryPort;
    workspacePort: GitWorktreeExperimentPort;
    workflow: KastWorkflowEvidencePort;
    mutationExecutor: KastMutationExecutor;
    regressionRunner: KastRegressionRunner;
    adjudicator: (input: KASTAdjudicationInput) => Promise<KASTAdjudication>;
  }) {}

  async run(trigger: KASTLawTrigger): Promise<KASTLawResult> {
    const baseSha = await this.input.workspacePort.headSha();
    const experiments = new Map<string, ExperimentState>();
    const workspaces: GitExperimentWorkspace[] = [];
    const adopter = new GitAdoptionPort({ repoPath: this.input.workspacePort.repoPath, expectedBaseSha: baseSha });

    const engine = new KastEngine({
      policy: this.input.policy,
      memory: this.input.memory,
      proposer: async (proposal: KASTVariantProposalInput) => {
        const workspace = await this.input.workspacePort.createWorkspace({
          id: safeId(`${trigger.id.slice(0, 8)}-${proposal.overlay}`),
          baseRef: baseSha,
        });
        workspaces.push(workspace);
        const mutation = await this.input.mutationExecutor.mutate({
          trigger: structuredClone(trigger),
          overlay: proposal.overlay,
          profile: proposal.profile,
          priorMemory: structuredClone(proposal.priorMemory),
          workspace,
        });
        const dirty = await this.input.workspacePort.status(workspace);
        if (!dirty) throw new DomainError(`KAST mutation executor produced no change:${proposal.overlay}`);
        const changeRef = await this.input.workspacePort.commitAll(workspace, `kast(${safeId(proposal.overlay)}): ${mutation.summary.slice(0, 72)}`);
        const changedPaths = await this.input.workspacePort.changedPaths(baseSha, changeRef);
        const state: ExperimentState = { workspace, sddChangeRef: mutation.sddChangeRef, reviewTargetRef: mutation.reviewTargetRef };
        experiments.set(changeRef, state);
        return {
          summary: mutation.summary,
          changeRef,
          isolationRef: workspace.path,
          affectedSurfaces: classifyHarnessSurfaces(changedPaths),
          evidenceRefs: [...mutation.evidenceRefs, `sdd:${mutation.sddChangeRef}`, `review:${mutation.reviewTargetRef}`, ...changedPaths.map((changed) => `git:path:${changed}`)],
          directMainMutation: false,
        };
      },
      verifier: async ({ variant }) => {
        const state = experiments.get(variant.changeRef);
        if (!state) throw new DomainError(`KAST experiment state missing:${variant.changeRef}`);
        const [workflow, regression] = await Promise.all([
          this.input.workflow.inspect({ sddChange: state.sddChangeRef, reviewTarget: state.reviewTargetRef }),
          this.input.regressionRunner.run({ workspace: state.workspace, trigger: structuredClone(trigger) }),
        ]);
        const verification = await buildGitVariantVerification({
          workspacePort: this.input.workspacePort,
          variant,
          baseSha,
          workflow,
          regressionRefs: regression.regressionRefs,
          verificationRefs: regression.verificationRefs,
          blockingFindings: [...(regression.blockingFindings ?? []), ...(regression.passed ? [] : ["regression-runner-failed"])],
        });
        return verification;
      },
      adjudicator: this.input.adjudicator,
      adopter: async (adoptionInput) => adopter.adopt(adoptionInput),
    });

    try {
      return await engine.run(trigger);
    } finally {
      await Promise.all(workspaces.map((workspace) => this.input.workspacePort.removeWorkspace(workspace, true).catch(() => undefined)));
    }
  }
}
