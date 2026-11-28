/**
 * lib/collectionPoints.ts
 *
 * Youniverse-isolated Collection Point submission validation, Neon SQL
 * persistence, owner retrieval, and CSV export helpers.
 *
 * Critical Data Boundary:
 *   - Every submission is strictly bound to a single `youniverseId`.
 *   - Public endpoints may only submit to a resolved live & verified handle.
 *   - Reading submissions requires authenticated owner access to `youniverseId`.
 *   - Input fields are sanitized and total payload size is strictly capped.
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { assertSafeDatabaseTarget } from "./creatorOwnership.ts";

export type CollectionPointType =
  | "newsletter"
  | "lead_capture"
  | "booking"
  | "digital_download";

export const VALID_COLLECTION_TYPES = new Set<CollectionPointType>([
  "newsletter",
  "lead_capture",
  "booking",
  "digital_download",
]);

export const MAX_COLLECTION_PAYLOAD_BYTES = 16_384; // 16 KB hard cap
const MAX_EMAIL_LEN = 254;
const MAX_NAME_LEN = 160;
const MAX_MESSAGE_LEN = 2_000;
const MAX_FIELD_KEYS = 25;
const MAX_FIELD_VALUE_LEN = 500;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface CollectionPointSubmissionRecord {
  id: string;
  youniverseId: string;
  widgetId: string | null;
  collectionType: CollectionPointType;
  email: string | null;
  name: string | null;
  message: string | null;
  payloadJson: Record<string, unknown>;
  sourceOrigin: string | null;
  createdAt: string;
}

export interface SanitizedCollectionInput {
  collectionType: CollectionPointType;
  widgetId: string | null;
  email: string | null;
  name: string | null;
  message: string | null;
  payloadJson: Record<string, unknown>;
  sourceOrigin: string | null;
}

export type SanitizeCollectionResult =
  | { ok: true; data: SanitizedCollectionInput }
  | { ok: false; status: 400 | 413; error: string; message: string };

export interface CollectionPointDeps {
  sql?: any;
  databaseUrl?: string;
  env?: Record<string, string | undefined>;
}

const textEncoder = new TextEncoder();

function stripControlChars(raw: string): string {
  return raw.replace(CONTROL_CHAR_REGEX, "").trim();
}

function sanitizeOptionalString(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = stripControlChars(raw);
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function sanitizeCustomFields(raw: unknown): Record<string, string | number | boolean | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string | number | boolean | null> = {};
  let count = 0;
  for (const [rawKey, rawVal] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_FIELD_KEYS) break;
    const key = stripControlChars(String(rawKey)).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);
    if (!key) continue;

    if (typeof rawVal === "string") {
      out[key] = stripControlChars(rawVal).slice(0, MAX_FIELD_VALUE_LEN);
      count++;
    } else if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      out[key] = rawVal;
      count++;
    } else if (typeof rawVal === "boolean") {
      out[key] = rawVal;
      count++;
    } else if (rawVal === null) {
      out[key] = null;
      count++;
    }
  }
  return out;
}

export function sanitizeCollectionSubmissionBody(
  body: any,
  sourceOrigin?: string | null
): SanitizeCollectionResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "bad_request",
      message: "Submission body must be a JSON object.",
    };
  }

  let rawBytes = 0;
  try {
    rawBytes = textEncoder.encode(JSON.stringify(body)).byteLength;
  } catch {
    return {
      ok: false,
      status: 400,
      error: "bad_request",
      message: "Submission body is not serializable.",
    };
  }
  if (rawBytes > MAX_COLLECTION_PAYLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "payload_too_large",
      message: `Submission payload exceeds ${MAX_COLLECTION_PAYLOAD_BYTES} byte limit.`,
    };
  }

  const rawType = typeof body.collectionType === "string"
    ? body.collectionType.trim().toLowerCase()
    : typeof body.type === "string"
      ? body.type.trim().toLowerCase()
      : "";

  if (!VALID_COLLECTION_TYPES.has(rawType as CollectionPointType)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_collection_type",
      message: "collectionType must be one of newsletter, lead_capture, booking, or digital_download.",
    };
  }
  const collectionType = rawType as CollectionPointType;

  const rawEmail = sanitizeOptionalString(body.email, MAX_EMAIL_LEN);
  const email = rawEmail ? rawEmail.toLowerCase() : null;
  if (email && !EMAIL_REGEX.test(email)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_email",
      message: "Provided email address is invalid.",
    };
  }

  if ((collectionType === "newsletter" || collectionType === "digital_download") && !email) {
    return {
      ok: false,
      status: 400,
      error: "email_required",
      message: `An email address is required for ${collectionType} submissions.`,
    };
  }

  const name = sanitizeOptionalString(body.name, MAX_NAME_LEN);
  const message = sanitizeOptionalString(body.message ?? body.notes, MAX_MESSAGE_LEN);
  const widgetId = sanitizeOptionalString(body.widgetId, 80);

  const fieldsSource =
    body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? body.fields
      : body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? body.payload
        : {};
  const sanitizedFields = sanitizeCustomFields(fieldsSource);

  if (
    !email &&
    !name &&
    !message &&
    Object.keys(sanitizedFields).length === 0
  ) {
    return {
      ok: false,
      status: 400,
      error: "empty_submission",
      message: "Submission must include at least an email, name, message, or custom field.",
    };
  }

  const cleanOrigin = sanitizeOptionalString(sourceOrigin ?? null, 200);

  return {
    ok: true,
    data: {
      collectionType,
      widgetId,
      email,
      name,
      message,
      payloadJson: sanitizedFields,
      sourceOrigin: cleanOrigin,
    },
  };
}

function resolveSql(deps: CollectionPointDeps = {}) {
  if (deps.sql) return deps.sql;
  const env = deps.env ?? process.env;
  const databaseUrl = deps.databaseUrl ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured for Collection Point operations.");
  }
  assertSafeDatabaseTarget(databaseUrl, env);
  return neon(databaseUrl);
}

function parseJsonObject(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function mapRowToSubmission(row: any): CollectionPointSubmissionRecord {
  const created = row.created_at ? new Date(row.created_at) : new Date();
  return {
    id: String(row.id),
    youniverseId: String(row.youniverse_id),
    widgetId: row.widget_id ? String(row.widget_id) : null,
    collectionType: row.collection_type as CollectionPointType,
    email: row.email ? String(row.email) : null,
    name: row.name ? String(row.name) : null,
    message: row.message ? String(row.message) : null,
    payloadJson: parseJsonObject(row.payload_json),
    sourceOrigin: row.source_origin ? String(row.source_origin) : null,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
  };
}

export async function createCollectionPointSubmission(
  youniverseId: string,
  input: SanitizedCollectionInput,
  deps: CollectionPointDeps = {}
): Promise<CollectionPointSubmissionRecord> {
  const cleanOwnerId = typeof youniverseId === "string" ? youniverseId.trim() : "";
  if (!cleanOwnerId) {
    throw new Error("youniverseId is required for Collection Point submission.");
  }

  const sql = resolveSql(deps);
  const id = `cps_${nanoid(16)}`;
  const nowIso = new Date().toISOString();
  const payloadJsonString = JSON.stringify(input.payloadJson);

  await sql`
    INSERT INTO collection_point_submissions (
      id,
      youniverse_id,
      widget_id,
      collection_type,
      email,
      name,
      message,
      payload_json,
      source_origin,
      created_at
    )
    VALUES (
      ${id},
      ${cleanOwnerId},
      ${input.widgetId},
      ${input.collectionType},
      ${input.email},
      ${input.name},
      ${input.message},
      ${payloadJsonString}::jsonb,
      ${input.sourceOrigin},
      NOW()
    )
  `;

  return {
    id,
    youniverseId: cleanOwnerId,
    widgetId: input.widgetId,
    collectionType: input.collectionType,
    email: input.email,
    name: input.name,
    message: input.message,
    payloadJson: input.payloadJson,
    sourceOrigin: input.sourceOrigin,
    createdAt: nowIso,
  };
}

export async function listCollectionPointSubmissions(
  youniverseId: string,
  options: { widgetId?: string; collectionType?: CollectionPointType; limit?: number } = {},
  deps: CollectionPointDeps = {}
): Promise<CollectionPointSubmissionRecord[]> {
  const cleanOwnerId = typeof youniverseId === "string" ? youniverseId.trim() : "";
  if (!cleanOwnerId) {
    throw new Error("youniverseId is required.");
  }

  const sql = resolveSql(deps);
  const limit = Math.min(Math.max(Number(options.limit ?? 100) || 100, 1), 500);

  let rows: any[];
  if (options.widgetId && options.collectionType) {
    rows = await sql`
      SELECT id, youniverse_id, widget_id, collection_type, email, name, message, payload_json, source_origin, created_at
      FROM collection_point_submissions
      WHERE youniverse_id = ${cleanOwnerId}
        AND widget_id = ${options.widgetId}
        AND collection_type = ${options.collectionType}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (options.widgetId) {
    rows = await sql`
      SELECT id, youniverse_id, widget_id, collection_type, email, name, message, payload_json, source_origin, created_at
      FROM collection_point_submissions
      WHERE youniverse_id = ${cleanOwnerId}
        AND widget_id = ${options.widgetId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (options.collectionType) {
    rows = await sql`
      SELECT id, youniverse_id, widget_id, collection_type, email, name, message, payload_json, source_origin, created_at
      FROM collection_point_submissions
      WHERE youniverse_id = ${cleanOwnerId}
        AND collection_type = ${options.collectionType}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT id, youniverse_id, widget_id, collection_type, email, name, message, payload_json, source_origin, created_at
      FROM collection_point_submissions
      WHERE youniverse_id = ${cleanOwnerId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return (Array.isArray(rows) ? rows : [])
    .filter((r: any) => String(r.youniverse_id) === cleanOwnerId)
    .map(mapRowToSubmission);
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @) and applies RFC 4180
 * CSV quoting.
 */
function escapeCsvCell(raw: unknown): string {
  let str = raw == null ? "" : String(raw);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatSubmissionsCsv(
  submissions: CollectionPointSubmissionRecord[]
): string {
  const headers = [
    "id",
    "createdAt",
    "collectionType",
    "widgetId",
    "email",
    "name",
    "message",
    "fieldsJson",
    "sourceOrigin",
  ];
  const lines = [headers.join(",")];
  for (const s of submissions) {
    lines.push(
      [
        escapeCsvCell(s.id),
        escapeCsvCell(s.createdAt),
        escapeCsvCell(s.collectionType),
        escapeCsvCell(s.widgetId ?? ""),
        escapeCsvCell(s.email ?? ""),
        escapeCsvCell(s.name ?? ""),
        escapeCsvCell(s.message ?? ""),
        escapeCsvCell(JSON.stringify(s.payloadJson ?? {})),
        escapeCsvCell(s.sourceOrigin ?? ""),
      ].join(",")
    );
  }
  return lines.join("\r\n");
}
