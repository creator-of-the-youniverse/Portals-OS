/**
 * lib/entitlements.ts
 *
 * Server-authoritative entitlement resolver for Portals OS.
 *
 * Resolves effective runtime permissions for a specific `identity_id` without
 * modifying or overloading `youniverse_identities.plan`, ordinary Stripe billing,
 * or Founding Angels memberships, and strictly scopes lifetime Genesis access to
 * the winning `identity_id` (no inheritance across sibling handles).
 */

import {
  GENESIS_DESIGNATION,
  GENESIS_ENTITLEMENT_KEY,
  GENESIS_OFFICIAL_TITLE,
  getGenesisStatusForIdentity,
  type GenesisStatusSummary,
} from "./genesisService.ts";

export interface ServerEntitlements {
  identityId: string;
  basePlan: string;
  effectiveTier: "free" | "squad+" | "platoon";
  hasLifetimeGenesisAccess: boolean;
  unlockedAllNodes: boolean;
  unlockedAllSquads: boolean;
  genesis: GenesisStatusSummary;
  foundingAngel: {
    isMember: boolean;
    memberNumber: number | null;
    status: string | null;
  };
}

function isUndefinedTableError(err: any): boolean {
  return err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message ?? ""));
}

async function queryEntitlements(db: any, identityId: string): Promise<any[]> {
  try {
    if (typeof db?.query === "function") {
      const res = await db.query(
        `SELECT entitlement_key, source_type, is_lifetime, status
         FROM public.identity_entitlements
         WHERE identity_id = $1 AND status = 'active'`,
        [identityId]
      );
      return Array.isArray(res?.rows) ? res.rows : [];
    }
    const rows = await db`
      SELECT entitlement_key, source_type, is_lifetime, status
      FROM public.identity_entitlements
      WHERE identity_id = ${identityId} AND status = 'active'
    `;
    return Array.isArray(rows) ? rows : [];
  } catch (err: any) {
    if (isUndefinedTableError(err)) return [];
    throw err;
  }
}

async function queryFoundingAngelMembership(db: any, identityId: string): Promise<any | null> {
  try {
    if (typeof db?.query === "function") {
      const res = await db.query(
        `SELECT member_number, status
         FROM public.founding_angel_memberships
         WHERE identity_id = $1
         LIMIT 1`,
        [identityId]
      );
      return res?.rows?.[0] ?? null;
    }
    const rows = await db`
      SELECT member_number, status
      FROM public.founding_angel_memberships
      WHERE identity_id = ${identityId}
      LIMIT 1
    `;
    return rows?.[0] ?? null;
  } catch (err: any) {
    if (isUndefinedTableError(err)) return null;
    throw err;
  }
}

function mapBasePlanToTier(basePlan: string): "free" | "squad+" | "platoon" {
  const normalized = (basePlan || "free").trim().toLowerCase();
  if (normalized === "platoon" || normalized === "enterprise" || normalized === "agency") {
    return "platoon";
  }
  if (normalized === "squad+" || normalized === "squad" || normalized === "builder" || normalized === "explorer") {
    return "squad+";
  }
  return "free";
}

/**
 * Resolves authoritative server entitlements scoped strictly to `identityId`.
 */
export async function resolveIdentityEntitlements(
  db: any,
  identityId: string,
  basePlan: string = "free"
): Promise<ServerEntitlements> {
  const [entitlementRows, genesisStatus, faMembership] = await Promise.all([
    queryEntitlements(db, identityId),
    getGenesisStatusForIdentity(db, identityId),
    queryFoundingAngelMembership(db, identityId),
  ]);

  const hasGenesisLedgerGrant = entitlementRows.some(
    (r) =>
      r?.entitlement_key === GENESIS_ENTITLEMENT_KEY &&
      r?.source_type === "genesis_001" &&
      r?.is_lifetime === true &&
      r?.status === "active"
  );

  // Require ledger or award row scoped to this exact identity_id
  const hasLifetimeGenesisAccess = hasGenesisLedgerGrant || genesisStatus.isWinner;

  const effectiveTier: "free" | "squad+" | "platoon" = hasLifetimeGenesisAccess
    ? "platoon"
    : mapBasePlanToTier(basePlan);

  const normalizedGenesis: GenesisStatusSummary = genesisStatus.isWinner
    ? genesisStatus
    : hasLifetimeGenesisAccess
      ? {
          isWinner: true,
          officialTitle: GENESIS_OFFICIAL_TITLE,
          designation: GENESIS_DESIGNATION,
          awardedAt: null,
          ceremonyPending: false,
        }
      : genesisStatus;

  return {
    identityId,
    basePlan: String(basePlan || "free"),
    effectiveTier,
    hasLifetimeGenesisAccess,
    unlockedAllNodes: hasLifetimeGenesisAccess || effectiveTier === "platoon",
    unlockedAllSquads: hasLifetimeGenesisAccess || effectiveTier === "platoon",
    genesis: normalizedGenesis,
    foundingAngel: {
      isMember: faMembership?.status === "active",
      memberNumber:
        typeof faMembership?.member_number === "number" ? faMembership.member_number : null,
      status: faMembership?.status ? String(faMembership.status) : null,
    },
  };
}

