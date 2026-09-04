/**
 * Repository-backed Youniverse identity resolver.
 *
 * This composes the authoritative identity repository with
 * the Youniverse identity-resolution contract.
 *
 * It does NOT:
 * - authenticate an owner
 * - prove ownership
 * - authorize capabilities
 * - register identities
 * - verify email ownership
 * - choose a persistence provider
 */

import type { YouniverseIdentityRepository } from "./youniverseIdentityRepository";
import type {
  YouniverseIdentityResolution,
  YouniverseIdentityResolver,
} from "./youniverseIdentityResolution";

export function createYouniverseIdentityResolver(
  repository: YouniverseIdentityRepository
): YouniverseIdentityResolver {
  return {
    async resolve(handle) {
      if (!handle.username) {
        return {
          status: "invalid",
          handle,
        };
      }

      const identity = await repository.findByUsername(handle.username);

      if (!identity) {
        return {
          status: "not-found",
          handle,
        };
      }

      return {
        status: "found",
        handle,
        identity,
      };
    },
  };
}
