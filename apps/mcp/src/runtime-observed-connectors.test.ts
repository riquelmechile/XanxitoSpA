import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseObservedConnectorConfig } from "./runtime.js";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("observed connector environment bootstrap", () => {
  it("builds provider-neutral CSV connectors from paths confined to the configured signal root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "xspa-signals-"));
    const csv = path.join(root, "ops.csv");
    await writeFile(csv, [
      "id,company_id,type,occurred_at,source_id,capability,opportunity_cost,action_window_minutes,evidence_ref",
      `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,${companyId},ops.event,2026-08-25T20:00:00.000Z,system:ops,ops.event,0.8,30,ev:ops:1`,
    ].join("\n"));

    const configured = parseObservedConnectorConfig(JSON.stringify([{
      type: "csv",
      id: "system:ops",
      capabilities: ["ops.event"],
      relativePath: "ops.csv",
      enabled: true,
    }]), { companyId, signalRoot: root });

    expect(configured).toHaveLength(1);
    expect(configured[0]!.enabled).toBe(true);
    const connector = configured[0]!.connector;
    const polled = await connector.poll({ sourceId: connector.id, position: null });
    expect(polled.events).toHaveLength(1);
    expect(polled.events[0]!.signal).toBeUndefined();
    expect(polled.events[0]!.signalCapability).toBe("ops.event");
  });

  it("rejects traversal, duplicate connector ids, unknown transports and secret-like config", () => {
    expect(() => parseObservedConnectorConfig(JSON.stringify([{ type: "csv", id: "system:ops", capabilities: ["ops.event"], relativePath: "../escape.csv" }]), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/PATH_OUTSIDE_SIGNAL_ROOT/);
    expect(() => parseObservedConnectorConfig(JSON.stringify([
      { type: "csv", id: "system:ops", capabilities: ["ops.event"], relativePath: "one.csv" },
      { type: "csv", id: "system:ops", capabilities: ["ops.event"], relativePath: "two.csv" },
    ]), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/DUPLICATE/);
    expect(() => parseObservedConnectorConfig(JSON.stringify([{ type: "http", id: "system:web", capabilities: ["ops.event"], relativePath: "ops.csv" }]), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/TYPE_UNSUPPORTED/);
    expect(() => parseObservedConnectorConfig(JSON.stringify([{ type: "csv", id: "system:ops", capabilities: ["ops.event"], relativePath: "ops.csv", token: "secret-value-123" }]), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/SECRET_MATERIAL_REJECTED/);
  });

  it("requires explicit company and signal root and bounds connector count/capabilities", () => {
    expect(() => parseObservedConnectorConfig("[]", { companyId: "", signalRoot: "/tmp/xspa-signals" })).toThrow(/COMPANY_REQUIRED/);
    expect(() => parseObservedConnectorConfig("[]", { companyId, signalRoot: "" })).toThrow(/SIGNAL_ROOT_REQUIRED/);
    const tooMany = Array.from({ length: 33 }, (_, index) => ({ type: "csv", id: `system:${index}`, capabilities: ["ops.event"], relativePath: `${index}.csv` }));
    expect(() => parseObservedConnectorConfig(JSON.stringify(tooMany), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/CONFIG_INVALID/);
    expect(() => parseObservedConnectorConfig(JSON.stringify([{ type: "csv", id: "system:ops", capabilities: [], relativePath: "ops.csv" }]), { companyId, signalRoot: "/tmp/xspa-signals" })).toThrow(/CAPABILITIES_INVALID/);
  });
});