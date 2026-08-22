import { execFile } from "node:child_process";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { KASTAdoptionResult, KASTHarnessSurface, KASTImprovementVariant, KASTVariantVerification } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { KASTAdoptionInput } from "./kast-law.js";

const execFileAsync = promisify(execFile);

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

function normalizeRepoRelative(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function classifyHarnessSurfaces(paths: string[]): KASTHarnessSurface[] {
  const surfaces = new Set<KASTHarnessSurface>();
  for (const raw of paths) {
    const file = normalizeRepoRelative(raw).toLowerCase();
    if (!file) continue;
    if (file === "packages/domain/src/index.ts" || file === "docs/adr/0005-one-model-law.md") surfaces.add("model-law");
    if (file === "packages/contracts/src/index.ts") surfaces.add("constitution");
    if (file.includes("authority") || file.includes("budget-envelope")) surfaces.add("authority-root");
    if (file.includes("secret") || file === "security.md") surfaces.add("secret-isolation");
    if (file === "packages/contracts/src/kast-law.ts" || file === "packages/kernel/src/kast-law.ts" || file.startsWith("skills/kast/")) surfaces.add("kast-law");
    if (file.includes("review") || file.includes("four-r")) surfaces.add("review-law");
    if (file.includes("engram") || file.includes("memory-law")) surfaces.add("memory-law");
    if (file.includes("reserved-human") || file.includes("human-boundary")) surfaces.add("human-reserved-boundary");

    if (file.startsWith("skills/") && !file.startsWith("skills/kast/")) surfaces.add("skill");
    if (file.includes("routing") || file.includes("router")) surfaces.add("routing");
    if (file.includes("prompt")) surfaces.add("prompt");
    if (file.includes("process")) surfaces.add("process");
    if (file.includes("heuristic")) surfaces.add("heuristic");
    if (file.includes("parallel")) surfaces.add("parallelism-policy");
    if (file.startsWith("packages/providers/") || file.includes("adapter")) surfaces.add("adapter");
    if (file.includes("perf") || file.includes("benchmark")) surfaces.add("performance");
    if (file.includes("test") || file.includes("gym") || file.startsWith("packages/testing/")) surfaces.add("test");
    if (file.startsWith("apps/") || file.includes("ui") || file.includes("visual")) surfaces.add("ux");
    if (file.includes("memory") && !file.includes("memory-law")) surfaces.add("memory-strategy");
    if (file.startsWith("scripts/") || file.startsWith("docs/") || file === "readme.md" || file === "package.json") surfaces.add("developer-experience");
  }
  if (surfaces.size === 0 && paths.length > 0) surfaces.add("developer-experience");
  return [...surfaces].sort();
}

export interface GitExperimentWorkspace {
  id: string;
  baseSha: string;
  branch: string;
  path: string;
}

export class GitWorktreeExperimentPort {
  readonly repoPath: string;
  readonly worktreeRoot: string;
  private adminTail: Promise<void> = Promise.resolve();

  private constructor(repoPath: string, worktreeRoot: string) {
    this.repoPath = repoPath;
    this.worktreeRoot = worktreeRoot;
  }

  static async create(input: { repoPath: string; worktreeRoot?: string }): Promise<GitWorktreeExperimentPort> {
    const repoPath = await realpath(input.repoPath);
    const root = (await git(repoPath, ["rev-parse", "--show-toplevel"]));
    const canonicalRoot = await realpath(root);
    if (canonicalRoot !== repoPath) throw new DomainError("KAST git repo path must be repository root");
    const worktreeRoot = input.worktreeRoot ? path.resolve(input.worktreeRoot) : await mkdtemp(path.join(tmpdir(), "xspa-kast-worktrees-"));
    return new GitWorktreeExperimentPort(repoPath, worktreeRoot);
  }

  async headSha(): Promise<string> { return git(this.repoPath, ["rev-parse", "HEAD"]); }

  private async serializeAdmin<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.adminTail;
    this.adminTail = next;
    await previous;
    try { return await fn(); } finally { release(); }
  }

  async createWorkspace(input: { id: string; baseRef?: string }): Promise<GitExperimentWorkspace> {
    if (!/^[a-zA-Z0-9._-]+$/.test(input.id)) throw new DomainError("invalid KAST experiment id");
    return this.serializeAdmin(async () => {
      const baseSha = await git(this.repoPath, ["rev-parse", `${input.baseRef ?? "HEAD"}^{commit}`]);
      const branch = `kast/${input.id}`;
      const worktreePath = path.join(this.worktreeRoot, input.id);
      await git(this.repoPath, ["worktree", "add", "-b", branch, worktreePath, baseSha]);
      return { id: input.id, baseSha, branch, path: worktreePath };
    });
  }

  async status(workspace: GitExperimentWorkspace): Promise<string> { return git(workspace.path, ["status", "--porcelain=v1"]); }

  async commitAll(workspace: GitExperimentWorkspace, message: string): Promise<string> {
    if (!message.trim()) throw new DomainError("KAST experiment commit message required");
    await git(workspace.path, ["add", "--all"]);
    const staged = await execFileAsync("git", ["diff", "--cached", "--quiet"], { cwd: workspace.path }).then(() => false).catch((error: { code?: number }) => {
      if (error.code === 1) return true;
      throw error;
    });
    if (!staged) throw new DomainError("KAST experiment has no staged change");
    await git(workspace.path, ["commit", "-m", message]);
    return git(workspace.path, ["rev-parse", "HEAD"]);
  }

  async changedPaths(baseSha: string, sourceCommit: string): Promise<string[]> {
    const text = await git(this.repoPath, ["diff", "--name-only", `${baseSha}..${sourceCommit}`, "--"]);
    return text ? text.split("\n").map(normalizeRepoRelative).filter(Boolean) : [];
  }

  async parentSha(sourceCommit: string): Promise<string> { return git(this.repoPath, ["rev-parse", `${sourceCommit}^`]); }

  async removeWorkspace(workspace: GitExperimentWorkspace, force = false): Promise<void> {
    await this.serializeAdmin(async () => {
      const args = ["worktree", "remove", ...(force ? ["--force"] : []), workspace.path];
      await git(this.repoPath, args);
      await execFileAsync("git", ["branch", "-D", workspace.branch], { cwd: this.repoPath }).catch(() => undefined);
    });
  }
}

