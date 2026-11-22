/**
 * lib/creatorOwnership.ts
 *
 * Server-authoritative Creator entitlement, multi-Youniverse ownership resolution,
 * cross-subdomain session extraction, runtime/production isolation guards, and
 * immutable audit logging.
 *
 * Security invariants:
 *  - Designated Creator email is strictly `creatoroftheyouniverse@itsyouonline.com`.
 *  - Creator authorization NEVER derives from client-supplied emails, roles, booleans,
 *    headers, or identity IDs alone.
 *  - Provisioning requires both prior email verification (`email_verified_at IS NOT NULL`)
 *    and an explicit server-side provisioning secret (`CREATOR_PROVISIONING_SECRET`).
 *  - Preview deployments (`VERCEL_ENV === "preview"`) and non-production runtimes
 *    targeting the production database endpoint are strictly denied.
 *  - Normal users remain strictly subject to the one-free-Youniverse limit and
 *    1:1 identity isolation.
 */

import { createHash, timingSafeEqual } from "crypto";
import { validateSession as defaultValidateSession } from "./neonSession.ts";
import { resolveHumanYouniverseAccess } from "./humanContinuity.ts";
import { resolveYouniverseRoute, YOUNIVERSE_ROOT_DOMAIN } from "./youniverseRouting.ts";

export const DESIGNATED_CREATOR_EMAIL = "creatoroftheyouniverse@itsyouonline.com";
export const CREATOR_SESSION_COOKIE_NAME = "__youniverse_session";
export const PRODUCTION_NEON_ENDPOINT_MARKER = "ep-aged-dew-av9711nr";

export type CreatorRuntimeEnv = "production" | "development" | "test";

export interface CreatorRuntimeCheck {
  allowed: boolean;
  reason?: "preview_environment_blocked" | "non_production_against_production_db";
  runtimeEnv: CreatorRuntimeEnv;
}

export interface ExtractedSessionToken {
  token: string | null;
  source: "bearer" | "cookie" | null;
  hasAuthHeader: boolean;
  malformedHeader: boolean;
}

export interface SessionTokenCandidates {
  bearerToken: string | null;
  cookieToken: string | null;
  hasAuthHeader: boolean;
  malformedHeader: boolean;
}

export type SessionFallbackValidationResult =
  | {
    ok: true;
    identityId: string;
    sessionId: string;
    token: string;
    source: "bearer" | "cookie";
    humanId?: string | null;
    authSubjectId?: string | null;
  }
  | {
    ok: false;
    reason: "missing" | "malformed" | "not_found" | "expired" | "revoked";
    hasAuthHeader: boolean;
    malformedHeader: boolean;
    hadCandidate: boolean;
  };

export interface RollbackSafetyResult {
  safe: boolean;
  blockedBy: string[];
  reason?: string;
  counts: {
    provisioningAuditEvents: number;
    privilegedClaimAuditEvents: number;
    totalAuditEvents: number;
    creatorAccounts: number;
    creatorMemberships: number;
  };
}

export type CreatorClaimAuthResult =
  | {
    authorized: true;
    status: "authorized";
    accountId: string;
    sessionId: string;
    actorIdentityId: string;
    runtimeEnv: CreatorRuntimeEnv;
  }
  | {
    authorized: false;
    status: "unauthenticated" | "not_creator";
  }
  | {
    authorized: false;
    status: "invalid_session" | "forbidden" | "environment_blocked";
    httpStatus: 401 | 403;
    error: string;
    message: string;
  };

export interface OwnerAccessResult {
  isOwner: boolean;
  status: 200 | 403;
  error?: string;
  message?: string;
  accessType?: "direct_identity" | "creator_account" | "creator_multi_youniverse";
  accountId?: string;
  isCreator?: boolean;
}

export interface OwnedYouniverseSummary {
  identityId: string;
  handle: string;
  subdomain: string;
  displayName: string;
  plan: string;
  claimSource: string;
}

export interface ProvisionCreatorResult {
  ok: boolean;
  error?: string;
  message: string;
  accountId?: string;
  linkedHandles?: string[];
}

export function isUndefinedTableError(err: any): boolean {
  return err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message ?? ""));
}

export function normalizeEmailAddress(email: string): string {
  return email.toLowerCase().trim();
}

export function accountIdForEmail(email: string): string {
  const normalized = normalizeEmailAddress(email);
  return `acct_${createHash("md5").update(normalized, "utf8").digest("hex")}`;
}

function isProductionDatabaseTarget(
  databaseUrl: string | undefined,
  env: Record<string, string | undefined>
): boolean {
  const candidate = (databaseUrl ?? env.DATABASE_URL ?? "").trim();
  if (!candidate) return false;

  if (candidate.toLowerCase().includes(PRODUCTION_NEON_ENDPOINT_MARKER)) {
    return true;
  }

  const prodUrl = (env.PRODUCTION_DATABASE_URL ?? "").trim();
  if (!prodUrl) return false;

  try {
    return new URL(candidate).host.toLowerCase() === new URL(prodUrl).host.toLowerCase();
  } catch {
    return candidate === prodUrl;
  }
}

const STAGING_NEON_ENDPOINT_MARKER = "ep-aged-lake-avdgndee";

function resolveNormalizedVercelEnv(env: Record<string, string | undefined>): string {
  const raw = "VERCEL_ENV" in env ? env.VERCEL_ENV : process.env.VERCEL_ENV;
  return String(raw ?? "").trim().toLowerCase();
}

function isStagingDatabaseTarget(
  databaseUrl: string | undefined,
  env: Record<string, string | undefined>
): boolean {
  const candidate = (databaseUrl ?? env.DATABASE_URL ?? "").trim().toLowerCase();
  if (!candidate) return false;
  return candidate.includes(STAGING_NEON_ENDPOINT_MARKER);
}

/**
 * Fails closed whenever a Vercel Preview runtime attempts to connect to the
 * Production Neon endpoint (`ep-aged-dew-av9711nr` or `PRODUCTION_DATABASE_URL`),
 * or when a Production runtime attempts to connect to Staging (`ep-aged-lake-avdgndee`).
 */
export function assertSafeDatabaseTarget(
  databaseUrl: string | undefined,
  env: Record<string, string | undefined> = process.env
): void {
  const vercelEnv = resolveNormalizedVercelEnv(env);
  if (vercelEnv === "preview" && isProductionDatabaseTarget(databaseUrl, env)) {
    throw new Error(
      "FATAL: Preview deployment is prohibited from targeting Production Neon endpoint ep-aged-dew-av9711nr."
    );
  }
  if (vercelEnv === "production" && isStagingDatabaseTarget(databaseUrl, env)) {
    throw new Error(
      "FATAL: Production deployment is prohibited from targeting Staging Neon endpoint ep-aged-lake-avdgndee."
    );
  }
}

/**
 * Enforces environment boundaries for Creator privilege execution and provisioning:
 *  - Vercel Preview deployments (`VERCEL_ENV === "preview"`) are ALWAYS blocked.
 *  - Non-production runtimes (`VERCEL_ENV !== "production"`) are blocked whenever
 *    configured against the Production Neon endpoint (`ep-aged-dew-av9711nr` or
 *    `PRODUCTION_DATABASE_URL`).
 */
