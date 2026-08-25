import type { ObservedSignalPollCycleResult } from "./observed-signal-scheduler.js";
import { GovernedObservedSignalScheduler } from "./observed-signal-scheduler.js";
import type { BusinessSystemConnector } from "./business-system-connector.js";

export interface RegisteredBusinessSystemConnector {
  connector: BusinessSystemConnector;
  enabled: boolean;
}

export class BusinessSystemConnectorRegistry {
  private readonly connectors = new Map<string, RegisteredBusinessSystemConnector>();

  register(connector: BusinessSystemConnector, options: { enabled?: boolean } = {}): void {
    const id = connector.id.trim();
    if (!id) throw new Error("BUSINESS_SYSTEM_CONNECTOR_ID_REQUIRED");
    if (this.connectors.has(id)) throw new Error(`BUSINESS_SYSTEM_CONNECTOR_DUPLICATE:${id}`);
    this.connectors.set(id, { connector, enabled: options.enabled ?? true });
  }

  setEnabled(id: string, enabled: boolean): void {
    const current = this.connectors.get(id);
    if (!current) throw new Error(`BUSINESS_SYSTEM_CONNECTOR_NOT_FOUND:${id}`);
    this.connectors.set(id, { ...current, enabled });
  }

  remove(id: string): boolean {
    return this.connectors.delete(id);
  }

  get(id: string): RegisteredBusinessSystemConnector | null {
    const value = this.connectors.get(id);
    return value ? { ...value } : null;
  }

  list(): RegisteredBusinessSystemConnector[] {
    return [...this.connectors.values()]
      .sort((a, b) => a.connector.id.localeCompare(b.connector.id))
      .map((entry) => ({ ...entry }));
  }

  listEnabled(): BusinessSystemConnector[] {
    return this.list().filter((entry) => entry.enabled).map((entry) => entry.connector);
  }
}

export interface ObservedSignalDaemonConnectorResult {
  connectorId: string;
  status: "processed" | "contended" | "failed";
  result?: ObservedSignalPollCycleResult;
  error?: string;
}

export interface ObservedSignalDaemonCycleResult {
  companyId: string;
  workerId: string;
  connectorCount: number;
  results: ObservedSignalDaemonConnectorResult[];
}

export class GovernedObservedSignalDaemon {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly registry: BusinessSystemConnectorRegistry,
    private readonly scheduler: GovernedObservedSignalScheduler,
  ) {}

  async runOnce(input: { companyId: string; workerId: string; now?: Date; leaseMs?: number }): Promise<ObservedSignalDaemonCycleResult> {
    const connectors = this.registry.listEnabled();
    const results: ObservedSignalDaemonConnectorResult[] = [];
    for (const connector of connectors) {
      try {
        const result = await this.scheduler.pollOnce({
          companyId: input.companyId,
          connector,
          workerId: `${input.workerId}:${connector.id}`,
          ...(input.now ? { now: input.now } : {}),
          ...(input.leaseMs ? { leaseMs: input.leaseMs } : {}),
        });
        results.push({ connectorId: connector.id, status: result.status, result });
      } catch (error) {
        results.push({
          connectorId: connector.id,
          status: "failed",
          error: error instanceof Error ? error.message : "OBSERVED_SIGNAL_DAEMON_UNKNOWN_ERROR",
        });
      }
    }
    return { companyId: input.companyId, workerId: input.workerId, connectorCount: connectors.length, results };
  }

  start(input: {
    companyId: string;
    workerId: string;
    intervalMs: number;
    leaseMs?: number;
    onCycle?: (result: ObservedSignalDaemonCycleResult) => void | Promise<void>;
  }): () => void {
    if (!Number.isFinite(input.intervalMs) || input.intervalMs < 1_000) throw new Error("OBSERVED_SIGNAL_DAEMON_INTERVAL_INVALID");
    if (!this.stopped) throw new Error("OBSERVED_SIGNAL_DAEMON_ALREADY_RUNNING");
    this.stopped = false;

    const schedule = () => {
      if (this.stopped) return;
      this.timer = setTimeout(async () => {
        if (this.stopped) return;
        try {
          const result = await this.runOnce({ companyId: input.companyId, workerId: input.workerId, ...(input.leaseMs ? { leaseMs: input.leaseMs } : {}) });
          await input.onCycle?.(result);
        } finally {
          schedule();
        }
      }, input.intervalMs);
      this.timer.unref?.();
    };
    schedule();
    return () => this.stop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
