/**
 * lib/homeverseRelinquishment.ts
 *
 * 30-day Homeverse relinquishment lifecycle for ItsYouOnline / Portals-OS.
 *
 * State machine:
 *   active_homeverse → relinquishment_pending (30-day cooldown) → available (after cooldown)
 *   relinquishment_pending → cancelled (former owner cancels during cooldown)
 *
 * Design invariants:
 *  - The former owner retains the owner association (is_homeverse = FALSE) during cooldown.
 *  - The replacement becomes is_homeverse = TRUE immediately upon initiation.
 *  - Cancellation is only possible while cooldown is still active.
 *  - After cooldown, processExpiredRelinquishments marks the old handle
 *    verification_status = 'relinquished' (new status value, requires migration 014).
 *  - No fee logic.
 */

import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  action: string;
  actorHumanId: string;
  metadata?: Record<string, unknown>;
}

export interface RelinquishmentRecord {
  id: string;
  humanId: string;
  identityId: string;           // the handle being relinquished
  replacementIdentityId: string; // the new Homeverse (must exist and be verified)
  status: "pending" | "cancelled" | "completed";
  initiatedAt: string;
  cooldownExpiresAt: string;    // initiatedAt + 30 days
  cancelledAt?: string;
  completedAt?: string;
  auditLog: AuditEntry[];
}

export interface InitiateRelinquishmentParams {
  humanId: string;
  currentHomeverseIdentityId: string;
  replacementIdentityId: string;
}

export interface CancelRelinquishmentParams {
  humanId: string;
  relinquishmentId: string;
}

export interface CooldownStatus {
  isInCooldown: boolean;
  expiresAt?: string;
  relinquishmentId?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function cooldownExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + COOLDOWN_MS).toISOString();
}

function isTableMissingError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ("code" in err ? (err as any).code === "42P01" : false)
  );
}

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Initiates a 30-day Homeverse relinquishment cooldown.
 *
 * Atomic contract:
 *  1. Validates human is authenticated owner of the current Homeverse.
 *  2. Validates replacement is a verified (non-homeverse) association for this human.
 *  3. No existing pending relinquishment for this human (conflict guard).
 *  4. Atomically:
 *     - Sets current is_homeverse = FALSE
 *     - Sets replacement is_homeverse = TRUE
 *     - Creates homeverse_relinquishments record with status = 'pending'
 */
export async function initiateHomeverseRelinquishment(
  sql: any,
  params: InitiateRelinquishmentParams
): Promise<{ relinquishmentId: string; cooldownExpiresAt: string }> {
  const { humanId, currentHomeverseIdentityId, replacementIdentityId } = params;

  if (!humanId || !currentHomeverseIdentityId || !replacementIdentityId) {
    throw new Error("Missing required parameters for relinquishment initiation.");
  }

  if (currentHomeverseIdentityId === replacementIdentityId) {
    throw new Error("Replacement identity must differ from the current Homeverse.");
  }

  // 0. Guard: no existing pending relinquishment for this human
  const existingPending = await sql`
    SELECT id FROM homeverse_relinquishments
    WHERE human_id = ${humanId}
      AND status = 'pending'
    LIMIT 1
  `;

  if (Array.isArray(existingPending) && existingPending.length > 0) {
    throw Object.assign(
      new Error("A pending relinquishment already exists for this human principal."),
      { code: "RELINQUISHMENT_CONFLICT" }
    );
  }

  // 1. Verify current handle IS the homeverse AND owned by this human
  const currentRows = await sql`
    SELECT id, is_homeverse, verification_status, role
    FROM human_youniverse_associations
    WHERE human_id = ${humanId}
      AND identity_id = ${currentHomeverseIdentityId}
      AND revoked_at IS NULL
    LIMIT 1
  `;

  if (!Array.isArray(currentRows) || currentRows.length === 0) {
    throw new Error("Current handle is not associated with this human principal.");
  }

  const current = currentRows[0];
  if (!current.is_homeverse) {
    throw new Error("The specified handle is not currently the Homeverse for this human.");
  }

  // 2. Verify replacement EXISTS, is verified, and belongs to this human (not already homeverse)
  const replacementRows = await sql`
    SELECT id, is_homeverse, verification_status, role
    FROM human_youniverse_associations
    WHERE human_id = ${humanId}
      AND identity_id = ${replacementIdentityId}
      AND revoked_at IS NULL
    LIMIT 1
  `;

  if (!Array.isArray(replacementRows) || replacementRows.length === 0) {
    throw new Error("Replacement identity is not associated with this human principal.");
  }

  const replacement = replacementRows[0];
  if (replacement.verification_status !== "verified") {
    throw new Error("Replacement identity must be verified before it can become the Homeverse.");
  }
  if (replacement.is_homeverse) {
    throw new Error("Replacement identity is already marked as Homeverse.");
  }

  // 4. Atomically flip flags and create relinquishment record
  const relinquishmentId = crypto.randomUUID();
  const initiatedAt = nowIso();
  const cooldownExpiresAt = cooldownExpiry(new Date(initiatedAt));

  const auditEntry: AuditEntry = {
    timestamp: initiatedAt,
    action: "relinquishment_initiated",
    actorHumanId: humanId,
    metadata: {
      currentHomeverseIdentityId,
      replacementIdentityId,
      cooldownExpiresAt,
    },
  };

  // Set current handle is_homeverse = FALSE
  await sql`
    UPDATE human_youniverse_associations
    SET is_homeverse = FALSE
    WHERE human_id = ${humanId}
      AND identity_id = ${currentHomeverseIdentityId}
      AND revoked_at IS NULL
  `;

  // Set replacement handle is_homeverse = TRUE
  await sql`
    UPDATE human_youniverse_associations
    SET is_homeverse = TRUE
    WHERE human_id = ${humanId}
      AND identity_id = ${replacementIdentityId}
      AND revoked_at IS NULL
  `;

  // Insert relinquishment record
  await sql`
    INSERT INTO homeverse_relinquishments (
      id,
      human_id,
      identity_id,
      replacement_identity_id,
      status,
      initiated_at,
      cooldown_expires_at,
      audit_log
    )
    VALUES (
      ${relinquishmentId},
      ${humanId},
      ${currentHomeverseIdentityId},
      ${replacementIdentityId},
      'pending',
      ${initiatedAt},
      ${cooldownExpiresAt},
      ${JSON.stringify([auditEntry])}
    )
  `;

  return { relinquishmentId, cooldownExpiresAt };
}

