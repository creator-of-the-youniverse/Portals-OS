/**
 * controllers/youniverseContextController.js
 *
 * Server-verified owner gate for Youniverse subdomains.
 *
 * GET /api/youniverse/:handle/context
 *
 * Protected by verifyJwt, which attaches:
 *   req.user = { userId, youniverseId, handle }
 *
 * Response shape:
 *   { success: true,  isOwner: boolean, handle: string, tier: string }
 *   { success: false, error: string }                    (4xx cases)
 *
 * isOwner = true  → JWT's youniverseId matches the Youniverse row for :handle
 * isOwner = false → JWT is valid but the caller does not own this subdomain
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export async function getYouniverseContextHandler(req, res) {
  const { handle } = req.params;

  if (!handle) {
    return res.status(400).json({ success: false, error: "handle_required" });
  }

  // Normalise handle — lowercase, strip leading @
  const normalised = handle.toLowerCase().replace(/^@/, "");

  try {
    const youniverse = await prisma.youniverse.findUnique({
      where: { handle: normalised },
      select: {
        id:       true,
        handle:   true,
        tier:     true,
        isLive:   true,
        ownerId:  true,
      },
    });

    if (!youniverse) {
      return res.status(404).json({
        success: false,
        error:   "youniverse_not_found",
        message: `No Youniverse found for handle @${normalised}.`,
      });
    }

    if (!youniverse.isLive) {
      return res.status(403).json({
        success: false,
        error:   "youniverse_suspended",
        message: "This Youniverse is not currently live.",
      });
    }

    // Server-authoritative ownership check.
    // req.user.youniverseId is the ID stamped into the verified JWT.
    const isOwner = req.user.youniverseId === youniverse.id;

    console.log(
      `[YouCtx] handle=@${normalised} | jwtYouniverseId=${req.user.youniverseId} | dbId=${youniverse.id} | isOwner=${isOwner}`
    );

    return res.json({
      success:  true,
      isOwner,
      handle:   youniverse.handle,
      tier:     youniverse.tier,
    });
  } catch (err) {
    console.error("[YouCtx] DB error:", err);
    return res.status(500).json({
      success: false,
      error:   "internal_error",
      message: "Could not verify Youniverse ownership.",
    });
  }
}
