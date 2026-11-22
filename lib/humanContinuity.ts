/**
 * lib/humanContinuity.ts
 *
 * Core Human Continuity Identity and Association model for Portals-OS / ItsYouOnline.
 *
 * Implements Option A (Explicit Authenticated Claim):
 *  - Human continuity identity is the root human principal (human_continuity_identities).
 *  - Authentication subjects (human_auth_subjects) decouple authentication methods from human identity.
 *  - Youniverse identities (youniverse_identities) represent digital environment territories.
 *  - Human-to-Youniverse associations (human_youniverse_associations) record explicit role-based access.
 *  - ONEAI continuity instances (oneai_continuity_instances) remain distinct.
 *  - Prohibits automatic merging of human identities on email equality.
 */

import crypto from "node:crypto";
import { type NeonQueryFunction } from "@neondatabase/serverless";

export interface HumanContinuityIdentity {
  humanId: string;
  status: "active" | "suspended" | "deactivated";
  createdAt: string;
  updatedAt: string;
}

export interface HumanAuthSubject {
  id: string;
  humanId: string;
  providerType: "password" | "passkey" | "webauthn" | "email_link";
  subjectIdentifier: string;
  status: "pending" | "active" | "revoked";
  verifiedAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface HumanPasswordRecord {
  authSubjectId: string;
  passwordHash: string;
  salt: string;
  algorithm: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanYouniverseAssociation {
  id: string;
  humanId: string;
  identityId: string;
  role: "owner" | "operator" | "participant";
  verificationStatus: "provisional" | "verified" | "suspended" | "revoked" | "relinquished";
  isHomeverse: boolean;
  requiresReverification: boolean;
  reverificationRequiredAt: string | null;
  verifiedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
}

export type AccessDecisionOutcome =
  | { allowed: true; isOwner: true; role: "owner"; association: HumanYouniverseAssociation }
  | { allowed: true; isOwner: false; role: "operator"; association: HumanYouniverseAssociation }
  | { allowed: true; isOwner: false; role: "participant"; association: HumanYouniverseAssociation }
  | { allowed: false; isOwner: false; reason: "not_associated" }
  | { allowed: false; isOwner: false; reason: "association_provisional" }
  | { allowed: false; isOwner: false; reason: "association_suspended" }
  | { allowed: false; isOwner: false; reason: "association_revoked" }
  | { allowed: false; isOwner: false; reason: "reverification_required" }
  | { allowed: false; isOwner: false; reason: "human_inactive" }
  | { allowed: false; isOwner: false; reason: "youniverse_not_live" }
  | { allowed: false; isOwner: false; reason: "youniverse_not_found" };

/** Normalize email according to canonical whitespace and lowercase rules. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Check if database error is table undefined (42P01). */
function isTableMissingError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ("code" in err ? (err as any).code === "42P01" : false)
  );
}

/**
 * Resolves an active Human Continuity Principal and its password credentials by normalized email.
 */
