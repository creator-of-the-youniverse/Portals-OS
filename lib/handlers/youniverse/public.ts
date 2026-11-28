import { neon } from "@neondatabase/serverless";
import { assertSafeDatabaseTarget } from "../../creatorOwnership.ts";
import { getPublicBadgesForIdentity } from "../../genesisService.ts";
import { formatPublicWidget, parseWidgetContent, type PublicWidgetDTO } from "../../widgetLifecycle.ts";
import {
  createCollectionPointSubmission,
  sanitizeCollectionSubmissionBody,
} from "../../collectionPoints.ts";

function isUndefinedTableError(err: any): boolean {
  return err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message ?? ""));
}

/**
 * Fails closed unless `email_verified_at` is a non-empty valid timestamp.
 * Any null, undefined, empty string, malformed date, or non-date value is unverified.
 */
export function isIdentityEmailVerified(value: unknown): boolean {
  if (value == null) return false;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^\d+$/.test(trimmed)) return false;
    return Number.isFinite(Date.parse(trimmed));
  }
  return false;
}

export interface PublicYouniverseProfilePayload {
  handle: string;
  displayName: string;
  subdomain: string;
  type: string;
  plan: string;
  badges: any[];
}

/**
 * Explicit public allowlist serializer for GET /api/youniverse/:handle/public.
 * Never exposes `email`, `identity_id`, `email_verified_at`, or internal columns.
 */
export function buildPublicYouniversePayload(
  row: Record<string, any>,
  badges: any[]
): PublicYouniverseProfilePayload {
  return {
    handle: String(row.username),
    displayName: String(row.display_name),
    subdomain: String(row.subdomain),
    type: String(row.identity_type),
    plan: String(row.plan ?? "free"),
    badges: Array.isArray(badges) ? badges : [],
  };
}

export async function getPublishedWidgetsForIdentity(
  sql: any,
  identityId: string
): Promise<PublicWidgetDTO[]> {
  if (!identityId) return [];

  try {
    const rows = await sql`
      SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
      FROM "NotNote"
      WHERE "youniverseId" = ${identityId}
        AND status = 'APPROVED'
      ORDER BY "updatedAt" DESC, "createdAt" DESC
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    return rows
      .filter((row: any) => String(row?.youniverseId ?? identityId) === String(identityId))
      .map((row: any) => formatPublicWidget(row))
      .filter((w): w is PublicWidgetDTO => w !== null);
  } catch (err: any) {
    if (isUndefinedTableError(err)) {
      return [];
    }
    throw err;
  }
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const method = String(req?.method ?? "").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      success: false,
      error: "method_not_allowed",
    });
  }

  // Support both Express req.params and Vercel req.query
  const rawHandle = req.params?.handle || req.query?.handle;

  if (typeof rawHandle !== "string") {
    return res.status(400).json({
      success: false,
      error: "invalid_handle",
    });
  }

  const handle = rawHandle.toLowerCase().replace(/^@/, "");

  if (
    handle.length < 2 ||
    handle.length > 50 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(handle)
  ) {
    return res.status(400).json({
      success: false,
      error: "invalid_handle",
    });
  }

  const env = deps?.env ?? process.env;
  const databaseUrl = deps.databaseUrl ?? env.DATABASE_URL;

  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({
      success: false,
      error: "server_misconfiguration",
    });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, env);
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl);
    const rows = await sql`
      SELECT identity_id, username, display_name, subdomain, identity_type, plan, is_live, email_verified_at
      FROM youniverse_identities
      WHERE username = ${handle}
      LIMIT 1
    `;

    if (!Array.isArray(rows) || rows.length === 0 || rows[0]?.is_live !== true) {
      return res.status(404).json({
        success: false,
        error: "youniverse_not_found",
      });
    }

    const youniverse = rows[0];

    if (!isIdentityEmailVerified(youniverse.email_verified_at)) {
      if (typeof res.setHeader === "function") {
        res.setHeader("Cache-Control", "no-store");
      }
      return res.status(403).json({
        success: false,
        error: "youniverse_unverified",
        status: "unverified",
        message: "This Youniverse is pending identity verification and is not publicly available.",
      });
    }

    // ── POST: Public Collection Point Capture (strictly scoped to target Youniverse) ──
    if (method === "POST") {
      const targetYouniverseId = String(youniverse.identity_id ?? "").trim();
      if (!targetYouniverseId) {
        return res.status(404).json({
          success: false,
          error: "youniverse_not_found",
        });
      }

      const rawOrigin =
        req?.headers?.origin ??
        req?.headers?.Origin ??
        req?.headers?.referer ??
        req?.headers?.Referer ??
        null;
      const sanitized = sanitizeCollectionSubmissionBody(
        req.body,
        typeof rawOrigin === "string" ? rawOrigin : null
      );
      if (!sanitized.ok) {
        const errRes = sanitized as {
          ok: false;
          status: 400 | 413;
          error: string;
          message: string;
        };
        return res.status(errRes.status).json({
          success: false,
          error: errRes.error,
          message: errRes.message,
        });
      }

      // If widgetId is provided, verify it belongs to this Youniverse and is published
      if (sanitized.data.widgetId) {
        const widgetRows = await sql`
          SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
          FROM "NotNote"
          WHERE id = ${sanitized.data.widgetId}
          LIMIT 1
        `;
        const widgetRow = Array.isArray(widgetRows) && widgetRows.length > 0 ? widgetRows[0] : null;
        const parsedWidget = widgetRow ? parseWidgetContent(widgetRow.content) : null;
        if (
          !widgetRow ||
          String(widgetRow.youniverseId) !== targetYouniverseId ||
          String(widgetRow.status ?? "APPROVED") !== "APPROVED" ||
          !parsedWidget ||
          parsedWidget.publicationStatus !== "published"
        ) {
          return res.status(404).json({
            success: false,
            error: "widget_not_found",
            message: "Target published widget was not found in this Youniverse.",
          });
        }
      }

      const record = await createCollectionPointSubmission(targetYouniverseId, sanitized.data, {
        sql,
        env,
      });

      return res.status(201).json({
        success: true,
        submission: {
          id: record.id,
          collectionType: record.collectionType,
          widgetId: record.widgetId,
          createdAt: record.createdAt,
        },
      });
    }

    const badges = youniverse.identity_id
      ? await getPublicBadgesForIdentity(sql, String(youniverse.identity_id))
      : [];

    const publicWidgets = youniverse.identity_id
      ? await getPublishedWidgetsForIdentity(sql, String(youniverse.identity_id))
      : [];

    return res.status(200).json({
      success: true,
      youniverse: buildPublicYouniversePayload(youniverse, badges),
      publicWidgets,
    });
  } catch (error) {
    console.error("[YouniversePublic] Profile lookup failed:", error);
    return res.status(500).json({
      success: false,
      error: "public_profile_unavailable",
    });
  }
}
