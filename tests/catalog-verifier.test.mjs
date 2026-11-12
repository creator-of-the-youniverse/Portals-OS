import assert from 'node:assert';
import fs from 'node:fs';
import { executeMigration } from '../scripts/execute-migration-007.mjs';
import { verifyMigration007, getClient } from '../scripts/verify-migration-007.mjs';

const pwFile = 'C:/Users/toidi/.pg18_disposable/superuser_pw.txt';
const pw = fs.existsSync(pwFile) ? fs.readFileSync(pwFile, 'utf8').trim() : 'postgres';
const baseConn = `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:5433`;
const testDbName = 'catalog_verifier_test';
const TEST_DB_URL = `${baseConn}/${testDbName}`;

async function setupTestDb() {
  const adminClient = await getClient(`${baseConn}/postgres`);
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await adminClient.query(`CREATE DATABASE ${testDbName};`);
  await adminClient.end();

  const initClient = await getClient(TEST_DB_URL);
  await initClient.connect();
  await initClient.query(`
    CREATE TABLE public.youniverse_identities (
      identity_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      subdomain TEXT NOT NULL UNIQUE,
      identity_type TEXT NOT NULL CHECK (identity_type IN ('person', 'agent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO public.youniverse_identities (identity_id, username, display_name, subdomain, identity_type)
    VALUES ('usr_verifier_test', 'verifier_user', 'Verifier User', 'verifiersub', 'person');
  `);
  await initClient.end();
}

async function runVerifierTests() {
  console.log('=== Catalog Verifier Test Suite ===\n');
  await setupTestDb();

  // Test 1: Verified pass on freshly applied Migration 007
  {
    console.log('--- Test 1: Verification Pass on Valid Migration ---');
    const applyRes = await executeMigration({ connectionString: TEST_DB_URL });
    assert.strictEqual(applyRes.success, true);

    const report = await verifyMigration007(TEST_DB_URL);
    assert.strictEqual(report.verified_pass, true, `Verification must pass (errors: ${report.errors.join(', ')})`);
    assert.strictEqual(report.errors.length, 0);
    assert.strictEqual(report.checks.tables_exist, true);
    assert.strictEqual(report.checks.orders_pkey, true);
    assert.strictEqual(report.checks.memberships_pkey, true);
    assert.strictEqual(report.checks.orders_identity_fk, true);
    assert.strictEqual(report.checks.memberships_identity_fk, true);
    assert.strictEqual(report.checks.memberships_order_identity_fk, true);
    assert.strictEqual(report.checks.trg_assign, true);
    assert.strictEqual(report.checks.trg_order_immutability, true);
    assert.strictEqual(report.checks.trg_membership_immutability, true);
    assert.strictEqual(report.checks.fn_transition, true);
    assert.strictEqual(report.checks.idx_one_active, true);
    assert.strictEqual(report.checks.orders_empty, true);
    assert.strictEqual(report.checks.memberships_empty, true);
    console.log('✔ Test 1: Full catalog verification returned verified_pass = true\n');
  }

  // Test 2: Fails closed when a trigger is disabled
  {
    console.log('--- Test 2: Fails Closed on Disabled Trigger ---');
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query('ALTER TABLE public.founding_angel_memberships DISABLE TRIGGER trg_assign_founding_angel_member_number;');
    await client.end();

    const report = await verifyMigration007(TEST_DB_URL);
    assert.strictEqual(report.verified_pass, false, 'Verifier must fail closed when trigger is disabled');
    assert.strictEqual(report.checks.trg_assign, false);
    assert.match(report.errors.join('; '), /Invalid or disabled trigger trg_assign_founding_angel_member_number/);

    // Restore trigger
    const restoreClient = await getClient(TEST_DB_URL);
    await restoreClient.connect();
    await restoreClient.query('ALTER TABLE public.founding_angel_memberships ENABLE TRIGGER trg_assign_founding_angel_member_number;');
    await restoreClient.end();
    console.log('✔ Test 2: Verifier detected disabled trigger and failed closed\n');
  }

  // Test 3: Fails closed when a foreign key constraint is missing or altered
  {
    console.log('--- Test 3: Fails Closed on Missing / Altered Foreign Key ---');
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query('ALTER TABLE public.founding_angel_memberships DROP CONSTRAINT founding_angel_memberships_order_identity_fk;');
    await client.end();

    const report = await verifyMigration007(TEST_DB_URL);
    assert.strictEqual(report.verified_pass, false, 'Verifier must fail closed when FK is missing');
    assert.strictEqual(report.checks.memberships_order_identity_fk, false);
    assert.match(report.errors.join('; '), /Invalid or missing FK founding_angel_memberships_order_identity_fk/);

    // Re-add FK
    const restoreClient = await getClient(TEST_DB_URL);
    await restoreClient.connect();
    await restoreClient.query(`
      ALTER TABLE public.founding_angel_memberships
      ADD CONSTRAINT founding_angel_memberships_order_identity_fk
      FOREIGN KEY (order_id, identity_id)
      REFERENCES public.founding_angel_orders (id, identity_id)
      ON DELETE RESTRICT;
    `);
    await restoreClient.end();
    console.log('✔ Test 3: Verifier detected missing FK and failed closed\n');
  }

  // Test 4: Fails closed when non-zero records exist
  {
    console.log('--- Test 4: Fails Closed on Non-Zero Initial Records ---');
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query(`
      INSERT INTO public.founding_angel_orders (
        identity_id, amount_cents, currency, livemode, status, stripe_idempotency_key, checkout_expires_at
      ) VALUES (
        'usr_verifier_test', 20000, 'usd', false, 'creating_session', 'idem_verifier_test', NOW() + INTERVAL '30 minutes'
      );
    `);
    await client.end();

    const report = await verifyMigration007(TEST_DB_URL);
    assert.strictEqual(report.verified_pass, false, 'Verifier must fail closed on non-zero initial records');
    assert.strictEqual(report.checks.orders_empty, false);
    assert.match(report.errors.join('; '), /founding_angel_orders has non-zero initial row count: 1/);

    // Clean up
    const restoreClient = await getClient(TEST_DB_URL);
    await restoreClient.connect();
    // Drop trigger temporarily to allow deletion in test db
    await restoreClient.query('ALTER TABLE public.founding_angel_orders DISABLE TRIGGER trg_enforce_founding_angel_order_immutability;');
    await restoreClient.query('DELETE FROM public.founding_angel_orders;');
    await restoreClient.query('ALTER TABLE public.founding_angel_orders ENABLE TRIGGER trg_enforce_founding_angel_order_immutability;');
    await restoreClient.end();
    console.log('✔ Test 4: Verifier detected non-zero initial records and failed closed\n');
  }

  // Final verification that cleaned db passes again
  const finalReport = await verifyMigration007(TEST_DB_URL);
  assert.strictEqual(finalReport.verified_pass, true);
  console.log('All Catalog Verifier tests passed (100% unconditional pass rate).');
}

runVerifierTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});

