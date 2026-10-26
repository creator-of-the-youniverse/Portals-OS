/**
 * @file cryptoHandoff
 *
 * Helpers for signing and verifying @welcome → subdomain handoff tokens (RS256).
 *
 * Key policy:
 *  - HANDOFF_PRIVATE_KEY (sign) and HANDOFF_PUBLIC_KEY (verify) are REQUIRED in
 *    any production runtime (NODE_ENV=production or VERCEL_ENV=production|preview).
 *  - Outside production, an ephemeral in-process RSA pair is used ONLY when
 *    HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS=1 is explicitly set. Ephemeral keys never
 *    verify across processes/instances, by design.
 *  - Otherwise a HandoffConfigError is thrown. There is no HS256 / JWT_SECRET fallback.
 *
 * Audience policy:
 *  - Tokens are bound to `${handle}.${YOUNIVERSE_ROOT_DOMAIN}`.
 *  - Verification requires the caller to supply the trusted expected audience
 *    (derived from the request's routing, never from the token itself).
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { YOUNIVERSE_ROOT_DOMAIN } from "./youniverseRouting.ts";

export const HANDOFF_ISSUER = "welcome.itsyouonline.com";
export const HANDOFF_TTL_SECONDS = 90;
const CLOCK_TOLERANCE_SECONDS = 5;

export class HandoffConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffConfigError";
  }
}

export interface HandoffPayload {
  handle: string;
  nonce: string;
}

/** True for any deployed/production-like runtime. Preview deployments count as production. */
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  return (
    process.env.NODE_ENV === "production" ||
    vercelEnv === "production" ||
    vercelEnv === "preview"
  );
}

/** The trusted audience for a handle's handoff, derived from canonical routing. */
export function handoffAudienceFor(handle: string): string {
  return `${handle}.${YOUNIVERSE_ROOT_DOMAIN}`;
}

// Ephemeral in-process key pair — explicit local-development opt-in only.
let devKeys: { privateKey: string; publicKey: string } | null = null;

function ephemeralDevKeysAllowed(): boolean {
  return !isProductionRuntime() && process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS === "1";
}

function getDevKeys() {
  if (!devKeys) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    devKeys = { privateKey, publicKey };
  }
  return devKeys;
}

function formatPem(raw: string, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  return raw.includes("-----BEGIN")
    ? raw.replace(/\\n/g, "\n")
    : `-----BEGIN ${label}-----\n${raw}\n-----END ${label}-----`;
}

function resolvePrivateKey(): string {
  const raw = process.env.HANDOFF_PRIVATE_KEY?.trim();
  if (raw) return formatPem(raw, "PRIVATE KEY");
  if (ephemeralDevKeysAllowed()) return getDevKeys().privateKey;
  throw new HandoffConfigError("HANDOFF_PRIVATE_KEY is not configured.");
}

function resolvePublicKey(): string {
  const raw = process.env.HANDOFF_PUBLIC_KEY?.trim();
  if (raw) return formatPem(raw, "PUBLIC KEY");
  if (ephemeralDevKeysAllowed()) return getDevKeys().publicKey;
  throw new HandoffConfigError("HANDOFF_PUBLIC_KEY is not configured.");
}

/**
 * Asserts that handoff signing is properly configured before stateful operations.
 * Throws HandoffConfigError if the key is missing in production or malformed.
 */
export function assertHandoffSigningConfigured(): void {
  const privateKey = resolvePrivateKey();
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey(privateKey);
  } catch {
    throw new HandoffConfigError("HANDOFF_PRIVATE_KEY is not a valid private key.");
  }

  if (keyObject.type !== "private" || keyObject.asymmetricKeyType !== "rsa") {
    throw new HandoffConfigError("HANDOFF_PRIVATE_KEY must be an RSA private key for RS256.");
  }

  const modulusLength = keyObject.asymmetricKeyDetails?.modulusLength;
  if (typeof modulusLength !== "number" || modulusLength < 2048) {
    throw new HandoffConfigError("HANDOFF_PRIVATE_KEY has a minimum key size of 2048 bits for RS256.");
  }
}

export function signHandoffToken(payload: HandoffPayload): string {
  assertHandoffSigningConfigured();
  const privateKey = resolvePrivateKey();
  return jwt.sign({ handle: payload.handle, nonce: payload.nonce }, privateKey, {
    algorithm: "RS256",
    expiresIn: HANDOFF_TTL_SECONDS,
    issuer: HANDOFF_ISSUER,
    audience: handoffAudienceFor(payload.handle),
  });
}

/**
 * Verify a handoff token against a trusted, routing-derived audience.
 * Throws HandoffConfigError on missing keys; jsonwebtoken errors on any token defect.
 */
export function verifyHandoffToken(token: string, expectedAudience: string): HandoffPayload {
  if (!expectedAudience) {
    throw new HandoffConfigError("A trusted expected audience is required.");
  }

  const publicKey = resolvePublicKey();
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer: HANDOFF_ISSUER,
    audience: expectedAudience,
    maxAge: HANDOFF_TTL_SECONDS,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  });

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof (decoded as any).handle !== "string" ||
    typeof (decoded as any).nonce !== "string" ||
    !(decoded as any).handle ||
    !(decoded as any).nonce
  ) {
    throw new jwt.JsonWebTokenError("Invalid handoff token payload");
  }

  const { handle, nonce, aud } = decoded as any;

  // The token's own handle must match the audience it was bound to.
  if (aud !== handoffAudienceFor(handle)) {
    throw new jwt.JsonWebTokenError("Handoff token handle/audience mismatch");
  }

  return { handle, nonce };
}
