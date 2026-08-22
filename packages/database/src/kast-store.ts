import type { KASTEntry, SessionCloseReceipt } from "../../contracts/src/index.js";

export interface KastStore {
  saveSessionClose(receipt: SessionCloseReceipt): Promise<void>;
  getSessionClose(companyId: string, sessionRef: string): Promise<SessionCloseReceipt | null>;
  upsertEntry(entry: KASTEntry): Promise<void>;
  getByFingerprint(companyId: string, fingerprint: string): Promise<KASTEntry | null>;
  listEntries(companyId: string): Promise<KASTEntry[]>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class InMemoryKastStore implements KastStore {
  readonly sessions = new Map<string, SessionCloseReceipt>();
  readonly entries = new Map<string, KASTEntry>();

  async saveSessionClose(receipt: SessionCloseReceipt): Promise<void> {
    this.sessions.set(`${receipt.companyId}:${receipt.sessionRef}`, clone(receipt));
  }

  async getSessionClose(companyId: string, sessionRef: string): Promise<SessionCloseReceipt | null> {
    const value = this.sessions.get(`${companyId}:${sessionRef}`);
    return value ? clone(value) : null;
  }

  async upsertEntry(entry: KASTEntry): Promise<void> {
    this.entries.set(`${entry.companyId}:${entry.fingerprint}`, clone(entry));
  }

  async getByFingerprint(companyId: string, fingerprint: string): Promise<KASTEntry | null> {
    const value = this.entries.get(`${companyId}:${fingerprint}`);
    return value ? clone(value) : null;
  }

  async listEntries(companyId: string): Promise<KASTEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.companyId === companyId).map(clone);
  }
}
