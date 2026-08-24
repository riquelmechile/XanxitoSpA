import { runGovernanceBoundaryV4 } from "./governance-boundary-v4.js";

const result = await runGovernanceBoundaryV4();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
