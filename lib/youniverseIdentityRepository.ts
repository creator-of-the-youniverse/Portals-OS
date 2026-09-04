/**
 * Authoritative Youniverse identity repository boundary.
 *
 * This is the persistence boundary for ItsYouOnline identities.
 *
 * The repository is intentionally provider-neutral.
 * A future implementation may use PostgreSQL, Firestore,
 * Supabase, or another persistence system without changing
 * the identity contracts above it.
 *
 * It does NOT:
 * - authenticate an owner
 * - prove ownership
 * - authorize capabilities
 * - verify email ownership
 * - choose a persistence provider
 * - implement HTTP/API routing
 */

import type { YouniverseIdentityRecord } from "./youniverseIdentityTypes";

export interface YouniverseIdentityRepository {
  findByUsername(
    username: string
  ): Promise<YouniverseIdentityRecord | null>;

  create(
    identity: YouniverseIdentityRecord
  ): Promise<YouniverseIdentityRecord>;
}
