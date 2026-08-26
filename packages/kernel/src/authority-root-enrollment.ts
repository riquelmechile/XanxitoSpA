import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import type {
  AuthorityRootEnrollmentChallenge,
  AuthorityRootEnrollmentProof,
  AuthorityRootEnrollmentVerification,
} from "../../contracts/src/index.js";

const ROOT_ROLES = new Set(["founder", "owner", "board"]);
const SECRET_LIKE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+\S{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}|\bsk-[A-Za-z0-9_-]{12,})/i;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]));
}

function publicKeyFingerprint(publicKeyPem: string): { fingerprint: string; normalizedPem: string } {
  if (SECRET_LIKE.test(publicKeyPem) || /PRIVATE KEY/i.test(publicKeyPem)) throw new Error("ROOT_ENROLLMENT_SECRET_MATERIAL_REJECTED");
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { throw new Error("ROOT_ENROLLMENT_PUBLIC_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("ROOT_ENROLLMENT_KEY_ALGORITHM_INVALID");
  const der = key.export({ type: "spki", format: "der" });
  return {
    fingerprint: createHash("sha256").update(der).digest("hex"),
    normalizedPem: key.export({ type: "spki", format: "pem" }).toString(),
  };
}

export function canonicalRootEnrollmentPayload(challenge: AuthorityRootEnrollmentChallenge): { payload: string; hash: string } {
  const payload = JSON.stringify(canonicalize(challenge));
  return { payload, hash: createHash("sha256").update(payload).digest("hex") };
}

export function createRootEnrollmentChallenge(input: {
  companyId: string;
  principalId: string;
  role: "founder" | "owner" | "board";
  keyId: string;
  publicKeyPem: string;
  allowedScopes: string[];
  now?: Date;
  ttlMs?: number;
  nonce?: string;
}): AuthorityRootEnrollmentChallenge {
  if (!input.companyId.trim()) throw new Error("ROOT_ENROLLMENT_COMPANY_REQUIRED");
  if (!input.principalId.trim() || !input.keyId.trim()) throw new Error("ROOT_ENROLLMENT_IDENTITY_REQUIRED");
  if (!ROOT_ROLES.has(input.role)) throw new Error("ROOT_ENROLLMENT_ROLE_INVALID");
  const scopes = [...new Set(input.allowedScopes.map((scope) => scope.trim()).filter(Boolean))].sort();
  if (scopes.length === 0 || scopes.length > 64) throw new Error("ROOT_ENROLLMENT_SCOPES_INVALID");
  if ([input.principalId, input.keyId, ...scopes].some((value) => SECRET_LIKE.test(value))) throw new Error("ROOT_ENROLLMENT_SECRET_MATERIAL_REJECTED");
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 5 * 60_000;
  if (!Number.isFinite(ttlMs) || ttlMs < 30_000 || ttlMs > 15 * 60_000) throw new Error("ROOT_ENROLLMENT_TTL_INVALID");
  const nonce = input.nonce ?? randomBytes(24).toString("base64url");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error("ROOT_ENROLLMENT_NONCE_INVALID");
  const { fingerprint, normalizedPem } = publicKeyFingerprint(input.publicKeyPem);
  return {
    vct: "authority.root-enrollment.challenge.1",
    challengeId: randomUUID(),
    companyId: input.companyId,
    principalId: input.principalId.trim(),
    role: input.role,
    keyId: input.keyId.trim(),
    algorithm: "Ed25519",
    publicKeyPem: normalizedPem,
    publicKeySha256: fingerprint,
    allowedScopes: scopes,
    nonce,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

export function verifyRootEnrollmentProof(input: {
  proof: AuthorityRootEnrollmentProof;
  companyId: string;
  now?: Date;
}): AuthorityRootEnrollmentVerification {
  const { proof, companyId } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const challenge = proof.challenge;
  const challengeShapeValid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challenge.challengeId)
    && /^[A-Za-z0-9_-]{16,128}$/.test(challenge.nonce)
    && challenge.allowedScopes.length > 0
    && challenge.allowedScopes.length <= 64
    && ![challenge.principalId, challenge.keyId, ...challenge.allowedScopes].some((value) => SECRET_LIKE.test(value));
  if (!challengeShapeValid) reasons.push("CHALLENGE_INVALID");
  const companyBound = challenge.companyId === companyId;
  if (!companyBound) reasons.push("COMPANY_MISMATCH");
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);
  const timeValid = Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && issuedAt <= now.getTime() && expiresAt > now.getTime() && expiresAt > issuedAt && (expiresAt - issuedAt) >= 30_000 && (expiresAt - issuedAt) <= 15 * 60_000;
  if (!timeValid) reasons.push("TIME_INVALID");
  if (challenge.vct !== "authority.root-enrollment.challenge.1" || !ROOT_ROLES.has(challenge.role)) reasons.push("CHALLENGE_INVALID");
  if (proof.signature.algorithm !== "Ed25519" || proof.signature.keyId !== challenge.keyId) reasons.push("KEY_ID_MISMATCH");

  let keyFingerprintValid = false;
  let signatureValid = false;
  let normalizedPem: string | undefined;
  try {
    const key = publicKeyFingerprint(challenge.publicKeyPem);
    normalizedPem = key.normalizedPem;
    keyFingerprintValid = key.fingerprint === challenge.publicKeySha256;
    if (!keyFingerprintValid) reasons.push("PUBLIC_KEY_FINGERPRINT_INVALID");
    if (keyFingerprintValid && proof.signature.algorithm === "Ed25519" && proof.signature.keyId === challenge.keyId) {
      const canonical = canonicalRootEnrollmentPayload(challenge);
      signatureValid = verify(null, Buffer.from(canonical.payload), createPublicKey(challenge.publicKeyPem), Buffer.from(proof.signature.value, "base64"));
    }
  } catch {
    reasons.push("PUBLIC_KEY_INVALID");
  }
  if (!signatureValid) reasons.push("SIGNATURE_INVALID");
  const valid = companyBound && timeValid && keyFingerprintValid && signatureValid && reasons.length === 0;
  const canonical = canonicalRootEnrollmentPayload(challenge);
  return {
    valid,
    companyBound,
    timeValid,
    keyFingerprintValid,
    signatureValid,
    reasons: [...new Set(reasons)],
    requiresOutOfBandProvisioning: true,
    ...(valid && normalizedPem ? { enrollmentBundle: {
      principalId: challenge.principalId,
      companyId: challenge.companyId,
      role: challenge.role,
      keyId: challenge.keyId,
      algorithm: "Ed25519",
      publicKeyPem: normalizedPem,
      allowedScopes: [...challenge.allowedScopes],
      sourceChallengeHash: canonical.hash,
    } } : {}),
  };
}
