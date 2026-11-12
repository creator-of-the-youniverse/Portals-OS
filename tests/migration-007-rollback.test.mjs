import assert from 'node:assert';
import fs from 'node:fs';
import { executeMigration } from '../scripts/execute-migration-007.mjs';
import { executeRollback, getClient } from '../scripts/rollback-migration-007.mjs';

const pwFile = 'C:/Users/toidi/.pg18_disposable/superuser_pw.txt';
const pw = fs.existsSync(pwFile) ? fs.readFileSync(pwFile, 'utf8').trim() : 'postgres';
const baseConn = `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:5433`;
const testDbName = 'migration_007_rollback_test';
const TEST_DB_URL = `${baseConn}/${testDbName}`;

async function setupTestDb() {
  const adminClient = await getClient(`${baseConn}/postgres`);
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await adminClient.query(`CREATE DATABASE ${testDbName};`);
  await adminClient.end();
}

async function resetTestDb() {
  const client = await getClient(TEST_DB_URL);
  await client.connect();
  try {
    // Drop test objects safely
    await client.query(`
      DROP TABLE IF EXISTS public.founding_angel_memberships CASCADE;
      DROP TABLE IF EXISTS public.founding_angel_orders CASCADE;
      DROP SCHEMA IF EXISTS test_other_schema CASCADE;
      CREATE TABLE IF NOT EXISTS public.youniverse_identities (
        identity_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        subdomain TEXT NOT NULL UNIQUE,
        identity_type TEXT NOT NULL CHECK (identity_type IN ('person', 'agent')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO public.youniverse_identities (identity_id, username, display_name, subdomain, identity_type)
      VALUES ('usr_test_rollback_identity', 'rollback_user', 'Rollback User', 'rollbacksub', 'person')
      ON CONFLICT (identity_id) DO NOTHING;
    `);
  } finally {
    await client.end();
  }
}

