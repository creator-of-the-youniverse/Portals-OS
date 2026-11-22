/**
 * Authoritative owner-account contract.
 *
 * Separates the human-level owner account (`owner_accounts`) from individual
 * Youniverse identities (`youniverse_identities`) and tracks per-Youniverse
 * ownership memberships (`youniverse_owner_memberships`).
 */

export interface YouniverseOwnerAccount {
  accountId: string;
  identityId: string;
  authenticationSubject: string;
  createdAt: string;
}

export interface OwnerAccountRecord {
  accountId: string;
  primaryEmail: string;
  emailVerifiedAt: string | null;
  isCreator: boolean;
  creatorProvisionedAt: string | null;
  creatorProvisionedBy: string | null;
  status: "active" | "suspended" | "revoked";
  createdAt: string;
}

export interface YouniverseOwnerMembershipRecord {
  id: string;
  accountId: string;
  identityId: string;
  role: "owner";
  status: "active" | "suspended" | "revoked";
  claimSource: "standard" | "creator_override" | "paid" | "backfill";
  verifiedAt: string | null;
  createdAt: string;
}
