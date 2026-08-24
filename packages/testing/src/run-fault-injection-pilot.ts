import { runFaultInjectionPilot, type FaultScenarioId } from "./fault-injection-pilot.js";

const allowed = new Set<FaultScenarioId>(["lost_ack", "budget_overrun", "stale_fence"]);
const requested = process.argv.slice(2).filter((value): value is FaultScenarioId => allowed.has(value as FaultScenarioId));
const result = await runFaultInjectionPilot(requested.length ? requested : undefined);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
