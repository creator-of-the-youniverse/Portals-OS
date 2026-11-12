/**
 * GET /api/migrate-db
 *
 * DEPRECATED AND DISABLED.
 * Schema migrations must never be triggered via public or unauthenticated HTTP endpoints.
 * Database migrations are managed via versioned SQL scripts in db/migrations/.
 */

export default async function handler(req: any, res: any) {
  return res.status(410).json({
    success: false,
    error: "endpoint_disabled",
    message: "Public HTTP schema migration endpoints are permanently disabled. Migrations must be run via versioned deployment scripts.",
  });
}
