import assert from 'node:assert';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });
const dbUrl = process.env.LOCAL_TEST_DATABASE_URL;
const sql = neon(dbUrl);

// Test through Vite dev server proxy at port 5174 to verify the frontend proxy layer
const VITE_API = 'http://localhost:5174';

async function testFrontendProxyAndServices() {
  console.log('Testing Frontend Proxy and Client API Services via ' + VITE_API);
  const nonce = Date.now().toString().slice(-6);
  const testHandle = `proxytest${nonce}`;
  const testEmail = `proxy${nonce}@test.internal`;

  try {
    // 1. Check availability via frontend proxy: /api/youniverseIdentity?username=...
    console.log(`1. Testing /api/youniverseIdentity for unregistered handle @${testHandle}...`);
    const availRes = await fetch(`${VITE_API}/api/youniverseIdentity?username=${testHandle}`);
    console.log(`   -> Proxy status: ${availRes.status}`);
    assert.strictEqual(availRes.status, 404, 'Unregistered handle should return 404 available');

    // 2. Submit claim via frontend proxy: POST /api/claim
    console.log(`2. Testing POST /api/claim via Vite proxy for @${testHandle}...`);
    const claimRes = await fetch(`${VITE_API}/api/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: testHandle,
        email: testEmail,
        displayName: 'Proxy Test User'
      })
    });
    console.log(`   -> Proxy status: ${claimRes.status}`);
    assert.strictEqual(claimRes.status, 201, 'Claim should return 201 Created');
    const claimData = await claimRes.json();
    assert.strictEqual(claimData.success, true);
    assert.strictEqual(claimData.status, 'created');
    assert.ok(claimData.sessionToken);
    const token = claimData.sessionToken;

    // 3. Re-check availability now that it's registered
    console.log(`3. Re-checking /api/youniverseIdentity for now-registered handle @${testHandle}...`);
    const availTakenRes = await fetch(`${VITE_API}/api/youniverseIdentity?username=${testHandle}`);
    console.log(`   -> Proxy status: ${availTakenRes.status}`);
    assert.strictEqual(availTakenRes.status, 200, 'Registered handle should return 200');
    const availTakenData = await availTakenRes.json();
    assert.strictEqual(availTakenData.status, 'found');

    // 4. Server-verified owner context check via proxy
    console.log(`4. Testing GET /api/youniverse/${testHandle}/context with sessionToken via proxy...`);
    const ctxRes = await fetch(`${VITE_API}/api/youniverse/${testHandle}/context`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   -> Proxy status: ${ctxRes.status}`);
    assert.strictEqual(ctxRes.status, 200);
    const ctxData = await ctxRes.json();
    assert.strictEqual(ctxData.isOwner, true);
    assert.strictEqual(ctxData.handle, testHandle);

    console.log('--- ALL FRONTEND PROXY AND END-TO-END SERVICES VERIFIED ---');
  } finally {
    console.log('Cleaning up test data from isolated DB...');
    await sql`DELETE FROM sessions WHERE identity_id IN (SELECT identity_id FROM youniverse_identities WHERE username = ${testHandle})`;
    await sql`DELETE FROM youniverse_identities WHERE username = ${testHandle}`;
    console.log('Cleanup complete.');
  }
}

testFrontendProxyAndServices().catch(e => {
  console.error('Proxy test failure:', e);
  process.exit(1);
});
