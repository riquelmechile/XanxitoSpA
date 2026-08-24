import { readFile } from "node:fs/promises";
import {
  HttpPlaneIssuePort,
  runPlaneAuthExpiryArm,
  runPlaneControlArm,
  runPlaneLostAckArm,
  runPlaneStaleWriterArm,
} from "./tac-plane-fault.js";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`missing ${name}`);
  return process.argv[index + 1] ?? "";
}

const mode = arg("--mode");
if (mode !== "direct" && mode !== "xanxitospa") throw new Error("--mode must be direct or xanxitospa");
const condition = arg("--condition");
if (!["control", "lost_ack_after_patch", "auth_session_expiry", "stale_writer_after_takeover"].includes(condition)) throw new Error("unsupported --condition");
const config = JSON.parse(await readFile(arg("--config"), "utf8")) as { baseUrl: string; apiKey: string; workspaceSlug: string };
const input = { projectId: arg("--project"), issueId: arg("--issue"), targetState: arg("--target-state") };
const port = new HttpPlaneIssuePort(config);
const result = condition === "control"
  ? await runPlaneControlArm(mode, input, port)
  : condition === "lost_ack_after_patch"
    ? await runPlaneLostAckArm(mode, input, port)
    : condition === "auth_session_expiry"
      ? await runPlaneAuthExpiryArm(mode, input, new HttpPlaneIssuePort({ ...config, apiKey: "v4-expired-plane-key" }), port)
      : await runPlaneStaleWriterArm(mode, input, port);
process.stdout.write(`${JSON.stringify({ condition, ...result }, null, 2)}\n`);