export function isCreatorRuntimeAllowed(
  env: Record<string, string | undefined> = process.env,
  databaseUrl?: string
): CreatorRuntimeCheck {
  const vercelEnv = resolveNormalizedVercelEnv(env);
  const nodeEnv = String(env.NODE_ENV ?? "").trim().toLowerCase();
  const runtimeEnv: CreatorRuntimeEnv =
    vercelEnv === "production"
      ? "production"
      : nodeEnv === "test" || Boolean(env.NODE_TEST_CONTEXT)
        ? "test"
        : "development";

  if (vercelEnv === "preview") {
    return {
      allowed: false,
      reason: "preview_environment_blocked",
      runtimeEnv,
    };
  }

  if (vercelEnv !== "production" && isProductionDatabaseTarget(databaseUrl, env)) {
    return {
      allowed: false,
      reason: "non_production_against_production_db",
      runtimeEnv,
    };
  }

  return { allowed: true, runtimeEnv };
}

function parseCookieValue(cookieHeader: string, cookieName: string): string | null {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key !== cookieName) continue;
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!rawVal) return null;
    try {
      const decoded = decodeURIComponent(rawVal).trim();
      return decoded.length > 0 ? decoded : null;
    } catch {
      return rawVal.length > 0 ? rawVal : null;
    }
  }
  return null;
}

/**
 * Anti-CSRF enforcement helper for mutation endpoints.
 *
 * Policy:
 *  PASS (server-to-server path) if `X-Portals-Internal: <secret>` matches the
 *       configured `PORTALS_INTERNAL_SECRET` environment variable. This is the
 *       only sanctioned path for authenticated internal services that do not
 *       send an Origin header.
 *
 *  PASS if Origin is one of the EXPLICITLY TRUSTED gateway origins:
 *       - https://itsyouonline.com          (root / welcome gateway)
 *       - https://welcome.itsyouonline.com  (explicit welcome subdomain)
 *
 *  BLOCK if Origin is absent. Browser cookie-authenticated mutations require a
 *       trusted Origin. `X-Portals-Request: 1` does NOT substitute for a
 *       trusted Origin and cannot override an untrusted or absent Origin.
 *
 *  BLOCK everything else, including arbitrary *.itsyouonline.com Youniverse
 *  subdomains. Each Youniverse subdomain is tenant-controlled content. A
 *  compromised tenant's JavaScript can set custom headers and forge requests
 *  on the user's behalf — it must not be trusted regardless of custom headers.
 *
 * Returns `{ blocked: true, reason }` when the request must be rejected with 403.
 *
 * Usage: call at the top of every state-mutating POST handler before any
 * business logic, then return 403 if blocked.
 */

/** Explicitly allowed first-party gateway origins for CSRF validation. */
export const TRUSTED_CSRF_ORIGINS = new Set([
  "https://itsyouonline.com",
  "https://welcome.itsyouonline.com",
]);

/** Canonical gateway alias origins (not claimable tenant subdomains). */
export const TRUSTED_GATEWAY_CSRF_ALIASES = new Set([
  "https://www.itsyouonline.com",
]);

export interface AntiCsrfOptions {
  allowSameOriginTenantSubdomain?: boolean;
  expectedTenantHandle?: string;
}

const RESERVED_TENANT_CSRF_HANDLES = new Set(["www", "welcome", "claim", "api"]);
const VALID_TENANT_CSRF_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/**
 * Extracts the valid non-reserved `<handle>` from `https://<handle>.itsyouonline.com`
 * Origin headers. Returns null for gateway origins, reserved subdomains, HTTP,
 * URLs with ports/credentials, or non-Youniverse origins.
 */
export function extractTenantOriginHandle(req: any): string | null {
  const rawOrigin: string | string[] | undefined =
    req?.headers?.["origin"] ?? req?.headers?.["Origin"];
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (!origin || typeof origin !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return null;
  }

  const parts = parsed.hostname.toLowerCase().split(".");
  if (parts.length !== 3 || parts[1] !== "itsyouonline" || parts[2] !== "com") {
    return null;
  }

  const handle = parts[0];
  if (
    !handle ||
    RESERVED_TENANT_CSRF_HANDLES.has(handle) ||
    !VALID_TENANT_CSRF_HANDLE_RE.test(handle)
  ) {
    return null;
  }

  return handle;
}

function isValidSameOriginTenantOrigin(
  origin: string,
  req: any,
  expectedTenantHandle?: string
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return false;
  }

  const originHostname = parsed.hostname.toLowerCase();
  const parts = originHostname.split(".");
  if (parts.length !== 3 || parts[1] !== "itsyouonline" || parts[2] !== "com") {
    return false;
  }

  const handle = parts[0];
  if (
    !handle ||
    RESERVED_TENANT_CSRF_HANDLES.has(handle) ||
    !VALID_TENANT_CSRF_HANDLE_RE.test(handle)
  ) {
    return false;
  }

  const rawHostHeader = String(
    (Array.isArray(req?.headers?.host) ? req.headers.host[0] : req?.headers?.host) ??
    (Array.isArray(req?.headers?.Host) ? req.headers.Host[0] : req?.headers?.Host) ??
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (rawHostHeader && rawHostHeader.includes(":")) {
    return false;
  }

  const requestHost = normalizeRequestHost(req);
  if (!requestHost || originHostname !== requestHost) {
    return false;
  }

  if (expectedTenantHandle && expectedTenantHandle.trim().length > 0) {
    const cleanExpected = expectedTenantHandle.toLowerCase().replace(/^@+/, "").trim();
    if (handle !== cleanExpected) {
      return false;
    }
  }

  return true;
}

const PREVIEW_VERCEL_APP_HOST_RE =
  /^portals-[a-z0-9-]+-the-youniverse\.vercel\.app$/;

