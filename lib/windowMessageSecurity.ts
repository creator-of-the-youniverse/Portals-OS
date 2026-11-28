/**
 * lib/windowMessageSecurity.ts
 *
 * Fail-closed cross-window `postMessage` origin, source, and schema validation
 * for Portals OS (`App.tsx`) and `WeaverSandbox`.
 *
 * Security invariants:
 *  - Explicit origin allowlist only; zero wildcards (`*`), zero `"null"`, zero permissive fallback.
 *  - Missing or invalid `currentOrigin` yields an empty allowlist (all messages rejected).
 *  - Cross-origin messages must originate both from an allowlisted origin AND a known source window.
 */

import { NEXUS_AGENTS } from "../constants/platoon.ts";

export const APPROVED_ECOSYSTEM_ORIGINS = Object.freeze([
  "https://itsyouonline.com",
  "https://www.itsyouonline.com",
] as const);

const AGENT_SUBDOMAIN_HOST_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.itsyouonline\.com$/;

const SAFE_AGENT_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_AGENT_NAME_LENGTH = 120;
const MAX_DELIVERABLE_CONTENT_LENGTH = 50_000;
const MAX_TIMESTAMP_LENGTH = 64;
const MAX_SANDBOX_PAYLOAD_LENGTH = 4_000;

export const ALLOWED_PORTAL_MESSAGE_TYPES = Object.freeze([
  "SUBMIT_DELIVERABLE",
  "AGENT_READY",
  "AGENT_HEARTBEAT",
  "AGENT_ERROR",
] as const);

export type PortalMessageType = (typeof ALLOWED_PORTAL_MESSAGE_TYPES)[number];

const PORTAL_MESSAGE_TYPE_SET = new Set<string>(ALLOWED_PORTAL_MESSAGE_TYPES);

export interface ValidatedPortalMessage {
  type: PortalMessageType;
  agentId: string;
  agentName?: string;
  content?: string;
  timestamp?: string;
}

export type PortalMessageValidationResult =
  | {
      ok: true;
      origin: string;
      message: ValidatedPortalMessage;
    }
  | {
      ok: false;
      reason:
        | "missing_origin_config"
        | "untrusted_origin"
        | "missing_source"
        | "untrusted_source"
        | "invalid_payload";
    };

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Validates and canonicalizes an origin string strictly.
 * Allows HTTPS origins with no credentials/path/query/fragment, or loopback HTTP origins for local dev.
 */
export function normalizeStrictOrigin(rawOrigin: unknown): string | null {
  if (typeof rawOrigin !== "string") return null;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed === "*" || trimmed.toLowerCase() === "null") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  if (parsed.origin !== trimmed) {
    return null;
  }

  if (parsed.protocol === "https:") {
    return parsed.origin;
  }

  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname.toLowerCase())) {
    return parsed.origin;
  }

  return null;
}

function buildApprovedAgentOrigins(): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const agent of NEXUS_AGENTS) {
    if (!agent?.url) continue;
    try {
      const parsed = new URL(agent.url);
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === "https:" &&
        !parsed.port &&
        !parsed.username &&
        !parsed.password &&
        AGENT_SUBDOMAIN_HOST_REGEX.test(hostname)
      ) {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore invalid agent URLs
    }
  }
  return origins;
}

export const APPROVED_AGENT_ORIGINS: ReadonlySet<string> = buildApprovedAgentOrigins();

/**
 * Verifies an iframe `src` attribute belongs strictly to an approved HTTPS agent origin.
 * Excludes same-origin proxy iframes (`/api/browser/proxy`), relative URLs, `blob:`, `data:`, and `about:`.
 */
export function isTrustedAgentIframeSrc(
  rawSrc: unknown,
  approvedAgentOrigins: ReadonlySet<string> = APPROVED_AGENT_ORIGINS
): boolean {
  if (typeof rawSrc !== "string") return false;
  const trimmed = rawSrc.trim();
  if (!trimmed || !trimmed.toLowerCase().startsWith("https://")) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      approvedAgentOrigins.has(parsed.origin)
    );
  } catch {
    return false;
  }
}