export async function getHumanAuthSubjectByEmail(
  sql: any,
  email: string
): Promise<{ human: HumanContinuityIdentity; authSubject: HumanAuthSubject; password: HumanPasswordRecord } | null> {
  const cleanEmail = normalizeEmail(email);

  try {
    const rows = await sql`
      SELECT 
        h.human_id, h.status as human_status, h.created_at as human_created_at, h.updated_at as human_updated_at,
        s.id as subject_id, s.provider_type, s.subject_identifier, s.status as subject_status, s.verified_at, s.revoked_at, s.created_at as subject_created_at,
        p.password_hash, p.salt, p.algorithm, p.created_at as password_created_at, p.updated_at as password_updated_at
      FROM human_continuity_identities h
      JOIN human_auth_subjects s ON s.human_id = h.human_id
      JOIN human_passwords p ON p.auth_subject_id = s.id
      WHERE s.provider_type = 'password'
        AND s.subject_identifier = ${cleanEmail}
        AND s.status = 'active'
        AND h.status = 'active'
      LIMIT 1
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      human: {
        humanId: String(row.human_id),
        status: row.human_status,
        createdAt: new Date(row.human_created_at).toISOString(),
        updatedAt: new Date(row.human_updated_at).toISOString(),
      },
      authSubject: {
        id: String(row.subject_id),
        humanId: String(row.human_id),
        providerType: row.provider_type,
        subjectIdentifier: row.subject_identifier,
        status: row.subject_status,
        verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : "",
        revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
        createdAt: new Date(row.subject_created_at).toISOString(),
      },
      password: {
        authSubjectId: String(row.subject_id),
        passwordHash: String(row.password_hash),
        salt: String(row.salt),
        algorithm: String(row.algorithm),
        createdAt: new Date(row.password_created_at).toISOString(),
        updatedAt: new Date(row.password_updated_at).toISOString(),
      },
    };
  } catch (err) {
    if (isTableMissingError(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * Creates a new Human Continuity Principal with an enrolled password auth subject.
 * Enforces Option A: Established upon verified enrollment.
 */
export async function createHumanPrincipalWithPassword(
  sql: any,
  params: {
    email: string;
    passwordHash: string;
    salt: string;
    algorithm?: string;
  }
): Promise<{ humanId: string; authSubjectId: string }> {
  const cleanEmail = normalizeEmail(params.email);
  const algorithm = params.algorithm ?? "scrypt-v1";

  const humanId = crypto.randomUUID();
  const authSubjectId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await sql`
    INSERT INTO human_continuity_identities (
      human_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${humanId},
      'active',
      ${nowIso},
      ${nowIso}
    )
  `;

  await sql`
    INSERT INTO human_auth_subjects (
      id,
      human_id,
      provider_type,
      subject_identifier,
      status,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      ${authSubjectId},
      ${humanId},
      'password',
      ${cleanEmail},
      'active',
      ${nowIso},
      ${nowIso},
      ${nowIso}
    )
  `;

  await sql`
    INSERT INTO human_passwords (
      auth_subject_id,
      password_hash,
      salt,
      algorithm,
      created_at,
      updated_at
    )
    VALUES (
      ${authSubjectId},
      ${params.passwordHash},
      ${params.salt},
      ${algorithm},
      ${nowIso},
      ${nowIso}
    )
  `;

  return { humanId, authSubjectId };
}

/**
 * Evaluates the 5-stage authorization chain for an authenticated human principal
 * against a requested Youniverse handle.
 */
export async function resolveHumanYouniverseAccess(
  sql: any,
  humanId: string,
  targetHandle: string
): Promise<AccessDecisionOutcome> {
  const cleanHandle = targetHandle.toLowerCase().replace(/^@/, "").trim();

  try {
    // 1. Resolve target Youniverse
    const youniverseRows = await sql`
      SELECT identity_id, username, is_live, email_verified_at, plan
      FROM youniverse_identities
      WHERE username = ${cleanHandle}
      LIMIT 1
    `;

    if (!Array.isArray(youniverseRows) || youniverseRows.length === 0) {
      return { allowed: false, isOwner: false, reason: "youniverse_not_found" };
    }

    const youniverse = youniverseRows[0];
    if (!youniverse.is_live) {
      return { allowed: false, isOwner: false, reason: "youniverse_not_live" };
    }

    // 2. Verify human principal active status
    const humanRows = await sql`
      SELECT status FROM human_continuity_identities
      WHERE human_id = ${humanId}
      LIMIT 1
    `;

    if (!Array.isArray(humanRows) || humanRows.length === 0 || humanRows[0].status !== "active") {
      return { allowed: false, isOwner: false, reason: "human_inactive" };
    }

    // 3. Query explicit human-to-Youniverse association
    const assocRows = await sql`
      SELECT 
        id, human_id, identity_id, role, verification_status,
        is_homeverse, requires_reverification, reverification_required_at,
        verified_at, revoked_at, revocation_reason, created_at
      FROM human_youniverse_associations
      WHERE human_id = ${humanId}
        AND identity_id = ${youniverse.identity_id}
      LIMIT 1
    `;

    if (!Array.isArray(assocRows) || assocRows.length === 0) {
      return { allowed: false, isOwner: false, reason: "not_associated" };
    }

    const row = assocRows[0];
    const association: HumanYouniverseAssociation = {
      id: String(row.id),
      humanId: String(row.human_id),
      identityId: String(row.identity_id),
      role: row.role,
      verificationStatus: row.verification_status,
      isHomeverse: Boolean(row.is_homeverse),
      requiresReverification: Boolean(row.requires_reverification),
      reverificationRequiredAt: row.reverification_required_at ? new Date(row.reverification_required_at).toISOString() : null,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : "",
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      revocationReason: row.revocation_reason ? String(row.revocation_reason) : null,
      createdAt: new Date(row.created_at).toISOString(),
    };

    // Fail-closed status checks
    if (association.verificationStatus === "revoked" || association.revokedAt !== null) {
      return { allowed: false, isOwner: false, reason: "association_revoked" };
    }
    if (association.verificationStatus === "suspended") {
      return { allowed: false, isOwner: false, reason: "association_suspended" };
    }
    if (association.verificationStatus === "provisional") {
      return { allowed: false, isOwner: false, reason: "association_provisional" };
    }
    if (association.requiresReverification) {
      return { allowed: false, isOwner: false, reason: "reverification_required" };
    }
    // Any non-verified state (e.g. 'relinquished') must fail closed
    if (association.verificationStatus !== "verified") {
      return { allowed: false, isOwner: false, reason: "not_associated" };
    }

    // Granted role evaluation
    if (association.role === "owner") {
      return { allowed: true, isOwner: true, role: "owner", association };
    }
    if (association.role === "operator") {
      return { allowed: true, isOwner: false, role: "operator", association };
    }
    if (association.role === "participant") {
      return { allowed: true, isOwner: false, role: "participant", association };
    }

    return { allowed: false, isOwner: false, reason: "not_associated" };
  } catch (err) {
    if (isTableMissingError(err)) {
      return { allowed: false, isOwner: false, reason: "not_associated" };
    }
    throw err;
  }
}

/**
 * Explicitly links an existing or new Youniverse to an authenticated human principal.
 * Option A Rule: Subsequent Youniverse claims or links require active authentication as that human.
 */
export async function linkYouniverseToHuman(
  sql: any,
  params: {
    humanId: string;
    identityId: string;
    role: "owner" | "operator" | "participant";
    isHomeverse?: boolean;
    verificationStatus?: "provisional" | "verified";
  }
): Promise<string> {
  const isHomeverse = params.isHomeverse ?? false;
  const verificationStatus = params.verificationStatus ?? "verified";
  const nowIso = new Date().toISOString();
  const associationId = crypto.randomUUID();

  // If this association is set as Homeverse, ensure the human does not already have an active Homeverse
  if (isHomeverse) {
    const existingHomeverse = await sql`
      SELECT id FROM human_youniverse_associations
      WHERE human_id = ${params.humanId}
        AND is_homeverse = TRUE
        AND revoked_at IS NULL
      LIMIT 1
    `;
    if (Array.isArray(existingHomeverse) && existingHomeverse.length > 0) {
      throw new Error("Human principal already has an active Homeverse. Cannot set multiple Homeverses.");
    }
  }

  await sql`
    INSERT INTO human_youniverse_associations (
      id,
      human_id,
      identity_id,
      role,
      verification_status,
      is_homeverse,
      requires_reverification,
      verified_at,
      created_at
    )
    VALUES (
      ${associationId},
      ${params.humanId},
      ${params.identityId},
      ${params.role},
      ${verificationStatus},
      ${isHomeverse},
      FALSE,
      ${verificationStatus === "verified" ? nowIso : null},
      ${nowIso}
    )
    ON CONFLICT (human_id, identity_id, role) DO UPDATE
    SET verification_status = EXCLUDED.verification_status,
        verified_at = EXCLUDED.verified_at
  `;

  return associationId;
}
