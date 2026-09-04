/**
 * Youniverse identity resolution contract.
 *
 * This defines the boundary between the @ Line and the
 * authoritative ItsYouOnline identity system.
 *
 * It does NOT:
 * - query a database
 * - create an account
 * - reserve a username
 * - authenticate an owner
 * - authorize capabilities
 * - choose an authentication or database provider
 */

import type { YouniverseHandle } from "./youniverseHandle";
import type { YouniverseIdentityRecord } from "./youniverseIdentityTypes";

export type YouniverseIdentityResolutionStatus =
  | "found"
  | "not-found"
  | "invalid";

export interface YouniverseIdentityResolution {
  status: YouniverseIdentityResolutionStatus;
  handle: YouniverseHandle;
  identity?: YouniverseIdentityRecord;
}

export interface YouniverseIdentityResolver {
  resolve(
    handle: YouniverseHandle
  ): Promise<YouniverseIdentityResolution>;
}
