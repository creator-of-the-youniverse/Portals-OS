/**
 * Youniverse application bootstrap.
 *
 * This is the boundary between browser runtime information and
 * the application's structural Youniverse identity.
 *
 * It does NOT:
 * - authenticate the visitor
 * - query a backend
 * - determine ownership
 * - determine public vs owner mode
 * - determine whether an identity exists
 *
 * Those responsibilities belong to later layers.
 */

import {
  resolveYouniverseIdentity,
  type YouniverseIdentity,
} from "./youniverseIdentity";

export interface YouniverseBootstrap {
  identity: YouniverseIdentity | null;
}

/**
 * Bootstrap the application from a browser hostname.
 *
 * The hostname is supplied explicitly so this function remains
 * deterministic and easy to test.
 */
export function bootstrapYouniverse(
  hostname: string,
  search?: string
): YouniverseBootstrap {
  return {
    identity: resolveYouniverseIdentity(hostname, search),
  };
}
