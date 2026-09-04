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

export type YouniverseRouteKind = "gateway" | "identity";

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
  hostname: string
): YouniverseRoute | null {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return null;
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
