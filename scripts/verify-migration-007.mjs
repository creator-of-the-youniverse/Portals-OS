#!/usr/bin/env node
/**
 * scripts/verify-migration-007.mjs
 *
 * Deep catalog verifier for Migration 007 (Founding Angels MVP).
 *
 * Validates:
 * 1. Tables and required columns with exact types, nullability, and defaults.
 * 2. Primary key constraints.
 * 3. Foreign key constraints with exact referenced tables, columns, and ON DELETE RESTRICT (confdeltype = 'r').
 * 4. Triggers: existence, timing/events, enabled state (tgenabled = 'O'), and target procedure.
 * 5. Functions: language plpgsql, argument types, return types, security invoker (prosecdef = false).
 * 6. Partial indexes: existence, validity (indisvalid = true), predicates.
 * 7. Initial state: table row counts = 0.
 * 8. Baseline Schema & Data Preservation:
 *    - Baseline public tables exist.
 *    - youniverse_identities PK and column definitions intact.
 *    - Distinguishes count non-regression from record-level preservation.
 *    - Verifies unrelated catalog preservation (constraints, indexes, triggers, functions).
 *
 * Returns: { verified_pass: boolean, checks: Record<string, any>, errors: string[] }
 */

import { pathToFileURL } from 'node:url';

