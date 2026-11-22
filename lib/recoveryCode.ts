/**
 * lib/recoveryCode.ts
 *
 * Layer 2 — Offline Recovery Codes for ItsYouOnline / Portals-OS.
 *
 * Security contract:
 *  - Codes generated with crypto.randomBytes (CSPRNG).
 *  - Format: XXXX-XXXX-XXXX (3 groups of 4 uppercase alphanumeric chars).
 *  - Stored as SHA-256 hashes only — plaintext is never persisted.
 *  - Comparison via timingSafeEqual (constant-time, defeats timing attacks).
 *  - Normalization: strip whitespace and hyphens, uppercase before hashing.
 */

import crypto from "node:crypto";

/** Character set: uppercase alphanumeric, excluding visually ambiguous chars (0, O, I, 1) */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP_SIZE = 4;
const GROUP_COUNT = 3;
const CODE_LENGTH = GROUP_SIZE * GROUP_COUNT; // 12 chars

function randomCodeChar(): string {
  // Use rejection sampling to avoid modulo bias
  const buf = crypto.randomBytes(1);
  const idx = buf[0] % CODE_CHARS.length;
  return CODE_CHARS[idx];
}

/**
 * Generates a single cryptographically secure recovery code.
 * Format: XXXX-XXXX-XXXX
 */
function generateSingleCode(): string {
  let chars = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    chars += randomCodeChar();
  }
  // Insert hyphens: XXXX-XXXX-XXXX
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    groups.push(chars.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE));
  }
  return groups.join("-");
}

/**
 * Normalize a recovery code for comparison:
 * strips whitespace and hyphens, uppercases.
 */
export function normalizeRecoveryCode(code: string): string {
  if (typeof code !== "string") return "";
  return code.replace(/[\s\-]/g, "").toUpperCase();
}

/**
 * SHA-256 hash of a recovery code, after normalization.
 * Deterministic: same normalized code → same hash.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a plaintext code against a stored SHA-256 hash.
 * Returns true only if the plaintext normalizes to a code whose hash matches.
 */
export function verifyRecoveryCode(plaintext: string, storedHash: string): boolean {
  try {
    if (typeof plaintext !== "string" || typeof storedHash !== "string") return false;
    const candidateHash = hashRecoveryCode(plaintext);
    const candidateBuf = Buffer.from(candidateHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (candidateBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Generates `count` cryptographically secure recovery codes.
 * Returns both plaintext (for one-time display) and their SHA-256 hashes (for storage).
 *
 * @param count number of codes to generate (default: 8)
 */
export function generateRecoveryCodes(count = 8): { plaintext: string[]; hashes: string[] } {
  const plaintext: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateSingleCode();
    plaintext.push(code);
    hashes.push(hashRecoveryCode(code));
  }

  return { plaintext, hashes };
}
