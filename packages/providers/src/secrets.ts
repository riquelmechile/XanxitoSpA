import type { SecretHandle } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";

export interface SecretResolver {
  getHandle(companyId: string, providerId: string, secretName: string): SecretHandle;
  withSecret<T>(handle: SecretHandle, use: (value: string) => T | Promise<T>): Promise<T>;
  assertSafe(value: unknown): void;
}

interface StoredValue {
  handle: SecretHandle;
  value: string;
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    throw new DomainError("provider result must be JSON-serializable");
  }
}

export class InMemorySecretResolver implements SecretResolver {
  private readonly values = new Map<string, StoredValue>();

  register(input: { companyId: string; providerId: string; secretName: string; value: string; version?: number }): SecretHandle {
    if (input.value.length < 8) throw new DomainError("secret value must be at least 8 characters");
    const handle: SecretHandle = {
      ref: `secret://${input.companyId}/${input.providerId}/${encodeURIComponent(input.secretName)}`,
      companyId: input.companyId,
      providerId: input.providerId,
      secretName: input.secretName,
      version: input.version ?? 1,
    };
    this.values.set(handle.ref, { handle: structuredClone(handle), value: input.value });
    return structuredClone(handle);
  }

  getHandle(companyId: string, providerId: string, secretName: string): SecretHandle {
    const found = [...this.values.values()].find((entry) =>
      entry.handle.companyId === companyId && entry.handle.providerId === providerId && entry.handle.secretName === secretName,
    );
    if (!found) throw new DomainError(`secret handle unavailable: ${providerId}/${secretName}`);
    return structuredClone(found.handle);
  }

  async withSecret<T>(handle: SecretHandle, use: (value: string) => T | Promise<T>): Promise<T> {
    const stored = this.values.get(handle.ref);
    if (!stored) throw new DomainError("secret handle not found");
    if (stored.handle.companyId !== handle.companyId || stored.handle.providerId !== handle.providerId || stored.handle.secretName !== handle.secretName || stored.handle.version !== handle.version) {
      throw new DomainError("secret handle scope mismatch");
    }
    return use(stored.value);
  }

  assertSafe(value: unknown): void {
    const serialized = safeSerialize(value);
    for (const stored of this.values.values()) {
      if (serialized.includes(stored.value)) {
        throw new DomainError(`secret value escaped adapter scope: ${stored.handle.providerId}/${stored.handle.secretName}`);
      }
    }
  }
}
