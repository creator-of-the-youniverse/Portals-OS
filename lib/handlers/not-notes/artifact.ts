/**
 * /api/not-notes/artifact (+ /update, /publish, /unpublish actions)
 *
 * Vercel Serverless Function — authenticated owner widget lifecycle:
 *   - POST /api/not-notes/artifact  -> saves a new private widget draft
 *   - PUT  /api/not-notes/artifact  -> updates an existing owned widget (title/code/deps)
 *   - PATCH /api/not-notes/artifact -> updates or toggles publication state via `action`
 *   - POST /api/not-notes/update    -> alias for widget update
 *   - POST /api/not-notes/publish   -> explicitly publishes an owned widget
 *   - POST /api/not-notes/unpublish -> explicitly unpublishes an owned widget (keeps private draft)
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { authenticateRequest } from "../../serverlessAuth.ts";
import { assertSafeDatabaseTarget, enforceAntiCsrf, extractTenantOriginHandle } from "../../creatorOwnership.ts";
import {
  buildWidgetContentPayload,
  formatOwnerWidget,
  parseWidgetContent,
  sanitizeWidgetDependencies,
} from "../../widgetLifecycle.ts";

export type ArtifactOperation = "create" | "update" | "publish" | "unpublish";

function resolveOperation(
  req: any,
  deps: any
): { ok: true; operation: ArtifactOperation } | { ok: false; status: number; error: string; message: string } {
  const method = String(req?.method ?? "").toUpperCase();
  const forced = deps?.forcedAction as ArtifactOperation | undefined;

  if (forced) {
    const allowedMethods =
      forced === "update"
        ? new Set(["POST", "PUT", "PATCH"])
        : forced === "create"
          ? new Set(["POST"])
          : new Set(["POST", "PATCH"]);
    if (!allowedMethods.has(method)) {
      return {
        ok: false,
        status: 405,
        error: "method_not_allowed",
        message: `HTTP method ${method} is not allowed for ${forced}.`,
      };
    }
    return { ok: true, operation: forced };
  }

  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    return {
      ok: false,
      status: 405,
      error: "method_not_allowed",
      message: `HTTP method ${method} is not allowed.`,
    };
  }

  const rawAction = req?.body?.action;
  if (rawAction !== undefined && rawAction !== null && rawAction !== "") {
    if (
      rawAction === "create" ||
      rawAction === "update" ||
      rawAction === "publish" ||
      rawAction === "unpublish"
    ) {
      if (rawAction === "create" && method !== "POST") {
        return {
          ok: false,
          status: 405,
          error: "method_not_allowed",
          message: "Create operation requires POST.",
        };
      }
      return { ok: true, operation: rawAction };
    }
    return {
      ok: false,
      status: 400,
      error: "invalid_action",
      message: "action must be one of create, update, publish, or unpublish.",
    };
  }

  if (method === "PUT" || method === "PATCH") {
    return { ok: true, operation: "update" };
  }

  return { ok: true, operation: "create" };
}

export default async function handler(req: any, res: any, deps: any = {}) {
  const opRes = resolveOperation(req, deps);
  if (!opRes.ok) {
    const errRes = opRes as { ok: false; status: number; error: string; message: string };
    return res.status(errRes.status).json({
      success: false,
      error: errRes.error,
      message: errRes.message,
    });
  }

  // Enforce CSRF for any Origin-bearing request and for cookie-authenticated requests
  // (programmatic Bearer-only callers without an Origin header remain compatible).
  const hasOriginHeader = Boolean(req?.headers?.origin ?? req?.headers?.Origin);
  const rawAuthHeader = req?.headers?.authorization ?? req?.headers?.Authorization;
  const hasBearerAuth =
    typeof rawAuthHeader === "string" &&
    rawAuthHeader.startsWith("Bearer ") &&
    rawAuthHeader.slice(7).trim().length > 0;

  if (hasOriginHeader || !hasBearerAuth) {
    const normalizedHeaders =
      !req?.headers?.origin && req?.headers?.Origin
        ? { ...req.headers, origin: req.headers.Origin }
        : req?.headers;
    const csrfReq = normalizedHeaders === req?.headers ? req : { ...req, headers: normalizedHeaders };
    const csrf = enforceAntiCsrf(csrfReq, deps.env ?? process.env, {
      allowSameOriginTenantSubdomain: true,
    });
    if (csrf.blocked) {
      return res.status(403).json({
        success: false,
        error: "csrf_rejected",
        message: csrf.reason,
      });
    }
  }

  const auth = await authenticateRequest(req, deps);
  if (!auth.ok) {
    const errAuth = auth as { status: number; error: string; message: string };
    return res.status(errAuth.status).json({
      success: false,
      error: errAuth.error,
      message: errAuth.message,
    });
  }

  const originTenantHandle = extractTenantOriginHandle(req);
  if (originTenantHandle && originTenantHandle !== auth.user.handle.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: "csrf_rejected",
      message: "Origin tenant handle does not match authorized target Youniverse.",
    });
  }

  const databaseUrl = deps.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !deps.sql) {
    return res.status(500).json({ success: false, error: "server_misconfiguration" });
  }
  if (!deps.sql) {
    assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  }

  const operation = opRes.operation;
  const body = req.body ?? {};

  try {
    const sql = deps.sql ?? neon(databaseUrl!);

    // ── CREATE PRIVATE DRAFT ────────────────────────────────────────────────
    if (operation === "create") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const code = typeof body.code === "string" ? body.code : "";
      if (!title || !code.trim()) {
        return res.status(400).json({
          success: false,
          error: "bad_request",
          message: "Component title and code are required.",
        });
      }

      const id = nanoid();
      const nowIso = new Date().toISOString();
      // Server authority: new artifacts always start as private drafts;
      // client-supplied isPublished / publicationStatus are ignored.
      const content = buildWidgetContentPayload({
        code,
        dependencies: body.dependencies,
        publicationStatus: "draft",
        publishedAt: null,
        unpublishedAt: null,
      });

      await sql`
        INSERT INTO "NotNote" (
          id,
          "youniverseId",
          title,
          content,
          status,
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${id},
          ${auth.user.youniverseId},
          ${title},
          ${JSON.stringify(content)},
          'APPROVED',
          NOW(),
          NOW()
        )
      `;

      const formatted = formatOwnerWidget(
        {
          id,
          youniverseId: auth.user.youniverseId,
          title,
          content,
          status: "APPROVED",
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        auth.user.youniverseId
      )!;

      return res.status(200).json({
        success: true,
        artifact: formatted,
        widget: formatted,
      });
    }

    // ── UPDATE / PUBLISH / UNPUBLISH EXISTING WIDGET ────────────────────────
    const rawId = body.id ?? body.widgetId;
    const widgetId = typeof rawId === "string" ? rawId.trim() : "";
    if (!widgetId) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        message: "Widget id is required.",
      });
    }

    const existingRows = await sql`
      SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
      FROM "NotNote"
      WHERE id = ${widgetId}
      LIMIT 1
    `;

    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "widget_not_found",
        message: "Widget not found.",
      });
    }

    const existing = existingRows[0];
    if (String(existing.youniverseId) !== String(auth.user.youniverseId)) {
      return res.status(403).json({
        success: false,
        error: "forbidden_widget_ownership",
        message: "You are not authorized to modify this widget.",
      });
    }

    const parsedExisting = parseWidgetContent(existing.content);
    if (String(existing.status ?? "APPROVED") !== "APPROVED" || !parsedExisting || parsedExisting.type !== "REACT_WIDGET") {
      return res.status(400).json({
        success: false,
        error: "invalid_widget_artifact",
        message: "Artifact is not an approved React widget.",
      });
    }

    const nowIso = new Date().toISOString();
    let nextTitle = String(existing.title ?? "").trim();
    let nextCode = parsedExisting.code;
    let nextDeps = parsedExisting.dependencies;
    let nextPubStatus = parsedExisting.publicationStatus;
    let nextPublishedAt = parsedExisting.publishedAt;
    let nextUnpublishedAt = parsedExisting.unpublishedAt;

    if (operation === "update") {
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim()) {
          return res.status(400).json({
            success: false,
            error: "bad_request",
            message: "Widget title cannot be empty.",
          });
        }
        nextTitle = body.title.trim();
      }
      if (body.code !== undefined) {
        if (typeof body.code !== "string" || !body.code.trim()) {
          return res.status(400).json({
            success: false,
            error: "bad_request",
            message: "Widget code cannot be empty.",
          });
        }
        nextCode = body.code;
      }
      if (body.dependencies !== undefined) {
        nextDeps = sanitizeWidgetDependencies(body.dependencies);
      }
      if (!nextTitle || !nextCode.trim()) {
        return res.status(400).json({
          success: false,
          error: "bad_request",
          message: "Widget title and code are required.",
        });
      }
    } else if (operation === "publish") {
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim()) {
          return res.status(400).json({
            success: false,
            error: "bad_request",
            message: "Widget title cannot be empty.",
          });
        }
        nextTitle = body.title.trim();
      }
      if (body.code !== undefined) {
        if (typeof body.code !== "string" || !body.code.trim()) {
          return res.status(400).json({
            success: false,
            error: "bad_request",
            message: "Widget code cannot be empty.",
          });
        }
        nextCode = body.code;
      }
      if (body.dependencies !== undefined) {
        nextDeps = sanitizeWidgetDependencies(body.dependencies);
      }
      if (!nextTitle || !nextCode.trim()) {
        return res.status(400).json({
          success: false,
          error: "bad_request",
          message: "Cannot publish an empty widget.",
        });
      }
      nextPubStatus = "published";
      nextPublishedAt = nowIso;
      nextUnpublishedAt = null;
    } else if (operation === "unpublish") {
      nextPubStatus = "unpublished";
      nextUnpublishedAt = nowIso;
    }

    const nextContent = buildWidgetContentPayload({
      code: nextCode,
      dependencies: nextDeps,
      publicationStatus: nextPubStatus,
      publishedAt: nextPublishedAt,
      unpublishedAt: nextUnpublishedAt,
    });

    await sql`
      UPDATE "NotNote"
      SET title = ${nextTitle},
          content = ${JSON.stringify(nextContent)},
          "updatedAt" = NOW()
      WHERE id = ${widgetId}
        AND "youniverseId" = ${auth.user.youniverseId}
    `;

    const formatted = formatOwnerWidget(
      {
        id: widgetId,
        youniverseId: auth.user.youniverseId,
        title: nextTitle,
        content: nextContent,
        status: existing.status ?? "APPROVED",
        createdAt: existing.createdAt ?? nowIso,
        updatedAt: nowIso,
      },
      auth.user.youniverseId
    )!;

    return res.status(200).json({
      success: true,
      artifact: formatted,
      widget: formatted,
    });
  } catch (error) {
    console.error("[NotNotes Artifact] Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
