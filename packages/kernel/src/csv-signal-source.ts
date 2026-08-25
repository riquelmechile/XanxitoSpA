import { readFile } from "node:fs/promises";
import type { BusinessEvent, SignalCursor, SignalPollResult } from "../../contracts/src/index.js";
import type { BusinessSystemConnector, DiscoveredBusinessSystem } from "./business-system-connector.js";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) { values.push(current); current = ""; continue; }
    current += char;
  }
  if (quoted) throw new Error("CSV signal row has unterminated quote");
  values.push(current);
  return values.map((value) => value.trim());
}

function numberField(value: string | undefined, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} invalid`);
  return parsed;
}

export class CsvSignalSource implements BusinessSystemConnector {
  readonly id: string;
  readonly capabilities: readonly string[];
  private readonly companyId: string;
  private readonly path: string;

  constructor(input: { id: string; companyId: string; capabilities: string[]; path: string }) {
    if (!input.id.trim() || !input.companyId.trim() || !input.path.trim()) throw new Error("CSV signal source configuration invalid");
    this.id = input.id;
    this.companyId = input.companyId;
    this.capabilities = [...new Set(input.capabilities.map((capability) => capability.trim()).filter(Boolean))];
    this.path = input.path;
  }

  async describe(): Promise<DiscoveredBusinessSystem> {
    return {
      id: this.id,
      label: `CSV signal source ${this.id}`,
      kind: "file-system",
      confidence: 1,
      signalCapabilities: this.capabilities.map((name) => ({ name, description: `Signals observed from ${name}`, criticality: "important" as const, confidence: 1 })),
      signalPolling: "live",
      grantsAuthority: false,
      grantsBudget: false,
      grantsCapabilities: false,
      executesWork: false,
    };
  }

  async poll(cursor: SignalCursor): Promise<SignalPollResult> {
    if (cursor.sourceId !== this.id) throw new Error("CSV signal cursor source mismatch");
    const start = cursor.position === null ? 0 : Number(cursor.position);
    if (!Number.isInteger(start) || start < 0) throw new Error("CSV signal cursor position invalid");
    const content = await readFile(this.path, "utf8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return { events: [], cursor: { sourceId: this.id, position: String(start) } };
    const header = parseCsvLine(lines[0]!);
    const required = ["id", "company_id", "type", "occurred_at", "source_id", "capability", "opportunity_cost", "action_window_minutes", "evidence_ref"];
    if (required.some((name) => !header.includes(name))) throw new Error("CSV signal header missing required columns");
    const rows = lines.slice(1);
    if (start > rows.length) throw new Error("CSV signal cursor exceeds available rows");
    const events: BusinessEvent[] = rows.slice(start).map((line, offset) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
      if (row.company_id !== this.companyId) throw new Error(`CSV signal company mismatch at row ${start + offset + 1}`);
      if (row.source_id !== this.id) throw new Error(`CSV signal source mismatch at row ${start + offset + 1}`);
      if (!this.capabilities.includes(row.capability ?? "")) throw new Error(`CSV signal capability outside adapter contract at row ${start + offset + 1}`);
      const occurredAt = new Date(row.occurred_at ?? "");
      if (Number.isNaN(occurredAt.getTime())) throw new Error(`CSV signal occurred_at invalid at row ${start + offset + 1}`);
      const opportunityCost = numberField(row.opportunity_cost, "opportunity_cost", 0, 1);
      const actionWindowMinutes = numberField(row.action_window_minutes, "action_window_minutes", 0.000001, Number.MAX_SAFE_INTEGER);
      const id = row.id ?? "";
      if (!id) throw new Error(`CSV signal id missing at row ${start + offset + 1}`);
      return {
        id,
        companyId: this.companyId,
        type: row.type ?? "business.signal",
        occurredAt: occurredAt.toISOString(),
        actorPrincipal: this.id,
        correlationId: id,
        idempotencyKey: `csv:${this.id}:${id}`,
        payload: { sourceId: this.id, capability: row.capability, opportunityCost, actionWindowMinutes },
        sensitivity: "internal",
        evidenceRefs: row.evidence_ref ? [row.evidence_ref] : [],
      };
    });
    return { events, cursor: { sourceId: this.id, position: String(rows.length) } };
  }
}
