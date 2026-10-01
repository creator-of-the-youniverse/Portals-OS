import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function getYouniversePublicDataHandler(req, res) {
  try {
    const { handle } = req.params;

    const youniverse = await prisma.youniverse.findUnique({
      where: { handle },
    });

    if (!youniverse) {
      return res.status(404).json({ error: "Youniverse not found." });
    }

    // Fetch only APPROVED public widgets/artifacts from NotNotes for this user
    const publicWidgets = await prisma.notNote.findMany({
      where: {
        youniverseId: youniverse.id,
        status: "APPROVED",
        // Optional: filter by a public flag if you have one, or return all approved
      },
      select: {
        id: true,
        title: true,
        content: true,
        updatedAt: true,
      },
      take: 12,
    });

    return res.status(200).json({
      success: true,
      youniverse: {
        handle: youniverse.handle,
        type: youniverse.type,
        ownerName: handle,
        createdAt: youniverse.createdAt,
      },
      publicWidgets,
    });
  } catch (error) {
    console.error("Public Youniverse Data Error:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
}
