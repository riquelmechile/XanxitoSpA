import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CsvSignalSource } from "./csv-signal-source.js";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("CsvSignalSource", () => {
  it("polls deterministic BusinessEvents with an opaque line cursor and does not replay consumed rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xspa-csv-signal-"));
    const path = join(dir, "signals.csv");
    await writeFile(path, [
      "id,company_id,type,occurred_at,source_id,capability,opportunity_cost,action_window_minutes,evidence_ref",
      `22222222-2222-4222-8222-222222222222,${companyId},lead.created,2026-08-24T19:00:00.000Z,signal:crm,crm.read,0.6,60,evidence:1`,
      `33333333-3333-4333-8333-333333333333,${companyId},lead.created,2026-08-24T19:01:00.000Z,signal:crm,crm.read,0.7,30,evidence:2`,
    ].join("\n"));
    const source = new CsvSignalSource({ id: "signal:crm", companyId, capabilities: ["crm.read"], path });
    const first = await source.poll({ sourceId: "signal:crm", position: null });
    expect(first.events).toHaveLength(2);
    expect(first.cursor).toEqual({ sourceId: "signal:crm", position: "2" });
    expect(first.events[0]?.payload).toMatchObject({ sourceId: "signal:crm", capability: "crm.read", opportunityCost: 0.6, actionWindowMinutes: 60 });
    const second = await source.poll(first.cursor);
    expect(second.events).toEqual([]);
    expect(second.cursor).toEqual(first.cursor);
  });
});
