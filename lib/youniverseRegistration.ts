/**
 * Youniverse registration contract.
 *
 * This defines what ItsYouOnline needs in order to create
 * a new Youniverse identity.
 *
 * The @ Line is the discovery interface.
 * Initial email is registration infrastructure.
 *
 * It does NOT:
 * - create a database record
 * - reserve a username
 * - authenticate the owner
 * - prove email ownership
 * - authorize capabilities
 * - choose an authentication or database provider
 */

import type { YouniverseIdentityRecord } from "./youniverseIdentityTypes";
import type { YouniverseHandle } from "./youniverseHandle";

export interface YouniverseRegistrationRequest {
  handle: YouniverseHandle;
  displayName: string;
  email: string;
}

export type YouniverseRegistrationStatus =
  | "created"
  | "username-taken"
  | "invalid";

export interface YouniverseRegistrationResult {
  status: YouniverseRegistrationStatus;
  request: YouniverseRegistrationRequest;
  identity?: YouniverseIdentityRecord;
}

export interface YouniverseRegistrar {
  register(
    request: YouniverseRegistrationRequest
  ): Promise<YouniverseRegistrationResult>;
}
