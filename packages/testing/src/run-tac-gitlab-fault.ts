import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import {
  HttpGitLabIssuePort,
  runGitLabControlArm,
  runGitLabCredentialExpiryArm,
  runGitLabLostAckArm,
  runGitLabServiceRestartArm,
} from "./tac-gitlab-fault.js";

const execFileAsync = promisify(execFile);
function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`missing ${name}`);
  return process.argv[index + 1] ?? "";
}
const mode = arg("--mode");
if (mode !== "direct" && mode !== "xanxitospa") throw new Error("--mode must be direct or xanxitospa");
const condition = arg("--condition");
if (!["control", "lost_ack_after_commit", "credential_expiry", "service_restart_after_commit"].includes(condition)) throw new Error("unsupported --condition");
const config = JSON.parse(await readFile(arg("--config"), "utf8")) as { baseUrl: string; privateToken: string };
const input = { projectPath: arg("--project"), title: arg("--title"), description: arg("--description") };
const port = new HttpGitLabIssuePort(config);

async function waitReady(): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/v4/version`, { headers: { "PRIVATE-TOKEN": config.privateToken } });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("GitLab did not become ready after restart");
}

const result = condition === "control"
  ? await runGitLabControlArm(mode, input, port)
  : condition === "lost_ack_after_commit"
    ? await runGitLabLostAckArm(mode, input, port)
    : condition === "credential_expiry"
      ? await runGitLabCredentialExpiryArm(mode, input, new HttpGitLabIssuePort({ ...config, privateToken: "v4-expired-token" }), port)
      : await runGitLabServiceRestartArm(mode, input, port, async () => {
          await execFileAsync("docker", ["restart", arg("--gitlab-container")]);
          await waitReady();
        });
process.stdout.write(`${JSON.stringify({ condition, ...result }, null, 2)}\n`);