/**
 * Builds the explicit allowed origin set for a host window.
 * Fails closed to an empty set if `currentOrigin` is missing or invalid.
 */
export function buildAllowedPortalMessageOrigins(
  currentOrigin: unknown
): ReadonlySet<string> {
  const normalizedCurrent = normalizeStrictOrigin(currentOrigin);
  if (!normalizedCurrent) {
    return new Set<string>();
  }

  const allowed = new Set<string>([normalizedCurrent]);
  for (const origin of APPROVED_ECOSYSTEM_ORIGINS) {
    allowed.add(origin);
  }
  for (const origin of APPROVED_AGENT_ORIGINS) {
    allowed.add(origin);
  }
  return allowed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates `event.origin`, `event.source`, and payload contract for `App.tsx`'s
 * `window` message listener before any state mutation is permitted.
 */
export function validatePortalWindowMessage(
  event: { origin?: unknown; source?: unknown; data?: unknown },
  options: {
    currentOrigin: unknown;
    allowedOrigins?: ReadonlySet<string>;
    allowedSources?: ReadonlySet<unknown>;
    selfWindow?: unknown;
  }
): PortalMessageValidationResult {
  const normalizedCurrent = normalizeStrictOrigin(options.currentOrigin);
  const allowedOrigins =
    options.allowedOrigins ?? buildAllowedPortalMessageOrigins(options.currentOrigin);

  if (!normalizedCurrent || allowedOrigins.size === 0) {
    return { ok: false, reason: "missing_origin_config" };
  }

  const origin = normalizeStrictOrigin(event?.origin);
  if (!origin || !allowedOrigins.has(origin)) {
    return { ok: false, reason: "untrusted_origin" };
  }

  if (event?.source == null) {
    return { ok: false, reason: "missing_source" };
  }

  const isSameOrigin = origin === normalizedCurrent;
  const isSelfSource =
    options.selfWindow !== undefined && event.source === options.selfWindow;
  const isKnownChildSource = Boolean(options.allowedSources?.has(event.source));

  if (isSameOrigin) {
    if (!isSelfSource && !isKnownChildSource) {
      return { ok: false, reason: "untrusted_source" };
    }
  } else if (!isKnownChildSource) {
    return { ok: false, reason: "untrusted_source" };
  }

  const data = event?.data;
  if (!isPlainObject(data)) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (typeof data.type !== "string" || !PORTAL_MESSAGE_TYPE_SET.has(data.type)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const type = data.type as PortalMessageType;

  if (typeof data.agentId !== "string") {
    return { ok: false, reason: "invalid_payload" };
  }
  const agentId = data.agentId.trim();
  if (!SAFE_AGENT_ID_REGEX.test(agentId)) {
    return { ok: false, reason: "invalid_payload" };
  }

  let agentName: string | undefined;
  if (data.agentName !== undefined) {
    if (typeof data.agentName !== "string") {
      return { ok: false, reason: "invalid_payload" };
    }
    const trimmedName = data.agentName.trim();
    if (!trimmedName || trimmedName.length > MAX_AGENT_NAME_LENGTH) {
      return { ok: false, reason: "invalid_payload" };
    }
    agentName = trimmedName;
  }

  let content: string | undefined;
  let timestamp: string | undefined;

  if (type === "SUBMIT_DELIVERABLE") {
    if (typeof data.content !== "string") {
      return { ok: false, reason: "invalid_payload" };
    }
    if (
      data.content.trim().length === 0 ||
      data.content.length > MAX_DELIVERABLE_CONTENT_LENGTH
    ) {
      return { ok: false, reason: "invalid_payload" };
    }
    content = data.content;

    if (data.timestamp !== undefined) {
      if (
        typeof data.timestamp !== "string" ||
        data.timestamp.length > MAX_TIMESTAMP_LENGTH ||
        !Number.isFinite(Date.parse(data.timestamp))
      ) {
        return { ok: false, reason: "invalid_payload" };
      }
      timestamp = data.timestamp;
    }
  }

  return {
    ok: true,
    origin,
    message: {
      type,
      agentId,
      ...(agentName !== undefined ? { agentName } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(timestamp !== undefined ? { timestamp } : {}),
    },
  };
}

export interface WeaverElementAnnotation {
  tagName: string;
  domPath: string;
  className: string;
  textSnippet: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type WeaverSandboxMessageType =
  | "SANDBOX_READY"
  | "RENDER_ERROR"
  | "RENDER_WARNING"
  | "RENDER_SUCCESS"
  | "ELEMENT_SELECTED";

const WEAVER_SANDBOX_TYPES = new Set<string>([
  "SANDBOX_READY",
  "RENDER_ERROR",
  "RENDER_WARNING",
  "RENDER_SUCCESS",
  "ELEMENT_SELECTED",
]);

const SAFE_TAG_NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

export type WeaverSandboxValidationResult =
  | {
      ok: true;
      message: {
        type: WeaverSandboxMessageType;
        payload?: string;
        annotation?: WeaverElementAnnotation;
      };
    }
  | {
      ok: false;
      reason: "untrusted_origin" | "untrusted_source" | "invalid_payload";
    };

/**
 * Validates messages emitted from the sandboxed (`sandbox="allow-scripts"`) Weaver iframe.
 * Requires both exact iframe `Window` identity and opaque `"null"` sandbox origin.
 */
export function validateWeaverSandboxMessage(
  event: { origin?: unknown; source?: unknown; data?: unknown },
  expectedSource: unknown
): WeaverSandboxValidationResult {
  if (!expectedSource || event?.source !== expectedSource) {
    return { ok: false, reason: "untrusted_source" };
  }

  if (event?.origin !== "null") {
    return { ok: false, reason: "untrusted_origin" };
  }

  const data = event?.data;
  if (!isPlainObject(data)) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (typeof data.type !== "string" || !WEAVER_SANDBOX_TYPES.has(data.type)) {
    return { ok: false, reason: "invalid_payload" };
  }
  const type = data.type as WeaverSandboxMessageType;

  if (type === "RENDER_ERROR" || type === "RENDER_WARNING") {
    const payload =
      typeof data.payload === "string"
        ? data.payload.slice(0, MAX_SANDBOX_PAYLOAD_LENGTH)
        : type === "RENDER_ERROR"
          ? "Sandbox error"
          : undefined;
    return { ok: true, message: { type, payload } };
  }

  if (type === "ELEMENT_SELECTED") {
    const rawAnn = data.annotation;
    if (!isPlainObject(rawAnn)) {
      return { ok: false, reason: "invalid_payload" };
    }
    const tagName = typeof rawAnn.tagName === "string" ? rawAnn.tagName.trim().toLowerCase() : "";
    const domPath = typeof rawAnn.domPath === "string" ? rawAnn.domPath.trim() : "";
    const className = typeof rawAnn.className === "string" ? rawAnn.className.trim() : "";
    const textSnippet = typeof rawAnn.textSnippet === "string" ? rawAnn.textSnippet.trim() : "";
    const rawRect = rawAnn.rect;

    if (
      !SAFE_TAG_NAME_REGEX.test(tagName) ||
      !domPath ||
      domPath.length > 300 ||
      className.length > 400 ||
      textSnippet.length > 240 ||
      !isPlainObject(rawRect)
    ) {
      return { ok: false, reason: "invalid_payload" };
    }

    const x = rawRect.x;
    const y = rawRect.y;
    const width = rawRect.width;
    const height = rawRect.height;
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof width !== "number" ||
      !Number.isFinite(width) ||
      typeof height !== "number" ||
      !Number.isFinite(height)
    ) {
      return { ok: false, reason: "invalid_payload" };
    }

    return {
      ok: true,
      message: {
        type: "ELEMENT_SELECTED",
        annotation: {
          tagName,
          domPath,
          className,
          textSnippet,
          rect: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          },
        },
      },
    };
  }

  return { ok: true, message: { type } };
}
