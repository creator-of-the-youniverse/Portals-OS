/**
 * Structural Youniverse identity.
 *
 * This module represents identity information derived from the
 * current Youniverse route.
 *
 * It does NOT:
 * - authenticate anyone
 * - verify that an identity exists
 * - determine ownership
 * - determine whether the identity is a person or agent
 * - load persistent identity data
 *
 * Those responsibilities belong to later architectural layers.
 */

import {
  resolveYouniverseRoute,
  type YouniverseRoute,
} from "./youniverseRouting";

export type YouniverseIdentityKind = "gateway" | "identity";

export interface YouniverseIdentity {
  kind: YouniverseIdentityKind;
  hostname: string;
  username?: string;
}

/**
 * Resolve the structural identity represented by a hostname.
 */
export function resolveYouniverseIdentity(
  hostname: string
): YouniverseIdentity | null {
  const route: YouniverseRoute | null =
    resolveYouniverseRoute(hostname);

  if (!route) {
    return null;
  }

  if (route.kind === "gateway") {
    return {
      kind: "gateway",
      hostname: route.hostname,
    };
  }

  return {
    kind: "identity",
    hostname: route.hostname,
    username: route.username,
  };
}
