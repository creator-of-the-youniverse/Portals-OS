import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executeMigration, getClient } from '../scripts/execute-migration-007.mjs';

const pwFile = 'C:/Users/toidi/.pg18_disposable/superuser_pw.txt';

test('Migration 007 Executor Test Suite (Local Disposable PG18)', async (t) => {
  if (!fs.existsSync(pwFile)) {
    t.skip('Local disposable PostgreSQL 18 not available');
    return;
  }

  const pw = fs.readFileSync(pwFile, 'utf8').trim();
  const baseConn = `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:5433`;
  const testDbName = 'migration_007_executor_test';
  const targetConn = `${baseConn}/${testDbName}`;

  // Setup fresh isolated test database
  const adminClient = await getClient(`${baseConn}/postgres`);
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await adminClient.query(`CREATE DATABASE ${testDbName};`);
  await adminClient.end();

  // Create prerequisite youniverse_identities table in test db
  const initClient = await getClient(targetConn);
  await initClient.connect();
  await initClient.query(`
    CREATE TABLE public.youniverse_identities (
      identity_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      subdomain TEXT NOT NULL UNIQUE,
      identity_type TEXT NOT NULL CHECK (identity_type IN ('person', 'agent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      email TEXT,
      plan TEXT DEFAULT 'free',
      is_live BOOLEAN NOT NULL DEFAULT true,
      is_primary BOOLEAN NOT NULL DEFAULT true
    );
    INSERT INTO public.youniverse_identities (identity_id, username, display_name, subdomain, identity_type)
    VALUES ('id_test_123', 'testuser', 'Test User', 'testsub', 'person');
  `);
  await initClient.end();

  await t.test('1. Dry-run execution rolls back cleanly leaving 0 tables', async () => {
    const res = await executeMigration({
      connectionString: targetConn,
      dryRun: true
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.rolledBack, true);

    const checkClient = await getClient(targetConn);
    await checkClient.connect();
    const tables = await checkClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('founding_angel_orders', 'founding_angel_memberships');
    `);
    assert.strictEqual(tables.rows.length, 0, 'Tables must not exist after dry-run');
    await checkClient.end();
  });

  await t.test('2. Lock timeout aborts migration when youniverse_identities is locked', async () => {
    const lockerClient = await getClient(targetConn);
    await lockerClient.connect();
    await lockerClient.query('BEGIN;');
    await lockerClient.query('LOCK TABLE public.youniverse_identities IN ACCESS EXCLUSIVE MODE;');

    const startTime = Date.now();
    let errorCaught = null;
    try {
      await executeMigration({
        connectionString: targetConn,
        lockTimeout: '1s',
        dryRun: false
      });
    } catch (err) {
      errorCaught = err;
    } finally {
      await lockerClient.query('ROLLBACK;');
      await lockerClient.end();
    }

    const elapsed = Date.now() - startTime;
    assert.ok(errorCaught, 'Migration must fail when table is locked');
    assert.match(errorCaught.message, /lock timeout/i, 'Error message must specify lock timeout');
    assert.ok(elapsed >= 900 && elapsed < 3500, `Lock timeout should trigger in ~1s (actual: ${elapsed}ms)`);

    // Verify clean rollback
    const checkClient = await getClient(targetConn);
    await checkClient.connect();
    const tables = await checkClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('founding_angel_orders', 'founding_angel_memberships');
    `);
    assert.strictEqual(tables.rows.length, 0, 'No partial tables after lock timeout rollback');
    await checkClient.end();
  });

  await t.test('3. Statement timeout aborts long-running statements', async () => {
    const slowSql = `
      BEGIN;
      CREATE TABLE IF NOT EXISTS public.founding_angel_orders (id UUID PRIMARY KEY);
      SELECT pg_sleep(3);
      COMMIT;
    `;

    let errorCaught = null;
    const startTime = Date.now();
    try {
      await executeMigration({
        connectionString: targetConn,
        statementTimeout: '1s',
        sqlOverride: slowSql
      });
    } catch (err) {
      errorCaught = err;
    }

    const elapsed = Date.now() - startTime;
    assert.ok(errorCaught, 'Migration must fail on statement timeout');
    assert.match(errorCaught.message, /statement timeout/i, 'Error message must specify statement timeout');
    assert.ok(elapsed >= 900 && elapsed < 3500, `Statement timeout should trigger in ~1s (actual: ${elapsed}ms)`);

    // Verify clean rollback
    const checkClient = await getClient(targetConn);
    await checkClient.connect();
    const tables = await checkClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'founding_angel_orders';
    `);
    assert.strictEqual(tables.rows.length, 0, 'Table must be rolled back on statement timeout');
    await checkClient.end();
  });

  await t.test('4. Mid-migration syntax/constraint failure triggers explicit rollback', async () => {
    const brokenSql = `
      BEGIN;
      CREATE TABLE IF NOT EXISTS public.founding_angel_orders (id UUID PRIMARY KEY);
      RAISE EXCEPTION 'Simulated mid-migration failure';
      COMMIT;
    `;

    let errorCaught = null;
    try {
      await executeMigration({
        connectionString: targetConn,
        sqlOverride: brokenSql
      });
    } catch (err) {
      errorCaught = err;
    }

    assert.ok(errorCaught, 'Should catch mid-migration exception');
    assert.match(errorCaught.message, /syntax error|Simulated mid-migration failure/i);

    // Verify clean rollback
    const checkClient = await getClient(targetConn);
    await checkClient.connect();
    const tables = await checkClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'founding_angel_orders';
    `);
    assert.strictEqual(tables.rows.length, 0, 'Table must not exist after mid-migration failure');
    await checkClient.end();
  });

  await t.test('5. Successful apply creates objects and commits transaction', async () => {
    const res = await executeMigration({
      connectionString: targetConn,
      dryRun: false
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.committed, true);

    const checkClient = await getClient(targetConn);
    await checkClient.connect();
    const tables = await checkClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('founding_angel_orders', 'founding_angel_memberships')
      ORDER BY table_name;
    `);
    assert.strictEqual(tables.rows.length, 2, 'Both tables must exist after successful commit');
    await checkClient.end();
  });

  // Cleanup test database
  const cleanupAdmin = await getClient(`${baseConn}/postgres`);
  await cleanupAdmin.connect();
  await cleanupAdmin.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await cleanupAdmin.end();
});
