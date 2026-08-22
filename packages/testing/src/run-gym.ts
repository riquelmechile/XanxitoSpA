import { runCompanyGym } from "./gym.js";

const result = await runCompanyGym();
for (const item of result.cases) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.ok ? "" : ` — ${item.detail}`}`);
console.log(`\nCompany Gym: ${result.passed}/${result.cases.length} passed`);
if (!result.ok) process.exitCode = 1;
