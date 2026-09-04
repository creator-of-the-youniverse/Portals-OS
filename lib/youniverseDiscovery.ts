/**
 * ItsYouOnline @ Line discovery contract.
 *
 * This is the orchestration boundary for the public @ Line.
 *
 * It composes:
 * - handle normalization
 * - authoritative Youniverse identity resolution
 * - registration eligibility
 *
 * It does NOT:
 * - authenticate a visitor
 * - prove ownership
 * - reserve a username
 * - create a database record
 * - verify email ownership
 * - authorize capabilities
 * - choose an authentication or database provider
 */

import {
  normalizeYouniverseHandle,
  type YouniverseHandle,
} from "./youniverseHandle";
import type {
  YouniverseIdentityResolution,
  YouniverseIdentityResolver,
} from "./youniverseIdentityResolution";

export type YouniverseDiscoveryStatus =
  | "found"
  | "registration-required"
  | "invalid";

export interface YouniverseDiscoveryResult {
  status: YouniverseDiscoveryStatus;
  handle: YouniverseHandle;
  resolution: YouniverseIdentityResolution;
}

export interface YouniverseDiscovery {
  discover(value: string): Promise<YouniverseDiscoveryResult>;
}

export function createYouniverseDiscovery(
  resolver: YouniverseIdentityResolver
): YouniverseDiscovery {
  return {
    async discover(value: string): Promise<YouniverseDiscoveryResult> {
      const handle = normalizeYouniverseHandle(value);

      if (!handle.username) {
        return {
          status: "invalid",
          handle,
          resolution: {
            status: "invalid",
            handle,
          },
        };
      }

      const resolution = await resolver.resolve(handle);

      if (resolution.status === "found") {
        return {
          status: "found",
          handle,
          resolution,
        };
      }

      if (resolution.status === "not-found") {
        return {
          status: "registration-required",
          handle,
          resolution,
        };
      }

      return {
        status: "invalid",
        handle,
        resolution,
      };
    },
  };
}
