/**
 * tests/handoff-verification.test.mjs
 *
 * Phase R9 — Isolated test suite verifying RS256 handoff security invariants:
 *  1. Valid key configuration and token signing.
 *  2. Signature verification with audience binding.
 *  3. Audience mismatch fails closed.
 *  4. Tampered / invalid signatures fail closed.
 *  5. Expired tokens fail closed.
 *  6. Missing keys in production fail closed without HS256 fallback.
 *  7. Cross-tenant mismatch fails closed.
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
  signHandoffToken,
  verifyHandoffToken,
  assertHandoffSigningConfigured,
  handoffAudienceFor,
  isProductionRuntime,
  HandoffConfigError,
  HANDOFF_ISSUER,
} from "../lib/cryptoHandoff.ts";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

test("1. Audience generation is canonical and bound to root domain", () => {
  assert.strictEqual(handoffAudienceFor("alice"), "alice.itsyouonline.com");
  assert.strictEqual(handoffAudienceFor("bob-99"), "bob-99.itsyouonline.com");
});

test("2. Valid RS256 token signs and verifies with expected audience", () => {
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;

  try {
    process.env.HANDOFF_PRIVATE_KEY = privateKey;
    process.env.HANDOFF_PUBLIC_KEY = publicKey;

    assertHandoffSigningConfigured();

    const token = signHandoffToken({ handle: "alice", nonce: "nonce-xyz-1" });
    assert.ok(typeof token === "string" && token.split(".").length === 3);

    const verified = verifyHandoffToken(token, "alice.itsyouonline.com");
    assert.strictEqual(verified.handle, "alice");
    assert.strictEqual(verified.nonce, "nonce-xyz-1");
  } finally {
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
  }
});

test("3. Wrong audience fails closed", () => {
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;

  try {
    process.env.HANDOFF_PRIVATE_KEY = privateKey;
    process.env.HANDOFF_PUBLIC_KEY = publicKey;

    const token = signHandoffToken({ handle: "alice", nonce: "nonce-xyz-2" });

    // Target tried to verify for "bob.itsyouonline.com"
    assert.throws(
      () => verifyHandoffToken(token, "bob.itsyouonline.com"),
      (err) => err.name === "JsonWebTokenError" && err.message.includes("jwt audience invalid")
    );
  } finally {
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
  }
});

test("4. Tampered / invalid signature fails closed", () => {
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;

  try {
    process.env.HANDOFF_PRIVATE_KEY = privateKey;
    process.env.HANDOFF_PUBLIC_KEY = publicKey;

    const token = signHandoffToken({ handle: "alice", nonce: "nonce-xyz-3" });
    const parts = token.split(".");
    // Tamper with the payload part
    const tamperedPayload = Buffer.from(JSON.stringify({ handle: "bob", nonce: "nonce-xyz-3" })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    assert.throws(
      () => verifyHandoffToken(tamperedToken, "bob.itsyouonline.com"),
      (err) => err.name === "JsonWebTokenError"
    );
  } finally {
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
  }
});

test("5. Expired token fails closed", () => {
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;

  try {
    process.env.HANDOFF_PRIVATE_KEY = privateKey;
    process.env.HANDOFF_PUBLIC_KEY = publicKey;

    // Sign an expired token directly with negative expiresIn
    const expiredToken = jwt.sign(
      { handle: "alice", nonce: "nonce-xyz-4" },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: -10, // expired 10 seconds ago
        issuer: HANDOFF_ISSUER,
        audience: "alice.itsyouonline.com",
      }
    );

    assert.throws(
      () => verifyHandoffToken(expiredToken, "alice.itsyouonline.com"),
      (err) => err.name === "TokenExpiredError"
    );
  } finally {
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
  }
});

test("6. Production runtime rejects missing keys (no fallback to HS256)", () => {
  const origEnv = process.env.NODE_ENV;
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;
  const origEphemeral = process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.HANDOFF_PRIVATE_KEY;
    delete process.env.HANDOFF_PUBLIC_KEY;
    delete process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS;

    assert.strictEqual(isProductionRuntime(), true);
    assert.throws(
      () => assertHandoffSigningConfigured(),
      (err) => err instanceof HandoffConfigError && err.message.includes("HANDOFF_PRIVATE_KEY is not configured")
    );
    assert.throws(
      () => signHandoffToken({ handle: "alice", nonce: "nonce-xyz-5" }),
      (err) => err instanceof HandoffConfigError
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
    process.env.HANDOFF_ALLOW_EPHEMERAL_DEV_KEYS = origEphemeral;
  }
});

test("7. Cross-tenant mismatch in token claims fails closed", () => {
  const origPrivate = process.env.HANDOFF_PRIVATE_KEY;
  const origPublic = process.env.HANDOFF_PUBLIC_KEY;

  try {
    process.env.HANDOFF_PRIVATE_KEY = privateKey;
    process.env.HANDOFF_PUBLIC_KEY = publicKey;

    // Forged token where aud claims "eve.itsyouonline.com" but handle is "alice"
    const forgedToken = jwt.sign(
      { handle: "alice", nonce: "nonce-xyz-6" },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: 60,
        issuer: HANDOFF_ISSUER,
        audience: "eve.itsyouonline.com",
      }
    );

    assert.throws(
      () => verifyHandoffToken(forgedToken, "eve.itsyouonline.com"),
      (err) => err.name === "JsonWebTokenError" && err.message.includes("mismatch")
    );
  } finally {
    process.env.HANDOFF_PRIVATE_KEY = origPrivate;
    process.env.HANDOFF_PUBLIC_KEY = origPublic;
  }
});
