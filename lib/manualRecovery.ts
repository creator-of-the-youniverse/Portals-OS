/**
 * lib/manualRecovery.ts
 *
 * Layer 3 — Controlled Manual Recovery for ItsYouOnline / Portals-OS.
 *
 * Recovery flow:
 *  1. Claimant submits case (unauthenticated — they may have lost all access).
 *  2. Two distinct reviewers (never the claimant) approve → case enters 30-day hold.
 *  3. After hold expires, executeRecovery() performs recovery:
 *     - Revokes compromised credentials and sessions
 *     - Preserves ALL Youniverse associations and ownership history
 *     - Creates new provisional auth subject for the claimant
 *     - Writes immutable audit record
 *
 * Persistence: SQL-backed via the `manual_recovery_cases` table (Migration 014).
 * All state is durable — survives server restarts and multi-instance deployments.
 */

import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export type RecoveryCaseStatus =
  | "pending_evidence"
  | "pending_review"
  | "hold_pending"
  | "completed"
  | "rejected";

export interface RecoveryCase {
  caseId: string;
  claimantEmail: string;
  humanId: string | null;
  evidenceDescription: string;
  contactChannels: string[];
  status: RecoveryCaseStatus;
  requestedAt: string;
  holdExpiresAt: string | null;
  completedAt: string | null;
  approvals: ReviewerDecision[];
  rejections: ReviewerDecision[];
  auditLog: AuditEntry[];
}

export interface ReviewerDecision {
  reviewerId: string;
  decision: "approved" | "rejected";
  notes: string;
  decidedAt: string;
}

