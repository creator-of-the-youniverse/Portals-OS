import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { assertSafeDatabaseTarget } from "../lib/creatorOwnership.ts";
import {
  buildWidgetContentPayload,
  formatOwnerWidget,
  parseWidgetContent,
  sanitizeWidgetDependencies,
} from "../lib/widgetLifecycle.ts";

function resolveSqlClient(deps = {}) {
  if (deps.sql) return deps.sql;
  const databaseUrl = deps.databaseUrl || process.env.DATABASE_URL || process.env.LOCAL_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Database URL is not configured for NotNotes operations.");
  }
  assertSafeDatabaseTarget(databaseUrl, deps.env ?? process.env);
  return neon(databaseUrl);
}

export async function saveWeaverArtifactHandler(req, res, deps = {}) {
  try {
    const { youniverseId } = req.user ?? {}; // Injected by verifyJwt middleware
    const { title, code, dependencies } = req.body ?? {};

    if (!title || !String(title).trim() || !code || !String(code).trim()) {
      return res.status(400).json({ error: "Component title and code are required." });
    }

    if (!youniverseId) {
      return res.status(401).json({ error: "Unauthorized: No youniverseId found in session." });
    }

    const content = buildWidgetContentPayload({
      code,
      dependencies,
      publicationStatus: "draft",
      publishedAt: null,
      unpublishedAt: null,
    });

    if (deps.prisma && !deps.sql) {
      const artifact = await deps.prisma.notNote.create({
        data: {
          youniverseId,
          title: String(title).trim(),
          content,
          status: "APPROVED",
        },
      });
      return res.status(200).json({
        success: true,
        artifact,
        widget: formatOwnerWidget(artifact, youniverseId),
      });
    }

    const sql = resolveSqlClient(deps);
    const id = nanoid();
    const cleanTitle = String(title).trim();
    await sql`
      INSERT INTO "NotNote" (id, "youniverseId", title, content, status, "createdAt", "updatedAt")
      VALUES (${id}, ${youniverseId}, ${cleanTitle}, ${JSON.stringify(content)}, 'APPROVED', NOW(), NOW())
    `;
    const nowIso = new Date().toISOString();
    const formatted = formatOwnerWidget(
      {
        id,
        youniverseId,
        title: cleanTitle,
        content,
        status: "APPROVED",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      youniverseId
    );
    return res.status(200).json({
      success: true,
      artifact: formatted,
      widget: formatted,
    });
  } catch (error) {
    console.error("NotNotes Save Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function getWeavedWidgetsHandler(req, res, deps = {}) {
  try {
    const { youniverseId } = req.user ?? {};

    if (!youniverseId) {
      return res.status(401).json({ error: "Unauthorized: No youniverseId found." });
    }

    const rawRequestedId = req?.query?.id;
    const requestedId =
      typeof rawRequestedId === "string" && rawRequestedId.trim().length > 0
        ? rawRequestedId.trim()
        : null;

    if (requestedId) {
      let row = null;
      if (deps.prisma && !deps.sql) {
        row = await deps.prisma.notNote.findUnique({ where: { id: requestedId } });
      } else {
        const sql = resolveSqlClient(deps);
        const byIdRows = await sql`
          SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
          FROM "NotNote"
          WHERE id = ${requestedId}
          LIMIT 1
        `;
        row = Array.isArray(byIdRows) && byIdRows.length > 0 ? byIdRows[0] : null;
      }

      if (!row) {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      if (String(row.youniverseId) !== String(youniverseId)) {
        return res.status(403).json({
          success: false,
          error: "forbidden_widget_ownership",
          message: "You are not authorized to access this widget.",
        });
      }
      if (String(row.status ?? "APPROVED") !== "APPROVED") {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      const formatted = formatOwnerWidget(row, youniverseId);
      if (!formatted) {
        return res.status(404).json({
          success: false,
          error: "widget_not_found",
          message: "Widget not found.",
        });
      }
      return res.status(200).json({
        success: true,
        widget: formatted,
        widgets: [formatted],
      });
    }

    let widgets = [];
    if (deps.prisma && !deps.sql) {
      widgets = await deps.prisma.notNote.findMany({
        where: {
          youniverseId,
          status: "APPROVED",
        },
      });
    } else {
      const sql = resolveSqlClient(deps);
      widgets = await sql`
        SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
        FROM "NotNote"
        WHERE "youniverseId" = ${youniverseId} AND status = 'APPROVED'
        ORDER BY "createdAt" DESC
      `;
    }

    const reactWidgets = (Array.isArray(widgets) ? widgets : [])
      .filter((w) => String(w.youniverseId ?? youniverseId) === String(youniverseId))
      .map((w) => formatOwnerWidget(w, youniverseId))
      .filter((w) => w !== null);

    return res.status(200).json({
      success: true,
      widgets: reactWidgets,
    });
  } catch (error) {
    console.error("NotNotes Fetch Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

async function mutateOwnedWidget(req, res, deps = {}, mode = "update") {
  try {
    const { youniverseId } = req.user ?? {};
    if (!youniverseId) {
      return res.status(401).json({ success: false, error: "Unauthorized: No youniverseId found." });
    }

    const body = req.body ?? {};
    const rawId = body.id ?? body.widgetId;
    const widgetId = typeof rawId === "string" ? rawId.trim() : "";
    if (!widgetId) {
      return res.status(400).json({ success: false, error: "bad_request", message: "Widget id is required." });
    }

    const sql = resolveSqlClient(deps);
    const rows = await sql`
      SELECT id, "youniverseId", title, content, status, "createdAt", "updatedAt"
      FROM "NotNote"
      WHERE id = ${widgetId}
      LIMIT 1
    `;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ success: false, error: "widget_not_found", message: "Widget not found." });
    }

    const existing = rows[0];
    if (String(existing.youniverseId) !== String(youniverseId)) {
      return res.status(403).json({
        success: false,
        error: "forbidden_widget_ownership",
        message: "You are not authorized to modify this widget.",
      });
    }

    const parsed = parseWidgetContent(existing.content);
    if (String(existing.status ?? "APPROVED") !== "APPROVED" || !parsed || parsed.type !== "REACT_WIDGET") {
      return res.status(400).json({
        success: false,
        error: "invalid_widget_artifact",
        message: "Artifact is not an approved React widget.",
      });
    }

    const nowIso = new Date().toISOString();
    const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title ?? "").trim();
    const nextCode = body.code !== undefined ? String(body.code) : parsed.code;
    const nextDeps = body.dependencies !== undefined ? sanitizeWidgetDependencies(body.dependencies) : parsed.dependencies;

    if (!nextTitle || !nextCode.trim()) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        message: "Widget title and code are required.",
      });
    }

    let nextPubStatus = parsed.publicationStatus;
    let nextPublishedAt = parsed.publishedAt;
    let nextUnpublishedAt = parsed.unpublishedAt;

    if (mode === "publish") {
      nextPubStatus = "published";
      nextPublishedAt = nowIso;
      nextUnpublishedAt = null;
    } else if (mode === "unpublish") {
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
        AND "youniverseId" = ${youniverseId}
    `;

    const formatted = formatOwnerWidget(
      {
        id: widgetId,
        youniverseId,
        title: nextTitle,
        content: nextContent,
        status: existing.status ?? "APPROVED",
        createdAt: existing.createdAt ?? nowIso,
        updatedAt: nowIso,
      },
      youniverseId
    );

    return res.status(200).json({
      success: true,
      artifact: formatted,
      widget: formatted,
    });
  } catch (error) {
    console.error("NotNotes Mutate Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function updateWeaverArtifactHandler(req, res, deps = {}) {
  return mutateOwnedWidget(req, res, deps, "update");
}

export async function publishWeaverWidgetHandler(req, res, deps = {}) {
  return mutateOwnedWidget(req, res, deps, "publish");
}

export async function unpublishWeaverWidgetHandler(req, res, deps = {}) {
  return mutateOwnedWidget(req, res, deps, "unpublish");
}
