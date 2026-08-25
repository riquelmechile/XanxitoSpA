import { describe, expect, it } from "vitest";
import { ManifestBusinessSystemConnector, projectBusinessSystemDiscoveries } from "./business-system-connector.js";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("generic business system connectors", () => {
  it("discovers unrelated systems without granting authority and projects lineage", async () => {
    const crm = new ManifestBusinessSystemConnector({
      id: "system:crm", label: "Customer system", kind: "customer-system", confidence: 0.9,
      signalCapabilities: [{ name: "sales.pipeline", description: "Pipeline changes", criticality: "critical", confidence: 0.9 }],
    });
    const ledger = new ManifestBusinessSystemConnector({
      id: "system:ledger", label: "Accounting ledger", kind: "finance-system", confidence: 0.8,
      signalCapabilities: [{ name: "finance.ledger", description: "Ledger changes", criticality: "important", confidence: 0.8 }],
    });
    const discoveries = await Promise.all([crm.discover(), ledger.discover()]);
    expect(discoveries.every((item) => item.grantsAuthority === false && item.grantsCapabilities === false)).toBe(true);
    const first = projectBusinessSystemDiscoveries({ companyId, discoveries }, new Date("2026-08-24T20:00:00.000Z"));
    expect(first.capabilities.map((item) => item.name).sort()).toEqual(["finance.ledger", "sales.pipeline"]);
    const second = projectBusinessSystemDiscoveries({ companyId, prior: first, discoveries }, new Date("2026-08-24T20:01:00.000Z"));
    expect(second.parentRevisionId).toBe(first.revisionId);
    expect(second.sequence).toBe(2);
    expect(second.capabilities).toHaveLength(2);
  });

  it("deduplicates repeated signal capabilities deterministically", async () => {
    const connector = new ManifestBusinessSystemConnector({
      id: "system:ops", label: "Operations", kind: "operations-system", confidence: 1,
      signalCapabilities: [
        { name: "operations.orders", description: "Orders", criticality: "critical", confidence: 0.9 },
        { name: "operations.orders", description: "Orders duplicate", criticality: "critical", confidence: 0.7 },
      ],
    });
    const discovery = await connector.discover();
    expect(discovery.signalCapabilities).toHaveLength(1);
    expect(discovery.signalCapabilities[0]?.confidence).toBe(0.9);
  });
});