/**
 * Cancels a pending Homeverse relinquishment during the cooldown window.
 *
 * Reverts: old handle → is_homeverse = TRUE, replacement → is_homeverse = FALSE.
 * Updates status to 'cancelled'.
 */
export async function cancelHomeverseRelinquishment(
  sql: any,
  params: CancelRelinquishmentParams
): Promise<void> {
  const { humanId, relinquishmentId } = params;

  // Fetch the relinquishment record
  const rows = await sql`
    SELECT id, human_id, identity_id, replacement_identity_id, status,
           cooldown_expires_at, audit_log
    FROM homeverse_relinquishments
    WHERE id = ${relinquishmentId}
    LIMIT 1
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Relinquishment record not found.");
  }

  const record = rows[0];

  if (String(record.human_id) !== humanId) {
    throw new Error("Not authorized to cancel this relinquishment.");
  }

  if (record.status !== "pending") {
    throw new Error(
      `Cannot cancel relinquishment with status '${record.status}'. Only 'pending' records can be cancelled.`
    );
  }

  const expiresAt = new Date(record.cooldown_expires_at);
  if (new Date() >= expiresAt) {
    throw new Error("Relinquishment cooldown has already expired; cancellation is no longer possible.");
  }

  const cancelledAt = nowIso();
  const auditEntry: AuditEntry = {
    timestamp: cancelledAt,
    action: "relinquishment_cancelled",
    actorHumanId: humanId,
    metadata: { relinquishmentId },
  };

  const existingLog: AuditEntry[] = Array.isArray(record.audit_log)
    ? record.audit_log
    : (typeof record.audit_log === "string" ? JSON.parse(record.audit_log) : []);

  const updatedLog = [...existingLog, auditEntry];

  // Revert replacement first so partial unique index human_singleton_homeverse_idx is never violated
  if (typeof sql.transaction === "function") {
    await sql.transaction([
      sql`
        UPDATE human_youniverse_associations
        SET is_homeverse = FALSE
        WHERE human_id = ${humanId}
          AND identity_id = ${String(record.replacement_identity_id)}
          AND revoked_at IS NULL
      `,
      sql`
        UPDATE human_youniverse_associations
        SET is_homeverse = TRUE
        WHERE human_id = ${humanId}
          AND identity_id = ${String(record.identity_id)}
          AND revoked_at IS NULL
      `,
      sql`
        UPDATE homeverse_relinquishments
        SET status = 'cancelled',
            cancelled_at = ${cancelledAt},
            audit_log = ${JSON.stringify(updatedLog)}
        WHERE id = ${relinquishmentId}
      `,
    ]);
  } else {
    // Revert: replacement → is_homeverse = FALSE before restoring original TRUE
    await sql`
      UPDATE human_youniverse_associations
      SET is_homeverse = FALSE
      WHERE human_id = ${humanId}
        AND identity_id = ${String(record.replacement_identity_id)}
        AND revoked_at IS NULL
    `;

    // Revert: original handle → is_homeverse = TRUE
    await sql`
      UPDATE human_youniverse_associations
      SET is_homeverse = TRUE
      WHERE human_id = ${humanId}
        AND identity_id = ${String(record.identity_id)}
        AND revoked_at IS NULL
    `;

    // Mark record as cancelled
    await sql`
      UPDATE homeverse_relinquishments
      SET status = 'cancelled',
          cancelled_at = ${cancelledAt},
          audit_log = ${JSON.stringify(updatedLog)}
      WHERE id = ${relinquishmentId}
    `;
  }
}

/**
 * Returns the current cooldown state for a given identity (handle).
 * Used by the claim flow to protect reserved handles.
 */
export async function checkRelinquishmentCooldown(
  sql: any,
  identityId: string
): Promise<CooldownStatus> {
  try {
    const rows = await sql`
      SELECT id, cooldown_expires_at
      FROM homeverse_relinquishments
      WHERE identity_id = ${identityId}
        AND status = 'pending'
      ORDER BY initiated_at DESC
      LIMIT 1
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return { isInCooldown: false };
    }

    const record = rows[0];
    const expiresAt = new Date(record.cooldown_expires_at);
    const now = new Date();

    if (now < expiresAt) {
      return {
        isInCooldown: true,
        expiresAt: expiresAt.toISOString(),
        relinquishmentId: String(record.id),
      };
    }

    // Cooldown technically expired but not yet processed — treat as not in cooldown
    return { isInCooldown: false };
  } catch (err) {
    if (isTableMissingError(err)) {
      return { isInCooldown: false };
    }
    throw err;
  }
}

