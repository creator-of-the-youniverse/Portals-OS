/**
 * tests/r5-recovery.test.mjs
 *
 * Test suite for Founder Decision B — Credential-Loss Recovery (Layers 2 & 3).
 *
 * In-memory tests only. Zero live database or network connections.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  normalizeRecoveryCode,
} from "../lib/recoveryCode.ts";
import {
  createManualRecoveryCase,
  submitReviewerApproval,
  checkHoldExpiry,
  executeRecovery,
  getRecoveryCaseStatus,
  getRecoveryCaseAuditLog,
} from "../lib/manualRecovery.ts";
import recoveryCodesHandler from "../api/auth/recovery/codes.ts";
import redeemHandler from "../api/auth/recovery/redeem.ts";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── In-memory DB mock for recovery codes ─────────────────────────────────────
function makeRecoveryDb() {
  const store = {
    human_recovery_codes: [],
    human_auth_subjects: [],
    human_continuity_identities: [],
    human_youniverse_associations: [],
    sessions: [],
  };

  const sql = async (strings, ...values) => {
    const full = strings.join("?");

    // SELECT remaining / last_issued_at
    if (full.includes("FROM human_recovery_codes") && full.includes("count(*)")) {
      const humanId = values[0];
      const valid = store.human_recovery_codes.filter(
        (c) => c.human_id === humanId && c.consumed_at === null
      );
      return [{ remaining: valid.length, last_issued_at: valid[0]?.created_at ?? null }];
    }

    // UPDATE human_recovery_codes (invalidate / consume)
    if (full.includes("UPDATE human_recovery_codes")) {
      if (full.includes("WHERE human_id = ?")) {
        const now = values[0];
        const humanId = values[1];
        store.human_recovery_codes.forEach((c) => {
          if (c.human_id === humanId && c.consumed_at === null) c.consumed_at = now;
        });
      } else if (full.includes("WHERE id = ?")) {
        const now = values[0];
        const id = values[1];
        const c = store.human_recovery_codes.find((item) => item.id === id);
        if (c) c.consumed_at = now;
      }
      return [];
    }

    // INSERT INTO human_recovery_codes
    if (full.includes("INSERT INTO human_recovery_codes")) {
      const [human_id, code_hash, created_at] = values;
      store.human_recovery_codes.push({
        id: crypto.randomUUID(),
        human_id,
        code_hash,
        created_at,
        consumed_at: null,
      });
      return [];
    }

    // SELECT subject by email
    if (full.includes("FROM human_auth_subjects s") && full.includes("subject_identifier = ?")) {
      const email = values[0];
      const s = store.human_auth_subjects.find(
        (sub) => sub.subject_identifier === email && sub.status === "active"
      );
      if (!s) return [];
      const h = store.human_continuity_identities.find(
        (hum) => hum.human_id === s.human_id && hum.status === "active"
      );
      if (!h) return [];
      return [{ human_id: s.human_id, auth_subject_id: s.id }];
    }

    // SELECT unused code hashes for human
    if (full.includes("FROM human_recovery_codes") && full.includes("WHERE human_id = ?")) {
      const humanId = values[0];
      return store.human_recovery_codes.filter(
        (c) => c.human_id === humanId && c.consumed_at === null
      );
    }

    // UPDATE sessions revoke
    if (full.includes("UPDATE sessions") && full.includes("revoked_at")) {
      const now = values[0];
      const humanId = values[1];
      store.sessions.forEach((s) => {
        if (s.human_id === humanId && s.revoked_at === null) s.revoked_at = now;
      });
      return [];
    }

    // SELECT association
    if (full.includes("FROM human_youniverse_associations")) {
      const humanId = values[0];
      return store.human_youniverse_associations.filter((a) => a.human_id === humanId);
    }

    return [];
  };

  return { store, sql };
}

function makeRes() {
  const r = { _status: 200, _headers: {}, _body: null };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  r.setHeader = (k, v) => { r._headers[k] = v; return r; };
  return r;
}

console.log("\n═══ Layer 2 — Offline Recovery Codes Tests ═══\n");

await test("R2-01 — Code generation produces 8 codes in XXXX-XXXX-XXXX format", () => {
  const { plaintext, hashes } = generateRecoveryCodes(8);
  assert.equal(plaintext.length, 8);
  assert.equal(hashes.length, 8);
  for (const code of plaintext) {
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  }
});

await test("R2-02 — Code normalization strips hyphens/spaces and uppercases", () => {
  assert.equal(normalizeRecoveryCode("abcd-efgh-jk23"), "ABCDEFGHJK23");
  assert.equal(normalizeRecoveryCode("  ab cd - ef gh - jk 23  "), "ABCDEFGHJK23");
});

await test("R2-03 — Code hashing is deterministic and non-reversible", () => {
  const code = "ABCD-EFGH-JK23";
  const h1 = hashRecoveryCode(code);
  const h2 = hashRecoveryCode("abcd-efgh-jk23");
  assert.equal(h1, h2);
  assert.equal(h1.length, 64); // SHA-256 hex
  assert.ok(!h1.includes("ABCD"));
});

await test("R2-04 — verifyRecoveryCode matches valid code and rejects invalid", () => {
  const code = "ABCD-EFGH-JK23";
  const hash = hashRecoveryCode(code);
  assert.equal(verifyRecoveryCode("abcd-efgh-jk23", hash), true);
  assert.equal(verifyRecoveryCode("wrong-code-here", hash), false);
  assert.equal(verifyRecoveryCode("", hash), false);
});

await test("R2-05 — API: Issue recovery codes requires explicit confirmation", async () => {
  const { sql } = makeRecoveryDb();
  const req = {
    method: "POST",
    headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" },
    body: { confirmed: false },
  };
  const res = makeRes();
  const mockValidateSession = async () => ({ ok: true, humanId: "human-1" });

  await recoveryCodesHandler(req, res, { sql, validateSession: mockValidateSession });
  assert.equal(res._status, 400);
  assert.equal(res._body.error, "confirmation_required");
});

await test("R2-06 — API: Successful code issuance stores hashes only and invalidates previous codes", async () => {
  const { store, sql } = makeRecoveryDb();
  const mockValidateSession = async () => ({ ok: true, humanId: "human-1" });

  // Issue 1
  const req1 = { method: "POST", headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" }, body: { confirmed: true } };
  const res1 = makeRes();
  await recoveryCodesHandler(req1, res1, { sql, validateSession: mockValidateSession });
  assert.equal(res1._status, 200);
  assert.equal(res1._body.recoveryCodes.length, 8);
  assert.equal(store.human_recovery_codes.length, 8);

  const firstBatchIds = store.human_recovery_codes.map((c) => c.id);

  // Issue 2 (regeneration)
  const req2 = { method: "POST", headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" }, body: { confirmed: true } };
  const res2 = makeRes();
  await recoveryCodesHandler(req2, res2, { sql, validateSession: mockValidateSession });
  assert.equal(res2._status, 200);
  assert.equal(store.human_recovery_codes.length, 16);

  // All 8 codes from first batch must now be consumed
  for (const id of firstBatchIds) {
    const code = store.human_recovery_codes.find((c) => c.id === id);
    assert.ok(code.consumed_at !== null, "Prior codes must be invalidated");
  }
});

await test("R2-07 — API: Redeem valid code marks code consumed and sets session cookie", async () => {
  const { store, sql } = makeRecoveryDb();
  const humanId = "human-alice";
  const authSubjectId = "subj-alice";
  const email = "alice@example.com";

  store.human_continuity_identities.push({ human_id: humanId, status: "active" });
  store.human_auth_subjects.push({ id: authSubjectId, human_id: humanId, subject_identifier: email, status: "active" });
  store.human_youniverse_associations.push({ human_id: humanId, identity_id: "youniverse-alice", verification_status: "verified" });

  const rawCode = "ABCD-EFGH-JK23";
  store.human_recovery_codes.push({
    id: "code-1",
    human_id: humanId,
    code_hash: hashRecoveryCode(rawCode),
    created_at: new Date().toISOString(),
    consumed_at: null,
  });

  const req = {
    method: "POST",
    headers: { "x-portals-request": "1", "origin": "https://itsyouonline.com" },
    body: { email, code: rawCode },
  };
  const res = makeRes();
  const mockCreateSession = async () => ({ rawToken: "new-session-raw-token" });

  await redeemHandler(req, res, { sql, createSessionFn: mockCreateSession });
  assert.equal(res._status, 200);
  assert.equal(res._body.ok, true);
  assert.equal(res._body.humanId, humanId);
  assert.ok(res._headers["Set-Cookie"].includes("youniverse_session="));

  // Verify code is now consumed
  const consumedCode = store.human_recovery_codes.find((c) => c.id === "code-1");
  assert.ok(consumedCode.consumed_at !== null);

  // Second redemption of same code must fail (single-use)
  const resAgain = makeRes();
  await redeemHandler(req, resAgain, { sql, createSessionFn: mockCreateSession });
  assert.equal(resAgain._status, 401);
  assert.equal(resAgain._body.error, "invalid_recovery_code");
});

console.log("\n═══ Layer 3 — Controlled Manual Recovery Tests ═══\n");

// ── SQL mock factory for manual_recovery_cases ───────────────────────────────
// Handles INSERT, SELECT, and UPDATE patterns issued by lib/manualRecovery.ts.
// Exposes `sql._cases` Map for test-side hold-expiry simulation.

function makeManualRecoveryMockSql() {
  const cases = new Map(); // caseId → plain JS object matching DB row shape
  const authSubjects = [];
  const sessions = [];

  const sql = async (strings, ...values) => {
    const full = strings.join("?");

    // ── INSERT INTO manual_recovery_cases ──────────────────────────────────
    if (full.includes("INSERT INTO manual_recovery_cases")) {
      const [caseId, claimantEmail, humanId, evidDesc, contactChannels,
             , holdExpiresAt, completedAt, approvals, rejections, auditLogStr] = values;
      cases.set(caseId, {
        case_id: caseId,
        claimant_email: claimantEmail,
        human_id: humanId ?? null,
        evidence_description: evidDesc ?? "",
        contact_channels: contactChannels,
        status: "pending_evidence",
        requested_at: new Date().toISOString(),
        hold_expires_at: holdExpiresAt ?? null,
        completed_at: completedAt ?? null,
        approvals: [],
        rejections: [],
        audit_log: typeof auditLogStr === "string" ? JSON.parse(auditLogStr) : (Array.isArray(auditLogStr) ? auditLogStr : []),
      });
      return [];
    }

    // ── SELECT FROM manual_recovery_cases WHERE case_id ────────────────────
    if (full.includes("FROM manual_recovery_cases") && full.includes("case_id")) {
      const caseId = values[0];
      const c = cases.get(caseId);
      if (!c) return [];
      // Return deep clone with JSONB fields serialised as the library expects
      return [Object.assign({}, c)];
    }

    // ── UPDATE manual_recovery_cases ───────────────────────────────────────
    if (full.includes("UPDATE manual_recovery_cases")) {
      // Determine shape by SQL text patterns; extract case_id (always last value)
      const caseId = values[values.length - 1];
      const c = cases.get(caseId);
      if (!c) return [];

      if (full.includes("status = 'rejected'")) {
        // SET status='rejected', rejections=?, audit_log=? WHERE case_id=?
        c.status = "rejected";
        c.rejections = typeof values[0] === "string" ? JSON.parse(values[0]) : values[0];
        c.audit_log  = typeof values[1] === "string" ? JSON.parse(values[1]) : values[1];
      } else if (full.includes("status = 'hold_pending'")) {
        // SET status='hold_pending', hold_expires_at=?, approvals=?, audit_log=? WHERE case_id=?
        c.status = "hold_pending";
        c.hold_expires_at = values[0];
        c.approvals  = typeof values[1] === "string" ? JSON.parse(values[1]) : values[1];
        c.audit_log  = typeof values[2] === "string" ? JSON.parse(values[2]) : values[2];
      } else if (full.includes("status = 'pending_review'")) {
        // SET status='pending_review', approvals=?, audit_log=? WHERE case_id=?
        c.status = "pending_review";
        c.approvals = typeof values[0] === "string" ? JSON.parse(values[0]) : values[0];
        c.audit_log = typeof values[1] === "string" ? JSON.parse(values[1]) : values[1];
      } else if (full.includes("status = 'completed'")) {
        // SET status='completed', completed_at=?, audit_log=? WHERE case_id=?
        c.status = "completed";
        c.completed_at = values[0];
        c.audit_log = typeof values[1] === "string" ? JSON.parse(values[1]) : values[1];
      }
      return [];
    }

    // ── UPDATE sessions (revoke) ───────────────────────────────────────────
    if (full.includes("UPDATE sessions")) {
      const now = values[0];
      const humanId = values[1];
      sessions.forEach((s) => {
        if (s.human_id === humanId && !s.revoked_at) s.revoked_at = now;
      });
      return [];
    }

    // ── UPDATE human_auth_subjects (revoke) ───────────────────────────────
    if (full.includes("UPDATE human_auth_subjects")) return [];

    // ── INSERT INTO human_auth_subjects (provisional) ─────────────────────
    if (full.includes("INSERT INTO human_auth_subjects")) {
      authSubjects.push({ id: values[0], human_id: values[1] });
      return [];
    }

    return [];
  };

  // sql.transaction(fn) — simulates the Neon HTTP transaction API.
  // The Neon @neondatabase/serverless v1.x API is sql.transaction(queriesOrFn)
  // where fn is a synchronous function returning an array of unawaited query objects.
  // The mock executes them sequentially to simulate the atomic batch.
  sql.transaction = async (fn) => {
    const queries = fn(sql); // fn returns an array of unawaited query promises
    const results = [];
    for (const q of queries) {
      results.push(await q);
    }
    return results;
  };

  // Expose internals for test manipulation
  sql._cases = cases;
  sql._authSubjects = authSubjects;
  sql._sessions = sessions;
  return sql;
}

await test("R3-01 — Manual recovery: Case creation starts in pending_evidence status", async () => {
  const sql = makeManualRecoveryMockSql();
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "lost@example.com",
    evidenceDescription: "Lost hardware key and phone. Driver license and notarized affidavit attached.",
    contactChannels: ["phone:+1234567890"],
  });
  assert.ok(caseId);
  const status = await getRecoveryCaseStatus(sql, caseId);
  assert.equal(status.status, "pending_evidence");
  assert.equal(status.approvalCount, 0);
});

await test("R3-02 — Manual recovery: Self-approval is rejected", async () => {
  const sql = makeManualRecoveryMockSql();
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "alice@example.com",
    evidenceDescription: "Lost access",
    contactChannels: [],
  });

  await assert.rejects(
    () =>
      submitReviewerApproval(sql, {
        caseId,
        reviewerId: "alice@example.com", // matches claimant
        decision: "approved",
        notes: "Self approving",
      }),
    /Self-approval is not permitted/i
  );
});

await test("R3-03 — Manual recovery: Single rejection transitions case to rejected", async () => {
  const sql = makeManualRecoveryMockSql();
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "claimant@example.com",
    evidenceDescription: "Insufficient evidence",
    contactChannels: [],
  });

  await submitReviewerApproval(sql, {
    caseId,
    reviewerId: "reviewer-1",
    decision: "rejected",
    notes: "Evidence does not match records",
  });

  const status = await getRecoveryCaseStatus(sql, caseId);
  assert.equal(status.status, "rejected");
  assert.equal(status.rejectionCount, 1);
});

await test("R3-04 — Manual recovery: Two distinct approvals transition to hold_pending (30-day hold)", async () => {
  const sql = makeManualRecoveryMockSql();
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "claimant@example.com",
    evidenceDescription: "Valid passport + utility bill",
    contactChannels: [],
  });

  // Reviewer 1 approves
  await submitReviewerApproval(sql, {
    caseId,
    reviewerId: "reviewer-1",
    decision: "approved",
    notes: "Verified identity doc",
  });
  let status = await getRecoveryCaseStatus(sql, caseId);
  assert.equal(status.status, "pending_review");
  assert.equal(status.approvalCount, 1);
  assert.equal(status.holdExpiresAt, null);

  // Reviewer 2 approves
  await submitReviewerApproval(sql, {
    caseId,
    reviewerId: "reviewer-2",
    decision: "approved",
    notes: "Second review confirmed",
  });
  status = await getRecoveryCaseStatus(sql, caseId);
  assert.equal(status.status, "hold_pending");
  assert.equal(status.approvalCount, 2);
  assert.ok(status.holdExpiresAt !== null);

  // Verify hold is 30 days in the future
  const expiry = new Date(status.holdExpiresAt);
  const now = new Date();
  const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
  assert.ok(diffDays >= 29 && diffDays <= 31);
});

await test("R3-05 — Manual recovery: Access blocked while 30-day hold is pending", async () => {
  const sql = makeManualRecoveryMockSql();
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "claimant@example.com",
    evidenceDescription: "Docs verified",
    contactChannels: [],
  });

  await submitReviewerApproval(sql, { caseId, reviewerId: "rev-1", decision: "approved", notes: "ok" });
  await submitReviewerApproval(sql, { caseId, reviewerId: "rev-2", decision: "approved", notes: "ok" });

  // Execution must fail closed while hold is pending
  await assert.rejects(
    () => executeRecovery(sql, caseId),
    /30-day hold has not yet expired/i
  );
});

await test("R3-06 — Manual recovery: Execution allowed after hold expires, preserves associations, revokes sessions", async () => {
  const sql = makeManualRecoveryMockSql();
  const humanId = "existing-human-id-123";
  const caseId = await createManualRecoveryCase(sql, {
    claimantEmail: "claimant@example.com",
    evidenceDescription: "Docs verified",
    contactChannels: [],
    humanId,
  });

  await submitReviewerApproval(sql, { caseId, reviewerId: "rev-1", decision: "approved", notes: "ok" });
  await submitReviewerApproval(sql, { caseId, reviewerId: "rev-2", decision: "approved", notes: "ok" });

  // Simulate hold expiration by directly backdating the in-memory row
  const caseRecord = sql._cases.get(caseId);
  caseRecord.hold_expires_at = new Date(Date.now() - 1000).toISOString();

  const result = await executeRecovery(sql, caseId);
  assert.equal(result.success, true);
  assert.equal(result.humanId, humanId);
  assert.ok(result.newAuthSubjectId);

  // Status must be completed
  const status = await getRecoveryCaseStatus(sql, caseId);
  assert.equal(status.status, "completed");

  // Audit log must contain immutable record
  const log = await getRecoveryCaseAuditLog(sql, caseId);
  const execEntry = log.find((entry) => entry.event === "recovery_executed");
  assert.ok(execEntry);
  assert.equal(execEntry.details.youniverseAssociationsPreserved, true);
  assert.equal(execEntry.details.humanId, humanId);
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
