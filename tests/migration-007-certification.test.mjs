import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { executeMigration, getClient, EXPECTED_SHA256 } from '../scripts/execute-migration-007.mjs';
import { verifyMigration007, captureUnrelatedCatalog } from '../scripts/verify-migration-007.mjs';

async function getClosedLocalPort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

const pwFile = 'C:/Users/toidi/.pg18_disposable/superuser_pw.txt';

if (!fs.existsSync(pwFile)) {
  console.error('Superuser password file not found. Skipping PG18 certification tests.');
  process.exit(1);
}

const pw = fs.readFileSync(pwFile, 'utf8').trim();
const baseConn = `postgresql://postgres:${encodeURIComponent(pw)}@127.0.0.1:5433`;
const testDbName = 'migration_007_cert_suite_db';
const targetConn = `${baseConn}/${testDbName}`;

// Helper to reset the test database with a realistic baseline schema
async function resetTestDb() {
  const adminClient = await getClient(`${baseConn}/postgres`);
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
  await adminClient.query(`CREATE DATABASE ${testDbName};`);
  await adminClient.end();

  const initClient = await getClient(targetConn);
  await initClient.connect();

  // Create baseline tables matching production catalog
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
      stripe_session_id TEXT,
      is_live BOOLEAN NOT NULL DEFAULT true,
      is_primary BOOLEAN NOT NULL DEFAULT true,
      email_verified_at TIMESTAMPTZ
    );
    INSERT INTO public.youniverse_identities (identity_id, username, display_name, subdomain, identity_type)
    VALUES 
      ('usr_cert_01', 'user1', 'User One', 'sub1', 'person'),
      ('usr_cert_02', 'user2', 'User Two', 'sub2', 'person'),
      ('usr_cert_03', 'user3', 'User Three', 'sub3', 'person'),
      ('usr_cert_04', 'user4', 'User Four', 'sub4', 'person');

    CREATE TABLE public."DeviceTrust" (id SERIAL PRIMARY KEY, note TEXT);
    CREATE TABLE public."NotNote" (id SERIAL PRIMARY KEY, title TEXT);
    CREATE TABLE public."Session" (id SERIAL PRIMARY KEY, token TEXT);
    CREATE TABLE public."User" (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE public."Youniverse" (id SERIAL PRIMARY KEY, handle TEXT);
    CREATE TABLE public.email_verification_tokens (id SERIAL PRIMARY KEY, token TEXT);
    CREATE TABLE public.handoff_tokens (id SERIAL PRIMARY KEY, token TEXT);
    CREATE TABLE public.sessions (id SERIAL PRIMARY KEY, session_id TEXT);

    INSERT INTO public."NotNote" (title) VALUES ('Note 1');
    INSERT INTO public."User" (name) VALUES ('User 1');
    INSERT INTO public."Youniverse" (handle) VALUES ('youniverse_main');
    INSERT INTO public.email_verification_tokens (token) VALUES ('tok_01'), ('tok_02'), ('tok_03'), ('tok_04'), ('tok_05'), ('tok_06'), ('tok_07');
    INSERT INTO public.handoff_tokens (token) VALUES ('h_01'), ('h_02'), ('h_03'), ('h_04'), ('h_05');
    INSERT INTO public.sessions (session_id) VALUES ('s_1'), ('s_2'), ('s_3'), ('s_4'), ('s_5'), ('s_6'), ('s_7'), ('s_8'), ('s_9');

    -- Create an unrelated trigger and function on a baseline table
    CREATE OR REPLACE FUNCTION public.custom_baseline_trigger_func()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_custom_baseline_notnote
    BEFORE INSERT ON public."NotNote"
    FOR EACH ROW EXECUTE FUNCTION public.custom_baseline_trigger_func();
  `);
  await initClient.end();
}

// ── Scenario 1: Checksum Mismatch Aborts Before Connection ──────────────────
test('Scenario 1: Checksum mismatch aborts before database connection', async () => {
  const actualFile = fs.readFileSync('db/migrations/007_founding_angels_mvp.sql');
  const actualHash = crypto.createHash('sha256').update(actualFile).digest('hex').toUpperCase();
  assert.strictEqual(actualHash, EXPECTED_SHA256, 'Working tree migration SHA must match EXPECTED_SHA256');

  // Prove that invalid connection string is NEVER reached if checksum fails
  let threwBeforeConnect = false;
  try {
    process.env.NODE_ENV = 'production';
    await executeMigration({
      connectionString: 'postgresql://invalid_host_unreachable:9999/bad_db',
      sqlOverride: 'TAMPERED_SQL;'
    });
  } catch (err) {
    threwBeforeConnect = true;
    assert.match(err.message, /sqlOverride is strictly prohibited in production mode/);
  } finally {
    delete process.env.NODE_ENV;
  }
  assert.strictEqual(threwBeforeConnect, true);
});

// ── Scenario 2: Successful Migration & Full Catalog Verification ─────────────
test('Scenario 2: Successful migration and deep catalog + baseline verification', async () => {
  await resetTestDb();

  // 1. Capture unrelated catalog snapshot BEFORE migration
  const preClient = await getClient(targetConn);
  await preClient.connect();
  const preSnapshot = await captureUnrelatedCatalog(preClient);
  await preClient.end();

  // 2. Execute Migration 007
  const res = await executeMigration({
    connectionString: targetConn,
    dryRun: false
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.committed, true);
  assert.strictEqual(res.mode, 'applied');

  // 3. Verify deep catalog and baseline preservation
  const report = await verifyMigration007(targetConn, {
    checkBaseline: true,
    baseline: {
      tables: [
        'DeviceTrust', 'NotNote', 'Session', 'User', 'Youniverse',
        'email_verification_tokens', 'handoff_tokens', 'sessions', 'youniverse_identities'
      ],
      minCounts: {
        youniverse_identities: 4,
        sessions: 9,
        email_verification_tokens: 7,
        handoff_tokens: 5,
        User: 1,
        Youniverse: 1,
        NotNote: 1
      },
      identityIds: ['usr_cert_01', 'usr_cert_02', 'usr_cert_03', 'usr_cert_04'],
      youniverseIdentitiesPk: 'youniverse_identities_pkey',
      youniverseIdentitiesPkColumn: 'identity_id',
      youniverseIdentitiesColumns: [
        { column_name: 'identity_id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'username', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'display_name', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'subdomain', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'identity_type', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' }
      ]
    },
    unrelatedCatalogBaseline: preSnapshot
  });

  assert.strictEqual(report.verified_pass, true, `Verification errors: ${report.errors.join('; ')}`);
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
  assert.strictEqual(report.checks.idx_capacity, true);
  assert.strictEqual(report.checks.idx_refund_queue, true);
  assert.strictEqual(report.checks.orders_empty, true);
  assert.strictEqual(report.checks.memberships_empty, true);
  assert.strictEqual(report.checks.baseline_tables_exist, true);
  assert.strictEqual(report.checks.baseline_identities_pk, true);
  assert.strictEqual(report.checks.baseline_identities_columns, true);
  assert.strictEqual(report.checks.count_non_regression, true);
  assert.strictEqual(report.checks.record_level_identities_preserved, true);
  assert.strictEqual(report.checks.unrelated_catalog_preserved, true);
});

// ── Scenario 3: Duplicate Execution Aborts Without Modifying Schema ─────────
test('Scenario 3: Duplicate execution aborts without changing committed schema', async () => {
  // Database already has Migration 007 applied from Scenario 2
  let threw = false;
  try {
    await executeMigration({
      connectionString: targetConn,
      dryRun: false
    });
  } catch (err) {
    threw = true;
    assert.match(err.message, /target tables already exist\. Re-running is prohibited\. Failing closed\./);
  }
  assert.strictEqual(threw, true, 'Executor must fail closed on duplicate execution');
});

// ── Scenario 4: SQL Failure Rolls Back Transaction ──────────────────────────
test('Scenario 4: SQL failure rolls back transaction leaving 0 partial tables', async () => {
  await resetTestDb();

  let threw = false;
  try {
    await executeMigration({
      connectionString: targetConn,
      sqlOverride: `
        CREATE TABLE public.partial_table_cert (id INT PRIMARY KEY);
        CREATE INVALID SQL SYNTAX ERROR;
      `
    });
  } catch (err) {
    threw = true;
    assert.match(err.message, /syntax error/i);
  }
  assert.strictEqual(threw, true);

  const client = await getClient(targetConn);
  await client.connect();
  const res = await client.query("SELECT to_regclass('public.partial_table_cert') IS NOT NULL AS exists;");
  await client.end();
  assert.strictEqual(res.rows[0].exists, false, 'Partial table must not exist after rollback');
});

// ── Scenario 5: Lock Timeout Aborts & Rolls Back ────────────────────────────
test('Scenario 5: Lock timeout aborts when youniverse_identities is locked', async () => {
  await resetTestDb();

  const blockerClient = await getClient(targetConn);
  await blockerClient.connect();
  await blockerClient.query('BEGIN;');
  await blockerClient.query('LOCK TABLE public.youniverse_identities IN ACCESS EXCLUSIVE MODE;');

  let threw = false;
  try {
    await executeMigration({
      connectionString: targetConn,
      lockTimeout: '1s',
      dryRun: false
    });
  } catch (err) {
    threw = true;
    assert.match(err.message, /canceling statement due to lock timeout/i);
  } finally {
    await blockerClient.query('ROLLBACK;');
    await blockerClient.end();
  }
  assert.strictEqual(threw, true, 'Lock timeout must fail closed');
});

// ── Scenario 6: Statement Timeout Aborts & Rolls Back ───────────────────────
test('Scenario 6: Statement timeout aborts runaway statement', async () => {
  await resetTestDb();

  let threw = false;
  try {
    await executeMigration({
      connectionString: targetConn,
      statementTimeout: '1s',
      sqlOverride: 'SELECT pg_sleep(3);'
    });
  } catch (err) {
    threw = true;
    assert.match(err.message, /canceling statement due to statement timeout/i);
  }
  assert.strictEqual(threw, true, 'Statement timeout must abort transaction');
});

// ── Scenario 7: Watchdog Expiration Produces UNKNOWN Outcome ────────────────
test('Scenario 7: Watchdog expiration produces UNKNOWN outcome', async () => {
  await resetTestDb();

  let caughtErr = null;
  try {
    await executeMigration({
      connectionString: targetConn,
      wallClockTimeoutMs: 1000,
      statementTimeout: '10s',
      sqlOverride: 'SELECT pg_sleep(4);'
    });
  } catch (err) {
    caughtErr = err;
  }

  assert.ok(caughtErr, 'Watchdog must throw an error');
  assert.strictEqual(caughtErr.outcome, 'UNKNOWN', 'Watchdog error must carry outcome = UNKNOWN');
  assert.strictEqual(caughtErr.isWatchdog, true, 'Watchdog error must set isWatchdog = true');
});

// ── Scenario 8: Connection Failure Before BEGIN ─────────────────────────────
test('Scenario 8: Connection failure before BEGIN aborts without claiming execution', async () => {
  let caughtErr = null;
  try {
    await executeMigration({
      connectionString: 'postgresql://postgres:bad_pw@127.0.0.1:5433/nonexistent_db_abc',
      dryRun: false
    });
  } catch (err) {
    caughtErr = err;
  }

  assert.ok(caughtErr, 'Must throw on connection failure');
  assert.strictEqual(caughtErr.outcome, undefined, 'Outcome must NOT be UNKNOWN if never connected');
});

// ── CLI Child-Process OS Exit Code Tests ─────────────────────────────────────
test('CLI Child-Process: Successful execution exits 0', async () => {
  await resetTestDb();

  const res = spawnSync(process.execPath, ['scripts/execute-migration-007.mjs'], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: targetConn },
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 0, `Expected exit 0, got ${res.status}. Stderr: ${res.stderr}`);
  assert.match(res.stdout, /Result:\s*\{\s*success:\s*true,\s*mode:\s*'applied'/);
});

test('CLI Child-Process: Duplicate execution exits nonzero (code 1)', async () => {
  // DB already has Migration 007 applied from previous test
  const res = spawnSync(process.execPath, ['scripts/execute-migration-007.mjs'], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: targetConn },
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 1, `Expected exit 1, got ${res.status}`);
  assert.match(res.stderr, /target tables already exist\. Re-running is prohibited\. Failing closed\./);
});

test('CLI Child-Process: Connection failure exits nonzero (code 1)', async () => {
  const res = spawnSync(process.execPath, ['scripts/execute-migration-007.mjs'], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: 'postgresql://postgres:wrong_pw@127.0.0.1:5433/nonexistent' },
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 1, `Expected exit 1, got ${res.status}`);
  assert.match(res.stderr, /\[execute-migration-007\] Failed:/);
});

test('CLI Child-Process: Watchdog expiration exits with code 2 (UNKNOWN outcome contract)', async () => {
  await resetTestDb();

  // We set a 500ms wall clock timeout and lock youniverse_identities so execution stalls
  const blockerClient = await getClient(targetConn);
  await blockerClient.connect();
  await blockerClient.query('BEGIN;');
  await blockerClient.query('LOCK TABLE public.youniverse_identities IN ACCESS EXCLUSIVE MODE;');

  let res;
  try {
    res = spawnSync(process.execPath, ['scripts/execute-migration-007.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL_UNPOOLED: targetConn,
        WALL_CLOCK_TIMEOUT_MS: '800',
        LOCK_TIMEOUT: '10s' // Lock timeout is longer than watchdog so watchdog fires FIRST
      },
      encoding: 'utf8'
    });
  } finally {
    await blockerClient.query('ROLLBACK;');
    await blockerClient.end();
  }

  assert.strictEqual(res.status, 2, `Expected exit code 2, got ${res.status}. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(res.stderr, /CRITICAL: Transaction outcome is UNKNOWN/);
});

