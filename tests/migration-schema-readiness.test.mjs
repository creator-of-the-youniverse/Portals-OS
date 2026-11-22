/**
 * tests/migration-schema-readiness.test.mjs
 *
 * Phase 1, Phase 2 & Phase 6 Migration Schema & Security Readiness Verification:
 *  - Verifies canonical identity_id column type (TEXT, never UUID) across all migrations
 *  - Catches UUID/TEXT foreign-key mismatches across db/migrations/*.sql
 *  - Verifies Migration 012, 013, and 014 structural consistency, named CHECK constraints & ordering
 *  - Verifies guarded rollback safety invariants (011, 012, 014) without dropping 012 columns
 *  - Verifies Homeverse relinquishment runtime executes cleanly with non-UUID TEXT identity_ids
 *    AND revokes owner access (resolveHumanYouniverseAccess -> isOwner: false) once relinquished
 *  - Verifies Phase 6 AuthN/AuthZ fixes in enroll, password/set, and recovery/manual
 *
 * Zero live database or network connections.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  initiateHomeverseRelinquishment,
  cancelHomeverseRelinquishment,
  checkRelinquishmentCooldown,
  processExpiredRelinquishments,
  canClaimRelinquishedHandle,
} from "../lib/homeverseRelinquishment.ts";
import { resolveHumanYouniverseAccess } from "../lib/humanContinuity.ts";
import { assertSafeDatabaseTarget } from "../lib/creatorOwnership.ts";
import { hashToken } from "../lib/neonSession.ts";
import enrollHandler from "../api/auth/enroll.ts";
import passwordSetHandler from "../api/auth/password/set.ts";
import manualRecoveryHandler from "../api/auth/recovery/manual.ts";
import genesisHandler from "../api/genesis/[action].ts";
import weaverGenerateHandler from "../api/weaver/generate.ts";
import claimHandler from "../api/claim.ts";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db", "migrations");

function readMigration(filename) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
}

function makeNonUuidHomeverseSql() {
  const humanId = "11111111-1111-4111-8111-111111111111";
  const youniverses = [
    {
      identity_id: "P62pLpfQvY0fmtQ-yiLVV",
      username: "oldhandle",
      is_live: true,
      email_verified_at: "2026-01-01T00:00:00.000Z",
      plan: "free",
    },
    {
      identity_id: "V9xLmN2qR8sTuVw-zAbCd",
      username: "newhandle",
      is_live: true,
      email_verified_at: "2026-01-01T00:00:00.000Z",
      plan: "free",
    },
  ];
  const associations = [
    {
      id: crypto.randomUUID(),
      human_id: humanId,
      identity_id: "P62pLpfQvY0fmtQ-yiLVV", // Canonical nanoid TEXT identity_id (non-UUID)
      role: "owner",
      verification_status: "verified",
      is_homeverse: true,
      requires_reverification: false,
      reverification_required_at: null,
      verified_at: "2026-01-01T00:00:00.000Z",
      revoked_at: null,
      revocation_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: crypto.randomUUID(),
      human_id: humanId,
      identity_id: "V9xLmN2qR8sTuVw-zAbCd", // Replacement nanoid TEXT identity_id (non-UUID)
      role: "owner",
      verification_status: "verified",
      is_homeverse: false,
      requires_reverification: false,
      reverification_required_at: null,
      verified_at: "2026-01-01T00:00:00.000Z",
      revoked_at: null,
      revocation_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const relinquishments = [];

  const sql = async (strings, ...values) => {
    const raw = strings.join("?");

    if (/FROM youniverse_identities/is.test(raw) && /username = \?/i.test(raw)) {
      const cleanHandle = values[0];
      return youniverses.filter((u) => u.username === cleanHandle);
    }

    if (/FROM human_continuity_identities/is.test(raw) && /WHERE human_id = \?/i.test(raw)) {
      return values[0] === humanId ? [{ status: "active" }] : [];
    }

    if (/SELECT.*FROM human_youniverse_associations/is.test(raw)) {
      const [hId, identityId] = values;
      return associations.filter(
        (a) => a.human_id === hId && a.identity_id === identityId && a.revoked_at == null
      );
    }

    if (
      /SELECT id FROM homeverse_relinquishments/is.test(raw) &&
      /status = 'pending'/i.test(raw) &&
      /human_id/i.test(raw)
    ) {
      const hId = values[0];
      return relinquishments.filter((r) => r.human_id === hId && r.status === "pending");
    }

    if (/SELECT.*FROM homeverse_relinquishments\s+WHERE id\b/is.test(raw)) {
      const id = values[0];
      return relinquishments.filter((r) => r.id === id);
    }

    if (
      /SELECT id, cooldown_expires_at/is.test(raw) &&
      /identity_id/i.test(raw) &&
      /status = 'pending'/i.test(raw)
    ) {
      const identityId = values[0];
      return relinquishments.filter(
        (r) => r.identity_id === identityId && r.status === "pending"
      );
    }

    if (
      /SELECT id, human_id, identity_id/is.test(raw) &&
      /status = 'pending'/i.test(raw) &&
      /cooldown_expires_at/i.test(raw)
    ) {
      const now = values[0];
      return relinquishments.filter(
        (r) => r.status === "pending" && new Date(r.cooldown_expires_at) < new Date(now)
      );
    }

    if (/UPDATE human_youniverse_associations\s+SET is_homeverse/is.test(raw)) {
      const isHomeverseVal = /SET is_homeverse = TRUE/i.test(raw);
      const [hId, identityId] = values;
      const assoc = associations.find(
        (a) => a.human_id === hId && a.identity_id === identityId && a.revoked_at == null
      );
      if (assoc) assoc.is_homeverse = isHomeverseVal;
      return [];
    }

    if (/UPDATE human_youniverse_associations\s+SET verification_status/is.test(raw)) {
      const [hId, identityId] = values;
      const assoc = associations.find(
        (a) => a.human_id === hId && a.identity_id === identityId && a.revoked_at == null
      );
      if (assoc) {
        assoc.verification_status = "relinquished";
        assoc.is_homeverse = false;
      }
      return [];
    }

    if (/UPDATE homeverse_relinquishments\s+SET status = 'cancelled'/is.test(raw)) {
      const [cancelledAt, auditJson, id] = values;
      const record = relinquishments.find((r) => r.id === id);
      if (record) {
        record.status = "cancelled";
        record.cancelled_at = cancelledAt;
        record.audit_log = typeof auditJson === "string" ? JSON.parse(auditJson) : auditJson;
      }
      return [];
    }

    if (/UPDATE homeverse_relinquishments\s+SET status = 'completed'/is.test(raw)) {
      const [completedAt, auditJson, id] = values;
      const record = relinquishments.find((r) => r.id === id);
      if (record) {
        record.status = "completed";
        record.completed_at = completedAt;
        record.audit_log = typeof auditJson === "string" ? JSON.parse(auditJson) : auditJson;
      }
      return [];
    }

    if (/INSERT INTO homeverse_relinquishments/is.test(raw)) {
      relinquishments.push({
        id: values[0],
        human_id: values[1],
        identity_id: values[2],
        replacement_identity_id: values[3],
        status: "pending",
        initiated_at: values[4],
        cooldown_expires_at: values[5],
        audit_log: typeof values[6] === "string" ? JSON.parse(values[6]) : values[6],
        cancelled_at: null,
        completed_at: null,
      });
      return [];
    }

    return [];
  };

  return { associations, relinquishments, sql };
}

function makeRes() {
  return {
    _status: 200,
    _headers: {},
    _body: null,
    status(s) {
      this._status = s;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
      return this;
    },
  };
}

test("Migration Schema & Staging Readiness Suite", async (t) => {
  await t.test("MSR-01: Canonical youniverse_identities.identity_id is TEXT PRIMARY KEY", () => {
    const m001 = readMigration("001_create_youniverse_identities.sql");
    const m003 = readMigration("003_neon_session_layer.sql");

    assert.match(m001, /identity_id\s+TEXT\s+PRIMARY\s+KEY/i);
    assert.match(m003, /identity_id\s+TEXT\s+PRIMARY\s+KEY/i);
  });

  await t.test("MSR-02: Migration 014 identity columns are TEXT and CHECK constraints match between 012, 014, and 014_rollback", () => {
    const m012 = readMigration("012_human_continuity_credentials.sql");
    const m014 = readMigration("014_passkey_recovery_homeverse_cooldown.sql");
    const r014 = readMigration("014_rollback_passkey_recovery_homeverse_cooldown.sql");

    assert.match(
      m014,
      /identity_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+public\.youniverse_identities\(identity_id\)\s+ON\s+DELETE\s+RESTRICT/i,
      "homeverse_relinquishments.identity_id must be TEXT referencing youniverse_identities(identity_id)"
    );
    assert.match(
      m014,
      /replacement_identity_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+public\.youniverse_identities\(identity_id\)\s+ON\s+DELETE\s+RESTRICT/i,
      "homeverse_relinquishments.replacement_identity_id must be TEXT referencing youniverse_identities(identity_id)"
    );
    assert.doesNotMatch(
      m014,
      /\b(identity_id|replacement_identity_id)\s+UUID\b/i,
      "Migration 014 must not declare identity_id or replacement_identity_id as UUID"
    );

    // Explicit constraint naming in 012 & dual-drop safety in 014 / 014_rollback
    assert.match(m012, /CONSTRAINT\s+human_auth_subjects_provider_type_check/i);
    assert.match(m012, /CONSTRAINT\s+hya_verification_status_check/i);
    assert.match(m014, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+hya_verification_status_check/i);
    assert.match(m014, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+human_youniverse_associations_verification_status_check/i);
    assert.match(r014, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+hya_verification_status_check/i);
    assert.match(r014, /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+human_youniverse_associations_verification_status_check/i);
  });

  await t.test("MSR-03: Repository-wide FK column type consistency across all SQL migrations", () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.includes("rollback"))
      .sort();

    // Check every column definition (cannot span across ',' or ';') ending with REFERENCES [public.]youniverse_identities(identity_id)
    const youniverseFkRegex =
      /(\b[a-zA-Z0-9_]+\b)\s+(UUID|TEXT|VARCHAR[^\s,]*)\b[^,;]*?REFERENCES\s+(?:public\.)?youniverse_identities\s*\(\s*identity_id\s*\)/gi;

    // Check every column definition (cannot span across ',' or ';') ending with REFERENCES [public.]human_continuity_identities(human_id) or human_auth_subjects(id)
    const humanUuidFkRegex =
      /(\b[a-zA-Z0-9_]+\b)\s+(UUID|TEXT|VARCHAR[^\s,]*)\b[^,;]*?REFERENCES\s+(?:public\.)?(human_continuity_identities\s*\(\s*human_id\s*\)|human_auth_subjects\s*\(\s*id\s*\))/gi;

    for (const file of files) {
      const content = readMigration(file);

      let match;
      while ((match = youniverseFkRegex.exec(content)) !== null) {
        const [, colName, colType] = match;
        assert.strictEqual(
          colType.toUpperCase(),
          "TEXT",
          `[${file}] Column '${colName}' referencing youniverse_identities(identity_id) has type '${colType}' instead of TEXT`
        );
      }

      while ((match = humanUuidFkRegex.exec(content)) !== null) {
        const [, colName, colType, target] = match;
        assert.strictEqual(
          colType.toUpperCase(),
          "UUID",
          `[${file}] Column '${colName}' referencing ${target} has type '${colType}' instead of UUID`
        );
      }
    }
  });

  await t.test("MSR-04: webauthn_challenges includes consumed_at in 012 and 014, and human_passkeys.transports is consistent", () => {
    const m012 = readMigration("012_human_continuity_credentials.sql");
    const m014 = readMigration("014_passkey_recovery_homeverse_cooldown.sql");

    const challengeBlockMatch = m012.match(/CREATE TABLE IF NOT EXISTS public\.webauthn_challenges[\s\S]*?\);/i);
    assert.ok(challengeBlockMatch, "Migration 012 must define webauthn_challenges");
    assert.match(
      challengeBlockMatch[0],
      /\bconsumed_at\s+TIMESTAMPTZ\b/i,
      "Migration 012 webauthn_challenges must define consumed_at TIMESTAMPTZ"
    );
    assert.match(
      m012,
      /transports\s+TEXT\[\]\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'/i,
      "Migration 012 human_passkeys.transports must match 014 NOT NULL DEFAULT '{}'"
    );

    assert.match(
      m014,
      /ALTER TABLE public\.webauthn_challenges[\s\S]*?ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ/i,
      "Migration 014 must idempotently add webauthn_challenges.consumed_at"
    );
  });

  await t.test("MSR-05: Migration 013 uses Option 2 no-op and has zero references to non-existent sessions.updated_at", () => {
    const m013 = readMigration("013_session_human_continuity_backfill.sql");

    // Strip SQL line comments to inspect executable SQL
    const executableSql = m013
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    assert.doesNotMatch(executableSql, /\bUPDATE\b/i, "Migration 013 Option 2 must not execute active UPDATE");
    assert.doesNotMatch(executableSql, /\bDELETE\b/i, "Migration 013 Option 2 must not execute active DELETE");
    assert.match(executableSql, /option_2_no_op/i, "Migration 013 must execute Option 2 no-op strategy");
    assert.doesNotMatch(
      m013,
      /\bupdated_at\b/i,
      "Migration 013 must not reference non-existent sessions.updated_at anywhere (including comments)"
    );
  });

  await t.test("MSR-06: Rollback scripts 011, 012, and 014 enforce pre-drop data guards, RESTRICT drops, and table ownership", () => {
    const r011 = readMigration("011_rollback_creator_multi_youniverse_ownership.sql");
    const r012 = readMigration("012_rollback_human_continuity_credentials.sql");
    const r014 = readMigration("014_rollback_passkey_recovery_homeverse_cooldown.sql");

    for (const [name, sql] of [
      ["011_rollback", r011],
      ["012_rollback", r012],
      ["014_rollback", r014],
    ]) {
      assert.match(sql, /DO\s+\$\$/i, `${name} must include a DO $$ data preservation check`);
      assert.match(sql, /RAISE EXCEPTION/i, `${name} must abort via RAISE EXCEPTION when active data exists`);
      assert.doesNotMatch(
        sql,
        /DROP TABLE IF EXISTS (?:public\.)?(youniverse_identities|sessions)\b/i,
        `${name} must NEVER drop core youniverse_identities or sessions tables`
      );
    }

    // 012 rollback must use RESTRICT (never CASCADE) and verify 014 tables are absent
    assert.doesNotMatch(r012, /\bCASCADE\b/i, "012_rollback must use RESTRICT, not CASCADE");
    assert.match(r012, /manual_recovery_cases[\s\S]*homeverse_relinquishments[\s\S]*human_recovery_codes/i);

    // 014 rollback must NOT drop 012-owned objects (human_passkeys or webauthn_challenges.consumed_at)
    assert.doesNotMatch(
      r014,
      /DROP TABLE IF EXISTS (?:public\.)?human_passkeys\b/i,
      "014 rollback must NOT drop human_passkeys (created and owned by Migration 012)"
    );
    assert.doesNotMatch(
      r014,
      /DROP COLUMN IF EXISTS consumed_at/i,
      "014 rollback must NOT drop webauthn_challenges.consumed_at (created and owned by Migration 012)"
    );
  });

  await t.test("MSR-07: Homeverse relinquishment executes cleanly with non-UUID TEXT identity_ids and revokes owner access upon completion", async () => {
    const { associations, relinquishments, sql } = makeNonUuidHomeverseSql();
    const humanId = "11111111-1111-4111-8111-111111111111";
    const oldIdentityId = "P62pLpfQvY0fmtQ-yiLVV";
    const newIdentityId = "V9xLmN2qR8sTuVw-zAbCd";

    // Before relinquishment: human owns oldhandle
    const preAccess = await resolveHumanYouniverseAccess(sql, humanId, "oldhandle");
    assert.strictEqual(preAccess.allowed, true);
    assert.strictEqual(preAccess.isOwner, true);

    const { relinquishmentId, cooldownExpiresAt } = await initiateHomeverseRelinquishment(sql, {
      humanId,
      currentHomeverseIdentityId: oldIdentityId,
      replacementIdentityId: newIdentityId,
    });

    assert.ok(relinquishmentId);
    assert.ok(new Date(cooldownExpiresAt) > new Date());
    assert.strictEqual(associations[0].is_homeverse, false);
    assert.strictEqual(associations[1].is_homeverse, true);

    const status = await checkRelinquishmentCooldown(sql, oldIdentityId);
    assert.strictEqual(status.isInCooldown, true);
    assert.strictEqual(await canClaimRelinquishedHandle(sql, oldIdentityId), false);

    // Cancel and re-initiate with expired timestamp to test completion sweep
    await cancelHomeverseRelinquishment(sql, { humanId, relinquishmentId });
    assert.strictEqual(relinquishments[0].status, "cancelled");
    assert.strictEqual(associations[0].is_homeverse, true);

    await initiateHomeverseRelinquishment(sql, {
      humanId,
      currentHomeverseIdentityId: oldIdentityId,
      replacementIdentityId: newIdentityId,
    });
    relinquishments[1].cooldown_expires_at = new Date(Date.now() - 60_000).toISOString();

    const processedCount = await processExpiredRelinquishments(sql);
    assert.strictEqual(processedCount, 1);
    assert.strictEqual(relinquishments[1].status, "completed");
    assert.strictEqual(associations[0].verification_status, "relinquished");
    assert.strictEqual(relinquishments[1].identity_id, oldIdentityId);
    assert.strictEqual(relinquishments[1].replacement_identity_id, newIdentityId);

    // Critical AuthZ check: former Homeverse owner must lose owner access once relinquished
    const postAccess = await resolveHumanYouniverseAccess(sql, humanId, "oldhandle");
    assert.strictEqual(postAccess.allowed, false);
    assert.strictEqual(postAccess.isOwner, false);
  });

  await t.test("MSR-08: Phase 6 AuthN/AuthZ fixes in enroll, password/set, and recovery/manual", async () => {
    const attackerToken = "a".repeat(48);
    const attackerSessionHash = hashToken(attackerToken);
    const attackerHumanId = "11111111-1111-4111-8111-111111111111";

    const mockSql = async (strings, ...values) => {
      const raw = strings.join("?");
      if (/FROM sessions/is.test(raw) && /WHERE token_hash = \?/i.test(raw)) {
        if (values[0] === attackerSessionHash) {
          return [{
            id: "sess-attacker",
            identity_id: "id-attacker",
            human_id: attackerHumanId,
            auth_subject_id: "subj-attacker",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            revoked_at: null,
          }];
        }
        return [];
      }
      if (/FROM youniverse_identities/is.test(raw) && /username = \?/i.test(raw)) {
        if (values[0] === "victim") {
          return [{
            identity_id: "id-victim",
            username: "victim",
            email: "victim@example.com",
            email_verified_at: "2026-01-01T00:00:00.000Z",
            plan: "free",
            is_live: true,
          }];
        }
        return [];
      }
      if (/FROM youniverse_identities/is.test(raw) && /email = \?/i.test(raw)) {
        return [{
          identity_id: "id-victim",
          email_verified_at: "2026-01-01T00:00:00.000Z",
        }];
      }
      return [];
    };

    // 1. enroll.ts must reject cross-identity hijack even when attacker already holds a humanId
    const enrollReq = {
      method: "POST",
      headers: {
        origin: "https://itsyouonline.com",
        authorization: `Bearer ${attackerToken}`,
      },
      body: {
        email: "victim@example.com",
        password: "StrongPassword123!",
        handle: "victim",
      },
    };
    const enrollRes = makeRes();
    await enrollHandler(enrollReq, enrollRes, { sql: mockSql });
    assert.strictEqual(enrollRes._status, 403);
    assert.strictEqual(enrollRes._body.error, "session_identity_mismatch");

    // 2. password/set.ts must reject unauthenticated password overwrite with 401
    const unauthSetReq = {
      method: "POST",
      headers: { origin: "https://itsyouonline.com" },
      body: {
        email: "victim@example.com",
        password: "StrongPassword123!",
      },
    };
    const unauthSetRes = makeRes();
    await passwordSetHandler(unauthSetReq, unauthSetRes, { sql: mockSql });
    assert.strictEqual(unauthSetRes._status, 401);
    assert.strictEqual(unauthSetRes._body.error, "unauthorized");

    // 3. recovery/manual.ts?action=review must reject non-reviewer humanId with 403
    const prevReviewers = process.env.RECOVERY_REVIEWER_HUMAN_IDS;
    const prevSecret = process.env.PORTALS_INTERNAL_SECRET;
    process.env.RECOVERY_REVIEWER_HUMAN_IDS = "99999999-9999-4999-8999-999999999999";
    delete process.env.PORTALS_INTERNAL_SECRET;
    try {
      const reviewReq = {
        method: "POST",
        query: { action: "review" },
        headers: {
          origin: "https://itsyouonline.com",
          authorization: `Bearer ${attackerToken}`,
        },
        body: {
          caseId: "case-1",
          decision: "approved",
          notes: "Unauthorized reviewer test",
        },
      };
      const reviewRes = makeRes();
      await manualRecoveryHandler(reviewReq, reviewRes, { sql: mockSql });
      assert.strictEqual(reviewRes._status, 403);
      assert.strictEqual(reviewRes._body.error, "forbidden");
    } finally {
      if (prevReviewers !== undefined) process.env.RECOVERY_REVIEWER_HUMAN_IDS = prevReviewers;
      else delete process.env.RECOVERY_REVIEWER_HUMAN_IDS;
      if (prevSecret !== undefined) process.env.PORTALS_INTERNAL_SECRET = prevSecret;
      else delete process.env.PORTALS_INTERNAL_SECRET;
    }
  });

  await t.test("MSR-09: Migration 006 and guarded 006 rollback enforce precondition and data-preservation checks cleanly", () => {
    const m006 = readMigration("006_neon_first_decoupling.sql");
    const m006Rb = readMigration("006_rollback_neon_first_decoupling.sql");

    // Forward 006 targets canonical TEXT PK on youniverse_identities(identity_id) cleanly
    assert.match(m006, /REFERENCES\s+youniverse_identities\s*\(identity_id\)/i);
    assert.match(m006, /DROP CONSTRAINT "NotNote_youniverseId_fkey"/i);
    assert.match(m006, /ADD CONSTRAINT "NotNote_youniverseId_identity_fkey"/i);
    assert.match(m006, /ON UPDATE CASCADE[\s\S]*ON DELETE CASCADE/i);
    assert.match(m006, /RAISE EXCEPTION[\s\S]*without silent remapping/i);

    // Guarded 006 rollback aborts on unmatched Neon-first NotNote rows and never drops data or uses CASCADE on DROP CONSTRAINT
    assert.match(m006Rb, /BEGIN;/i);
    assert.match(m006Rb, /COMMIT;/i);
    assert.match(m006Rb, /LEFT JOIN public\."Youniverse"\s+y\s+ON y\.id = nn\."youniverseId"/is);
    assert.match(m006Rb, /WHERE y\.id IS NULL/i);
    assert.match(m006Rb, /RAISE EXCEPTION 'Migration 006 rollback blocked:/i);
    assert.match(m006Rb, /DROP CONSTRAINT "NotNote_youniverseId_identity_fkey"/i);
    assert.match(m006Rb, /ADD CONSTRAINT "NotNote_youniverseId_fkey"/i);
    assert.doesNotMatch(m006Rb, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  await t.test("MSR-10: assertSafeDatabaseTarget enforces case-insensitive Preview and Production endpoint isolation", () => {
    assert.throws(
      () =>
        assertSafeDatabaseTarget("postgres://user:pass@ep-aged-dew-av9711nr-pooler.c-11.us-east-1.aws.neon.tech/neondb", {
          VERCEL_ENV: "Preview",
        }),
      /FATAL: Preview deployment is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr/
    );

    assert.throws(
      () =>
        assertSafeDatabaseTarget("postgres://user:pass@ep-aged-lake-avdgndee-pooler.c-11.us-east-1.aws.neon.tech/neondb", {
          VERCEL_ENV: "Production",
        }),
      /FATAL: Production deployment is prohibited from targeting Staging Neon endpoint ep-aged-lake-avdgndee/
    );

    assert.doesNotThrow(() =>
      assertSafeDatabaseTarget("postgres://user:pass@ep-aged-lake-avdgndee-pooler.c-11.us-east-1.aws.neon.tech/neondb", {
        VERCEL_ENV: "preview",
      })
    );
    assert.doesNotThrow(() =>
      assertSafeDatabaseTarget("postgres://user:pass@ep-aged-dew-av9711nr-pooler.c-11.us-east-1.aws.neon.tech/neondb", {
        VERCEL_ENV: "production",
      })
    );
  });

  await t.test("MSR-11: Launch-blocker CSRF guards on acknowledge/weaver/claim and pinned WeaverSandbox integrity", async () => {
    const reqBadOrigin = (body = {}) => ({
      method: "POST",
      headers: {
        origin: "https://evil-attacker.example",
        cookie: "__youniverse_session=cookie_only_tok",
      },
      body,
    });

    const genRes = makeRes();
    await genesisHandler(
      { ...reqBadOrigin(), query: { action: "acknowledge" } },
      genRes,
      { sql: async () => [], env: { VERCEL_ENV: "production" } }
    );
    assert.strictEqual(genRes._status, 403);
    assert.strictEqual(genRes._body.error, "csrf_rejected");

    const weaverRes = makeRes();
    await weaverGenerateHandler(
      reqBadOrigin({ prompt: "clock" }),
      weaverRes,
      { sql: async () => [], env: { VERCEL_ENV: "production" } }
    );
    assert.strictEqual(weaverRes._status, 403);
    assert.strictEqual(weaverRes._body.error, "csrf_rejected");

    const claimRes = makeRes();
    await claimHandler(
      reqBadOrigin({ handle: "validhandle", email: "user@example.com" }),
      claimRes,
      { sql: async () => [], env: { VERCEL_ENV: "production" } }
    );
    assert.strictEqual(claimRes._status, 403);
    assert.strictEqual(claimRes._body.error, "csrf_rejected");

    const sandboxSrc = fs.readFileSync(
      path.resolve(process.cwd(), "components", "weaver", "WeaverSandbox.tsx"),
      "utf8"
    );
    assert.match(sandboxSrc, /https:\/\/cdn\.tailwindcss\.com\/3\.4\.17/);
    assert.match(sandboxSrc, /react@18\.3\.1\/umd\/react\.production\.min\.js" integrity="sha384-/);
    assert.match(sandboxSrc, /react-dom@18\.3\.1\/umd\/react-dom\.production\.min\.js" integrity="sha384-/);
    assert.match(sandboxSrc, /@babel\/standalone@7\.26\.10\/babel\.min\.js" integrity="sha384-/);
    assert.match(sandboxSrc, /sandbox="allow-scripts"/);
    assert.doesNotMatch(sandboxSrc, /allow-same-origin/);
  });
});