const PROTECTED = new Set<KASTHarnessSurface>(["model-law", "constitution", "authority-root", "secret-isolation", "kast-law", "review-law", "memory-law", "human-reserved-boundary"]);

export function hasProtectedHarnessSurface(surfaces: KASTHarnessSurface[]): boolean {
  return surfaces.some((surface) => PROTECTED.has(surface));
}

export interface GitHarnessWorkflowEvidence {
  sddComplete: boolean;
  sddRef: string;
  reviewApproved: boolean;
  fourRRefs: string[];
  reviewRef: string;
}

export interface GitVerificationEvidenceInput {
  workspacePort: GitWorktreeExperimentPort;
  variant: KASTImprovementVariant;
  baseSha: string;
  workflow: GitHarnessWorkflowEvidence;
  regressionRefs: string[];
  verificationRefs: string[];
  blockingFindings?: string[];
}

export async function buildGitVariantVerification(input: GitVerificationEvidenceInput): Promise<KASTVariantVerification> {
  const changedPaths = await input.workspacePort.changedPaths(input.baseSha, input.variant.changeRef);
  const observedSurfaces = classifyHarnessSurfaces(changedPaths);
  const parent = await input.workspacePort.parentSha(input.variant.changeRef);
  const isolationVerified = parent === input.baseSha && input.variant.isolationRef !== "main" && input.variant.isolationRef.length > 0;
  const blockingFindings = [...(input.blockingFindings ?? [])];
  if (changedPaths.length === 0) blockingFindings.push("no-git-change");
  if (hasProtectedHarnessSurface(observedSurfaces)) blockingFindings.push("constitutional-surface");
  if (!input.workflow.sddComplete) blockingFindings.push("sdd-incomplete");
  if (!input.workflow.reviewApproved) blockingFindings.push("review-not-approved");
  return {
    variantId: input.variant.id,
    passed: blockingFindings.length === 0 && input.regressionRefs.length > 0 && input.verificationRefs.length > 0,
    verifiedChangeRef: input.variant.changeRef,
    isolationVerified,
    observedSurfaces,
    sddComplete: input.workflow.sddComplete,
    regressionRefs: [...input.regressionRefs],
    reviewApproved: input.workflow.reviewApproved,
    fourRRefs: [...input.workflow.fourRRefs],
    verificationRefs: [...input.verificationRefs, input.workflow.sddRef, input.workflow.reviewRef, ...changedPaths.map((p) => `git:path:${p}`)],
    blockingFindings,
  };
}

export class GitAdoptionPort {
  constructor(private readonly input: { repoPath: string; expectedBaseSha: string }) {}

  async adopt({ variant, verification }: KASTAdoptionInput): Promise<KASTAdoptionResult> {
    const repo = await realpath(this.input.repoPath);
    const head = await git(repo, ["rev-parse", "HEAD"]);
    if (head !== this.input.expectedBaseSha) return { adopted: false, sourceChangeRef: variant.changeRef, reason: "base-head-moved" };
    const dirty = await git(repo, ["status", "--porcelain=v1"]);
    if (dirty) return { adopted: false, sourceChangeRef: variant.changeRef, reason: "base-worktree-dirty" };
    if (verification.verifiedChangeRef !== variant.changeRef || !verification.isolationVerified || !verification.passed) {
      return { adopted: false, sourceChangeRef: variant.changeRef, reason: "verification-binding-invalid" };
    }
    const changedPathsText = await git(repo, ["diff", "--name-only", `${this.input.expectedBaseSha}..${variant.changeRef}`, "--"]);
    const changedPaths = changedPathsText ? changedPathsText.split("\n").filter(Boolean) : [];
    const observed = classifyHarnessSurfaces(changedPaths);
    if (hasProtectedHarnessSurface(observed)) return { adopted: false, sourceChangeRef: variant.changeRef, reason: "constitutional-surface" };
    const parent = await git(repo, ["rev-parse", `${variant.changeRef}^`]);
    if (parent !== this.input.expectedBaseSha) return { adopted: false, sourceChangeRef: variant.changeRef, reason: "source-parent-mismatch" };
    try {
      await git(repo, ["cherry-pick", variant.changeRef]);
    } catch (error) {
      await execFileAsync("git", ["cherry-pick", "--abort"], { cwd: repo }).catch(() => undefined);
      return { adopted: false, sourceChangeRef: variant.changeRef, reason: `cherry-pick-failed:${error instanceof Error ? error.message : String(error)}` };
    }
    const adoptionRef = await git(repo, ["rev-parse", "HEAD"]);
    return { adopted: true, sourceChangeRef: variant.changeRef, adoptionRef };
  }
}
