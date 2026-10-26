import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
const dbUrl = process.env.LOCAL_TEST_DATABASE_URL;
if (!dbUrl) {
  console.error("Missing LOCAL_TEST_DATABASE_URL");
  process.exit(1);
}

// Make sure process.env.DATABASE_URL points to LOCAL_TEST_DATABASE_URL
process.env.DATABASE_URL = dbUrl;

async function runEndToEndIntegration() {
  const testHandle = "testuser" + Math.floor(Math.random() * 899999 + 100000);
  const testEmail = testHandle + "@testdomain.example";
  const otherHandle = "otheruser" + Math.floor(Math.random() * 899999 + 100000);
  const otherEmail = otherHandle + "@testdomain.example";

  console.log(`1. Claiming test identity @${testHandle}...`);
  const { default: claimHandler } = await import("../api/claim.ts");
  const { default: verifyHandler } = await import("../api/v1/auth/verify.ts");
  const { default: contextHandler } = await import("../api/youniverse/[handle]/context.ts");

  function makeMockRes() {
    let statusCode = 200;
    let body = null;
    return {
      status(c) {
        statusCode = c;
        return this;
      },
      json(b) {
        body = b;
        return this;
      },
      get statusCode() {
        return statusCode;
      },
      get body() {
        return body;
      },
    };
  }

  let dispatchedToken1 = null;
  const mockSendEmail1 = async (p) => {
    dispatchedToken1 = p.token;
    return { sent: true, reason: "delivered" };
  };

  // Claim identity 1
  const claimRes1 = makeMockRes();
  await claimHandler(
    {
      method: "POST",
      body: { handle: testHandle, email: testEmail, displayName: "Test Owner" },
      headers: { "user-agent": "IntegrationTestRunner/1.0" },
    },
    claimRes1,
    { sendVerificationEmail: mockSendEmail1 }
  );

  if (claimRes1.statusCode !== 201 || claimRes1.body?.status !== "pending_verification") {
    console.error("Claim 1 failed:", claimRes1.statusCode, claimRes1.body);
    process.exit(1);
  }
  if (claimRes1.body.sessionToken !== undefined) {
    console.error("CRITICAL: Claim 1 leaked sessionToken before email verification!");
    process.exit(1);
  }
  console.log("  -> Claimed successfully in pending_verification state without session token.");

  if (!dispatchedToken1) {
    console.error("Expected verification token to be generated and dispatched!");
    process.exit(1);
  }

  // Verify identity 1 via verifyHandler
  console.log("2. Verifying email using dispatched verification token...");
  const verifyRes1 = makeMockRes();
  await verifyHandler(
    {
      method: "GET",
      query: { token: dispatchedToken1 },
      headers: { "user-agent": "IntegrationTestRunner/1.0" },
    },
    verifyRes1
  );

  if (verifyRes1.statusCode !== 200 || !verifyRes1.body?.sessionToken) {
    console.error("Verification 1 failed:", verifyRes1.statusCode, verifyRes1.body);
    process.exit(1);
  }
  const token1 = verifyRes1.body.sessionToken;
  const identityId1 = claimRes1.body.identityId;
  console.log("  -> Email verified successfully. Received owner sessionToken.");

  // Single-use token check: second verify call must be rejected
  const verifyResReplay = makeMockRes();
  await verifyHandler(
    {
      method: "GET",
      query: { token: dispatchedToken1 },
    },
    verifyResReplay
  );
  if (verifyResReplay.statusCode !== 401 || verifyResReplay.body?.error !== "token_already_consumed") {
    console.error("Expected token replay to be rejected with 401 token_already_consumed, got:", verifyResReplay.statusCode, verifyResReplay.body);
    process.exit(1);
  }
  console.log("  -> Replay check passed: token is single-use and already consumed.");

  // Claim & verify identity 2 (for identity isolation / cross-tenant check)
  let dispatchedToken2 = null;
  const mockSendEmail2 = async (p) => {
    dispatchedToken2 = p.token;
    return { sent: true, reason: "delivered" };
  };

  const claimRes2 = makeMockRes();
  await claimHandler(
    {
      method: "POST",
      body: { handle: otherHandle, email: otherEmail, displayName: "Other Owner" },
      headers: { "user-agent": "IntegrationTestRunner/1.0" },
    },
    claimRes2,
    { sendVerificationEmail: mockSendEmail2 }
  );

  const verifyRes2 = makeMockRes();
  await verifyHandler(
    {
      method: "GET",
      query: { token: dispatchedToken2 },
      headers: { "user-agent": "IntegrationTestRunner/1.0" },
    },
    verifyRes2
  );
  const token2 = verifyRes2.body.sessionToken;
  const identityId2 = claimRes2.body.identityId;
  console.log(`  -> Claimed & verified second identity @${otherHandle} with separate session.`);

  // Access owner context with token 1 on handle 1
  console.log(`3. Accessing owner context for @${testHandle} using its valid token...`);
  const ctxResOwner = makeMockRes();
  await contextHandler(
    {
      method: "GET",
      headers: { authorization: `Bearer ${token1}` },
      params: { handle: testHandle },
      query: {},
    },
    ctxResOwner
  );

  if (ctxResOwner.statusCode !== 200 || ctxResOwner.body?.isOwner !== true) {
    console.error("Expected isOwner: true, got:", ctxResOwner.statusCode, ctxResOwner.body);
    process.exit(1);
  }
  console.log(`  -> Context verified: isOwner = true, tier = ${ctxResOwner.body.tier}`);

  // Access owner context for handle 1 with token 2 (cross-identity isolation)
  console.log(`4. Accessing owner context for @${testHandle} using a different identity token...`);
  const ctxResOther = makeMockRes();
  await contextHandler(
    {
      method: "GET",
      headers: { authorization: `Bearer ${token2}` },
      params: { handle: testHandle },
      query: {},
    },
    ctxResOther
  );

  if (ctxResOther.statusCode !== 200 || ctxResOther.body?.isOwner !== false) {
    console.error("Expected isOwner: false for cross-tenant access, got:", ctxResOther.statusCode, ctxResOther.body);
    process.exit(1);
  }
  console.log("  -> Cross-identity verified: isOwner = false (access denied safely)");

  // Test forged token fails
  console.log("5. Accessing owner context with forged token...");
  const ctxResForged = makeMockRes();
  await contextHandler(
    {
      method: "GET",
      headers: { authorization: "Bearer forged_session_token_12345" },
      params: { handle: testHandle },
      query: {},
    },
    ctxResForged
  );
  if (ctxResForged.statusCode !== 401) {
    console.error("Expected forged token to return 401, got:", ctxResForged.statusCode);
    process.exit(1);
  }
  console.log("  -> Forged token rejected with 401");

  // Revoke token 1 in DB and verify revocation enforcement
  console.log("6. Revoking token 1 in database and verifying fail-closed...");
  const sql = neon(dbUrl);
  const { hashToken } = await import("../lib/neonSession.ts");
  const token1Hash = hashToken(token1);
  await sql`UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ${token1Hash}`;

  const ctxResRevoked = makeMockRes();
  await contextHandler(
    {
      method: "GET",
      headers: { authorization: `Bearer ${token1}` },
      params: { handle: testHandle },
      query: {},
    },
    ctxResRevoked
  );
  if (ctxResRevoked.statusCode !== 401) {
    console.error("Expected revoked token to return 401, got:", ctxResRevoked.statusCode);
    process.exit(1);
  }
  console.log("  -> Revoked token rejected with 401");

  // Clean up
  console.log("7. Cleaning up disposable test identities from isolated DB...");
  await sql`DELETE FROM email_verification_tokens WHERE identity_id IN (${identityId1}, ${identityId2})`;
  await sql`DELETE FROM sessions WHERE identity_id IN (${identityId1}, ${identityId2})`;
  await sql`DELETE FROM youniverse_identities WHERE identity_id IN (${identityId1}, ${identityId2})`;
  try {
    await sql`DELETE FROM "Youniverse" WHERE id IN (${identityId1}, ${identityId2})`;
    await sql`DELETE FROM "User" WHERE id IN (${identityId1}, ${identityId2})`;
  } catch {}
  console.log("  -> Test data cleaned up.");

  console.log("\n*** DATABASE-BACKED END-TO-END VERIFICATION PASSED ***\n");
}

runEndToEndIntegration().catch((err) => {
  console.error("Integration test threw unhandled error:", err);
  process.exit(1);
});
