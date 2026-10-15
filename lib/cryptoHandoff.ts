/**
 * @file cryptoHandoff
 *
 * Helpers for asymmetric/HMAC signing and verifying handoff tokens.
 * Uses HANDOFF_PRIVATE_KEY and HANDOFF_PUBLIC_KEY (RS256) when configured,
 * with graceful fallback to JWT_SECRET (HS256) for local development.
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";

// Fallback in-memory/static key pair for local development if env keys aren't set
let devKeys: { privateKey: string; publicKey: string } | null = null;

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

export function signHandoffToken(payload: {
  handle: string;
  nonce: string;
}): string {
  const privateKey = process.env.HANDOFF_PRIVATE_KEY;

  if (privateKey) {
    // Standard RS256 with formatted PEM
    const formattedKey = privateKey.includes("-----BEGIN")
      ? privateKey.replace(/\\n/g, "\n")
      : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;

    return jwt.sign(payload, formattedKey, {
      algorithm: "RS256",
      expiresIn: "90s",
      issuer: "welcome.itsyouonline.com",
      audience: `${payload.handle}.itsyouonline.com`,
    });
  }

  // Graceful development mode: generated RSA pair or HS256
  const dev = getDevKeys();
  return jwt.sign(payload, dev.privateKey, {
    algorithm: "RS256",
    expiresIn: "90s",
    issuer: "welcome.itsyouonline.com",
    audience: `${payload.handle}.itsyouonline.com`,
  });
}

export function verifyHandoffToken(token: string): {
  handle: string;
  nonce: string;
} {
  const publicKey = process.env.HANDOFF_PUBLIC_KEY;

  if (publicKey) {
    const formattedKey = publicKey.includes("-----BEGIN")
      ? publicKey.replace(/\\n/g, "\n")
      : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;

    return jwt.verify(token, formattedKey, {
      algorithms: ["RS256"],
      issuer: "welcome.itsyouonline.com",
    }) as { handle: string; nonce: string };
  }

  // Graceful development mode with devKeys
  const dev = getDevKeys();
  return jwt.verify(token, dev.publicKey, {
    algorithms: ["RS256"],
    issuer: "welcome.itsyouonline.com",
  }) as { handle: string; nonce: string };
}