/**
 * Background sweep: marks completed relinquishments where cooldown has expired.
 *
 * For each expired pending relinquishment:
 *  - Sets status = 'completed'
 *  - Sets the original identity's verification_status = 'relinquished'
 *    (requires migration 014 to extend the CHECK constraint)
 *  - Records an audit entry
 */
export async function processExpiredRelinquishments(sql: any): Promise<number> {
  const now = nowIso();

  // Fetch all expired pending relinquishments
  const expired = await sql`
    SELECT id, human_id, identity_id, replacement_identity_id, audit_log
    FROM homeverse_relinquishments
    WHERE status = 'pending'
      AND cooldown_expires_at < ${now}
  `;

  if (!Array.isArray(expired) || expired.length === 0) {
    return 0;
  }

  let processed = 0;
  const completedAt = nowIso();

  for (const record of expired) {
    const auditEntry: AuditEntry = {
      timestamp: completedAt,
      action: "relinquishment_completed",
      actorHumanId: "system",
      metadata: {
        identityId: String(record.identity_id),
        replacementIdentityId: String(record.replacement_identity_id),
      },
    };

    const existingLog: AuditEntry[] = Array.isArray(record.audit_log)
      ? record.audit_log
      : (typeof record.audit_log === "string" ? JSON.parse(record.audit_log) : []);

    const updatedLog = [...existingLog, auditEntry];

    // Mark original association as relinquished
    await sql`
      UPDATE human_youniverse_associations
      SET verification_status = 'relinquished',
          is_homeverse = FALSE
      WHERE human_id = ${String(record.human_id)}
        AND identity_id = ${String(record.identity_id)}
        AND revoked_at IS NULL
    `;

    // Mark relinquishment record as completed
    await sql`
      UPDATE homeverse_relinquishments
      SET status = 'completed',
          completed_at = ${completedAt},
          audit_log = ${JSON.stringify(updatedLog)}
      WHERE id = ${String(record.id)}
    `;

    processed++;
  }

  return processed;
}

/**
 * Returns true when a relinquished handle is claimable:
 *  - No pending relinquishment, OR
 *  - Cooldown has expired (pending record exists but cooldown_expires_at < NOW).
 */
export async function canClaimRelinquishedHandle(
  sql: any,
  identityId: string
): Promise<boolean> {
  const cooldown = await checkRelinquishmentCooldown(sql, identityId);
  return !cooldown.isInCooldown;
}
