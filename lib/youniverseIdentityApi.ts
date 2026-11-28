import type { YouniverseIdentityResolver } from "../lib/youniverseIdentityResolution";
import type {
  PublicYouniverseIdentity,
  YouniverseIdentityType,
} from "./youniverseIdentityTypes";
import { normalizeYouniverseHandle } from "./youniverseHandle.ts";

export interface YouniverseIdentityApiDependencies {
  resolver: YouniverseIdentityResolver;
}

const VALID_IDENTITY_TYPES = new Set<YouniverseIdentityType>(["person", "agent"]);

/**
 * Projects any identity object onto the strict public identity allowlist.
 * Fails closed and returns `null` if required public fields are invalid.
 * Private fields (`email`, `plan`, `identityId`, nested objects, future columns)
 * are never read or serialized.
 */
export function toPublicYouniverseIdentity(
  candidate: unknown
): PublicYouniverseIdentity | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const displayName =
    typeof record.displayName === "string" ? record.displayName.trim() : "";
  const subdomain =
    typeof record.subdomain === "string" ? record.subdomain.trim() : "";
  const identityType =
    typeof record.identityType === "string" &&
    VALID_IDENTITY_TYPES.has(record.identityType as YouniverseIdentityType)
      ? (record.identityType as YouniverseIdentityType)
      : null;
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt.trim() : "";

  if (!username || !displayName || !subdomain || !identityType || !createdAt) {
    return null;
  }

  return {
    username,
    displayName,
    subdomain,
    identityType,
    createdAt,
  };
}

export function createYouniverseIdentityHandler(
  dependencies: YouniverseIdentityApiDependencies
) {
  return async (req: any, res: any) => {
    if (req.method !== "GET") {
      if (typeof res.setHeader === "function") {
        res.setHeader("Allow", "GET");
      }
      return res.status(405).json({
        status: "method-not-allowed",
      });
    }

    const rawUsername = req.query?.username;
    if (typeof rawUsername !== "string") {
      return res.status(400).json({
        status: "invalid",
      });
    }

    const handle = normalizeYouniverseHandle(rawUsername);

    if (!handle.username) {
      return res.status(400).json({
        status: "invalid",
      });
    }

    try {
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

      const publicIdentity = toPublicYouniverseIdentity(resolution.identity);
      if (!publicIdentity) {
        return res.status(500).json({
          status: "error",
        });
      }

      if (typeof res.setHeader === "function") {
        res.setHeader("Cache-Control", "no-store");
      }

      return res.status(200).json({
        status: "found",
        identity: publicIdentity,
      });
    } catch {
      console.error("[YouniverseIdentity] Resolution failed");
      return res.status(500).json({
        status: "error",
      });
    }
  };
}
