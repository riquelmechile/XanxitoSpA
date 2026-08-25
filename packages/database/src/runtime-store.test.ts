import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CompanyAsset } from "../../contracts/src/index.js";
import { InMemoryRuntimeStore } from "./runtime-store.js";

function asset(companyId: string, id = randomUUID(), metadata: Record<string, unknown> = {}): CompanyAsset {
  const now = new Date().toISOString();
  return {
    id,
    companyId,
    kind: "test-asset",
    capability: "test.asset",
    department: "testing",
    cost: 0,
    currency: "N/A",
    status: "active",
    grantRefs: [],
    restrictions: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

describe("RuntimeStore asset CAS", () => {
  it("treats expectedVersion=0 as create-only and positive versions as update-only", async () => {
    const store = new InMemoryRuntimeStore();
    const companyId = randomUUID();
    const value = asset(companyId);
    expect(await store.saveAsset(value, 0)).toBe(true);
    expect(await store.saveAsset({ ...value, metadata: { staleCreate: true } }, 0)).toBe(false);
    expect(await store.saveAsset(asset(companyId), 1)).toBe(false);
    expect(await store.saveAsset({ ...value, metadata: { updated: true } }, 1)).toBe(true);
    const stored = (await store.listAssets(companyId)).find((item) => item.id === value.id);
    expect(stored?.version).toBe(2);
    expect(stored?.metadata).toEqual({ updated: true });
  });

  it("applies multi-asset CAS atomically and leaves no partial write on conflict", async () => {
    const store = new InMemoryRuntimeStore();
    const companyId = randomUUID();
    const head = asset(companyId, randomUUID(), { count: 1 });
    expect(await store.saveAsset(head, 0)).toBe(true);

    const mandate = asset(companyId, randomUUID(), { mandate: true });
    const nextHead = { ...head, metadata: { count: 2 } };
    expect(await store.saveAssetsAtomically([
      { asset: mandate, expectedVersion: 0 },
      { asset: nextHead, expectedVersion: 0 },
    ])).toBe(false);

    const afterConflict = await store.listAssets(companyId);
    expect(afterConflict.some((item) => item.id === mandate.id)).toBe(false);
    expect(afterConflict.find((item) => item.id === head.id)?.metadata).toEqual({ count: 1 });

    expect(await store.saveAssetsAtomically([
      { asset: mandate, expectedVersion: 0 },
      { asset: nextHead, expectedVersion: 1 },
    ])).toBe(true);
    const afterSuccess = await store.listAssets(companyId);
    expect(afterSuccess.find((item) => item.id === mandate.id)?.version).toBe(1);
    expect(afterSuccess.find((item) => item.id === head.id)?.version).toBe(2);
  });
});