async function runRollbackTests() {
  console.log('=== Migration 007 Hardened Rollback Test Suite ===\n');
  await setupTestDb();

  // Test 1: Full lifecycle (Apply -> Verify -> Rollback -> Verify clean)
  {
    console.log('--- Test 1: Full Lifecycle Apply -> Rollback on Empty Schema ---');
    await resetTestDb();

    // 1. Apply Migration 007
    const applyRes = await executeMigration({ connectionString: TEST_DB_URL });
    assert.strictEqual(applyRes.success, true);
    console.log('  Applied Migration 007');

    // 2. Execute Rollback
    const rollbackRes = await executeRollback({ connectionString: TEST_DB_URL });
    assert.strictEqual(rollbackRes.success, true);
    assert.strictEqual(rollbackRes.committed, true);
    assert.strictEqual(rollbackRes.verifiedClean, true);
    assert.strictEqual(rollbackRes.tablesRemaining, 0);
    assert.strictEqual(rollbackRes.functionsRemaining, 0);

    // Verify youniverse_identities remains intact
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    const idRes = await client.query('SELECT identity_id FROM public.youniverse_identities;');
    assert.strictEqual(idRes.rows.length >= 1, true, 'youniverse_identities must remain intact');
    await client.end();

    console.log('✔ Test 1: Full rollback executed cleanly; prerequisite tables preserved\n');
  }

  // Test 2: Dry-run rollback leaves schema intact
  {
    console.log('--- Test 2: Dry-Run Rollback Leaves Schema Intact ---');
    await resetTestDb();
    await executeMigration({ connectionString: TEST_DB_URL });

    const dryRes = await executeRollback({ connectionString: TEST_DB_URL, dryRun: true });
    assert.strictEqual(dryRes.success, true);
    assert.strictEqual(dryRes.rolledBack, true);

    // Verify tables still exist
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    const tableRes = await client.query(`
      SELECT c.relname FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'founding_angel_orders';
    `);
    assert.strictEqual(tableRes.rows.length, 1, 'Tables must still exist after dry-run');
    await client.end();

    console.log('✔ Test 2: Dry-run rolled back transaction without dropping objects\n');
  }

  // Test 3: Safe against partially created schema
  {
    console.log('--- Test 3: Safe Against Partial / Corrupted Schema ---');
    await resetTestDb();

    // Create partial schema: only create founding_angel_orders, no memberships, no triggers
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query(`
      CREATE TABLE public.founding_angel_orders (
        id UUID PRIMARY KEY,
        identity_id TEXT REFERENCES public.youniverse_identities(identity_id)
      );
    `);
    await client.end();

    // Rollback should handle missing table 2, missing triggers, missing functions without error
    const rollbackRes = await executeRollback({ connectionString: TEST_DB_URL });
    assert.strictEqual(rollbackRes.success, true);
    assert.strictEqual(rollbackRes.verifiedClean, true);

    console.log('✔ Test 3: Partial schema safely cleaned up without failure\n');
  }

  // Test 4: Schema-scoped protection (objects in other schemas untouched)
  {
    console.log('--- Test 4: Schema Isolation (Other Schemas Untouched) ---');
    await resetTestDb();
    await executeMigration({ connectionString: TEST_DB_URL });

    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query(`
      CREATE SCHEMA test_other_schema;
      CREATE TABLE test_other_schema.founding_angel_orders (
        id UUID PRIMARY KEY,
        identity_id TEXT
      );
      CREATE TABLE test_other_schema.founding_angel_memberships (
        member_number INT PRIMARY KEY,
        identity_id TEXT,
        order_id UUID
      );
      ALTER TABLE test_other_schema.founding_angel_memberships
        ADD CONSTRAINT founding_angel_memberships_order_identity_fk
        FOREIGN KEY (order_id) REFERENCES test_other_schema.founding_angel_orders(id);
    `);
    await client.end();

    // Run rollback on public
    const rollbackRes = await executeRollback({ connectionString: TEST_DB_URL });
    assert.strictEqual(rollbackRes.success, true);

    // Verify test_other_schema tables and constraints are 100% untouched
    const client2 = await getClient(TEST_DB_URL);
    await client2.connect();
    const otherTables = await client2.query(`
      SELECT c.relname FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'test_other_schema' AND c.relkind = 'r';
    `);
    assert.strictEqual(otherTables.rows.length, 2, 'test_other_schema tables must NOT be dropped');

    const otherFk = await client2.query(`
      SELECT c.conname FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'test_other_schema' AND c.conname = 'founding_angel_memberships_order_identity_fk';
    `);
    assert.strictEqual(otherFk.rows.length, 1, 'test_other_schema FK must NOT be dropped');

    // Clean up other schema
    await client2.query('DROP SCHEMA test_other_schema CASCADE;');
    await client2.end();

    console.log('✔ Test 4: Rollback strictly respects schema boundaries\n');
  }

  // Test 5: Table-scoped trigger protection
  {
    console.log('--- Test 5: Table-Scoped Trigger Protection ---');
    await resetTestDb();
    await executeMigration({ connectionString: TEST_DB_URL });

    const client = await getClient(TEST_DB_URL);
    await client.connect();
    // Create same-named trigger on a different table
    await client.query(`
      CREATE OR REPLACE FUNCTION public.dummy_trigger_fn() RETURNS TRIGGER AS $$
      BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_assign_founding_angel_member_number
      BEFORE INSERT ON public.youniverse_identities
      FOR EACH ROW EXECUTE FUNCTION public.dummy_trigger_fn();
    `);
    await client.end();

    // Execute rollback
    await executeRollback({ connectionString: TEST_DB_URL });

    // Verify that the trigger on youniverse_identities was NOT dropped
    const client2 = await getClient(TEST_DB_URL);
    await client2.connect();
    const trgRes = await client2.query(`
      SELECT t.tgname FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'youniverse_identities'
        AND t.tgname = 'trg_assign_founding_angel_member_number';
    `);
    assert.strictEqual(trgRes.rows.length, 1, 'Trigger on youniverse_identities must remain intact');
    // Cleanup dummy trigger & function
    await client2.query('DROP TRIGGER trg_assign_founding_angel_member_number ON public.youniverse_identities;');
    await client2.query('DROP FUNCTION public.dummy_trigger_fn();');
    await client2.end();

    console.log('✔ Test 5: Same-named trigger on different table preserved\n');
  }

  // Test 6: Automated Data-Loss Abort Guard (Pre-traffic enforcement)
  {
    console.log('--- Test 6: Automated Data-Loss Abort Guard ---');
    await resetTestDb();
    await executeMigration({ connectionString: TEST_DB_URL });

    // Insert an order into founding_angel_orders
    const client = await getClient(TEST_DB_URL);
    await client.connect();
    await client.query(`
      INSERT INTO public.founding_angel_orders (
        identity_id, amount_cents, currency, livemode, status, stripe_idempotency_key, checkout_expires_at
      ) VALUES (
        'usr_test_rollback_identity', 20000, 'usd', false, 'creating_session', 'idem_rollback_guard_test', NOW() + INTERVAL '30 minutes'
      );
    `);
    await client.end();

    // Rollback MUST abort and raise safety violation
    await assert.rejects(
      async () => {
        await executeRollback({ connectionString: TEST_DB_URL });
      },
      (err) => {
        assert.match(err.message, /CRITICAL SAFETY VIOLATION: Pre-traffic rollback aborted!/);
        assert.match(err.message, /Table public.founding_angel_orders contains 1 records/);
        return true;
      },
      'Rollback must throw CRITICAL SAFETY VIOLATION when orders exist'
    );

    // Verify tables and row still exist
    const client2 = await getClient(TEST_DB_URL);
    await client2.connect();
    const countRes = await client2.query('SELECT count(*)::int AS cnt FROM public.founding_angel_orders;');
    assert.strictEqual(countRes.rows[0].cnt, 1, 'Order record must be preserved');
    await client2.end();

    console.log('✔ Test 6: Automated data-loss abort guard successfully prevented data destruction\n');
  }

  // Clean reset after tests
  await resetTestDb();
  console.log('All Rollback tests passed (100% unconditional pass rate).');
}

runRollbackTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
