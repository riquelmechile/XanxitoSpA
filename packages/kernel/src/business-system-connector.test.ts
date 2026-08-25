import { describe, expect, it } from "vitest";
import { ManifestBusinessSystemConnector, pollObservedBusinessSystem, projectBusinessSystemDiscoveries } from "./business-system-connector.js";

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
    const discoveries = await Promise.all([crm.describe(), ledger.describe()]);
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
    const discovery = await connector.describe();
    expect(discovery.signalCapabilities).toHaveLength(1);
    expect(discovery.signalCapabilities[0]?.confidence).toBe(0.9);
  });
  it("uses one connector identity for describe and poll", async () => {
    const connector = new ManifestBusinessSystemConnector({
      id: "system:dual", label: "Dual-mode system", kind: "generic-system", confidence: 1,
      signalCapabilities: [{ name: "operations.events", description: "Operational events", criticality: "important", confidence: 1 }],
    }, {
      poll: async (cursor) => ({ events: [], cursor: { sourceId: cursor.sourceId, position: "next" } }),
    });
    const descriptor = await connector.describe();
    const polled = await connector.poll({ sourceId: connector.id, position: null });
    expect(descriptor.id).toBe(connector.id);
    expect(descriptor.signalPolling).toBe("live");
    expect(connector.capabilities).toEqual(["operations.events"]);
    expect(polled.cursor).toEqual({ sourceId: connector.id, position: "next" });
  });

  it("attests observed events only after polling a registered connector boundary", async () => {
    const connector = new ManifestBusinessSystemConnector({
      id: "system:attested", label: "Attested", kind: "generic-system", confidence: 1,
      signalCapabilities: [{ name: "operations.events", description: "Operational events", criticality: "important", confidence: 1 }],
    }, {
      poll: async () => ({
        events: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", companyId, type: "operations.events", occurredAt: "2026-08-25T12:00:00.000Z", actorPrincipal: "connector", correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", idempotencyKey: "evt:a", payload: {}, sensitivity: "internal", evidenceRefs: [], signal: { provenance: "asserted", sourceId: "spoofed", topic: "operations.events", capability: "operations.events" } }],
        cursor: { sourceId: "system:attested", position: "1" },
      }),
    });
    const result = await pollObservedBusinessSystem({ connector, companyId, cursor: { sourceId: connector.id, position: null } });
    expect(result.events[0]?.signal?.provenance).toBe("observed");
    expect(result.events[0]?.signal?.sourceId).toBe(connector.id);
    expect(result.events[0]?.signal?.attestationRef).toMatch(/^connector-attestation:[a-f0-9]{64}$/);
    expect(result.events[0]?.evidenceRefs).toContain(result.events[0]?.signal?.attestationRef);
  });


});