export interface AuditEntry {
  event: string;
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface CreateManualRecoveryCaseParams {
  claimantEmail: string;
  humanId?: string;
  evidenceDescription: string;
  contactChannels: string[];
}

export interface SubmitReviewerApprovalParams {
  caseId: string;
  reviewerId: string;
  decision: "approved" | "rejected";
  notes: string;
}

export interface ExecuteRecoveryResult {
  success: true;
  humanId: string;
  newAuthSubjectId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/** Load a recovery case from SQL. Throws if not found. */
async function loadCase(sql: any, caseId: string): Promise<RecoveryCase> {
  const rows = await sql`
    SELECT case_id, claimant_email, human_id, evidence_description,
           contact_channels, status, requested_at, hold_expires_at,
           completed_at, approvals, rejections, audit_log
    FROM manual_recovery_cases
    WHERE case_id = ${caseId}
    LIMIT 1
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Recovery case not found");
  }

  const r = rows[0];
  return {
    caseId: String(r.case_id),
    claimantEmail: String(r.claimant_email),
    humanId: r.human_id ? String(r.human_id) : null,
    evidenceDescription: String(r.evidence_description ?? ""),
    contactChannels: Array.isArray(r.contact_channels) ? r.contact_channels : (typeof r.contact_channels === "string" ? JSON.parse(r.contact_channels) : []),
    status: r.status as RecoveryCaseStatus,
    requestedAt: String(r.requested_at),
    holdExpiresAt: r.hold_expires_at ? String(r.hold_expires_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
    approvals: parseJsonField(r.approvals),
    rejections: parseJsonField(r.rejections),
    auditLog: parseJsonField(r.audit_log),
  };
}

function parseJsonField(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

// ── Core Library Functions ───────────────────────────────────────────────────

/**
 * Creates a new manual recovery case with status 'pending_evidence'.
 * Does NOT grant any access.
 */
export async function createManualRecoveryCase(
  sql: any,
  params: CreateManualRecoveryCaseParams
): Promise<string> {
  const caseId = crypto.randomUUID();
  const now = nowIso();

  const initEntry: AuditEntry = {
    event: "case_created",
    actor: params.claimantEmail,
    timestamp: now,
    details: {
      evidenceDescription: params.evidenceDescription,
      contactChannels: params.contactChannels,
      humanId: params.humanId ?? null,
    },
  };

  await sql`
    INSERT INTO manual_recovery_cases (
      case_id,
      claimant_email,
      human_id,
      evidence_description,
      contact_channels,
      status,
      requested_at,
      hold_expires_at,
      completed_at,
      approvals,
      rejections,
      audit_log
    )
    VALUES (
      ${caseId},
      ${params.claimantEmail.trim().toLowerCase()},
      ${params.humanId ?? null},
      ${params.evidenceDescription ?? ""},
      ${JSON.stringify(params.contactChannels ?? [])},
      'pending_evidence',
      ${now},
      ${null},
      ${null},
      ${"[]"},
      ${"[]"},
      ${JSON.stringify([initEntry])}
    )
  `;

  return caseId;
}

/**
 * Submits a reviewer decision (approved/rejected) for a recovery case.
 *
 * Rules:
 * - Self-approval rejected (reviewerId matches claimantEmail).
 * - Case must be in 'pending_evidence' or 'pending_review' status.
 * - Each reviewer may only vote once.
 * - 2 distinct approvals → transitions to 'hold_pending' (30-day hold).
 * - Any rejection → transitions to 'rejected'.
 */
export async function submitReviewerApproval(
  sql: any,
  params: SubmitReviewerApprovalParams
): Promise<void> {
  const recoveryCase = await loadCase(sql, params.caseId);

  // Only allow review in these statuses
  if (
    recoveryCase.status !== "pending_evidence" &&
    recoveryCase.status !== "pending_review"
  ) {
    throw new Error(
      `Cannot submit review: case is in status '${recoveryCase.status}'`
    );
  }

  // Self-approval guard
  const normalizedClaimant = recoveryCase.claimantEmail.trim().toLowerCase();
  const normalizedReviewer = params.reviewerId.trim().toLowerCase();
  if (normalizedReviewer === normalizedClaimant) {
    throw new Error("Self-approval is not permitted");
  }

  // Prevent duplicate votes from same reviewer
  const alreadyVoted =
    recoveryCase.approvals.some(
      (a) => a.reviewerId.trim().toLowerCase() === normalizedReviewer
    ) ||
    recoveryCase.rejections.some(
      (r) => r.reviewerId.trim().toLowerCase() === normalizedReviewer
    );
  if (alreadyVoted) {
    throw new Error("Reviewer has already submitted a decision for this case");
  }

  const now = nowIso();
  const decision: ReviewerDecision = {
    reviewerId: params.reviewerId,
    decision: params.decision,
    notes: params.notes,
    decidedAt: now,
  };

  const auditEntry: AuditEntry = {
    event: `reviewer_${params.decision}`,
    actor: params.reviewerId,
    timestamp: now,
    details: { notes: params.notes, caseId: params.caseId },
  };

  if (params.decision === "rejected") {
    const newRejections = [...recoveryCase.rejections, decision];
    const newAuditLog = [
      ...recoveryCase.auditLog,
      auditEntry,
      {
        event: "case_rejected",
        actor: "system",
        timestamp: now,
        details: { rejectedBy: params.reviewerId },
      },
    ];

    await sql`
      UPDATE manual_recovery_cases
      SET status = 'rejected',
          rejections = ${JSON.stringify(newRejections)},
          audit_log = ${JSON.stringify(newAuditLog)}
      WHERE case_id = ${params.caseId}
    `;
    return;
  }

  // Approval path
  const newApprovals = [...recoveryCase.approvals, decision];
  const newAuditLog = [...recoveryCase.auditLog, auditEntry];

  if (newApprovals.length >= 2) {
    // Two distinct approvals → hold_pending
    const holdExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const holdEntry: AuditEntry = {
      event: "hold_pending_started",
      actor: "system",
      timestamp: now,
      details: { holdExpiresAt: holdExpiry.toISOString() },
    };
    newAuditLog.push(holdEntry);

    await sql`
      UPDATE manual_recovery_cases
      SET status = 'hold_pending',
          hold_expires_at = ${holdExpiry.toISOString()},
          approvals = ${JSON.stringify(newApprovals)},
          audit_log = ${JSON.stringify(newAuditLog)}
      WHERE case_id = ${params.caseId}
    `;
  } else {
    await sql`
      UPDATE manual_recovery_cases
      SET status = 'pending_review',
          approvals = ${JSON.stringify(newApprovals)},
          audit_log = ${JSON.stringify(newAuditLog)}
      WHERE case_id = ${params.caseId}
    `;
  }
}

/**
 * Returns whether the 30-day hold has expired for a case.
 */
export async function checkHoldExpiry(
  sql: any,
  caseId: string
): Promise<boolean> {
  const recoveryCase = await loadCase(sql, caseId);
  if (!recoveryCase.holdExpiresAt) return false;
  return new Date(recoveryCase.holdExpiresAt) < new Date();
}

/**
 * Executes recovery:
 * - Requires hold expired + 2 approvals + no rejections.
 * - Revokes compromised credentials/sessions.
 * - Preserves ALL Youniverse associations and ownership history.
 * - Creates new provisional auth subject for the claimant.
 * - Writes immutable audit record.
 */
export async function executeRecovery(
  sql: any,
  caseId: string
): Promise<ExecuteRecoveryResult> {
  const recoveryCase = await loadCase(sql, caseId);

  if (recoveryCase.status !== "hold_pending") {
    throw new Error(
      `Cannot execute recovery: case status is '${recoveryCase.status}', must be 'hold_pending'`
    );
  }

  if (recoveryCase.rejections.length > 0) {
    throw new Error("Cannot execute recovery: case has rejections");
  }

  if (recoveryCase.approvals.length < 2) {
    throw new Error(
      "Cannot execute recovery: requires at least 2 distinct approvals"
    );
  }

  const holdExpired = await checkHoldExpiry(sql, caseId);
  if (!holdExpired) {
    throw new Error("Cannot execute recovery: 30-day hold has not yet expired");
  }

  const now = nowIso();
  const humanId = recoveryCase.humanId ?? crypto.randomUUID(); // provisional if unknown
  const newAuthSubjectId = crypto.randomUUID();

  // Immutable audit record (computed before the transaction)
  const auditEntry: AuditEntry = {
    event: "recovery_executed",
    actor: "system",
    timestamp: now,
    details: {
      humanId,
      newAuthSubjectId,
      claimantEmail: recoveryCase.claimantEmail,
      approvals: recoveryCase.approvals.map((a) => a.reviewerId),
      youniverseAssociationsPreserved: true,
    },
  };

  const newAuditLog = [...recoveryCase.auditLog, auditEntry];

  // All four SQL writes are atomic: a mid-sequence failure leaves no partial state.
  //
  // Neon HTTP client (@neondatabase/serverless v1.x) transaction API:
  //   sql.transaction(queriesOrFn)
  //   where queriesOrFn is an ARRAY of unawaited NeonQueryInTransaction objects,
  //   or a synchronous function returning such an array.
  //   Queries must NOT be awaited inside the callback — the client serialises and
  //   submits them as a single HTTP batch under BEGIN/COMMIT.
  //
  // The conditional session-revocation writes are built into the array only when
  // humanId is known, preserving the original branch semantics.
  const txQueries = (tx: any): any[] => {
    const writes: any[] = [];

    if (!recoveryCase.humanId) {
      writes.push(tx`
        INSERT INTO human_continuity_identities (human_id, status, created_at, updated_at)
        VALUES (${humanId}, 'active', ${now}, ${now})
        ON CONFLICT (human_id) DO NOTHING
      `);
    }

    if (recoveryCase.humanId) {
      // 1. Revoke all existing sessions for this human
      writes.push(tx`
        UPDATE sessions
        SET revoked_at = ${now}
        WHERE human_id = ${recoveryCase.humanId}
          AND revoked_at IS NULL
      `);

      // 2. Revoke all existing active auth subjects for this human
      writes.push(tx`
        UPDATE human_auth_subjects
        SET status = 'revoked', revoked_at = ${now}, updated_at = ${now}
        WHERE human_id = ${recoveryCase.humanId}
          AND status = 'active'
      `);
    }

    // 3. Create provisional auth subject (requires new credential from claimant post-recovery)
    // Youniverse associations are PRESERVED — do not touch them
    writes.push(tx`
      INSERT INTO human_auth_subjects (id, human_id, provider_type, subject_identifier, status, verified_at, created_at, updated_at)
      VALUES (
        ${newAuthSubjectId},
        ${humanId},
        'email_link',
        ${recoveryCase.claimantEmail},
        'active',
        ${now},
        ${now},
        ${now}
      )
      ON CONFLICT (provider_type, subject_identifier)
      DO UPDATE SET
        human_id = EXCLUDED.human_id,
        status = 'active',
        verified_at = EXCLUDED.verified_at,
        revoked_at = NULL,
        updated_at = EXCLUDED.updated_at
    `);

    // 4. Mark case completed with immutable audit log
    writes.push(tx`
      UPDATE manual_recovery_cases
      SET status = 'completed',
          completed_at = ${now},
          audit_log = ${JSON.stringify(newAuditLog)}
      WHERE case_id = ${caseId}
    `);

    return writes;
  };

  await sql.transaction(txQueries);

  return { success: true, humanId, newAuthSubjectId };
}

/**
 * Returns the full immutable audit log for a recovery case.
 */
export async function getRecoveryCaseAuditLog(
  sql: any,
  caseId: string
): Promise<AuditEntry[]> {
  const recoveryCase = await loadCase(sql, caseId);
  // Return a deep copy — immutable from caller perspective
  return JSON.parse(JSON.stringify(recoveryCase.auditLog)) as AuditEntry[];
}

/**
 * Returns the status of a recovery case (safe for public claimant access).
 */
export async function getRecoveryCaseStatus(
  sql: any,
  caseId: string
): Promise<{
  status: RecoveryCaseStatus;
  holdExpiresAt: string | null;
  approvalCount: number;
  rejectionCount: number;
}> {
  const recoveryCase = await loadCase(sql, caseId);
  return {
    status: recoveryCase.status,
    holdExpiresAt: recoveryCase.holdExpiresAt,
    approvalCount: recoveryCase.approvals.length,
    rejectionCount: recoveryCase.rejections.length,
  };
}
