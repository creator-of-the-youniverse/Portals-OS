import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import assert from 'node:assert';
import { hashToken } from '../lib/neonSession.ts';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.LOCAL_TEST_DATABASE_URL;
if (!dbUrl) {
  throw new Error('LOCAL_TEST_DATABASE_URL not set in .env.local');
}
if (!dbUrl.includes('ep-aged-lake-avdgndee')) {
  throw new Error(`Refusing to run tests: dbUrl does not target isolated test database! ${dbUrl}`);
}

const sql = neon(dbUrl);
const BASE_URL = 'http://localhost:3002';

async function run() {
  console.log('--- Real HTTP Contract & Baseline Verification ---');
  console.log(`Backend Target: ${BASE_URL}`);

  const nonce = Date.now().toString().slice(-6);
  const handleA = `r4btest${nonce}`;
  const emailA = `r4b_${nonce}@test.internal`;
  const handleB = `r4bother${nonce}`;
  const emailB = `r4b_other_${nonce}@test.internal`;

  let tokenA = null;
  let tokenB = null;
  let identityIdA = null;

  try {
    // 1. POST /api/claim tenant A
    console.log(`[HTTP 1] POST /api/claim (Tenant A: @${handleA})`);
    const resA = await fetch(`${BASE_URL}/api/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: handleA,
        email: emailA,
        displayName: 'R4B Test User'
      })
    });
    const textA = await resA.text();
    const dataA = JSON.parse(textA);
    assert.strictEqual(resA.status, 201, `Expected 201, got ${resA.status}`);
    assert.strictEqual(dataA.success, true);
    assert.strictEqual(dataA.status, 'created');
    assert.strictEqual(dataA.username, handleA);
    assert.strictEqual(dataA.subdomain, `${handleA}.itsyouonline.com`);
    assert.ok(dataA.identityId);
    assert.ok(typeof dataA.sessionToken === 'string' && dataA.sessionToken.length >= 32);
    tokenA = dataA.sessionToken;
    identityIdA = dataA.identityId;
    console.log(`  -> Status: 201 Created | sessionToken format: [REDACTED ${tokenA.length}-char string] | username: ${dataA.username}`);

    // 2. POST /api/claim tenant B
    console.log(`[HTTP 2] POST /api/claim (Tenant B: @${handleB})`);
    const resB = await fetch(`${BASE_URL}/api/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: handleB,
        email: emailB,
        displayName: 'R4B Other User'
      })
    });
    const dataB = await resB.json();
    assert.strictEqual(resB.status, 201);
    tokenB = dataB.sessionToken;
    assert.notStrictEqual(tokenA, tokenB, 'Tenant tokens must be strictly distinct');
    console.log(`  -> Status: 201 Created | sessionToken distinct: true | username: ${dataB.username}`);

    // 3. GET /api/v1/auth/verify?token=...
    console.log('[HTTP 3] GET /api/v1/auth/verify?token=[REDACTED]');
    const verifyRes = await fetch(`${BASE_URL}/api/v1/auth/verify?token=${tokenA}`);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.handle, handleA);
    assert.ok(verifyData.role === 'AUTHENTICATED_OWNER' || verifyData.role === 'PROVISIONAL_OWNER');
    console.log(`  -> Status: 200 OK | success: true | handle: ${verifyData.handle} | role: ${verifyData.role}`);

    // 4. GET /api/youniverse/:handle/context with matching session
    console.log(`[HTTP 4] GET /api/youniverse/${handleA}/context (matching session)`);
    const ctxA = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const ctxAData = await ctxA.json();
    assert.strictEqual(ctxA.status, 200);
    assert.strictEqual(ctxAData.success, true);
    assert.strictEqual(ctxAData.isOwner, true);
    assert.strictEqual(ctxAData.handle, handleA);
    console.log(`  -> Status: 200 OK | isOwner: ${ctxAData.isOwner} | handle: ${ctxAData.handle} | tier: ${ctxAData.tier}`);

    // 5. GET /api/youniverse/:handle/context with cross-tenant session
    console.log(`[HTTP 5] GET /api/youniverse/${handleA}/context (cross-tenant session B)`);
    const ctxCross = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const ctxCrossData = await ctxCross.json();
    assert.strictEqual(ctxCross.status, 200);
    assert.strictEqual(ctxCrossData.success, true);
    assert.strictEqual(ctxCrossData.isOwner, false);
    console.log(`  -> Status: 200 OK | isOwner: ${ctxCrossData.isOwner} (Access isolated)`);

    // 6. Missing auth header
    console.log(`[HTTP 6] GET /api/youniverse/${handleA}/context (missing auth)`);
    const ctxMissing = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`);
    assert.strictEqual(ctxMissing.status, 401);
    console.log('  -> Status: 401 Unauthorized');

    // 7. Forged token
    console.log(`[HTTP 7] GET /api/youniverse/${handleA}/context (forged token)`);
    const ctxForged = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`, {
      headers: { Authorization: 'Bearer 0000000000000000000000000000000000000000000000000000000000000000' }
    });
    assert.strictEqual(ctxForged.status, 401);
    console.log('  -> Status: 401 Unauthorized');

    // 8. Expired session
    console.log(`[HTTP 8] GET /api/youniverse/${handleA}/context (expired session)`);
    const expiredRawToken = 'expired_' + nonce + '_0123456789abcdef0123456789abcdef';
    const expiredHash = hashToken(expiredRawToken);
    await sql`
      INSERT INTO sessions (identity_id, token_hash, expires_at)
      VALUES (${identityIdA}, ${expiredHash}, NOW() - INTERVAL '1 hour')
    `;
    const ctxExpired = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`, {
      headers: { Authorization: `Bearer ${expiredRawToken}` }
    });
    assert.strictEqual(ctxExpired.status, 401);
    console.log('  -> Status: 401 Unauthorized (expired token rejected)');

    // 9. Revoked session
    console.log(`[HTTP 9] GET /api/youniverse/${handleA}/context (revoked session)`);
    const revokedRawToken = 'revoked_' + nonce + '_0123456789abcdef0123456789abcdef';
    const revokedHash = hashToken(revokedRawToken);
    await sql`
      INSERT INTO sessions (identity_id, token_hash, expires_at, revoked_at)
      VALUES (${identityIdA}, ${revokedHash}, NOW() + INTERVAL '1 day', NOW() - INTERVAL '1 minute')
    `;
    const ctxRevoked = await fetch(`${BASE_URL}/api/youniverse/${handleA}/context`, {
      headers: { Authorization: `Bearer ${revokedRawToken}` }
    });
    assert.strictEqual(ctxRevoked.status, 401);
    console.log('  -> Status: 401 Unauthorized (revoked token rejected)');

    // 10. Unauthenticated access to other owner routes (legacy JWT routes)
    console.log('[HTTP 10] Legacy route protection checks:');
    const rNotNotes = await fetch(`${BASE_URL}/api/not-notes/widgets`);
    assert.strictEqual(rNotNotes.status, 401);
    console.log(`  -> GET /api/not-notes/widgets (no auth): ${rNotNotes.status} Unauthorized`);

    const rNotNotesOpaque = await fetch(`${BASE_URL}/api/not-notes/widgets`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(rNotNotesOpaque.status, 401);
    console.log(`  -> GET /api/not-notes/widgets (opaque Neon token): ${rNotNotesOpaque.status} Unauthorized`);

    const rArtifact = await fetch(`${BASE_URL}/api/not-notes/artifact`, { method: 'POST' });
    assert.strictEqual(rArtifact.status, 401);
    console.log(`  -> POST /api/not-notes/artifact (no auth): ${rArtifact.status} Unauthorized`);

    const rWeaver = await fetch(`${BASE_URL}/api/weaver/generate`, { method: 'POST' });
    assert.strictEqual(rWeaver.status, 401);
    console.log(`  -> POST /api/weaver/generate (no auth): ${rWeaver.status} Unauthorized`);

    console.log('--- ALL REAL HTTP BASELINE CHECKS PASSED (10/10) ---');
  } finally {
    // Prune test data
    console.log('Cleaning up isolated database test rows...');
    await sql`DELETE FROM sessions WHERE identity_id IN (SELECT identity_id FROM youniverse_identities WHERE username IN (${handleA}, ${handleB}))`;
    await sql`DELETE FROM youniverse_identities WHERE username IN (${handleA}, ${handleB})`;
    const remaining = await sql`SELECT count(*) FROM youniverse_identities WHERE username IN (${handleA}, ${handleB})`;
    assert.strictEqual(Number(remaining[0].count), 0);
    console.log('Database cleanup confirmed: 0 rows remaining.');
  }
}

run().catch((err) => {
  console.error('HTTP BASELINE TEST ERROR:', err);
  process.exit(1);
});
