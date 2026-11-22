/**
 * api/auth/recovery/manual.ts
 *
 * Layer 3 — Controlled Manual Recovery Workflow API.
 *
 * Operations:
 *  - POST (unauthenticated or claimant): Submit a manual recovery case.
 *  - POST ?action=review (authenticated reviewer): Submit reviewer approval or rejection.
 *  - POST ?action=execute (internal admin only): Execute recovery after hold expires.
 *    Requires X-Portals-Internal: <PORTALS_INTERNAL_SECRET> header.
 *  - GET: Public/claimant status lookup by caseId.
 *
 * Security:
 *  - CSRF enforced on all mutations.
 *  - Review action requires authenticated human session.
 *  - Execute action requires PORTALS_INTERNAL_SECRET token (not a user session).
 *  - Case creation does NOT grant any access.
 *  - All state is SQL-persisted (manual_recovery_cases table, Migration 014).
 */

import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget, enforceAntiCsrf, validateRequestSessionWithCookieFallback } from "../../../creatorOwnership.ts";
import {
  createManualRecoveryCase,
  submitReviewerApproval,
  checkHoldExpiry,
  executeRecovery,
  getRecoveryCaseStatus,
} from "../../../manualRecovery.ts";

export interface ManualRecoveryHandlerDeps {
  sql?: any;
  databaseUrl?: string;
  validateSession?: typeof validateRequestSessionWithCookieFallback;
  env?: Record<string, string | undefined>;
}

export default async function handler(req: any, res: any, deps: ManualRecoveryHandlerDeps = {}) {
  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ error: "configuration_error", message: "Database not configured." });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const sql = deps.sql ?? neon(databaseUrl!);
  const action = req.query?.action;

  // ── GET: Check case status ───────────────────────────────────────────────
  if (req.method === "GET") {
    const caseId = req.query?.caseId;
    if (!caseId || typeof caseId !== "string") {
      return res.status(400).json({ error: "invalid_input", message: "caseId query parameter required." });
    }

    try {
      const status = await getRecoveryCaseStatus(sql, caseId);
      return res.status(200).json({ ok: true, caseId, ...status });
    } catch (err: any) {
      return res.status(404).json({ error: "case_not_found", message: err.message });
    }
  }

  // ── POST: Mutations ──────────────────────────────────────────────────────
  if (req.method === "POST") {
    const csrf = enforceAntiCsrf(req, deps.env ?? process.env, {
      allowSameOriginTenantSubdomain: true,
    });
    if (csrf.blocked) {
      return res.status(403).json({ error: "csrf_rejected", message: csrf.reason });
    }

    // 1. Execute action — requires internal service token (NOT a user session)
    if (action === "execute") {
      const internalHeader = req.headers?.["x-portals-internal"];
      const internalSecret = (process.env.PORTALS_INTERNAL_SECRET ?? "").trim();

      if (!internalSecret) {
        return res.status(503).json({
          error: "not_configured",
          message: "Internal recovery execution is not configured on this deployment.",
        });
      }

      if (!internalHeader || internalHeader !== internalSecret) {
        return res.status(401).json({
          error: "unauthorized",
          message: "Authorized internal token required for recovery execution.",
        });
      }

      const { caseId } = req.body ?? {};
      if (!caseId) {
        return res.status(400).json({ error: "invalid_input", message: "caseId required." });
      }

      try {
        const result = await executeRecovery(sql, caseId);
        return res.status(200).json({ ok: true, message: "Recovery executed successfully.", ...result });
      } catch (err: any) {
        return res.status(400).json({ error: "execution_blocked", message: err.message });
      }
    }

    // 2. Review action — requires authenticated reviewer session AND explicit reviewer privilege
    if (action === "review") {
      const validateFn = deps.validateSession ?? validateRequestSessionWithCookieFallback;
      const session = await validateFn(sql, req);
      if (!session.ok || !session.humanId) {
        return res.status(401).json({ error: "unauthenticated", message: "Reviewer session required." });
      }

      const internalHeader = req.headers?.["x-portals-internal"];
      const internalSecret = (process.env.PORTALS_INTERNAL_SECRET ?? "").trim();
      const hasInternalAuth = Boolean(internalSecret && internalHeader === internalSecret);
      const allowedReviewers = (process.env.RECOVERY_REVIEWER_HUMAN_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isAllowedReviewer = hasInternalAuth || allowedReviewers.includes(session.humanId);
      if (!isAllowedReviewer) {
        return res.status(403).json({
          error: "forbidden",
          message: "Authorized recovery reviewer privilege required.",
        });
      }

      const { caseId, decision, notes } = req.body ?? {};
      if (!caseId || !decision || (decision !== "approved" && decision !== "rejected")) {
        return res.status(400).json({ error: "invalid_input", message: "caseId and decision ('approved' | 'rejected') required." });
      }

      try {
        await submitReviewerApproval(sql, {
          caseId,
          reviewerId: session.humanId,
          decision,
          notes: notes ?? "",
        });
        const updated = await getRecoveryCaseStatus(sql, caseId);
        return res.status(200).json({ ok: true, message: `Review submitted: ${decision}`, ...updated });
      } catch (err: any) {
        return res.status(400).json({ error: "review_rejected", message: err.message });
      }
    }

    // 3. Default POST: Submit new recovery case (unauthenticated claimant)
    const { claimantEmail, evidenceDescription, contactChannels } = req.body ?? {};
    if (!claimantEmail || typeof claimantEmail !== "string") {
      return res.status(400).json({ error: "invalid_input", message: "claimantEmail is required." });
    }

    const cleanClaimantEmail = claimantEmail.trim().toLowerCase();
    let resolvedHumanId: string | undefined;
    try {
      const subjectRows = await sql`
        SELECT human_id FROM human_auth_subjects
        WHERE subject_identifier = ${cleanClaimantEmail}
          AND status = 'active'
        LIMIT 1
      `;
      if (Array.isArray(subjectRows) && subjectRows.length > 0 && subjectRows[0].human_id) {
        resolvedHumanId = String(subjectRows[0].human_id);
      }
    } catch {
      resolvedHumanId = undefined;
    }

    try {
      const caseId = await createManualRecoveryCase(sql, {
        claimantEmail: cleanClaimantEmail,
        evidenceDescription: evidenceDescription ?? "",
        contactChannels: Array.isArray(contactChannels) ? contactChannels : [],
        humanId: resolvedHumanId,
      });

      return res.status(201).json({
        ok: true,
        caseId,
        message: "Manual recovery case created. Two authorized reviewer approvals and a 30-day hold are required before credentials can be reissued.",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "server_error", message: err.message });
    }
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