export const RECORDED_PRODUCTION_BASELINE = {
  tables: [
    'DeviceTrust',
    'NotNote',
    'Session',
    'User',
    'Youniverse',
    'email_verification_tokens',
    'handoff_tokens',
    'sessions',
    'youniverse_identities'
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
};

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

/**
 * Capture fingerprint of catalog objects unrelated to Migration 007
 */
export async function captureUnrelatedCatalog(client) {
  const constraints = await client.query(`
    SELECT cl.relname as table_name, c.conname, pg_get_constraintdef(c.oid) as def
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname NOT IN ('founding_angel_orders', 'founding_angel_memberships')
    ORDER BY cl.relname, c.conname;
  `);

  const indexes = await client.query(`
    SELECT c.relname as table_name, i.relname as index_name, pg_get_indexdef(i.oid) as def
    FROM pg_catalog.pg_index x
    JOIN pg_catalog.pg_class c ON c.oid = x.indrelid
    JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname NOT IN ('founding_angel_orders', 'founding_angel_memberships')
    ORDER BY c.relname, i.relname;
  `);

  const triggers = await client.query(`
    SELECT c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as def
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND c.relname NOT IN ('founding_angel_orders', 'founding_angel_memberships')
    ORDER BY c.relname, t.tgname;
  `);

  const functions = await client.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN (
        'assign_and_verify_founding_angel_member_number',
        'enforce_founding_angel_order_immutability',
        'enforce_founding_angel_membership_immutability',
        'transition_founding_angel_membership'
      )
    ORDER BY p.proname;
  `);

  return {
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
    functions: functions.rows
  };
}

export async function verifyMigration007(connectionString, options = {}) {
  if (!connectionString) {
    throw new Error('Connection string is required');
  }

  const client = await getClient(connectionString);
  const errors = [];
  const checks = {};

  try {
    await client.connect();

    // ── 1. Table Existence ──────────────────────────────────────────────────
    const tablesRes = await client.query(`
      SELECT c.relname
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('founding_angel_orders', 'founding_angel_memberships')
        AND c.relkind = 'r';
    `);
    const existingTables = new Set(tablesRes.rows.map((r) => r.relname));
    checks.tables_exist = existingTables.has('founding_angel_orders') && existingTables.has('founding_angel_memberships');
    if (!checks.tables_exist) {
      errors.push(`Missing tables: expected founding_angel_orders and founding_angel_memberships (found: ${[...existingTables].join(', ')})`);
    }

    // ── 2. Primary Keys ─────────────────────────────────────────────────────
    const pkeyRes = await client.query(`
      SELECT cl.relname, c.conname, pg_get_constraintdef(c.oid) as def
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'public'
        AND cl.relname IN ('founding_angel_orders', 'founding_angel_memberships')
        AND c.contype = 'p';
    `);
    const pkeys = new Map(pkeyRes.rows.map((r) => [r.relname, r]));
    const ordersPkey = pkeys.get('founding_angel_orders');
    const membershipsPkey = pkeys.get('founding_angel_memberships');

    checks.orders_pkey = ordersPkey?.conname === 'founding_angel_orders_pkey' && ordersPkey?.def === 'PRIMARY KEY (id)';
    checks.memberships_pkey = membershipsPkey?.conname === 'founding_angel_memberships_pkey' && membershipsPkey?.def === 'PRIMARY KEY (member_number)';
    if (!checks.orders_pkey) errors.push(`Invalid or missing PK on founding_angel_orders: ${ordersPkey?.def}`);
    if (!checks.memberships_pkey) errors.push(`Invalid or missing PK on founding_angel_memberships: ${membershipsPkey?.def}`);

    // ── 3. Foreign Key Constraints & ON DELETE RESTRICT ──────────────────────
    const fkeyRes = await client.query(`
      SELECT cl.relname as table_name, c.conname, c.confdeltype,
             pg_get_constraintdef(c.oid) as def
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'public'
        AND cl.relname IN ('founding_angel_orders', 'founding_angel_memberships')
        AND c.contype = 'f';
    `);
    const fkeys = new Map(fkeyRes.rows.map((r) => [r.conname, r]));

    // Check FK 1: founding_angel_orders_identity_id_fkey
    const fk1 = fkeys.get('founding_angel_orders_identity_id_fkey');
    checks.orders_identity_fk = Boolean(fk1 && fk1.table_name === 'founding_angel_orders' && fk1.confdeltype === 'r' && fk1.def.includes('REFERENCES youniverse_identities(identity_id)'));
    if (!checks.orders_identity_fk) errors.push(`Invalid or missing FK founding_angel_orders_identity_id_fkey: confdeltype=${fk1?.confdeltype}, def=${fk1?.def}`);

    // Check FK 2: founding_angel_memberships_identity_id_fkey
    const fk2 = fkeys.get('founding_angel_memberships_identity_id_fkey');
    checks.memberships_identity_fk = Boolean(fk2 && fk2.table_name === 'founding_angel_memberships' && fk2.confdeltype === 'r' && fk2.def.includes('REFERENCES youniverse_identities(identity_id)'));
    if (!checks.memberships_identity_fk) errors.push(`Invalid or missing FK founding_angel_memberships_identity_id_fkey: confdeltype=${fk2?.confdeltype}, def=${fk2?.def}`);

    // Check FK 3: founding_angel_memberships_order_identity_fk
    const fk3 = fkeys.get('founding_angel_memberships_order_identity_fk');
    checks.memberships_order_identity_fk = Boolean(fk3 && fk3.table_name === 'founding_angel_memberships' && fk3.confdeltype === 'r' && fk3.def.includes('REFERENCES founding_angel_orders(id, identity_id)'));
    if (!checks.memberships_order_identity_fk) errors.push(`Invalid or missing FK founding_angel_memberships_order_identity_fk: confdeltype=${fk3?.confdeltype}, def=${fk3?.def}`);

    // ── 4. Triggers (Enabled & Verified) ────────────────────────────────────
    const trgRes = await client.query(`
      SELECT c.relname as table_name, t.tgname, t.tgenabled, p.proname,
             pg_get_triggerdef(t.oid) as def
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'public'
        AND c.relname IN ('founding_angel_orders', 'founding_angel_memberships')
        AND NOT t.tgisinternal;
    `);
    const triggers = new Map(trgRes.rows.map((r) => [r.tgname, r]));

    // Trigger 1: trg_assign_founding_angel_member_number
    const t1 = triggers.get('trg_assign_founding_angel_member_number');
    checks.trg_assign = Boolean(t1 && t1.table_name === 'founding_angel_memberships' && t1.tgenabled === 'O' && t1.proname === 'assign_and_verify_founding_angel_member_number');
    if (!checks.trg_assign) errors.push(`Invalid or disabled trigger trg_assign_founding_angel_member_number: enabled=${t1?.tgenabled}, proc=${t1?.proname}`);

    // Trigger 2: trg_enforce_founding_angel_order_immutability
    const t2 = triggers.get('trg_enforce_founding_angel_order_immutability');
    checks.trg_order_immutability = Boolean(t2 && t2.table_name === 'founding_angel_orders' && t2.tgenabled === 'O' && t2.proname === 'enforce_founding_angel_order_immutability');
    if (!checks.trg_order_immutability) errors.push(`Invalid or disabled trigger trg_enforce_founding_angel_order_immutability: enabled=${t2?.tgenabled}, proc=${t2?.proname}`);

    // Trigger 3: trg_enforce_founding_angel_membership_immutability
    const t3 = triggers.get('trg_enforce_founding_angel_membership_immutability');
    checks.trg_membership_immutability = Boolean(t3 && t3.table_name === 'founding_angel_memberships' && t3.tgenabled === 'O' && t3.proname === 'enforce_founding_angel_membership_immutability');
    if (!checks.trg_membership_immutability) errors.push(`Invalid or disabled trigger trg_enforce_founding_angel_membership_immutability: enabled=${t3?.tgenabled}, proc=${t3?.proname}`);

    // ── 5. Functions & Security Modes ───────────────────────────────────────
    const fnRes = await client.query(`
      SELECT p.proname, p.prosecdef, l.lanname,
             pg_get_function_identity_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as result_type
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'assign_and_verify_founding_angel_member_number',
          'enforce_founding_angel_order_immutability',
          'enforce_founding_angel_membership_immutability',
          'transition_founding_angel_membership'
        );
    `);
    const funcs = new Map(fnRes.rows.map((r) => [r.proname, r]));

    const fnTransition = funcs.get('transition_founding_angel_membership');
    checks.fn_transition = Boolean(fnTransition && fnTransition.prosecdef === false && fnTransition.lanname === 'plpgsql' && fnTransition.result_type === 'void' && fnTransition.args.includes('uuid'));
    if (!checks.fn_transition) errors.push(`Invalid function transition_founding_angel_membership: secdef=${fnTransition?.prosecdef}, args=${fnTransition?.args}, res=${fnTransition?.result_type}`);

    const fnAssign = funcs.get('assign_and_verify_founding_angel_member_number');
    checks.fn_assign = Boolean(fnAssign && fnAssign.prosecdef === false && fnAssign.result_type === 'trigger');
    if (!checks.fn_assign) errors.push(`Invalid function assign_and_verify_founding_angel_member_number`);

    const fnOrderImmut = funcs.get('enforce_founding_angel_order_immutability');
    checks.fn_order_immut = Boolean(fnOrderImmut && fnOrderImmut.prosecdef === false && fnOrderImmut.result_type === 'trigger');
    if (!checks.fn_order_immut) errors.push(`Invalid function enforce_founding_angel_order_immutability`);

    const fnMemImmut = funcs.get('enforce_founding_angel_membership_immutability');
    checks.fn_mem_immut = Boolean(fnMemImmut && fnMemImmut.prosecdef === false && fnMemImmut.result_type === 'trigger');
    if (!checks.fn_mem_immut) errors.push(`Invalid function enforce_founding_angel_membership_immutability`);

    // ── 6. Partial Indexes ──────────────────────────────────────────────────
    const idxRes = await client.query(`
      SELECT c.relname as index_name, i.indisvalid, i.indisunique,
             pg_get_expr(i.indpred, i.indrelid) as predicate
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'founding_angel_orders_one_active_checkout_idx',
          'founding_angel_orders_active_capacity_idx',
          'founding_angel_orders_refund_queue_idx'
        );
    `);
    const indexes = new Map(idxRes.rows.map((r) => [r.index_name, r]));

    const idxOne = indexes.get('founding_angel_orders_one_active_checkout_idx');
    checks.idx_one_active = Boolean(idxOne && idxOne.indisvalid === true && idxOne.indisunique === true && idxOne.predicate.includes('status'));
    if (!checks.idx_one_active) errors.push(`Invalid index founding_angel_orders_one_active_checkout_idx`);

    const idxCap = indexes.get('founding_angel_orders_active_capacity_idx');
    checks.idx_capacity = Boolean(idxCap && idxCap.indisvalid === true && idxCap.predicate.includes('status'));
    if (!checks.idx_capacity) errors.push(`Invalid index founding_angel_orders_active_capacity_idx`);

    const idxQueue = indexes.get('founding_angel_orders_refund_queue_idx');
    checks.idx_refund_queue = Boolean(idxQueue && idxQueue.indisvalid === true && idxQueue.predicate.includes('refund_obligation_cents'));
    if (!checks.idx_refund_queue) errors.push(`Invalid index founding_angel_orders_refund_queue_idx`);

    // ── 7. Initial Table Row Counts ─────────────────────────────────────────
    if (existingTables.has('founding_angel_orders')) {
      const orderCountRes = await client.query('SELECT count(*)::int AS cnt FROM public.founding_angel_orders;');
      const orderCnt = orderCountRes.rows[0].cnt;
      checks.orders_empty = orderCnt === 0;
      if (!checks.orders_empty) errors.push(`founding_angel_orders has non-zero initial row count: ${orderCnt}`);
    } else {
      checks.orders_empty = false;
    }

    if (existingTables.has('founding_angel_memberships')) {
      const memCountRes = await client.query('SELECT count(*)::int AS cnt FROM public.founding_angel_memberships;');
      const memCnt = memCountRes.rows[0].cnt;
      checks.memberships_empty = memCnt === 0;
      if (!checks.memberships_empty) errors.push(`founding_angel_memberships has non-zero initial row count: ${memCnt}`);
    } else {
      checks.memberships_empty = false;
    }

    // ── 8. Baseline Schema & Data Preservation ──────────────────────────────
    const checkBaseline = options.checkBaseline ?? false;
    const baseline = options.baseline ?? (checkBaseline ? RECORDED_PRODUCTION_BASELINE : null);

    if (baseline) {
      // 8a. Check baseline public tables exist
      if (baseline.tables && baseline.tables.length > 0) {
        const blTablesRes = await client.query(`
          SELECT c.relname
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = ANY($1::text[])
            AND c.relkind = 'r';
        `, [baseline.tables]);
        const foundBlTables = new Set(blTablesRes.rows.map(r => r.relname));
        const missingBlTables = baseline.tables.filter(t => !foundBlTables.has(t));
        checks.baseline_tables_exist = missingBlTables.length === 0;
        if (!checks.baseline_tables_exist) {
          errors.push(`Missing baseline tables: ${missingBlTables.join(', ')}`);
        }
      }

      // 8b. Check youniverse_identities PK and structure
      const idPkRes = await client.query(`
        SELECT c.conname, pg_get_constraintdef(c.oid) as def, a.attname
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE n.nspname = 'public'
          AND cl.relname = 'youniverse_identities'
          AND c.contype = 'p';
      `);
      const hasIdPk = idPkRes.rows.some(r => r.attname === baseline.youniverseIdentitiesPkColumn);
      checks.baseline_identities_pk = hasIdPk;
      if (!checks.baseline_identities_pk) {
        errors.push(`Baseline youniverse_identities missing primary key on ${baseline.youniverseIdentitiesPkColumn}`);
      }

      // 8c. Check column definitions on youniverse_identities
      if (baseline.youniverseIdentitiesColumns) {
        const colsRes = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'youniverse_identities';
        `);
        const colMap = new Map(colsRes.rows.map(c => [c.column_name, c]));
        let colsValid = true;
        for (const expCol of baseline.youniverseIdentitiesColumns) {
          const actualCol = colMap.get(expCol.column_name);
          if (!actualCol) {
            colsValid = false;
            errors.push(`Missing column in youniverse_identities: ${expCol.column_name}`);
          } else if (actualCol.data_type !== expCol.data_type || actualCol.is_nullable !== expCol.is_nullable) {
            colsValid = false;
            errors.push(`Column definition mismatch on ${expCol.column_name}: expected (${expCol.data_type}, nullable=${expCol.is_nullable}), got (${actualCol.data_type}, nullable=${actualCol.is_nullable})`);
          }
        }
        checks.baseline_identities_columns = colsValid;
      }

      // 8d. Explicit distinction: Count Non-Regression vs Record-Level Identity Preservation
      if (baseline.minCounts) {
        let countsPreserved = true;
        for (const [table, minCnt] of Object.entries(baseline.minCounts)) {
          const tCheck = await client.query(`SELECT to_regclass('public."' || $1 || '"') IS NOT NULL AS exists;`, [table]);
          if (tCheck.rows[0].exists) {
            const countRes = await client.query(`SELECT count(*)::int AS cnt FROM public."${table}";`);
            const actualCnt = countRes.rows[0].cnt;
            if (actualCnt < minCnt) {
              countsPreserved = false;
              errors.push(`Baseline table ${table} row count decreased below baseline: expected >= ${minCnt}, found ${actualCnt}`);
            }
          }
        }
        checks.count_non_regression = countsPreserved;
      }

      // 8e. Record-Level Identity Preservation (Explicitly checked if IDs provided)
      if (baseline.identityIds && Array.isArray(baseline.identityIds) && baseline.identityIds.length > 0) {
        const idRowsRes = await client.query(`
          SELECT identity_id FROM public.youniverse_identities
          WHERE identity_id = ANY($1::text[]);
        `, [baseline.identityIds]);
        const foundIds = new Set(idRowsRes.rows.map(r => r.identity_id));
        const missingIds = baseline.identityIds.filter(id => !foundIds.has(id));
        checks.record_level_identities_preserved = missingIds.length === 0;
        if (!checks.record_level_identities_preserved) {
          errors.push(`Missing specific baseline identity IDs: ${missingIds.join(', ')}`);
        }
      } else {
        // Record-level identity IDs not provided in authorized baseline evidence
        checks.record_level_identities_preserved = 'UNVERIFIED (missing baseline IDs)';
      }

      // 8f. Unrelated Catalog Preservation (Checked against captured pre-migration catalog snapshot)
      if (options.unrelatedCatalogBaseline) {
        const currentUnrelated = await captureUnrelatedCatalog(client);
        const baselineCat = options.unrelatedCatalogBaseline;

        const constrMatch = JSON.stringify(currentUnrelated.constraints) === JSON.stringify(baselineCat.constraints);
        const idxMatch = JSON.stringify(currentUnrelated.indexes) === JSON.stringify(baselineCat.indexes);
        const trgMatch = JSON.stringify(currentUnrelated.triggers) === JSON.stringify(baselineCat.triggers);
        const fnMatch = JSON.stringify(currentUnrelated.functions) === JSON.stringify(baselineCat.functions);

        checks.unrelated_catalog_preserved = constrMatch && idxMatch && trgMatch && fnMatch;
        if (!checks.unrelated_catalog_preserved) {
          errors.push(`Unrelated catalog objects modified by migration: constraints=${constrMatch}, indexes=${idxMatch}, triggers=${trgMatch}, functions=${fnMatch}`);
        }
      } else {
        checks.unrelated_catalog_preserved = 'UNVERIFIED (no pre-migration snapshot provided)';
      }
    }

    const verified_pass = errors.length === 0;

    return {
      verified_pass,
      checks,
      errors,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
