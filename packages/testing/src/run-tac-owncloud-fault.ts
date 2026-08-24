import { readFile } from "node:fs/promises";
import {
  HttpOwnCloudObjectPort,
  runOwnCloudAuthExpiryArm,
  runOwnCloudConcurrentRevisionArm,
  runOwnCloudControlArm,
  runOwnCloudLostAckArm,
} from "./tac-owncloud-fault.js";

function arg(name: string): string { const i = process.argv.indexOf(name); if (i < 0 || i + 1 >= process.argv.length) throw new Error(`missing ${name}`); return process.argv[i + 1] ?? ""; }
const mode = arg("--mode"); if (mode !== "direct" && mode !== "xanxitospa") throw new Error("invalid mode");
const condition = arg("--condition");
if (!["control","lost_ack_after_upload","credential_expiry","concurrent_revision_write"].includes(condition)) throw new Error("unsupported condition");
const config = JSON.parse(await readFile(arg("--config"), "utf8")) as { davRoot: string; username: string; password: string };
const path = arg("--path");
const body = new TextEncoder().encode(arg("--body"));
const stale = new TextEncoder().encode(arg("--stale-body"));
const port = new HttpOwnCloudObjectPort(config);
const result = condition === "control"
  ? await runOwnCloudControlArm(mode, { path, body }, port)
  : condition === "lost_ack_after_upload"
    ? await runOwnCloudLostAckArm(mode, { path, body }, port)
    : condition === "credential_expiry"
      ? await runOwnCloudAuthExpiryArm(mode, { path, body }, new HttpOwnCloudObjectPort({ ...config, password: "v4-expired-owncloud-password" }), port)
      : await runOwnCloudConcurrentRevisionArm(mode, { path, body }, stale, port);
process.stdout.write(`${JSON.stringify({ condition, ...result }, null, 2)}\n`);
