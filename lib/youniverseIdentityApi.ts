import type { YouniverseIdentityResolver } from "../lib/youniverseIdentityResolution";
import { normalizeYouniverseHandle } from "../lib/youniverseHandle.js";

export interface YouniverseIdentityApiDependencies {
  resolver: YouniverseIdentityResolver;
}

export function createYouniverseIdentityHandler(
  dependencies: YouniverseIdentityApiDependencies
) {
  return async (req: any, res: any) => {
    if (req.method !== "GET") {
      return res.status(405).json({
        status: "method-not-allowed",
      });
    }

    const username = req.query?.username ?? "";
    const handle = normalizeYouniverseHandle(String(username));

    if (!handle.username) {
      return res.status(400).json({
        status: "invalid",
      });
    }

    const resolution = await dependencies.resolver.resolve(handle);

    if (resolution.status === "invalid") {
      return res.status(400).json({
        status: "invalid",
      });
    }

    if (resolution.status === "not-found") {
      return res.status(404).json({
        status: "not-found",
      });
    }

    return res.status(200).json({
      status: "found",
      identity: resolution.identity,
    });
  };
}
