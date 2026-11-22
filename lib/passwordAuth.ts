/**
 * lib/passwordAuth.ts
 *
 * Modern, asynchronous password hashing and recovery management for Portals-OS / ItsYouOnline.
 *
 * Cryptographic Contract:
 *  - Algorithm: scrypt (Node.js native node:crypto, non-blocking via worker threads).
 *  - OWASP Recommended Parameters: N = 32768, r = 8, p = 1, keylen = 64 bytes.
 *  - Salt: 16 bytes cryptographically secure random entropy (128 bits).
 *  - Format: $scrypt$v=1$N=32768,r=8,p=1$<salt_hex>$<hash_hex>
 *  - Comparison: TimingSafeEqual (constant-time).
 *  - Anti-Enumeration: Dummy scrypt calculation performed for unknown accounts to equalize response latency.
 *  - Single-use reset tokens: 192-bit random token stored as SHA-256 hash with 15-minute expiration.
 */

import crypto from "node:crypto";

function scryptAsync(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

export const SCRYPT_CONFIG = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 64 * 1024 * 1024, // 64 MB upper limit
  saltBytes: 16,
  algorithmVersion: "v=1",
} as const;

// Constant dummy salt and password for anti-enumeration timing mitigation
const DUMMY_SALT = crypto.randomBytes(SCRYPT_CONFIG.saltBytes);
const DUMMY_PASSWORD = "PORTALS_OS_DUMMY_PASSWORD_ANTI_ENUM_MITIGATION";

export interface HashPasswordResult {
  passwordHash: string;
  salt: string;
  algorithm: string;
}

/**
 * Validates password strength policy:
 *  - Minimum 10 characters
 *  - At least one lowercase letter
 *  - At least one uppercase letter
 *  - At least one numeric digit
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== "string" || password.length < 10) {
    return { valid: false, reason: "Password must be at least 10 characters long." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: "Password must include at least one lowercase letter." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: "Password must include at least one uppercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: "Password must include at least one number." };
  }
  return { valid: true };
}

/**
 * Asynchronously derives an scrypt hash from a plaintext password.
 */
export async function hashPassword(password: string, saltBuffer?: Buffer): Promise<HashPasswordResult> {
  const salt = saltBuffer ?? crypto.randomBytes(SCRYPT_CONFIG.saltBytes);
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_CONFIG.keylen, {
    N: SCRYPT_CONFIG.N,
    r: SCRYPT_CONFIG.r,
    p: SCRYPT_CONFIG.p,
    maxmem: SCRYPT_CONFIG.maxmem,
  })) as Buffer;

  const saltHex = salt.toString("hex");
  const hashHex = derivedKey.toString("hex");
  const formattedHash = `$scrypt$${SCRYPT_CONFIG.algorithmVersion}$N=${SCRYPT_CONFIG.N},r=${SCRYPT_CONFIG.r},p=${SCRYPT_CONFIG.p}$${saltHex}$${hashHex}`;

  return {
    passwordHash: formattedHash,
    salt: saltHex,
    algorithm: `scrypt-${SCRYPT_CONFIG.algorithmVersion}`,
  };
}

/**
 * Asynchronously verifies a candidate password against a stored scrypt hash.
 * Uses timingSafeEqual to defeat side-channel timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (!storedHash || typeof storedHash !== "string" || !storedHash.startsWith("$scrypt$")) {
      return false;
    }

    const parts = storedHash.split("$");
    // Expected format: ["", "scrypt", "v=1", "N=32768,r=8,p=1", "<salt_hex>", "<hash_hex>"]
    if (parts.length < 6) return false;

    const saltHex = parts[4];
    const expectedHashHex = parts[5];
    const salt = Buffer.from(saltHex, "hex");
    const expectedBuffer = Buffer.from(expectedHashHex, "hex");

    const derivedBuffer = (await scryptAsync(password, salt, expectedBuffer.length, {
      N: SCRYPT_CONFIG.N,
      r: SCRYPT_CONFIG.r,
      p: SCRYPT_CONFIG.p,
      maxmem: SCRYPT_CONFIG.maxmem,
    })) as Buffer;

    if (derivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(derivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Computes a dummy scrypt calculation when an email is not found.
 * Ensures the response time of unknown accounts matches authenticated accounts (~35-50ms).
 */
export async function executeDummyScryptVerification(): Promise<void> {
  try {
    await scryptAsync(DUMMY_PASSWORD, DUMMY_SALT, SCRYPT_CONFIG.keylen, {
      N: SCRYPT_CONFIG.N,
      r: SCRYPT_CONFIG.r,
      p: SCRYPT_CONFIG.p,
      maxmem: SCRYPT_CONFIG.maxmem,
    });
  } catch {
    // Ignore dummy execution errors
  }
}

/**
 * Generates an opaque, cryptographically secure password reset token.
 * Returns rawToken (sent via email) and tokenHash (stored in DB).
 */
export function generatePasswordResetToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = crypto.randomBytes(24).toString("hex"); // 192 bits of entropy
  const tokenHash = crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Verifies SHA-256 hash of a candidate reset token.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}

// In-memory rate limiting map for login attempts (sliding window per IP/email)
const rateLimitMap = new Map<string, { attempts: number; firstAttempt: number }>();

export function checkLoginRateLimit(key: string, maxAttempts = 5, windowMs = 60000): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now - record.firstAttempt > windowMs) {
    rateLimitMap.set(key, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (record.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((record.firstAttempt + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  record.attempts += 1;
  return { allowed: true };
}

export function clearLoginRateLimit(key: string): void {
  rateLimitMap.delete(key);
}
