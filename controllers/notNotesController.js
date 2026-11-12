import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

function resolveSqlClient(deps = {}) {
  if (deps.sql) return deps.sql;
  const databaseUrl = deps.databaseUrl || process.env.DATABASE_URL || process.env.LOCAL_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Database URL is not configured for NotNotes operations.");
  }
  return neon(databaseUrl);
}

export async function saveWeaverArtifactHandler(req, res, deps = {}) {
  try {
    const { youniverseId } = req.user ?? {}; // Injected by verifyJwt middleware
    const { title, code, dependencies } = req.body ?? {};

    if (!title || !code) {
      return res.status(400).json({ error: "Component title and code are required." });
    }

    if (!youniverseId) {
      return res.status(401).json({ error: "Unauthorized: No youniverseId found in session." });
    }

    if (deps.prisma && !deps.sql) {
      const artifact = await deps.prisma.notNote.create({
        data: {
          youniverseId,
          title,
          content: {
            type: "REACT_WIDGET",
            code,
            dependencies: dependencies || [],
          },
          status: "APPROVED",
        },
      });
      return res.status(200).json({
        success: true,
        artifact,
      });
    }

    const sql = resolveSqlClient(deps);
    const id = nanoid();
    const content = {
      type: "REACT_WIDGET",
      code,
      dependencies: Array.isArray(dependencies) ? dependencies : [],
    };
    await sql`
      INSERT INTO "NotNote" (id, "youniverseId", title, content, status, "createdAt", "updatedAt")
      VALUES (${id}, ${youniverseId}, ${title}, ${JSON.stringify(content)}, 'APPROVED', NOW(), NOW())
    `;
    return res.status(200).json({
      success: true,
      artifact: {
        id,
        youniverseId,
        title,
        content,
        status: "APPROVED",
      },
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
        SELECT id, title, content, "createdAt"
        FROM "NotNote"
        WHERE "youniverseId" = ${youniverseId} AND status = 'APPROVED'
        ORDER BY "createdAt" DESC
      `;
    }

    // Filter down to just REACT_WIDGET type, handling both parsed object and string content
    const reactWidgets = widgets
      .map((w) => {
        let contentObj = w.content;
        if (typeof contentObj === "string") {
          try {
            contentObj = JSON.parse(contentObj);
          } catch {
            contentObj = null;
          }
        }
        return {
          id: w.id,
          title: w.title,
          content: contentObj,
          createdAt: w.createdAt,
        };
      })
      .filter((w) => w.content && typeof w.content === "object" && w.content.type === "REACT_WIDGET")
      .map((w) => ({
        id: w.id,
        title: w.title,
        code: w.content.code,
        dependencies: w.content.dependencies || [],
        createdAt: w.createdAt,
      }));

    return res.status(200).json({
      success: true,
      widgets: reactWidgets,
    });
  } catch (error) {
    console.error("NotNotes Fetch Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}
