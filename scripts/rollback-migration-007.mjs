#!/usr/bin/env node
/**
 * scripts/rollback-migration-007.mjs
 *
 * Transactional rollback executor for Migration 007 (Founding Angels MVP Pre-Traffic Removal).
 *
 * Safety Invariants:
 * 1. Single explicit transaction.
 * 2. Fail-closed pre-traffic guard in JS AND in SQL (aborts if order/membership records exist).
 * 3. Scoped object lookups in pg_constraint, pg_trigger, pg_proc, pg_class restricted to schema 'public'.
 * 4. RESTRICT drop semantics (never CASCADE).
 * 5. Transaction-scoped lock_timeout = 3s, statement_timeout = 15s.
 * 6. External 30s wall-clock watchdog.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROLLBACK_PATH = path.resolve(process.cwd(), 'db/migrations/007_rollback_founding_angels_mvp.sql');

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

export async function executeRollback(options = {}) {
  const {
    connectionString,
    dryRun = false,
    lockTimeout = '3s',
    statementTimeout = '15s',
    idleTimeout = '10s',
    wallClockTimeoutMs = 30000,
    sqlOverride = null,
  } = options;

  if (!connectionString) {
    throw new Error('Connection string is required');
  }

  const rawSql = sqlOverride ?? fs.readFileSync(ROLLBACK_PATH, 'utf8');

  // Strip file BEGIN / COMMIT so executor has exclusive control over transaction boundaries
  const strippedSql = rawSql
    .replace(/^\s*BEGIN\s*;/im, '')
    .replace(/^\s*COMMIT\s*;/im, '')
    .trim();

  const client = await getClient(connectionString);

  let wallClockTimer = null;
  let inTransaction = false;

  try {
    await client.connect();

    // 1. Preflight data-loss guard (outside transaction before attempting lock)
    const ordersExist = await client.query(`
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'founding_angel_orders' AND c.relkind = 'r'
    `);
    if (ordersExist.rows.length > 0) {
      const cntRes = await client.query('SELECT count(*)::int AS cnt FROM public.founding_angel_orders;');
      const orderCount = cntRes.rows[0].cnt;
      if (orderCount > 0) {
        throw new Error(
          `CRITICAL SAFETY VIOLATION: Pre-traffic rollback aborted! Table public.founding_angel_orders contains ${orderCount} records. Financial and customer records exist. Data must be preserved; manual forward repair required.`
        );
      }
    }

    const membershipsExist = await client.query(`
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'founding_angel_memberships' AND c.relkind = 'r'
    `);
    if (membershipsExist.rows.length > 0) {
      const cntRes = await client.query('SELECT count(*)::int AS cnt FROM public.founding_angel_memberships;');
      const memCount = cntRes.rows[0].cnt;
      if (memCount > 0) {
        throw new Error(
          `CRITICAL SAFETY VIOLATION: Pre-traffic rollback aborted! Table public.founding_angel_memberships contains ${memCount} records. Memberships exist. Data must be preserved; manual forward repair required.`
        );
      }
    }

    // 2. Setup external wall-clock guard
    wallClockTimer = setTimeout(() => {
      console.error(`[rollback-migration-007] External wall-clock deadline (${wallClockTimeoutMs}ms) exceeded. Terminating connection.`);
      client.end().catch(() => {});
    }, wallClockTimeoutMs);

    // 3. Begin explicit transaction
    await client.query('BEGIN;');
    inTransaction = true;

    // 4. Set transaction-scoped timeouts immediately
    await client.query(`SET LOCAL lock_timeout = '${lockTimeout}';`);
    await client.query(`SET LOCAL statement_timeout = '${statementTimeout}';`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${idleTimeout}';`);

    // 5. Execute Rollback DDL
    await client.query(strippedSql);

    // 6. Conclude transaction
    if (dryRun) {
      await client.query('ROLLBACK;');
      inTransaction = false;
      return { success: true, mode: 'dry-run', rolledBack: true };
    } else {
      await client.query('COMMIT;');
      inTransaction = false;

      // 7. Post-rollback catalog verification
      const verifyTables = await client.query(`
        SELECT c.relname FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('founding_angel_orders', 'founding_angel_memberships');
      `);

      const verifyFunctions = await client.query(`
        SELECT p.proname FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'assign_and_verify_founding_angel_member_number',
          'enforce_founding_angel_order_immutability',
          'enforce_founding_angel_membership_immutability',
          'transition_founding_angel_membership'
        );
      `);

      return {
        success: true,
        mode: 'applied',
        committed: true,
        tablesRemaining: verifyTables.rows.length,
        functionsRemaining: verifyFunctions.rows.length,
        verifiedClean: verifyTables.rows.length === 0 && verifyFunctions.rows.length === 0,
      };
    }
  } catch (err) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK;');
      } catch {
        // ignore rollback errors on disconnected clients
      }
    }
    throw err;
  } finally {
    if (wallClockTimer) clearTimeout(wallClockTimer);
    await client.end().catch(() => {});
  }
}

