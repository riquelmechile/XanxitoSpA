import type { SecretHandle } from "../../contracts/src/index.js";
import { DomainError } from "../../domain/src/index.js";
import type { SecretResolver } from "./secrets.js";

interface EnvironmentBinding {
  handle: SecretHandle;
  envVar: string;
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    throw new DomainError("provider result must be JSON-serializable");
  }
}

export class EnvironmentSecretResolver implements SecretResolver {
  private readonly bindings = new Map<string, EnvironmentBinding>();

  register(input: {
    companyId: string;
    providerId: string;
    secretName: string;
    envVar: string;
    version?: number;
  }): SecretHandle {
    if (!input.companyId || !input.providerId || !input.secretName) throw new DomainError("secret binding scope required");
    if (!/^[A-Z_][A-Z0-9_]*$/.test(input.envVar)) throw new DomainError("environment secret variable must use uppercase env naming");
    const handle: SecretHandle = {
      ref: `env-secret://${input.companyId}/${input.providerId}/${encodeURIComponent(input.secretName)}`,
      companyId: input.companyId,
      providerId: input.providerId,
      secretName: input.secretName,
      version: input.version ?? 1,
    };
    this.bindings.set(handle.ref, { handle: structuredClone(handle), envVar: input.envVar });
    return structuredClone(handle);
  }

  getHandle(companyId: string, providerId: string, secretName: string): SecretHandle {
    const binding = [...this.bindings.values()].find((entry) =>
      entry.handle.companyId === companyId &&
      entry.handle.providerId === providerId &&
      entry.handle.secretName === secretName,
    );
    if (!binding) throw new DomainError(`secret handle unavailable: ${providerId}/${secretName}`);
    return structuredClone(binding.handle);
  }

  async withSecret<T>(handle: SecretHandle, use: (value: string) => T | Promise<T>): Promise<T> {
    const binding = this.bindings.get(handle.ref);
    if (!binding) throw new DomainError("environment secret handle not found");
    if (
      binding.handle.companyId !== handle.companyId ||
      binding.handle.providerId !== handle.providerId ||
      binding.handle.secretName !== handle.secretName ||
      binding.handle.version !== handle.version
    ) {
      throw new DomainError("environment secret handle scope mismatch");
    }
    const value = process.env[binding.envVar];
    if (!value || value.length < 8) throw new DomainError(`environment secret unavailable: ${binding.envVar}`);
    return use(value);
  }

  assertSafe(value: unknown): void {
    const serialized = safeSerialize(value);
    for (const binding of this.bindings.values()) {
      const secret = process.env[binding.envVar];
      if (secret && secret.length >= 8 && serialized.includes(secret)) {
        throw new DomainError(`environment secret escaped adapter scope: ${binding.handle.providerId}/${binding.handle.secretName}`);
      }
    }
  }
}
