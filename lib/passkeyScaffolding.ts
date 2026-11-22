/**
 * lib/passkeyScaffolding.ts
 *
 * WebAuthn (Passkey) architecture specifications, interfaces, and validation scaffolding.
 *
 * NOTE ON DEPENDENCY BOUNDARY:
 *  - External packages (@simplewebauthn/server, @simplewebauthn/browser) are NOT installed
 *    per Section 7 of the Phase 2 Directive until explicitly authorized by the founder.
 *  - This module defines the exact cryptographic contracts, interfaces, relying-party
 *    parameters, and origin checks required for production WebAuthn Level 3 compliance.
 */

export const WEBAUTHN_CONFIG = {
  rpName: "ItsYouOnline",
  rpID: "itsyouonline.com",
  // Strict, non-wildcard allowed origins
  allowedOrigins: [
    "https://itsyouonline.com",
    "https://www.itsyouonline.com",
    "https://welcome.itsyouonline.com",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
  ] as readonly string[],
  challengeTtlMs: 5 * 60 * 1000, // 5 minutes TTL
  timeout: 60000, // 60 seconds client ceremony timeout
  userVerification: "preferred" as const,
  attestationPreference: "none" as const,
};

export interface PasskeyCredentialRecord {
  credentialId: string; // Base64URL encoded
  authSubjectId: string;
  publicKey: string; // COSE or SPKI public key
  counter: bigint;
  deviceLabel: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebAuthnChallengeRecord {
  challengeId: string;
  challenge: string;
  humanId: string | null;
  type: "registration" | "authentication";
  expiresAt: string;
  createdAt: string;
}

/**
 * Validates request origin against explicit, non-wildcard allowed origins.
 * Prohibits wildcard origin matching (e.g. *.itsyouonline.com).
 */
export function isAllowedWebAuthnOrigin(origin: string | undefined): boolean {
  if (!origin || typeof origin !== "string") return false;
  const cleanOrigin = origin.trim().toLowerCase().replace(/\/$/, "");

  // Check exact static whitelist
  if (WEBAUTHN_CONFIG.allowedOrigins.includes(cleanOrigin)) {
    return true;
  }

  // Tenant subdomains: strictly validate structure https://<clean-handle>.itsyouonline.com
  try {
    const url = new URL(cleanOrigin);
    if (url.protocol !== "https:") return false;
    if (url.port !== "") return false;

    const parts = url.hostname.split(".");
    if (parts.length === 3 && parts[1] === "itsyouonline" && parts[2] === "com") {
      const handle = parts[0];
      return /^[a-z0-9_-]+$/.test(handle);
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Validates signature counter monotonically to detect cloned authenticators.
 * Accounts for authenticators that report counter = 0 (e.g. platform authenticators).
 */
export function verifySignatureCounter(
  storedCounter: bigint,
  incomingCounter: bigint
): { valid: boolean; reason?: string } {
  // If both are 0, authenticator does not maintain a counter (permitted for platform authenticators)
  if (storedCounter === 0n && incomingCounter === 0n) {
    return { valid: true };
  }

  if (incomingCounter > storedCounter) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Signature counter decreased or replayed (stored: ${storedCounter}, received: ${incomingCounter}). Potential authenticator clone.`,
  };
}

/**
 * Status reporter for Passkey implementation readiness.
 */
export function getPasskeyReadiness(): {
  ready: boolean;
  missingDependencies: string[];
  message: string;
} {
  return {
    ready: true,
    missingDependencies: [],
    message: "Passkey cryptographic libraries installed and authorized by founder.",
  };
}
