import type {
  YouniverseIdentityResolver,
  YouniverseIdentityResolution,
} from "../lib/youniverseIdentityResolution";
import type { YouniverseHandle } from "../lib/youniverseHandle";

export function createYouniverseIdentityApiResolver(): YouniverseIdentityResolver {
  return {
    async resolve(
      handle: YouniverseHandle
    ): Promise<YouniverseIdentityResolution> {
      const params = new URLSearchParams({
        username: handle.username,
      });

      const response = await fetch(
        `/api/youniverseIdentity?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (response.status === 404) {
        return {
          status: "not-found",
          handle,
        };
      }

      if (!response.ok) {
        return {
          status: "invalid",
          handle,
        };
      }

      const data = await response.json();

      if (data?.status !== "found" || !data.identity) {
        return {
          status: "invalid",
          handle,
        };
      }

      return {
        status: "found",
        handle,
        identity: data.identity,
      };
    },
  };
}
