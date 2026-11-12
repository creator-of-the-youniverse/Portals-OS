/**
 * tests/pg18-genesis-certification.test.mjs
 *
 * Real PostgreSQL 18 execution test for Migration 008, triggers, constraints,
 * immutability, guarded rollback, atomic verification, and concurrent race certification.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { Pool } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: true });
const testDbUrl = process.env.LOCAL_TEST_DATABASE_URL;
const prodDbUrl = process.env.DATABASE_URL;

assert.ok(testDbUrl, "LOCAL_TEST_DATABASE_URL must be defined");
assert.notStrictEqual(
  new URL(testDbUrl).host,
  new URL(prodDbUrl).host,
  "SAFETY CHECK: testDbUrl must NEVER be prodDbUrl"
);

const m008Sql = fs.readFileSync("db/migrations/008_genesis_001.sql", "utf-8");
const r008Sql = fs.readFileSync("db/migrations/008_rollback_genesis_001.sql", "utf-8");

function prepareMigrationSql(sqlText, schema) {
  return sqlText
    .replace(/public\./g, `${schema}.`)
    .replace(/search_path = public/g, `search_path = ${schema}`);
}

async function withClient(fn) {
  const pool = new Pool({ connectionString: testDbUrl });
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

test("PG18: 1 & 2. Migration 008 applies cleanly and enforces program state singleton immutability", async () => {
  const schema = `test_g1_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await withClient(async (client) => {
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${schema}.youniverse_identities (
          identity_id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL,
          subdomain TEXT NOT NULL, identity_type TEXT NOT NULL DEFAULT 'person', email TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free', is_live BOOLEAN NOT NULL DEFAULT TRUE,
          email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE ${schema}.email_verification_tokens (
          id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES ${schema}.youniverse_identities(identity_id),
          token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const sqlInSchema = prepareMigrationSql(m008Sql, schema);
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(sqlInSchema);

      // Verify tables
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
        [schema]
      );
      const names = res.rows.map((r) => r.table_name);
      assert.ok(names.includes("genesis_program_state"));
      assert.ok(names.includes("genesis_awards"));
      assert.ok(names.includes("identity_entitlements"));

      // Verify row
      const prog = await client.query(`SELECT * FROM ${schema}.genesis_program_state`);
      assert.strictEqual(prog.rows.length, 1);
      assert.strictEqual(prog.rows[0].program_key, "genesis_001");
      assert.strictEqual(prog.rows[0].official_title, "FIRST PERSON OF THE YOUNIVERSE");
      assert.strictEqual(prog.rows[0].official_designation, "GENESIS 001");

      // Immutability checks
      await assert.rejects(
        client.query(`INSERT INTO ${schema}.genesis_program_state (program_key) VALUES ('genesis_002')`),
        /genesis_program_state_key_check/
      );
      await assert.rejects(
        client.query(`DELETE FROM ${schema}.genesis_program_state WHERE program_key = 'genesis_001'`),
        /cannot be deleted/
      );
      await assert.rejects(
        client.query(
          `UPDATE ${schema}.genesis_program_state SET eligible_verified_after = '2020-01-01' WHERE program_key = 'genesis_001'`
        ),
        /permanently immutable/
      );
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
});

test("PG18: 3. Email eligibility helper function in PostgreSQL", async () => {
  const schema = `test_g3_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await withClient(async (client) => {
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${schema}.youniverse_identities (identity_id TEXT PRIMARY KEY);
        CREATE TABLE ${schema}.email_verification_tokens (id TEXT PRIMARY KEY);
      `);
      const sqlInSchema = prepareMigrationSql(m008Sql, schema);
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(sqlInSchema);

      const check = async (email) => {
        const r = await client.query(`SELECT ${schema}.is_eligible_genesis_email($1) as ok`, [email]);
        return r.rows[0].ok;
      };

      assert.strictEqual(await check("internal@itsyouonline.com"), false);
      assert.strictEqual(await check("sub.team@itsyouonline.com"), false);
      assert.strictEqual(await check("test@example.com"), false);
      assert.strictEqual(await check("person+test@gmail.com"), false);
      assert.strictEqual(await check("smoke-runner@gmail.com"), false);
      assert.strictEqual(await check("autotest.user@gmail.com"), false);
      assert.strictEqual(await check("founder@icloud.com"), true);
      assert.strictEqual(await check("realperson@proton.me"), true);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
});

test("PG18: 4. Guarded rollback succeeds when empty and refuses when award exists", async () => {
  const schema = `test_g4_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await withClient(async (client) => {
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${schema}.youniverse_identities (
          identity_id TEXT PRIMARY KEY, username TEXT, display_name TEXT, subdomain TEXT,
          identity_type TEXT DEFAULT 'person', email TEXT, plan TEXT DEFAULT 'free',
          is_live BOOLEAN DEFAULT TRUE, email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE ${schema}.email_verification_tokens (
          id TEXT PRIMARY KEY, identity_id TEXT, token_hash TEXT, expires_at TIMESTAMPTZ,
          consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      const mSql = prepareMigrationSql(m008Sql, schema);
      const rSql = prepareMigrationSql(r008Sql, schema);

      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(mSql);
      // Empty: rollback succeeds
      await client.query(rSql);

      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('genesis_program_state', 'genesis_awards', 'identity_entitlements')`,
        [schema]
      );
      assert.strictEqual(tables.rows.length, 0);

      // Re-apply and insert award
      await client.query(mSql);
      await client.query(`
        INSERT INTO ${schema}.youniverse_identities (identity_id, username, display_name, subdomain, email, email_verified_at)
        VALUES ('id_rb_1', 'rbwinner', 'rbwinner', 'rbwinner.itsyouonline.com', 'winner@real.org', NOW());
        INSERT INTO ${schema}.email_verification_tokens (id, identity_id, token_hash, expires_at, consumed_at)
        VALUES ('tok_rb_1', 'id_rb_1', 'hash1', NOW() + INTERVAL '1 hour', NOW());
        INSERT INTO ${schema}.genesis_awards (award_slot, identity_id, verification_token_id, awarded_username, official_title, award_label, source_environment)
        VALUES ('genesis_001', 'id_rb_1', 'tok_rb_1', 'rbwinner', 'FIRST PERSON OF THE YOUNIVERSE', 'GENESIS 001', 'production');
      `);

      // Attempt guarded rollback: must fail
      let threw = false;
      try {
        await client.query(rSql);
      } catch (err) {
        threw = true;
        assert.match(String(err.message), /Rollback blocked: .*genesis_awards already contains 1 awarded row/);
      }
      assert.strictEqual(threw, true, "Guarded rollback must refuse to drop populated genesis_awards");
    } finally {
      // Must rollback any open tx on client before dropping schema
      try {
        await client.query("ROLLBACK");
      } catch {}
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
});

test("PG18: 5. Real concurrent verification race: exactly 1 wins Genesis 001 and losers complete verified", async () => {
  const schema = `test_g5_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const pool = new Pool({ connectionString: testDbUrl });
  try {
    const setupClient = await pool.connect();
    try {
      await setupClient.query(`CREATE SCHEMA ${schema}`);
      await setupClient.query(`
        CREATE TABLE ${schema}.youniverse_identities (
          identity_id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL,
          subdomain TEXT NOT NULL, identity_type TEXT NOT NULL DEFAULT 'person', email TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free', is_live BOOLEAN NOT NULL DEFAULT TRUE,
          email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE ${schema}.email_verification_tokens (
          id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES ${schema}.youniverse_identities(identity_id),
          token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const mSql = prepareMigrationSql(m008Sql, schema);
      await setupClient.query(`SET search_path TO ${schema}, public`);
      await setupClient.query(mSql);
    } finally {
      setupClient.release();
    }

    // Seed 5 candidates
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      id: `id_c_${i}_${crypto.randomBytes(3).toString("hex")}`,
      username: `racer_${i}`,
      email: `racer_${i}@fastmail.com`,
      tokenId: `tok_${i}_${crypto.randomBytes(3).toString("hex")}`,
    }));

    const seedClient = await pool.connect();
    try {
      for (const c of candidates) {
        await seedClient.query(
          `INSERT INTO ${schema}.youniverse_identities 
            (identity_id, username, display_name, subdomain, email, is_live)
          VALUES ($1, $2, $3, $4, $5, TRUE)`,
          [c.id, c.username, c.username, `${c.username}.itsyouonline.com`, c.email]
        );
        await seedClient.query(
          `INSERT INTO ${schema}.email_verification_tokens
            (id, identity_id, token_hash, expires_at)
          VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
          [c.tokenId, c.id, "hash_" + c.tokenId]
        );
      }
    } finally {
      seedClient.release();
    }

    // Run 5 concurrent transactions
    const verifyWorker = async (c) => {
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO ${schema}, public`);
        await client.query("BEGIN");

        await client.query(
          `UPDATE ${schema}.email_verification_tokens SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`,
          [c.tokenId]
        );
        await client.query(
          `UPDATE ${schema}.youniverse_identities SET email_verified_at = NOW() WHERE identity_id = $1`,
          [c.id]
        );

        const awardRes = await client.query(
          `INSERT INTO ${schema}.genesis_awards (
             award_slot, identity_id, verification_token_id, awarded_username, official_title, award_label, source_environment
           ) VALUES (
             'genesis_001', $1, $2, $3, 'FIRST PERSON OF THE YOUNIVERSE', 'GENESIS 001', 'production'
           ) ON CONFLICT (award_slot) DO NOTHING
           RETURNING identity_id`,
          [c.id, c.tokenId, c.username]
        );

        let won = false;
        if (awardRes.rows.length > 0) {
          won = true;
          await client.query(
            `INSERT INTO ${schema}.identity_entitlements (
               identity_id, entitlement_key, source_type, source_ref, is_lifetime, status
             ) VALUES ($1, 'genesis_lifetime_access', 'genesis_001', 'genesis_001', TRUE, 'active')`,
            [c.id]
          );
        }

        await client.query("COMMIT");
        return { id: c.id, won };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    };

    const results = await Promise.all(candidates.map((c) => verifyWorker(c)));
    const winners = results.filter((r) => r.won);
    assert.strictEqual(winners.length, 1, "Exactly one identity must win Genesis 001 in concurrent race");

    const checkClient = await pool.connect();
    try {
      const awards = await checkClient.query(`SELECT * FROM ${schema}.genesis_awards`);
      assert.strictEqual(awards.rows.length, 1);
      assert.strictEqual(awards.rows[0].identity_id, winners[0].id);

      const ents = await checkClient.query(
        `SELECT * FROM ${schema}.identity_entitlements WHERE source_type = 'genesis_001'`
      );
      assert.strictEqual(ents.rows.length, 1);
      assert.strictEqual(ents.rows[0].identity_id, winners[0].id);

      const tokens = await checkClient.query(
        `SELECT COUNT(*) as count FROM ${schema}.email_verification_tokens WHERE consumed_at IS NOT NULL`
      );
      assert.strictEqual(Number(tokens.rows[0].count), 5);
    } finally {
      checkClient.release();
    }
  } finally {
    const cleanClient = await pool.connect();
    try {
      await cleanClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      cleanClient.release();
      await pool.end();
    }
  }
});

test("PG18: 6. Award identity and timestamp immutability triggers in PostgreSQL", async () => {
  const schema = `test_g6_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await withClient(async (client) => {
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${schema}.youniverse_identities (
          identity_id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL,
          subdomain TEXT NOT NULL, identity_type TEXT NOT NULL DEFAULT 'person', email TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free', is_live BOOLEAN NOT NULL DEFAULT TRUE,
          email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE ${schema}.email_verification_tokens (
          id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES ${schema}.youniverse_identities(identity_id),
          token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const mSql = prepareMigrationSql(m008Sql, schema);
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(mSql);

      await client.query(`
        INSERT INTO ${schema}.youniverse_identities (identity_id, username, display_name, subdomain, email, email_verified_at)
        VALUES ('id_im_1', 'immutableuser', 'im', 'im.itsyouonline.com', 'im@real.org', NOW());
        INSERT INTO ${schema}.email_verification_tokens (id, identity_id, token_hash, expires_at, consumed_at)
        VALUES ('tok_im_1', 'id_im_1', 'hash_im', NOW() + INTERVAL '1 hour', NOW());
        INSERT INTO ${schema}.genesis_awards (award_slot, identity_id, verification_token_id, awarded_username, official_title, award_label, source_environment)
        VALUES ('genesis_001', 'id_im_1', 'tok_im_1', 'immutableuser', 'FIRST PERSON OF THE YOUNIVERSE', 'GENESIS 001', 'production');
      `);

      // Attempt to alter identity_id
      await assert.rejects(
        client.query(`UPDATE ${schema}.genesis_awards SET identity_id = 'id_hacker' WHERE award_slot = 'genesis_001'`),
        /Immutable Genesis 001 award identity\/historical columns cannot be modified/
      );

      // Attempt to alter awarded_at
      await assert.rejects(
        client.query(
          `UPDATE ${schema}.genesis_awards SET awarded_at = '2020-01-01' WHERE award_slot = 'genesis_001'`
        ),
        /Immutable Genesis 001 award identity\/historical columns cannot be modified/
      );

      // Attempt to delete award
      await assert.rejects(
        client.query(`DELETE FROM ${schema}.genesis_awards WHERE award_slot = 'genesis_001'`),
        /genesis_awards record .* is permanent and cannot be deleted/
      );

      // Ceremony seen update: succeeds
      await client.query(
        `UPDATE ${schema}.genesis_awards SET ceremony_seen_at = NOW() WHERE award_slot = 'genesis_001'`
      );
      const res = await client.query(`SELECT ceremony_seen_at FROM ${schema}.genesis_awards`);
      assert.ok(res.rows[0].ceremony_seen_at);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
});

test("PG18: 7. Ineligible identity (internal email) rejected by database trigger", async () => {
  const schema = `test_g7_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  await withClient(async (client) => {
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${schema}.youniverse_identities (
          identity_id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT NOT NULL,
          subdomain TEXT NOT NULL, identity_type TEXT NOT NULL DEFAULT 'person', email TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free', is_live BOOLEAN NOT NULL DEFAULT TRUE,
          email_verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE ${schema}.email_verification_tokens (
          id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES ${schema}.youniverse_identities(identity_id),
          token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const mSql = prepareMigrationSql(m008Sql, schema);
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(mSql);

      await client.query(`
        INSERT INTO ${schema}.youniverse_identities 
          (identity_id, username, display_name, subdomain, email, is_live, email_verified_at)
        VALUES ('id_ineligible', 'internaluser', 'Internal', 'internal.itsyouonline.com', 'team@itsyouonline.com', TRUE, NOW());
        INSERT INTO ${schema}.email_verification_tokens 
          (id, identity_id, token_hash, expires_at, consumed_at)
        VALUES ('tok_ineligible', 'id_ineligible', 'hash_ineligible', NOW() + INTERVAL '1 hour', NOW());
      `);

      await assert.rejects(
        client.query(`
          INSERT INTO ${schema}.genesis_awards (
            award_slot, identity_id, verification_token_id, awarded_username, official_title, award_label, source_environment
          ) VALUES ('genesis_001', 'id_ineligible', 'tok_ineligible', 'internaluser', 'FIRST PERSON OF THE YOUNIVERSE', 'GENESIS 001', 'production')
        `),
        /Identity \(id_ineligible\) email is excluded from Genesis 001 eligibility/
      );
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
});
