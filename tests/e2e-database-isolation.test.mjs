/**
 * tests/e2e-database-isolation.test.mjs
 *
 * Phase 13B.1.35 — Dedicated Local E2E Database Isolation and Target Verification Suite.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { validateE2EDatabaseTarget, redactDatabaseUrl } from "../lib/e2eDatabaseConfig.ts";

test("1. validateE2EDatabaseTarget accepts valid local loopback targets", () => {
  const validUrl = "postgresql://postgres:secret_pass@127.0.0.1:5433/founding_angels_e2e_test";
  const result = validateE2EDatabaseTarget(validUrl);
  assert.strictEqual(result.hostname, "127.0.0.1");
  assert.strictEqual(result.port, 5433);
  assert.strictEqual(result.database, "founding_angels_e2e_test");
  assert.strictEqual(result.isLoopback, true);

  const localhostUrl = "postgresql://postgres:secret_pass@localhost:5433/founding_angels_e2e_test";
  const resultLocalhost = validateE2EDatabaseTarget(localhostUrl);
  assert.strictEqual(resultLocalhost.hostname, "localhost");
  assert.strictEqual(resultLocalhost.isLoopback, true);
});

test("2. validateE2EDatabaseTarget rejects remote Neon URLs immediately", () => {
  const neonUrl = "postgresql://neondb_owner:secret@ep-cool-fog-1234.us-east-2.aws.neon.tech/neondb?sslmode=require";
  assert.throws(
    () => validateE2EDatabaseTarget(neonUrl),
    /NOT local loopback|Remote Neon connection string detected/
  );
});

test("3. validateE2EDatabaseTarget rejects arbitrary remote databases", () => {
  const remoteUrl = "postgresql://app:pass@aws.rds.amazonaws.com:5432/founding_angels_e2e_test";
  assert.throws(
    () => validateE2EDatabaseTarget(remoteUrl),
    /Database host is NOT local loopback/
  );
});

test("4. validateE2EDatabaseTarget rejects non-e2e database names", () => {
  const wrongDbUrl = "postgresql://postgres:secret@127.0.0.1:5433/founding_angels_test";
  assert.throws(
    () => validateE2EDatabaseTarget(wrongDbUrl),
    /Database name is NOT founding_angels_e2e_test/
  );

  const neondbUrl = "postgresql://postgres:secret@127.0.0.1:5433/neondb";
  assert.throws(
    () => validateE2EDatabaseTarget(neondbUrl),
    /Database name is NOT founding_angels_e2e_test/
  );
});

test("5. validateE2EDatabaseTarget rejects unapproved protocols and malformed strings", () => {
  assert.throws(() => validateE2EDatabaseTarget(""), /Database connection string is required/);
  assert.throws(() => validateE2EDatabaseTarget("http://127.0.0.1:5433/founding_angels_e2e_test"), /Unapproved database protocol/);
  assert.throws(() => validateE2EDatabaseTarget("invalid string"), /Malformed database connection string/);
});

test("6. redactDatabaseUrl never logs passwords", () => {
  const rawUrl = "postgresql://my_user:super_secret_password_12345@127.0.0.1:5433/founding_angels_e2e_test";
  const redacted = redactDatabaseUrl(rawUrl);
  assert.doesNotMatch(redacted, /super_secret_password_12345/);
  assert.match(redacted, /my_user:\[REDACTED\]@127\.0\.0\.1:5433\/founding_angels_e2e_test/);
});

test("7. Live runtime verification of founding_angels_e2e_test target", () => {
  const pwFile = "C:/Users/toidi/.pg18_disposable/superuser_pw.txt";
  assert.ok(fs.existsSync(pwFile), "Password file must exist");
  const pw = fs.readFileSync(pwFile, "utf8").trim();

  const env = { ...process.env, PGPASSWORD: pw };
  const cmd = `C:/Users/toidi/.pg18_disposable/pgsql/bin/psql.exe -h 127.0.0.1 -p 5433 -U postgres -d founding_angels_e2e_test -t -A -c "SELECT current_database(), inet_server_port(), (SELECT count(*) FROM public.founding_angel_orders), (SELECT count(*) FROM public.founding_angel_memberships);"`;
  const output = execSync(cmd, { env }).toString().trim();
  const parts = output.split("|");

  assert.strictEqual(parts[0], "founding_angels_e2e_test", "Connected database must be founding_angels_e2e_test");
  assert.strictEqual(parts[1], "5433", "Connected port must be 5433");
  assert.ok(parts[2] === "0" || parts[2] === "1", "Orders count in e2e database must be 0 or 1");
  assert.ok(parts[3] === "0" || parts[3] === "1", "Memberships count in e2e database must be 0 or 1");
});

test("8. Live verification that original founding_angels_test remains untouched", () => {
  const pwFile = "C:/Users/toidi/.pg18_disposable/superuser_pw.txt";
  const pw = fs.readFileSync(pwFile, "utf8").trim();

  const env = { ...process.env, PGPASSWORD: pw };
  const cmd = `C:/Users/toidi/.pg18_disposable/pgsql/bin/psql.exe -h 127.0.0.1 -p 5433 -U postgres -d founding_angels_test -t -A -c "SELECT count(*) FROM public.founding_angel_memberships;"`;
  const count = execSync(cmd, { env }).toString().trim();

  assert.strictEqual(count, "500", "Original founding_angels_test must still hold exactly 500 memberships");
});

test("9. getPool wires validateE2EDatabaseTarget and rejects remote Neon in E2E mode", async () => {
  const { getPool } = await import("../lib/foundingAngelsService.ts");
  const origE2E = process.env.E2E_TEST;
  const origDb = process.env.DATABASE_URL;

  try {
    process.env.E2E_TEST = "true";
    process.env.DATABASE_URL = "postgresql://neondb_owner:secret@ep-cool-fog-1234.us-east-2.aws.neon.tech/neondb?sslmode=require";

    assert.throws(
      () => getPool(),
      /NOT local loopback|Remote Neon connection string detected/
    );
  } finally {
    process.env.E2E_TEST = origE2E;
    process.env.DATABASE_URL = origDb;
  }
});

test("10. withTransaction verifies connected target in E2E mode before mutation", async () => {
  const { withTransaction } = await import("../lib/foundingAngelsService.ts");
  const origE2E = process.env.E2E_TEST;

  try {
    process.env.E2E_TEST = "true";

    // Mock client connected to wrong database
    const mockClient = {
      async query(sql) {
        if (typeof sql === "string" && sql.includes("SELECT current_database()")) {
          return { rows: [{ db: "wrong_db", addr: "127.0.0.1", port: 5433 }] };
        }
        return { rows: [] };
      },
      release() {},
    };

    const mockPool = {
      async connect() {
        return mockClient;
      },
    };

    await assert.rejects(
      async () => {
        await withTransaction({ pool: mockPool }, async () => {
          throw new Error("Should not reach here");
        });
      },
      /Connected database target violation in E2E mode/
    );
  } finally {
    process.env.E2E_TEST = origE2E;
  }
});

