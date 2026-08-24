import type { CompanyConstitution, GovernedWakeResult, WakeAccumulatorState } from "../../contracts/src/index.js";
import type { HeartbeatWakeInput } from "./heartbeat.js";
import { GovernedWakeEngine } from "./governed-wake.js";

export interface GovernedWakePersistence {
  loadConstitution(companyId: string): Promise<CompanyConstitution>;
  loadState(companyId: string): Promise<WakeAccumulatorState[]>;
  saveResult(companyId: string, result: GovernedWakeResult, input: HeartbeatWakeInput): Promise<void>;
}

export function createGovernedHeartbeatWakeHandler(persistence: GovernedWakePersistence, engine = new GovernedWakeEngine()): (input: HeartbeatWakeInput) => Promise<void> {
  return async (input) => {
    const [constitution, priorState] = await Promise.all([
      persistence.loadConstitution(input.companyId),
      persistence.loadState(input.companyId),
    ]);
    const result = engine.evaluate({ companyId: input.companyId, constitution, events: input.events, priorState, now: input.now });
    await persistence.saveResult(input.companyId, result, input);
  };
}