function isValidPreviewSameOrigin(
  origin: string,
  req: any,
  env: Record<string, string | undefined> = process.env
): boolean {
  const vercelEnv = String(env.VERCEL_ENV ?? process.env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();
  if (vercelEnv !== "preview") {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const originHost = parsed.host.toLowerCase();
  const originHostname = parsed.hostname.toLowerCase();
  const requestHost =
    normalizeRequestHost(req) ||
    cleanHostHeaderValue(
      req?.headers?.["x-forwarded-host"] ?? req?.headers?.["X-Forwarded-Host"]
    );
  if (!requestHost || originHost !== requestHost) {
    return false;
  }

  const envPreviewHosts = new Set(
    [
      env.VERCEL_URL ?? process.env.VERCEL_URL,
      env.VERCEL_BRANCH_URL ?? process.env.VERCEL_BRANCH_URL,
    ]
      .map((v) => cleanHostHeaderValue(v))
      .filter(Boolean)
  );

  return (
    PREVIEW_VERCEL_APP_HOST_RE.test(originHostname) ||
    envPreviewHosts.has(originHostname)
  );
}

/**
 * Explicitly allowed origins for local development / test environments only.
 * NEVER active in production or Vercel preview environments.
 */
export const LOCAL_DEV_CSRF_ORIGINS = new Set([
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]);

/**
 * Determines whether local development CSRF origins are permitted.
 * Strict fail-closed policy:
 *  - NEVER allowed if VERCEL_ENV is 'production' or 'preview'.
 *  - NEVER allowed if NODE_ENV is 'production'.
 *  - Permitted only when explicitly running in local development or test mode.
 */
export function isLocalDevCsrfAllowed(
  env: Record<string, string | undefined> = process.env
): boolean {
  const vercelEnv = resolveNormalizedVercelEnv(env);
  const nodeEnv = String(env.NODE_ENV ?? "").trim().toLowerCase();
  if (
    vercelEnv === "production" ||
    vercelEnv === "preview" ||
    nodeEnv === "production"
  ) {
    return false;
  }
  return (
    nodeEnv === "development" ||
    nodeEnv === "test" ||
    Boolean(env.LOCAL_DEV_CSRF) ||
    Boolean(env.LOCAL_DEV_MODE) ||
    Boolean(env.LOCAL_TEST_DATABASE_URL) ||
    (!vercelEnv && !nodeEnv)
  );
}

export function enforceAntiCsrf(
  req: any,
  env: Record<string, string | undefined> = process.env,
  options: AntiCsrfOptions = {}
): { blocked: false } | { blocked: true; reason: string } {
  // Server-to-server authenticated path: internal service token.
  // This is the only way to pass CSRF enforcement without a trusted Origin.
  // Set PORTALS_INTERNAL_SECRET in the environment and pass it as
  // `X-Portals-Internal: <secret>` from authorized internal services.
  const internalHeader = req?.headers?.["x-portals-internal"];
  const internalSecret = (env.PORTALS_INTERNAL_SECRET ?? process.env.PORTALS_INTERNAL_SECRET ?? "").trim();
  if (internalSecret && typeof internalHeader === "string" && internalHeader === internalSecret) {
    return { blocked: false };
  }

  // Normalize: take only the first value if the header is somehow duplicated.
  const rawOrigin: string | string[] | undefined =
    req?.headers?.["origin"] ?? req?.headers?.["Origin"];
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

  // Missing or empty Origin: reject for cookie-authenticated browser mutations.
  // X-Portals-Request: 1 does NOT substitute for a trusted Origin.
  if (!origin) {
    return {
      blocked: true,
      reason:
        "Missing Origin header. Cookie-authenticated browser mutations require a trusted Origin. " +
        "Internal services must use the X-Portals-Internal authenticated path.",
    };
  }

  // Permit only the explicit well-known gateway origins in production.
  // Arbitrary *.itsyouonline.com tenant subdomains require explicit same-origin +
  // session handle binding via options.allowSameOriginTenantSubdomain.
  if (TRUSTED_CSRF_ORIGINS.has(origin) || TRUSTED_GATEWAY_CSRF_ALIASES.has(origin)) {
    return { blocked: false };
  }

  // Scoped same-origin tenant subdomain support (exact host match, non-reserved handle).
  if (
    options.allowSameOriginTenantSubdomain &&
    isValidSameOriginTenantOrigin(origin, req, options.expectedTenantHandle)
  ) {
    return { blocked: false };
  }

  // Vercel Preview same-origin support for this project's *.vercel.app preview deployment.
  if (isValidPreviewSameOrigin(origin, req, env)) {
    return { blocked: false };
  }

  // Local development fallback: permitted strictly when NOT in production,
  // and Origin exactly matches an explicitly approved local dev host.
  if (isLocalDevCsrfAllowed(env) && LOCAL_DEV_CSRF_ORIGINS.has(origin)) {
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: `Cross-origin mutation blocked. Origin '${origin}' is not in the trusted gateway allowlist.`,
  };
}

/**
 * Extracts both `Authorization: Bearer <token>` and HttpOnly cookie
 * `__youniverse_session` candidates from a request so stale/revoked Bearer
 * tokens never prevent fallback to a valid cross-subdomain session cookie.
 */
export function extractSessionCandidatesFromRequest(req: any): SessionTokenCandidates {
  const rawAuthHeader = req?.headers?.["authorization"] ?? req?.headers?.["Authorization"];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

  let bearerToken: string | null = null;
  let hasAuthHeader = false;
  let malformedHeader = false;

  if (authHeader !== undefined && authHeader !== null && authHeader !== "") {
    hasAuthHeader = true;
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
      malformedHeader = true;
    } else {
      const token = authHeader.slice(7).trim();
      if (!token) {
        malformedHeader = true;
      } else {
        bearerToken = token;
      }
    }
  }

  const rawCookieHeader = req?.headers?.["cookie"] ?? req?.headers?.["Cookie"];
  const cookieHeader = Array.isArray(rawCookieHeader) ? rawCookieHeader[0] : rawCookieHeader;
  const cookieToken =
    typeof cookieHeader === "string" && cookieHeader.trim().length > 0
      ? parseCookieValue(cookieHeader, CREATOR_SESSION_COOKIE_NAME)
      : null;

  return {
    bearerToken,
    cookieToken,
    hasAuthHeader,
    malformedHeader,
  };
}

/**
 * Extracts a bearer session token from `Authorization: Bearer <token>` or
 * from the HttpOnly cross-subdomain cookie `__youniverse_session`.
 */
export function extractSessionTokenFromRequest(req: any): ExtractedSessionToken {
  const candidates = extractSessionCandidatesFromRequest(req);

  if (candidates.bearerToken) {
    return {
      token: candidates.bearerToken,
      source: "bearer",
      hasAuthHeader: true,
      malformedHeader: false,
    };
  }

  if (candidates.cookieToken) {
    return {
      token: candidates.cookieToken,
      source: "cookie",
      hasAuthHeader: candidates.hasAuthHeader,
      malformedHeader: candidates.malformedHeader,
    };
  }

  return {
    token: null,
    source: null,
    hasAuthHeader: candidates.hasAuthHeader,
    malformedHeader: candidates.malformedHeader,
  };
}

/**
 * Validates `Authorization: Bearer <token>` first, then falls back to the
 * `__youniverse_session` cookie if Bearer is missing, malformed, invalid,
 * expired, or revoked.
 */
export async function validateRequestSessionWithCookieFallback(
  sql: any,
  req: any,
  validateSessionFn: typeof defaultValidateSession = defaultValidateSession
): Promise<SessionFallbackValidationResult> {
  const candidates = extractSessionCandidatesFromRequest(req);

  if (!candidates.bearerToken && !candidates.cookieToken) {
    return {
      ok: false,
      reason: candidates.malformedHeader ? "malformed" : "missing",
      hasAuthHeader: candidates.hasAuthHeader,
      malformedHeader: candidates.malformedHeader,
      hadCandidate: false,
    };
  }

  let lastReason: "not_found" | "expired" | "revoked" | null = null;

  if (candidates.bearerToken) {
    const bearerValidation = await validateSessionFn(sql, candidates.bearerToken);
    if (bearerValidation?.ok) {
      return {
        ok: true,
        identityId: bearerValidation.identityId,
        sessionId: bearerValidation.sessionId,
        humanId: bearerValidation.humanId ?? null,
        authSubjectId: bearerValidation.authSubjectId ?? null,
        token: candidates.bearerToken,
        source: "bearer",
      };
    }
    lastReason = bearerValidation?.reason ?? "not_found";
  }

  if (candidates.cookieToken && candidates.cookieToken !== candidates.bearerToken) {
    const cookieValidation = await validateSessionFn(sql, candidates.cookieToken);
    if (cookieValidation?.ok) {
      return {
        ok: true,
        identityId: cookieValidation.identityId,
        sessionId: cookieValidation.sessionId,
        humanId: cookieValidation.humanId ?? null,
        authSubjectId: cookieValidation.authSubjectId ?? null,
        token: candidates.cookieToken,
        source: "cookie",
      };
    }
    if (!lastReason) {
      lastReason = cookieValidation?.reason ?? "not_found";
    }
  }

  return {
    ok: false,
    reason: lastReason ?? "not_found",
    hasAuthHeader: candidates.hasAuthHeader,
    malformedHeader: candidates.malformedHeader,
    hadCandidate: true,
  };
}

const TRUSTED_SINGLE_LABEL_YOUNIVERSE_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.itsyouonline\.com$/;

function cleanHostHeaderValue(raw: unknown): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return "";
  const firstEntry = first.split(",")[0] ?? "";
  return firstEntry.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isTrustedYouniverseDomainHost(host: string): boolean {
  const normalized = cleanHostHeaderValue(host);
  if (!normalized) return false;
  if (normalized === YOUNIVERSE_ROOT_DOMAIN) return true;
  return (
    normalized.endsWith(`.${YOUNIVERSE_ROOT_DOMAIN}`) &&
    TRUSTED_SINGLE_LABEL_YOUNIVERSE_HOST_RE.test(normalized)
  );
}

export function normalizeRequestHost(req: any): string {
  const directHost = cleanHostHeaderValue(req?.headers?.host ?? req?.headers?.Host);
  if (isTrustedYouniverseDomainHost(directHost)) {
    return directHost;
  }

  const forwardedHost = cleanHostHeaderValue(
    req?.headers?.["x-forwarded-host"] ?? req?.headers?.["X-Forwarded-Host"]
  );
  if (isTrustedYouniverseDomainHost(forwardedHost)) {
    return forwardedHost;
  }

  return directHost;
}

/**
 * Constructs the Set-Cookie header for cross-subdomain authenticated sessions.
 */
export function buildSessionCookieHeader(
  rawToken: string,
  req: any,
  ttlSeconds: number = 60 * 60 * 24 * 7
): string {
  const maxAge = Math.max(0, Math.floor(ttlSeconds));
  const host = normalizeRequestHost(req);
  const attrs = [
    `${CREATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (isTrustedYouniverseDomainHost(host)) {
    attrs.push(`Domain=.${YOUNIVERSE_ROOT_DOMAIN}`, "Secure");
  } else if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    attrs.push("Secure");
  }

  return attrs.join("; ");
}

export function buildClearSessionCookieHeader(req: any): string {
  const host = normalizeRequestHost(req);
  const attrs = [
    `${CREATOR_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isTrustedYouniverseDomainHost(host)) {
    attrs.push(`Domain=.${YOUNIVERSE_ROOT_DOMAIN}`, "Secure");
  } else if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    attrs.push("Secure");
  }

  return attrs.join("; ");
}

function timingSafeSecretMatch(provided: string, configured: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(configured, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Records a Creator privileged action in `public.creator_privilege_audit_log`.
 */
export async function recordCreatorAuditEvent(
  sql: any,
  event: {
    accountId: string;
    actorSessionId?: string | null;
    actorIdentityId?: string | null;
    targetIdentityId?: string | null;
    targetHandle: string;
    targetSubdomain: string;
    eventType:
    | "creator_entitlement_provisioned"
    | "creator_privileged_claim"
    | "creator_owner_handoff_issued";
    runtimeEnv: CreatorRuntimeEnv;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await sql`
    INSERT INTO public.creator_privilege_audit_log (
      account_id,
      actor_session_id,
      actor_identity_id,
      target_identity_id,
      target_handle,
      target_subdomain,
      event_type,
      runtime_environment,
      ip_address,
      user_agent,
      metadata
    )
    VALUES (
      ${event.accountId},
      ${event.actorSessionId ?? null},
      ${event.actorIdentityId ?? null},
      ${event.targetIdentityId ?? null},
      ${event.targetHandle},
      ${event.targetSubdomain},
      ${event.eventType},
      ${event.runtimeEnv},
      ${event.ipAddress ?? null},
      ${event.userAgent ?? null},
      ${JSON.stringify(event.metadata ?? {})}
    )
  `;
}

/**
 * Ensures an `owner_accounts` row and `youniverse_owner_memberships` row exist
 * for an email-verified identity. Never grants `is_creator = TRUE`.
 */
export async function syncVerifiedOwnerMembership(
  sql: any,
  params: {
    identityId: string;
    email: string | null | undefined;
    claimSource?: "standard" | "creator_override" | "paid" | "backfill";
    verifiedAt?: string | Date | null;
  }
): Promise<{ synced: boolean; accountId?: string }> {
  const cleanEmail = params.email ? normalizeEmailAddress(params.email) : "";
  if (!params.identityId || !cleanEmail || !cleanEmail.includes("@")) {
    return { synced: false };
  }

  const accountId = accountIdForEmail(cleanEmail);
  const verifiedIso = params.verifiedAt
    ? new Date(params.verifiedAt).toISOString()
    : new Date().toISOString();
  const claimSource = params.claimSource ?? "standard";

  try {
    await sql`
      INSERT INTO public.owner_accounts (
        account_id,
        primary_email,
        email_verified_at,
        is_creator,
        status
      )
      VALUES (
        ${accountId},
        ${cleanEmail},
        ${verifiedIso},
        FALSE,
        'active'
      )
      ON CONFLICT (primary_email) DO UPDATE
      SET email_verified_at = COALESCE(public.owner_accounts.email_verified_at, EXCLUDED.email_verified_at),
          updated_at = NOW()
    `;

    await sql`
      INSERT INTO public.youniverse_owner_memberships (
        account_id,
        identity_id,
        role,
        status,
        claim_source,
        verified_at
      )
      VALUES (
        ${accountId},
        ${params.identityId},
        'owner',
        'active',
        ${claimSource},
        ${verifiedIso}
      )
      ON CONFLICT (identity_id) DO UPDATE
      SET account_id = EXCLUDED.account_id,
          verified_at = COALESCE(public.youniverse_owner_memberships.verified_at, EXCLUDED.verified_at),
          updated_at = NOW()
    `;

    return { synced: true, accountId };
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      return { synced: false };
    }
    throw err;
  }
}

/**
 * Server-side one-time provisioning of Creator entitlement for
 * `creatoroftheyouniverse@itsyouonline.com`.
 *
 * Requires:
 *  - Non-preview environment and non-prod-against-prod boundary check.
 *  - Valid `CREATOR_PROVISIONING_SECRET` (>= 16 chars) matched in constant time.
 *  - At least one live, person, email-verified identity belonging to
 *    `creatoroftheyouniverse@itsyouonline.com`.
 */
export async function provisionCreatorEntitlement(
  sql: any,
  opts: {
    provisioningSecret: string;
    provisionedBy: string;
    env?: Record<string, string | undefined>;
    databaseUrl?: string;
  }
): Promise<ProvisionCreatorResult> {
  const env = opts.env ?? process.env;
  const runtimeCheck = isCreatorRuntimeAllowed(env, opts.databaseUrl);
  if (!runtimeCheck.allowed) {
    return {
      ok: false,
      error: runtimeCheck.reason,
      message: "Creator provisioning is blocked in preview or mismatched production runtime.",
    };
  }

  const configuredSecret = (env.CREATOR_PROVISIONING_SECRET ?? "").trim();
  const providedSecret = (opts.provisioningSecret ?? "").trim();
  if (configuredSecret.length < 16 || !providedSecret || !timingSafeSecretMatch(providedSecret, configuredSecret)) {
    return {
      ok: false,
      error: "invalid_provisioning_secret",
      message: "A valid CREATOR_PROVISIONING_SECRET (>= 16 chars) is required.",
    };
  }

  const provisionedBy = (opts.provisionedBy ?? "").trim();
  if (!provisionedBy) {
    return {
      ok: false,
      error: "provisioned_by_required",
      message: "Operator identifier (provisionedBy) is required.",
    };
  }

  const identityRows = await sql`
    SELECT identity_id, username, email, identity_type, is_live, email_verified_at, created_at
    FROM youniverse_identities
    WHERE lower(btrim(email)) = ${DESIGNATED_CREATOR_EMAIL}
    ORDER BY created_at ASC
  `;

  const livePersonRows = (identityRows ?? []).filter(
    (r: any) =>
      String(r.identity_type ?? "person") === "person" && r.is_live === true
  );

  if (livePersonRows.length === 0) {
    return {
      ok: false,
      error: "creator_identity_not_found",
      message: `No live person Youniverse identity exists for ${DESIGNATED_CREATOR_EMAIL}.`,
    };
  }

  const verifiedRows = livePersonRows.filter(
    (r: any) => r.email_verified_at !== null && r.email_verified_at !== undefined
  );

  if (verifiedRows.length === 0) {
    return {
      ok: false,
      error: "creator_email_not_verified",
      message: `${DESIGNATED_CREATOR_EMAIL} must complete email verification before Creator provisioning.`,
    };
  }

  const primaryVerified = verifiedRows[0];
  const accountId = accountIdForEmail(DESIGNATED_CREATOR_EMAIL);
  const earliestVerifiedIso = new Date(primaryVerified.email_verified_at).toISOString();

  await sql`
    INSERT INTO public.owner_accounts (
      account_id,
      primary_email,
      email_verified_at,
      is_creator,
      creator_provisioned_at,
      creator_provisioned_by,
      status
    )
    VALUES (
      ${accountId},
      ${DESIGNATED_CREATOR_EMAIL},
      ${earliestVerifiedIso},
      TRUE,
      NOW(),
      ${provisionedBy},
      'active'
    )
    ON CONFLICT (primary_email) DO UPDATE
    SET email_verified_at = COALESCE(public.owner_accounts.email_verified_at, EXCLUDED.email_verified_at),
        is_creator = TRUE,
        creator_provisioned_at = COALESCE(public.owner_accounts.creator_provisioned_at, NOW()),
        creator_provisioned_by = EXCLUDED.creator_provisioned_by,
        status = 'active',
        updated_at = NOW()
  `;

  const linkedHandles: string[] = [];
  for (const row of verifiedRows) {
    const rowVerifiedIso = new Date(row.email_verified_at).toISOString();
    await sql`
      INSERT INTO public.youniverse_owner_memberships (
        account_id,
        identity_id,
        role,
        status,
        claim_source,
        verified_at
      )
      VALUES (
        ${accountId},
        ${String(row.identity_id)},
        'owner',
        'active',
        ${"standard"},
        ${rowVerifiedIso}
      )
      ON CONFLICT (identity_id) DO UPDATE
      SET account_id = EXCLUDED.account_id,
          status = 'active',
          verified_at = COALESCE(public.youniverse_owner_memberships.verified_at, EXCLUDED.verified_at),
          updated_at = NOW()
    `;
    linkedHandles.push(String(row.username));
  }

  await recordCreatorAuditEvent(sql, {
    accountId,
    actorIdentityId: String(primaryVerified.identity_id),
    targetIdentityId: String(primaryVerified.identity_id),
    targetHandle: String(primaryVerified.username),
    targetSubdomain: `${primaryVerified.username}.${YOUNIVERSE_ROOT_DOMAIN}`,
    eventType: "creator_entitlement_provisioned",
    runtimeEnv: runtimeCheck.runtimeEnv,
    metadata: {
      provisionedBy,
      linkedHandles,
    },
  });

  return {
    ok: true,
    message: `Provisioned Creator entitlement for ${DESIGNATED_CREATOR_EMAIL}.`,
    accountId,
    linkedHandles,
  };
}

/**
 * Evaluates whether the incoming request holds a verified, authenticated,
 * server-provisioned Creator session authorized to bypass the one-free-Youniverse
 * restriction for `submittedEmail`.
 */
export async function evaluateCreatorClaimAuthorization(
  sql: any,
  req: any,
  submittedEmail: string,
  opts: {
    validateSession?: typeof defaultValidateSession;
    env?: Record<string, string | undefined>;
    databaseUrl?: string;
  } = {}
): Promise<CreatorClaimAuthResult> {
  const cleanSubmitted = normalizeEmailAddress(submittedEmail);
  const validateSessionFn = opts.validateSession ?? defaultValidateSession;
  const validation = await validateRequestSessionWithCookieFallback(
    sql,
    req,
    validateSessionFn
  );

  if (!validation.ok) {
    if (validation.reason === "malformed") {
      return {
        authorized: false,
        status: "invalid_session",
        httpStatus: 401,
        error: "invalid_token",
        message: "Invalid Authorization header.",
      };
    }

    if (!validation.hadCandidate) {
      return {
        authorized: false,
        status: "unauthenticated",
      };
    }

    if (validation.hasAuthHeader) {
      return {
        authorized: false,
        status: "invalid_session",
        httpStatus: 401,
        error: "invalid_token",
        message: "Session is invalid, expired, or revoked.",
      };
    }

    return {
      authorized: false,
      status: "unauthenticated",
    };
  }

  const sessionIdentityRows = await sql`
    SELECT identity_id, username, email, identity_type, is_live, email_verified_at
    FROM youniverse_identities
    WHERE identity_id = ${validation.identityId}
    LIMIT 1
  `;

  if (!sessionIdentityRows || sessionIdentityRows.length === 0) {
    if (cleanSubmitted === DESIGNATED_CREATOR_EMAIL) {
      return {
        authorized: false,
        status: "forbidden",
        httpStatus: 403,
        error: "creator_authorization_denied",
        message: "Authenticated session is not authorized for Creator privileges.",
      };
    }
    return { authorized: false, status: "not_creator" };
  }

  const sessionIdentity = sessionIdentityRows[0];
  const sessionEmail = sessionIdentity.email
    ? normalizeEmailAddress(String(sessionIdentity.email))
    : "";

  const isSessionIdentityVerified =
    sessionIdentity.is_live === true &&
    sessionIdentity.email_verified_at !== null &&
    sessionIdentity.email_verified_at !== undefined;

  let accountRow: any = null;
  try {
    const accountRows = await sql`
      SELECT
        oa.account_id,
        oa.primary_email,
        oa.email_verified_at,
        oa.is_creator,
        oa.creator_provisioned_at,
        oa.creator_provisioned_by,
        oa.status AS account_status,
        m.status AS membership_status,
        m.verified_at AS membership_verified_at
      FROM public.youniverse_owner_memberships m
      JOIN public.owner_accounts oa ON oa.account_id = m.account_id
      WHERE m.identity_id = ${validation.identityId}
      LIMIT 1
    `;
    accountRow = accountRows?.[0] ?? null;
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
    accountRow = null;
  }

  const isProvisionedCreatorSession = Boolean(
    isSessionIdentityVerified &&
    sessionEmail === DESIGNATED_CREATOR_EMAIL &&
    accountRow &&
    accountRow.is_creator === true &&
    accountRow.primary_email === DESIGNATED_CREATOR_EMAIL &&
    accountRow.email_verified_at !== null &&
    accountRow.email_verified_at !== undefined &&
    accountRow.creator_provisioned_at !== null &&
    accountRow.creator_provisioned_at !== undefined &&
    accountRow.account_status === "active" &&
    accountRow.membership_status === "active" &&
    accountRow.membership_verified_at !== null &&
    accountRow.membership_verified_at !== undefined
  );

  if (cleanSubmitted !== DESIGNATED_CREATOR_EMAIL) {
    return {
      authorized: false,
      status: "not_creator",
    };
  }

  if (!isProvisionedCreatorSession) {
    return {
      authorized: false,
      status: "forbidden",
      httpStatus: 403,
      error: "creator_authorization_denied",
      message: "Authenticated session is not authorized for Creator privileges.",
    };
  }

  const runtimeCheck = isCreatorRuntimeAllowed(opts.env, opts.databaseUrl);
  if (!runtimeCheck.allowed) {
    return {
      authorized: false,
      status: "environment_blocked",
      httpStatus: 403,
      error: "creator_privilege_environment_blocked",
      message:
        "Creator privileges are disabled in preview deployments and against production data from non-production runtimes.",
    };
  }

  return {
    authorized: true,
    status: "authorized",
    accountId: String(accountRow.account_id),
    sessionId: validation.sessionId,
    actorIdentityId: String(sessionIdentity.identity_id),
    runtimeEnv: runtimeCheck.runtimeEnv,
  };
}

/**
 * Resolves server-authoritative owner access for `targetIdentity` given an
 * authenticated `sessionIdentityId`.
 *
 * - Enforces target liveness and email verification.
 * - For `sessionIdentityId === targetIdentity.identity_id`, maintains 1:1
 *   compatibility while respecting explicit revocation/suspension or blocked
 *   preview boundaries on `creator_override` claims.
 * - For cross-Youniverse access (`sessionIdentityId !== targetIdentity.identity_id`),
 *   requires BOTH identities to have active, verified `owner` memberships under the
 *   same active, verified, provisioned Creator `owner_accounts` record.
 */
export async function resolveOwnerAccessForIdentity(
  sql: any,
  sessionIdentityId: string,
  targetIdentity: {
    identity_id: string;
    username: string;
    email?: string | null;
    is_live: boolean;
    email_verified_at: any;
  },
  opts: {
    env?: Record<string, string | undefined>;
    databaseUrl?: string;
  } = {}
): Promise<OwnerAccessResult> {
  if (!targetIdentity.is_live) {
    return {
      isOwner: false,
      status: 403,
      error: "youniverse_suspended",
      message: "This Youniverse is not currently live.",
    };
  }

  if (targetIdentity.email_verified_at === null) {
    return {
      isOwner: false,
      status: 403,
      error: "email_not_verified",
      message: "Email verification required before accessing private operating system.",
    };
  }

  const targetId = String(targetIdentity.identity_id);
  const isDirectMatch = sessionIdentityId === targetId;

  let targetMembership: any = null;
  try {
    const rows = await sql`
      SELECT
        m.account_id,
        m.identity_id,
        m.status AS membership_status,
        m.claim_source,
        m.verified_at AS membership_verified_at,
        oa.primary_email,
        oa.email_verified_at AS account_email_verified_at,
        oa.is_creator,
        oa.creator_provisioned_at,
        oa.status AS account_status
      FROM public.youniverse_owner_memberships m
      JOIN public.owner_accounts oa ON oa.account_id = m.account_id
      WHERE m.identity_id = ${targetId}
      LIMIT 1
    `;
    targetMembership = rows?.[0] ?? null;
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
    targetMembership = null;
  }

  if (isDirectMatch) {
    if (
      targetMembership &&
      (targetMembership.membership_status !== "active" ||
        targetMembership.account_status !== "active")
    ) {
      return {
        isOwner: false,
        status: 403,
        error: "ownership_revoked",
        message: "Owner access to this Youniverse has been suspended or revoked.",
      };
    }

    if (
      targetMembership &&
      (targetMembership.claim_source === "creator_override" || targetMembership.is_creator === true)
    ) {
      const runtimeCheck = isCreatorRuntimeAllowed(opts.env, opts.databaseUrl);
      if (!runtimeCheck.allowed) {
        return {
          isOwner: false,
          status: 403,
          error: "creator_privilege_environment_blocked",
          message:
            "Creator privileges are disabled in preview deployments and against production data from non-production runtimes.",
        };
      }
    }

    return {
      isOwner: true,
      status: 200,
      accessType: targetMembership?.is_creator ? "creator_account" : "direct_identity",
      accountId: targetMembership?.account_id ? String(targetMembership.account_id) : undefined,
      isCreator: Boolean(targetMembership?.is_creator),
    };
  }

  // Cross-Youniverse access requires verified Creator account ownership on both sides.
  if (!targetMembership) {
    return { isOwner: false, status: 200 };
  }

  const sessionIdRows = await sql`
    SELECT identity_id, email, is_live, email_verified_at
    FROM youniverse_identities
    WHERE identity_id = ${sessionIdentityId}
    LIMIT 1
  `;

  const sessionIdentity = sessionIdRows?.[0];
  if (
    !sessionIdentity ||
    sessionIdentity.is_live !== true ||
    sessionIdentity.email_verified_at === null ||
    sessionIdentity.email_verified_at === undefined
  ) {
    return { isOwner: false, status: 200 };
  }

  let sessionMembership: any = null;
  try {
    const sRows = await sql`
      SELECT
        m.account_id,
        m.identity_id,
        m.status AS membership_status,
        m.verified_at AS membership_verified_at
      FROM public.youniverse_owner_memberships m
      WHERE m.identity_id = ${sessionIdentityId}
      LIMIT 1
    `;
    sessionMembership = sRows?.[0] ?? null;
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
    sessionMembership = null;
  }

  if (!sessionMembership) {
    return { isOwner: false, status: 200 };
  }

  const sessionEmail = sessionIdentity.email
    ? normalizeEmailAddress(String(sessionIdentity.email))
    : "";
  const targetEmail = targetIdentity.email
    ? normalizeEmailAddress(String(targetIdentity.email))
    : "";

  const sameAccount =
    String(sessionMembership.account_id) === String(targetMembership.account_id);
  const bothMembershipsActiveAndVerified =
    sessionMembership.membership_status === "active" &&
    sessionMembership.membership_verified_at !== null &&
    sessionMembership.membership_verified_at !== undefined &&
    targetMembership.membership_status === "active" &&
    targetMembership.membership_verified_at !== null &&
    targetMembership.membership_verified_at !== undefined;
  const creatorAccountValid =
    targetMembership.is_creator === true &&
    targetMembership.primary_email === DESIGNATED_CREATOR_EMAIL &&
    targetMembership.account_status === "active" &&
    targetMembership.account_email_verified_at !== null &&
    targetMembership.account_email_verified_at !== undefined &&
    targetMembership.creator_provisioned_at !== null &&
    targetMembership.creator_provisioned_at !== undefined &&
    sessionEmail === DESIGNATED_CREATOR_EMAIL &&
    targetEmail === DESIGNATED_CREATOR_EMAIL;

  if (!sameAccount || !bothMembershipsActiveAndVerified || !creatorAccountValid) {
    return { isOwner: false, status: 200 };
  }

  const runtimeCheck = isCreatorRuntimeAllowed(opts.env, opts.databaseUrl);
  if (!runtimeCheck.allowed) {
    return {
      isOwner: false,
      status: 403,
      error: "creator_privilege_environment_blocked",
      message:
        "Creator privileges are disabled in preview deployments and against production data from non-production runtimes.",
    };
  }

  return {
    isOwner: true,
    status: 200,
    accessType: "creator_multi_youniverse",
    accountId: String(targetMembership.account_id),
    isCreator: true,
  };
}

/**
 * Checks whether a Youniverse identity is blocked by preview/non-production
 * Creator runtime boundaries (e.g. during handoff exchange).
 */
export async function checkCreatorIdentityRuntimeAccess(
  sql: any,
  identityId: string,
  opts: {
    env?: Record<string, string | undefined>;
    databaseUrl?: string;
  } = {}
): Promise<{ allowed: boolean; error?: string; message?: string }> {
  let row: any = null;
  try {
    const rows = await sql`
      SELECT m.claim_source, oa.is_creator
      FROM public.youniverse_owner_memberships m
      JOIN public.owner_accounts oa ON oa.account_id = m.account_id
      WHERE m.identity_id = ${identityId}
      LIMIT 1
    `;
    row = rows?.[0] ?? null;
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
    row = null;
  }

  if (row && (row.claim_source === "creator_override" || row.is_creator === true)) {
    const runtimeCheck = isCreatorRuntimeAllowed(opts.env, opts.databaseUrl);
    if (!runtimeCheck.allowed) {
      return {
        allowed: false,
        error: "creator_privilege_environment_blocked",
        message:
          "Creator privileges are disabled in preview deployments and against production data from non-production runtimes.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Returns all active, verified Youniverses belonging to an explicitly provisioned
 * Creator owner account (`oa.is_creator = TRUE`). Ordinary users receive `[]` so
 * they never list or switch into sibling handles even if emails collide.
 */
export async function listOwnedYouniversesForIdentity(
  sql: any,
  identityId: string
): Promise<OwnedYouniverseSummary[]> {
  try {
    const rows = await sql`
      SELECT
        yi.identity_id,
        yi.username,
        yi.subdomain,
        yi.display_name,
        yi.plan,
        m_other.claim_source
      FROM public.youniverse_owner_memberships m_self
      JOIN public.owner_accounts oa
        ON oa.account_id = m_self.account_id
       AND oa.status = 'active'
       AND oa.email_verified_at IS NOT NULL
       AND oa.is_creator = TRUE
       AND oa.primary_email = ${DESIGNATED_CREATOR_EMAIL}
       AND oa.creator_provisioned_at IS NOT NULL
      JOIN public.youniverse_owner_memberships m_other
        ON m_other.account_id = oa.account_id
       AND m_other.status = 'active'
       AND m_other.verified_at IS NOT NULL
      JOIN public.youniverse_identities yi
        ON yi.identity_id = m_other.identity_id
       AND yi.is_live = TRUE
       AND yi.email_verified_at IS NOT NULL
      WHERE m_self.identity_id = ${identityId}
        AND m_self.status = 'active'
        AND m_self.verified_at IS NOT NULL
      ORDER BY m_other.created_at ASC
    `;

    return (rows ?? []).map((r: any) => ({
      identityId: String(r.identity_id),
      handle: String(r.username),
      subdomain: String(r.subdomain),
      displayName: String(r.display_name ?? r.username),
      plan: String(r.plan ?? "free"),
      claimSource: String(r.claim_source ?? "standard"),
    }));
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      return [];
    }
    throw err;
  }
}

/**
 * Evaluates the same preconditions enforced by `011_rollback_creator_multi_youniverse_ownership.sql`:
 * blocks rollback whenever Creator provisioning, audit events, `is_creator = TRUE`,
 * or Creator-created/owned memberships exist, while permitting rollback on an
 * unprovisioned Migration 011 schema (including ordinary backfilled rows sharing an email).
 */
export async function evaluateMigration011RollbackSafety(
  sql: any
): Promise<RollbackSafetyResult> {
  const blockedBy: string[] = [];
  let provisioningAuditEvents = 0;
  let privilegedClaimAuditEvents = 0;
  let totalAuditEvents = 0;
  let creatorAccounts = 0;
  let creatorMemberships = 0;

  try {
    const auditRows = await sql`
      SELECT event_type, COUNT(*)::int AS cnt
      FROM public.creator_privilege_audit_log
      GROUP BY event_type
    `;
    for (const r of auditRows ?? []) {
      const cnt = Number(r.cnt ?? 0);
      totalAuditEvents += cnt;
      if (r.event_type === "creator_entitlement_provisioned") {
        provisioningAuditEvents += cnt;
      } else if (r.event_type === "creator_privileged_claim") {
        privilegedClaimAuditEvents += cnt;
      }
    }
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
  }

  try {
    const accountRows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM public.owner_accounts
      WHERE is_creator = TRUE
         OR creator_provisioned_at IS NOT NULL
    `;
    creatorAccounts = Number(accountRows?.[0]?.cnt ?? 0);
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
  }

  try {
    const membershipRows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM public.youniverse_owner_memberships m
      LEFT JOIN public.owner_accounts oa
        ON oa.account_id = m.account_id
      WHERE m.claim_source = 'creator_override'
         OR oa.is_creator = TRUE
    `;
    creatorMemberships = Number(membershipRows?.[0]?.cnt ?? 0);
  } catch (err: any) {
    if (!isUndefinedTableError(err)) throw err;
  }

  if (provisioningAuditEvents > 0) {
    blockedBy.push(
      `Rollback blocked: public.creator_privilege_audit_log contains ${provisioningAuditEvents} Creator provisioning audit event(s).`
    );
  }
  if (privilegedClaimAuditEvents > 0) {
    blockedBy.push(
      `Rollback blocked: public.creator_privilege_audit_log contains ${privilegedClaimAuditEvents} Creator privileged claim event(s).`
    );
  }
  if (totalAuditEvents > 0 && provisioningAuditEvents === 0 && privilegedClaimAuditEvents === 0) {
    blockedBy.push(
      `Rollback blocked: public.creator_privilege_audit_log contains ${totalAuditEvents} Creator audit event(s).`
    );
  }
  if (creatorAccounts > 0) {
    blockedBy.push(
      `Rollback blocked: public.owner_accounts contains ${creatorAccounts} provisioned Creator account(s) (is_creator = TRUE).`
    );
  }
  if (creatorMemberships > 0) {
    blockedBy.push(
      `Rollback blocked: public.youniverse_owner_memberships contains ${creatorMemberships} Creator-created or Creator-owned membership(s).`
    );
  }

  return {
    safe: blockedBy.length === 0,
    blockedBy,
    reason: blockedBy[0],
    counts: {
      provisioningAuditEvents,
      privilegedClaimAuditEvents,
      totalAuditEvents,
      creatorAccounts,
      creatorMemberships,
    },
  };
}

export type TargetYouniverseResolution =
  | { ok: true; youniverseId: string; handle: string; plan?: string }
  | { ok: false; status: 403 | 404; error: string; message: string };

function extractRequestedTargetHandle(req: any): string | null {
  const headerVal =
    req?.headers?.["x-youniverse-handle"] ?? req?.headers?.["X-Youniverse-Handle"];
  const rawHeaderHandle = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof rawHeaderHandle === "string" && rawHeaderHandle.trim().length > 0) {
    const clean = rawHeaderHandle.trim().toLowerCase().replace(/^@+/, "");
    return clean || null;
  }

  const host = normalizeRequestHost(req);
  if (!host) return null;

  let search: string | undefined;
  if (typeof req?.url === "string" && req.url.includes("?")) {
    try {
      search = new URL(req.url, "http://local.invalid").search;
    } catch {
      search = undefined;
    }
  }

  const route = resolveYouniverseRoute(host, search);
  if (route?.kind === "identity" && route.username) {
    return route.username.toLowerCase();
  }

  return null;
}

/**
 * Resolves the target Youniverse identity for an authenticated session on
 * non-`[handle]` routes (`NotNotes`, `Weaver`, `Genesis`) and verifies owner
 * authorization server-side.
 */
export async function resolveAuthorizedTargetYouniverse(
  sql: any,
  req: any,
  sessionIdentity: {
    identity_id: string;
    username: string;
    human_id?: string | null;
    email?: string | null;
    plan?: string | null;
    is_live: boolean;
    email_verified_at: any;
  },
  opts: {
    env?: Record<string, string | undefined>;
    databaseUrl?: string;
  } = {}
): Promise<TargetYouniverseResolution> {
  const sessionIdentityId = String(sessionIdentity.identity_id);
  const sessionHandle = String(sessionIdentity.username).toLowerCase();
  const requestedHandle = extractRequestedTargetHandle(req);
  const targetHandle = requestedHandle || sessionHandle;

  // Prefer human-continuity authorization whenever the session carries human_id.
  if (sessionIdentity.human_id) {
    const humanAccess = await resolveHumanYouniverseAccess(
      sql,
      String(sessionIdentity.human_id),
      targetHandle
    );

    if (!humanAccess.allowed || !humanAccess.isOwner) {
      if (!humanAccess.allowed && humanAccess.reason === "youniverse_not_found") {
        return {
          ok: false,
          status: 404,
          error: "youniverse_not_found",
          message: `No Youniverse found for handle @${targetHandle}.`,
        };
      }

      const reason = !humanAccess.allowed ? humanAccess.reason : "not_authorized";
      return {
        ok: false,
        status: 403,
        error: reason,
        message: "You are not authorized to access this Youniverse.",
      };
    }

    let resolvedPlan = String(sessionIdentity.plan ?? "free");
    if (String(humanAccess.association.identityId) !== sessionIdentityId) {
      const targetPlanRows = await sql`
        SELECT plan
        FROM youniverse_identities
        WHERE identity_id = ${humanAccess.association.identityId}
        LIMIT 1
      `;
      if (targetPlanRows?.[0]?.plan) {
        resolvedPlan = String(targetPlanRows[0].plan);
      }
    }

    return {
      ok: true,
      youniverseId: String(humanAccess.association.identityId),
      handle: targetHandle,
      plan: resolvedPlan,
    };
  }

  if (!requestedHandle || requestedHandle === sessionHandle) {
    const selfAccess = await resolveOwnerAccessForIdentity(
      sql,
      sessionIdentityId,
      sessionIdentity,
      opts
    );
    if (!selfAccess.isOwner) {
      return {
        ok: false,
        status: 403,
        error: selfAccess.error ?? "not_authorized",
        message: selfAccess.message ?? "Not authorized to access this Youniverse.",
      };
    }

    return {
      ok: true,
      youniverseId: sessionIdentityId,
      handle: String(sessionIdentity.username),
      plan: String(sessionIdentity.plan ?? "free"),
    };
  }

  const targetRows = await sql`
    SELECT identity_id, username, email, plan, is_live, email_verified_at
    FROM youniverse_identities
    WHERE username = ${requestedHandle}
    LIMIT 1
  `;

  if (!targetRows || targetRows.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "youniverse_not_found",
      message: `No Youniverse found for handle @${requestedHandle}.`,
    };
  }

  const targetIdentity = targetRows[0];
  const access = await resolveOwnerAccessForIdentity(
    sql,
    sessionIdentityId,
    targetIdentity,
    opts
  );

  if (!access.isOwner) {
    return {
      ok: false,
      status: 403,
      error: access.error ?? "not_authorized",
      message: access.message ?? "You are not authorized to access this Youniverse.",
    };
  }

  return {
    ok: true,
    youniverseId: String(targetIdentity.identity_id),
    handle: String(targetIdentity.username),
    plan: String(targetIdentity.plan ?? "free"),
  };
}
