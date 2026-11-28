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
 *   - POST /api/not-notes/archive   -> commits an owned widget or NotNotes artifact to Books OS
 */

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { authenticateRequest } from "../../serverlessAuth.ts";
import { assertSafeDatabaseTarget, enforceAntiCsrf, extractTenantOriginHandle } from "../../creatorOwnership.ts";
import {
  buildWidgetContentPayload,
  formatOwnerWidget,
  parseWidgetContent,
  resolveProjectFieldsFromBody,
  sanitizeWidgetDependencies,
} from "../../widgetLifecycle.ts";
import { extractEntryCode } from "../../weaverProject.ts";
import {
  archiveToBooksOs,
  buildWeaverBooksOsSnapshot,
  type BooksOsArchiveResult,
  type BooksOsEntryType,
} from "../../booksOsBridge.ts";

export type ArtifactOperation =
  | "create"
  | "update"
  | "publish"
  | "unpublish"
  | "archive"
  | "save_deliverable";

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
      rawAction === "unpublish" ||
      rawAction === "archive" ||
      rawAction === "save_deliverable"
    ) {
      if ((rawAction === "create" || rawAction === "save_deliverable") && method !== "POST") {
        return {
          ok: false,
          status: 405,
          error: "method_not_allowed",
          message: `${rawAction} operation requires POST.`,
        };
      }
      return { ok: true, operation: rawAction };
    }
    return {
      ok: false,
      status: 400,
      error: "invalid_action",
      message:
        "action must be one of create, update, publish, unpublish, archive, or save_deliverable.",
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

  // Strict owner -> active Youniverse boundary: reject any explicit targetHandle/handle
  // mismatch so Weaver builds can NEVER publish to another handle or agent subdomain.
  const rawRequestedHandle = body.targetHandle ?? body.handle ?? body.publishTarget;
  if (typeof rawRequestedHandle === "string" && rawRequestedHandle.trim().length > 0) {
    const normalizedTarget = rawRequestedHandle
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/^https?:\/\//, "")
      .split(".")[0];
    if (normalizedTarget !== auth.user.handle.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: "forbidden_youniverse_publish_target",
        message:
          "Weaver artifacts are strictly scoped to the active authenticated Youniverse and cannot publish to another handle or external subdomain.",
      });
    }
  }

  try {
    const sql = deps.sql ?? neon(databaseUrl!);

    // ── SAVE REAL AGENT PWA DELIVERABLE TO NOTNOTES ─────────────────────────
    if (operation === "save_deliverable") {
      const agentId = typeof body.agentId === "string" ? body.agentId.trim().toUpperCase() : "";
      const agentName = typeof body.agentName === "string" ? body.agentName.trim() : "";
      const agentRole = typeof body.agentRole === "string" ? body.agentRole.trim() : "";
      const agentUrl = typeof body.agentUrl === "string" ? body.agentUrl.trim() : "";
      const rawDeliverableContent =
        typeof body.content === "string"
          ? body.content
          : typeof body.bodyMarkdown === "string"
            ? body.bodyMarkdown
            : "";
      const deliverableContent = rawDeliverableContent.trim();

      if (!agentId || !deliverableContent) {
        return res.status(400).json({
          success: false,
          error: "bad_request",
          message: "agentId and deliverable content are required.",
        });
      }
      if (deliverableContent.length > 50_000) {
        return res.status(413).json({
          success: false,
          error: "payload_too_large",
          message: "Deliverable content exceeds 50,000 character limit.",
        });
      }

      const notNoteId = `nn_${nanoid(14)}`;
      const nowIso = new Date().toISOString();
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 140)
          : `${agentName || agentId}${agentRole ? ` (${agentRole})` : ""} Deliverable`;

      const contentPayload = {
        type: "AGENT_DELIVERABLE",
        agentId,
        agentName: agentName || agentId,
        agentRole,
        agentUrl,
        bodyMarkdown: deliverableContent,
        createdAt: nowIso,
      };

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
          ${notNoteId},
          ${auth.user.youniverseId},
          ${title},
          ${JSON.stringify(contentPayload)},
          'APPROVED',
          NOW(),
          NOW()
        )
      `;

      return res.status(200).json({
        success: true,
        deliverable: {
          notNoteId,
          youniverseId: auth.user.youniverseId,
          agentId,
          agentName: agentName || agentId,
          agentRole,
          agentUrl,
          title,
          content: deliverableContent,
          createdAt: nowIso,
        },
      });
    }

    // ── CREATE PRIVATE DRAFT ────────────────────────────────────────────────
    if (operation === "create") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const projectRes = resolveProjectFieldsFromBody(body, null);
      if (!projectRes.ok) {
        const errRes = projectRes as { ok: false; status: 400 | 413; error: string; message: string };
        return res.status(errRes.status).json({
          success: false,
          error: errRes.error,
          message: errRes.message,
        });
      }

      const rawCode = typeof body.code === "string" ? body.code : "";
      const code = rawCode.trim()
        ? rawCode
        : projectRes.files
          ? extractEntryCode(projectRes.files, projectRes.entryFile)
          : "";
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
        files: projectRes.files,
        entryFile: projectRes.entryFile,
        iterations: projectRes.iterations,
        sandboxConfig: projectRes.sandboxConfig,
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

    // ── ARCHIVE STANDALONE NOTNOTE / DAILY RECORD (NO WIDGET ID) ───────────
    const rawId = body.id ?? body.widgetId;
    const widgetId = typeof rawId === "string" ? rawId.trim() : "";

    if (operation === "archive" && !widgetId) {
      const requestedEntryType: BooksOsEntryType =
        body.entryType === "daily_record" || body.entryType === "notnote_artifact"
          ? body.entryType
          : "notnote_artifact";
      const standaloneTitle = typeof body.title === "string" ? body.title.trim() : "";
      const bodyMarkdown = typeof body.bodyMarkdown === "string" ? body.bodyMarkdown : "";
      const summary = typeof body.summary === "string" ? body.summary.trim() : "";

      if (!standaloneTitle || (!bodyMarkdown.trim() && !summary)) {
        return res.status(400).json({
          success: false,
          error: "bad_request",
          message: "Either widget id or (title + bodyMarkdown/summary) is required to archive.",
        });
      }

      const archiveRes = await archiveToBooksOs(
        {
          youniverseId: auth.user.youniverseId,
          entryType: requestedEntryType,
          title: standaloneTitle,
          summary: summary || null,
          bodyMarkdown: bodyMarkdown || summary,
          payloadJson:
            body.payloadJson && typeof body.payloadJson === "object" && !Array.isArray(body.payloadJson)
              ? body.payloadJson
              : { kind: requestedEntryType, title: standaloneTitle, summary },
          sourceArtifactId:
            typeof body.sourceArtifactId === "string" && body.sourceArtifactId.trim()
              ? body.sourceArtifactId.trim()
              : null,
          coordinates: body.coordinates ?? body.location,
          timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
        },
        { sql, env: deps.env, fetch: deps.fetch }
      );

      return res.status(200).json({
        success: true,
        deduplicated: archiveRes.deduplicated,
        archive: archiveRes.record,
        badge: archiveRes.badge,
      });
    }

    // ── UPDATE / PUBLISH / UNPUBLISH / ARCHIVE EXISTING WIDGET ──────────────
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
    let nextFiles = parsedExisting.schemaVersion === 2 ? parsedExisting.files : undefined;
    let nextEntryFile = parsedExisting.entryFile;
    let nextIterations = parsedExisting.iterations;
    let nextSandboxConfig = parsedExisting.sandboxConfig;
    let nextPubStatus = parsedExisting.publicationStatus;
    let nextPublishedAt = parsedExisting.publishedAt;
    let nextUnpublishedAt = parsedExisting.unpublishedAt;
    let nextBooksOsArchive = parsedExisting.booksOsArchive;
    let archiveResult: BooksOsArchiveResult | null = null;

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

      const projectRes = resolveProjectFieldsFromBody(body, parsedExisting);
      if (!projectRes.ok) {
        const errRes = projectRes as { ok: false; status: 400 | 413; error: string; message: string };
        return res.status(errRes.status).json({
          success: false,
          error: errRes.error,
          message: errRes.message,
        });
      }
      nextFiles = projectRes.files;
      nextEntryFile = projectRes.entryFile ?? nextEntryFile;
      nextIterations = projectRes.iterations ?? nextIterations;
      nextSandboxConfig = projectRes.sandboxConfig ?? nextSandboxConfig;
      if (nextFiles) {
        nextCode = extractEntryCode(nextFiles, nextEntryFile);
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

      const projectRes = resolveProjectFieldsFromBody(body, parsedExisting);
      if (!projectRes.ok) {
        const errRes = projectRes as { ok: false; status: 400 | 413; error: string; message: string };
        return res.status(errRes.status).json({
          success: false,
          error: errRes.error,
          message: errRes.message,
        });
      }
      nextFiles = projectRes.files;
      nextEntryFile = projectRes.entryFile ?? nextEntryFile;
      nextIterations = projectRes.iterations ?? nextIterations;
      nextSandboxConfig = projectRes.sandboxConfig ?? nextSandboxConfig;
      if (nextFiles) {
        nextCode = extractEntryCode(nextFiles, nextEntryFile);
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
    } else if (operation === "archive") {
      if (body.title !== undefined && typeof body.title === "string" && body.title.trim()) {
        nextTitle = body.title.trim();
      }
      if (body.files !== undefined || body.code !== undefined || body.dependencies !== undefined) {
        if (body.dependencies !== undefined) {
          nextDeps = sanitizeWidgetDependencies(body.dependencies);
        }
        const projectRes = resolveProjectFieldsFromBody(body, parsedExisting);
        if (!projectRes.ok) {
          const errRes = projectRes as { ok: false; status: 400 | 413; error: string; message: string };
          return res.status(errRes.status).json({
            success: false,
            error: errRes.error,
            message: errRes.message,
          });
        }
        nextFiles = projectRes.files;
        nextEntryFile = projectRes.entryFile ?? nextEntryFile;
        nextIterations = projectRes.iterations ?? nextIterations;
        nextSandboxConfig = projectRes.sandboxConfig ?? nextSandboxConfig;
        if (nextFiles) {
          nextCode = extractEntryCode(nextFiles, nextEntryFile);
        }
      }
    }

    const shouldArchiveToBooksOs =
      operation === "archive" || (operation === "publish" && body.archiveToBooksOs === true);

    if (shouldArchiveToBooksOs) {
      const resolvedFiles = nextFiles ?? parsedExisting.files;
      const snapshot = buildWeaverBooksOsSnapshot({
        sourceArtifactId: widgetId,
        title: nextTitle,
        files: resolvedFiles,
        entryFile: nextEntryFile,
        dependencies: nextDeps,
        iterations: nextIterations,
        summary: typeof body.summary === "string" ? body.summary : null,
        includePromptHistory: body.includePromptHistory === true,
      });

      const entryType: BooksOsEntryType =
        body.entryType === "notnote_artifact" || body.entryType === "daily_record"
          ? body.entryType
          : "weaver_app_snapshot";

      archiveResult = await archiveToBooksOs(
        {
          youniverseId: auth.user.youniverseId,
          entryType,
          title: nextTitle,
          summary: snapshot.summary,
          bodyMarkdown: snapshot.bodyMarkdown,
          payloadJson: snapshot.payloadJson,
          sourceArtifactId: widgetId,
          coordinates: body.coordinates ?? body.location,
          timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
        },
        { sql, env: deps.env, fetch: deps.fetch }
      );
      nextBooksOsArchive = archiveResult.badge;
    }

    const nextContent = buildWidgetContentPayload({
      code: nextCode,
      dependencies: nextDeps,
      files: nextFiles,
      entryFile: nextEntryFile,
      iterations: nextIterations,
      sandboxConfig: nextSandboxConfig,
      publicationStatus: nextPubStatus,
      publishedAt: nextPublishedAt,
      unpublishedAt: nextUnpublishedAt,
      booksOsArchive: nextBooksOsArchive,
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
      ...(archiveResult
        ? {
            archive: archiveResult.record,
            badge: archiveResult.badge,
            deduplicated: archiveResult.deduplicated,
          }
        : {}),
    });
  } catch (error) {
    console.error("[NotNotes Artifact] Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