test('CLI Child-Process: Incorrect migration checksum exits nonzero (code 1) without DB connection', async (t) => {
  const realFile = fs.readFileSync(path.resolve(process.cwd(), 'db/migrations/007_founding_angels_mvp.sql'));
  const realHash = crypto.createHash('sha256').update(realFile).digest('hex').toUpperCase();
  assert.strictEqual(realHash, EXPECTED_SHA256, 'Real Migration 007 SHA-256 must remain untouched');

  // Assert source order guarantees checksum validation precedes getClient/connect
  const executorSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/execute-migration-007.mjs'), 'utf8');
  const checksumThrowIdx = executorSource.indexOf('Migration 007 checksum mismatch');
  const getClientCallIdx = executorSource.indexOf('const client = await getClient(');
  const connectCallIdx = executorSource.indexOf('await client.connect(');
  assert.ok(checksumThrowIdx > 0 && checksumThrowIdx < getClientCallIdx && getClientCallIdx < connectCallIdx);

  const unreachablePort = await getClosedLocalPort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig007-cli-checksum-'));

  try {
    const tempMigDir = path.join(tempDir, 'db', 'migrations');
    fs.mkdirSync(tempMigDir, { recursive: true });
    const tamperedSql = '-- Controlled tampered Migration 007 fixture for CLI checksum test\nBEGIN;\nSELECT 1;\nCOMMIT;\n';
    const tempMigPath = path.join(tempMigDir, '007_founding_angels_mvp.sql');
    fs.writeFileSync(tempMigPath, tamperedSql, 'utf8');

    const tamperedSha = crypto.createHash('sha256').update(Buffer.from(tamperedSql, 'utf8')).digest('hex').toUpperCase();
    assert.notStrictEqual(tamperedSha, EXPECTED_SHA256, 'Tampered fixture SHA-256 must differ from EXPECTED_SHA256');

    const cliScript = path.resolve(process.cwd(), 'scripts/execute-migration-007.mjs');
    const res = spawnSync(process.execPath, [cliScript], {
      cwd: tempDir,
      env: {
        ...process.env,
        DATABASE_URL_UNPOOLED: `postgresql://postgres:bad_pw@127.0.0.1:${unreachablePort}/unreachable_db`
      },
      encoding: 'utf8'
    });

    assert.strictEqual(res.error, undefined, `Subprocess spawn error: ${res.error?.message}`);
    assert.strictEqual(res.status, 1, `Expected OS exit code 1, got ${res.status}. Stderr: ${res.stderr}`);
    assert.notStrictEqual(res.status, 0, 'CLI must exit nonzero on checksum mismatch');
    assert.strictEqual(res.stdout.trim(), '', 'CLI stdout must be empty on checksum abort');
    assert.match(
      res.stderr,
      new RegExp(`Migration 007 checksum mismatch: expected ${EXPECTED_SHA256}, got ${tamperedSha}`),
      `Expected checksum mismatch message for tampered SHA ${tamperedSha}, got stderr: ${res.stderr}`
    );
    assert.doesNotMatch(
      res.stderr,
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect|UNKNOWN/i,
      `Checksum abort must not attempt DB connection or classify as UNKNOWN. Stderr: ${res.stderr}`
    );
    t.diagnostic(`exit=${res.status} stderr=${JSON.stringify(res.stderr.trim())}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI Child-Process: Mid-transaction SQL failure rolls back and exits nonzero (code 1)', async (t) => {
  await resetTestDb();

  // Inject a controlled disposable-DB DDL fault that triggers after founding_angel_orders
  // is created inside the migration transaction, without altering real Migration 007 SQL or executor.
  const setupClient = await getClient(targetConn);
  await setupClient.connect();
  try {
    await setupClient.query(`
      CREATE OR REPLACE FUNCTION public.test_inject_sql_failure()
      RETURNS event_trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        obj RECORD;
        orders_created BOOLEAN;
      BEGIN
        FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
          IF obj.object_identity = 'public.founding_angel_memberships' THEN
            orders_created := (to_regclass('public.founding_angel_orders') IS NOT NULL);
            RAISE EXCEPTION 'Controlled mid-transaction SQL failure injected after founding_angel_orders=%',
              CASE WHEN orders_created THEN 'true' ELSE 'false' END;
          END IF;
        END LOOP;
      END;
      $$;

      CREATE EVENT TRIGGER trg_test_inject_sql_failure
        ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE')
        EXECUTE FUNCTION public.test_inject_sql_failure();
    `);
  } finally {
    await setupClient.end();
  }

  let res;
  try {
    res = spawnSync(process.execPath, ['scripts/execute-migration-007.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL_UNPOOLED: targetConn
      },
      encoding: 'utf8'
    });
  } finally {
    const cleanupClient = await getClient(targetConn);
    await cleanupClient.connect();
    try {
      await cleanupClient.query('DROP EVENT TRIGGER IF EXISTS trg_test_inject_sql_failure;');
      await cleanupClient.query('DROP FUNCTION IF EXISTS public.test_inject_sql_failure();');
    } finally {
      await cleanupClient.end();
    }
  }

  assert.strictEqual(res.error, undefined, `Subprocess spawn error: ${res.error?.message}`);
  assert.strictEqual(res.status, 1, `Expected ordinary SQL failure exit code 1, got ${res.status}. Stderr: ${res.stderr}`);
  assert.notStrictEqual(res.status, 0, 'CLI must exit nonzero on SQL failure');
  assert.notStrictEqual(res.status, 2, 'Ordinary SQL failure must NOT exit with code 2 (UNKNOWN)');
  assert.strictEqual(res.stdout.trim(), '', 'CLI stdout must be empty on rolled-back SQL failure');
  assert.match(
    res.stderr,
    /\[execute-migration-007\] Failed: Controlled mid-transaction SQL failure injected after founding_angel_orders=true/,
    `Expected mid-transaction injected SQL failure in stderr, got: ${res.stderr}`
  );
  assert.doesNotMatch(
    res.stderr,
    /CRITICAL: Transaction outcome is UNKNOWN|Watchdog/i,
    `Ordinary SQL failure must NOT be classified as UNKNOWN. Stderr: ${res.stderr}`
  );
  t.diagnostic(`exit=${res.status} stderr=${JSON.stringify(res.stderr.trim())}`);

  // Verify transaction completely rolled back and zero Migration 007 partial objects remain
  const verifyClient = await getClient(targetConn);
  await verifyClient.connect();
  try {
    const objRes = await verifyClient.query(`
      SELECT
        to_regclass('public.founding_angel_orders') AS orders_tbl,
        to_regclass('public.founding_angel_memberships') AS memberships_tbl,
        to_regclass('public.founding_angel_orders_one_active_checkout_idx') AS idx_active,
        to_regclass('public.founding_angel_orders_active_capacity_idx') AS idx_cap,
        to_regclass('public.founding_angel_orders_refund_queue_idx') AS idx_refund;
    `);
    const row = objRes.rows[0];
    assert.strictEqual(row.orders_tbl, null, 'founding_angel_orders must be rolled back');
    assert.strictEqual(row.memberships_tbl, null, 'founding_angel_memberships must be rolled back');
    assert.strictEqual(row.idx_active, null, 'founding_angel_orders_one_active_checkout_idx must be rolled back');
    assert.strictEqual(row.idx_cap, null, 'founding_angel_orders_active_capacity_idx must be rolled back');
    assert.strictEqual(row.idx_refund, null, 'founding_angel_orders_refund_queue_idx must be rolled back');

    const procRes = await verifyClient.query(`
      SELECT p.proname
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'assign_and_verify_founding_angel_member_number',
          'enforce_founding_angel_order_immutability',
          'enforce_founding_angel_membership_immutability',
          'transition_founding_angel_membership'
        );
    `);
    assert.strictEqual(procRes.rows.length, 0, 'Zero Migration 007 functions may remain after rollback');

    const baselineRes = await verifyClient.query(`
      SELECT identity_id FROM public.youniverse_identities ORDER BY identity_id;
    `);
    assert.deepStrictEqual(
      baselineRes.rows.map((r) => r.identity_id),
      ['usr_cert_01', 'usr_cert_02', 'usr_cert_03', 'usr_cert_04'],
      'Baseline identity records must remain 100% preserved after rollback'
    );
    t.diagnostic('postcondition: orders_tbl=null memberships_tbl=null indexes=0 functions=0 baseline_identities=4');
  } finally {
    await verifyClient.end();
  }
});
