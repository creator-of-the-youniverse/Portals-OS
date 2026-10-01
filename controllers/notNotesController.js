import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function saveWeaverArtifactHandler(req, res) {
  try {
    const { youniverseId } = req.user; // Injected by verifyJwt middleware
    const { title, code, dependencies } = req.body;

    if (!title || !code) {
      return res.status(400).json({ error: "Component title and code are required." });
    }

    if (!youniverseId) {
      return res.status(401).json({ error: "Unauthorized: No youniverseId found in session." });
    }

    // Create a new NotNote artifact scoped to this user's Youniverse
    const artifact = await prisma.notNote.create({
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
  } catch (error) {
    console.error("NotNotes Save Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}

export async function getWeavedWidgetsHandler(req, res) {
  try {
    const { youniverseId } = req.user;

    if (!youniverseId) {
      return res.status(401).json({ error: "Unauthorized: No youniverseId found." });
    }

    const widgets = await prisma.notNote.findMany({
      where: {
        youniverseId,
        status: "APPROVED",
      },
    });

    // Filter down to just REACT_WIDGET type
    const reactWidgets = widgets
      .filter((w) => w.content && typeof w.content === 'object' && w.content.type === "REACT_WIDGET")
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
