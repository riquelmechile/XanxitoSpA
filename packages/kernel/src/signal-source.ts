import type { SignalCursor, SignalPollResult } from "../../contracts/src/index.js";

export interface BusinessSignalAdapter {
  readonly id: string;
  readonly capabilities: readonly string[];
  poll(cursor: SignalCursor): Promise<SignalPollResult>;
}
