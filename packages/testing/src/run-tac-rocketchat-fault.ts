import { readFile } from "node:fs/promises";
import {
  HttpRocketChatPort,
  runRocketChatAuthExpiryArm,
  runRocketChatConcurrentDuplicateArm,
  runRocketChatControlArm,
  runRocketChatLostAckArm,
} from "./tac-rocketchat-fault.js";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) throw new Error(`missing ${name}`);
  return process.argv[index + 1] ?? "";
}

const mode = arg("--mode");
if (mode !== "direct" && mode !== "xanxitospa") throw new Error("--mode must be direct or xanxitospa");
const condition = arg("--condition");
if (!["control", "lost_ack_after_commit", "auth_session_expiry", "concurrent_duplicate_intent"].includes(condition)) throw new Error("unsupported --condition");
const configPath = arg("--config");
const targetName = arg("--target");
const text = arg("--text");
const config = JSON.parse(await readFile(configPath, "utf8")) as { baseUrl: string; username: string; password: string };
const port = new HttpRocketChatPort(config);
const input = { targetName, text };
const result = condition === "control"
  ? await runRocketChatControlArm(mode, input, port)
  : condition === "lost_ack_after_commit"
    ? await runRocketChatLostAckArm(mode, input, port)
    : condition === "auth_session_expiry"
      ? await runRocketChatAuthExpiryArm(mode, input, port)
      : await runRocketChatConcurrentDuplicateArm(mode, input, port);
process.stdout.write(`${JSON.stringify({ condition, ...result }, null, 2)}\n`);
