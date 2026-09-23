/**
 * Youniverse hostname resolution.
 *
 * This module is intentionally pure.
 *
 * It resolves the structural meaning of an ItsYouOnline hostname.
 * It does NOT:
 * - authenticate users
 * - query persistence
 * - determine ownership
 * - determine whether an identity exists
 * - determine whether an identity is a person or agent
 *
 * Those responsibilities belong to later architectural layers.
 */

export const YOUNIVERSE_ROOT_DOMAIN = "itsyouonline.com";

export type YouniverseRouteKind = "gateway" | "identity" | "claim";

export interface YouniverseRoute {
  kind: YouniverseRouteKind;
  hostname: string;
  username?: string;
}

/**
 * Normalize a hostname for deterministic comparison.
 */
function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

/**
 * Resolve the structural Youniverse route represented by a hostname.
 *
 * Examples:
 *   itsyouonline.com
 *     -> gateway
 *
 *   www.itsyouonline.com
 *     -> gateway
 *
 *   trader.itsyouonline.com
 *     -> identity / trader
 *
 * Unknown domains return null.
 */
export function resolveYouniverseRoute(
  hostname: string,
  search?: string
): YouniverseRoute | null {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return null;
  }

  // Handle local development & preview domains with query params
  // Supported params:
  //   ?@=handle or ?u=handle or ?username=handle  → identity route
  //   ?claim=handle                               → claim route (mirrors claim.itsyouonline.com)
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".vercel.app")
  ) {
    if (search) {
      const params = new URLSearchParams(search);

      // Claim route (dev equivalent of claim.itsyouonline.com/?handle=name)
      const claimHandle = params.get("claim");
      if (claimHandle) {
        return {
          kind: "claim",
          hostname: normalized,
        };
      }

      // Identity route
      const queryUsername = params.get("@") || params.get("u") || params.get("username");
      if (queryUsername) {
        const cleanUser = queryUsername.trim().toLowerCase().replace(/^@/, "");
        return {
          kind: "identity",
          hostname: normalized,
          username: cleanUser,
        };
      }
    }
    return {
      kind: "gateway",
      hostname: normalized,
    };
  }

  if (
    normalized === YOUNIVERSE_ROOT_DOMAIN ||
    normalized === `www.${YOUNIVERSE_ROOT_DOMAIN}`
  ) {
    return {
      kind: "gateway",
      hostname: normalized,
    };
  }

  // Dedicated Claim subdomain
  if (normalized === `claim.${YOUNIVERSE_ROOT_DOMAIN}`) {
    return {
      kind: "claim",
      hostname: normalized,
    };
  }

  const suffix = `.${YOUNIVERSE_ROOT_DOMAIN}`;

  if (!normalized.endsWith(suffix)) {
    return null;
  }

  const subdomain = normalized.slice(0, -suffix.length);

  /**
   * Only a single-label identity is recognized at this layer.
   *
   * This deliberately avoids making assumptions about deeper
   * paths or future nested routing.
   */
  if (!subdomain || subdomain.includes(".")) {
    return null;
  }

  return {
    kind: "identity",
    hostname: normalized,
    username: subdomain,
  };
}
