#!/usr/bin/env node
/**
 * scripts/execute-migration-007.mjs
 *
 * Transactional executor for Migration 007 (Founding Angels MVP).
 *
 * Safety Invariants:
 * 1. Single explicit transaction (no nested transactions).
 * 2. Mandatory runtime SHA-256 assertion BEFORE database connection.
 * 3. Pre-execution re-run guard (fail closed if target tables exist).
 * 4. Transaction-scoped lock_timeout = 3s (prevents cascading write locks on youniverse_identities).
 * 5. Transaction-scoped statement_timeout = 15s (prevents runaway statement execution).
 * 6. Transaction-scoped idle_in_transaction_session_timeout = 10s.
 * 7. External wall-clock deadline (30s) that forcibly destroys the client connection if the server hangs.
 * 8. Explicit classification of watchdog timeouts as UNKNOWN outcome (exit code 2).
 * 9. Explicit fail-closed ROLLBACK on any SQL error or timeout.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const MIGRATION_PATH = path.resolve(process.cwd(), 'db/migrations/007_founding_angels_mvp.sql');
export const EXPECTED_SHA256 = '2E4395EF75CC8720E03149DE917BEA7AD438F1F7C644FCFF94C92F9CADE8D27C';

export async function getClient(connectionString) {
  if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')) {
    try {
      const pgUrl = pathToFileURL('C:/Users/toidi/.pg18_disposable/node_modules/pg/lib/index.js').href;
      const m = await import(pgUrl);
      const ClientClass = m.default?.Client ?? m.Client;
      return new ClientClass({ connectionString });
    } catch {
      // fallback
    }
  }
  const neon = await import('@neondatabase/serverless');
  return new neon.Client(connectionString);
}

export async function executeMigration(options = {}) {
  const {
    connectionString,
    dryRun = false,
    lockTimeout = '3s',
    statementTimeout = '15s',
    idleTimeout = '10s',
    wallClockTimeoutMs = 30000,
    sqlOverride = null,
    allowAlreadyApplied = false
  } = options;

  if (!connectionString) {
    throw new Error('Connection string is required');
  }

  // 1. Runtime Checksum Assertion (Mandatory before opening database connection)
  let rawSql;
  if (sqlOverride !== null) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('sqlOverride is strictly prohibited in production mode');
    }
    rawSql = sqlOverride;
  } else {
    if (!fs.existsSync(MIGRATION_PATH)) {
      throw new Error(`Migration file not found at: ${MIGRATION_PATH}`);
    }
    const fileBuffer = fs.readFileSync(MIGRATION_PATH);
    const actualSha = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
    if (actualSha !== EXPECTED_SHA256) {
      throw new Error(`Migration 007 checksum mismatch: expected ${EXPECTED_SHA256}, got ${actualSha}`);
    }
    rawSql = fileBuffer.toString('utf8');
  }

  // Strip file BEGIN / COMMIT so executor has exclusive control over transaction boundaries
  const strippedSql = rawSql
    .replace(/^\s*BEGIN\s*;/im, '')
    .replace(/^\s*COMMIT\s*;/im, '')
    .trim();

  const client = await getClient(connectionString);

  let wallClockTimer = null;
  let inTransaction = false;
  let watchdogTriggered = false;

  try {
    await client.connect();

    // Setup external wall clock guard
    wallClockTimer = setTimeout(() => {
      watchdogTriggered = true;
      console.error(`[execute-migration-007] External wall-clock deadline (${wallClockTimeoutMs}ms) exceeded. Terminating connection.`);
      client.end().catch(() => {});
    }, wallClockTimeoutMs);

    // 2. Begin explicit transaction
    await client.query('BEGIN;');
    inTransaction = true;

    // 3. Set transaction-scoped timeouts immediately
    await client.query(`SET LOCAL lock_timeout = '${lockTimeout}';`);
    await client.query(`SET LOCAL statement_timeout = '${statementTimeout}';`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${idleTimeout}';`);

    // 4. Pre-execution Re-run Guard: fail closed if target tables already exist
    if (!allowAlreadyApplied) {
      const existsRes = await client.query(`
        SELECT 
          to_regclass('public.founding_angel_orders') IS NOT NULL AS orders_exist,
          to_regclass('public.founding_angel_memberships') IS NOT NULL AS memberships_exist;
      `);
      if (existsRes.rows[0].orders_exist || existsRes.rows[0].memberships_exist) {
        throw new Error('Migration 007 target tables already exist. Re-running is prohibited. Failing closed.');
      }
    }

    // 5. Execute the Migration DDL
    await client.query(strippedSql);

    // 6. Conclude transaction
    if (dryRun) {
      await client.query('ROLLBACK;');
      inTransaction = false;
      return { success: true, mode: 'dry-run', rolledBack: true };
    } else {
      await client.query('COMMIT;');
      inTransaction = false;
      return { success: true, mode: 'applied', committed: true };
    }
  } catch (err) {
    if (watchdogTriggered) {
      err.outcome = 'UNKNOWN';
      err.isWatchdog = true;
    }
    if (inTransaction) {
      try {
        await client.query('ROLLBACK;');
      } catch (rollbackErr) {
        console.error('[execute-migration-007] Secondary rollback error:', rollbackErr.message);
      }
    }
    throw err;
  } finally {
    if (wallClockTimer) clearTimeout(wallClockTimer);
    await client.end().catch(() => {});
  }
}

// Standalone CLI invocation
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '')) {
  const isDryRun = process.argv.includes('--dry-run');
  const connStr = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const wallClockMs = process.env.WALL_CLOCK_TIMEOUT_MS ? parseInt(process.env.WALL_CLOCK_TIMEOUT_MS, 10) : 30000;
  const stmtTimeout = process.env.STATEMENT_TIMEOUT || '15s';
  const lockTimeout = process.env.LOCK_TIMEOUT || '3s';

  executeMigration({
    connectionString: connStr,
    dryRun: isDryRun,
    wallClockTimeoutMs: wallClockMs,
    statementTimeout: stmtTimeout,
    lockTimeout: lockTimeout
  })
    .then(res => {
      console.log('[execute-migration-007] Result:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('[execute-migration-007] Failed:', err.message);
      if (err.outcome === 'UNKNOWN' || err.isWatchdog) {
        console.error('[execute-migration-007] CRITICAL: Transaction outcome is UNKNOWN. Watchdog or connection severed in-flight. Do NOT retry without catalog verification.');
        process.exit(2);
      }
      process.exit(1);
    });
}
