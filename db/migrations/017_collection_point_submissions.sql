-- =============================================================================
-- Migration 017: Collection Point Submissions (Neon PostgreSQL)
--
-- Purpose:
--   Tenant-isolated storage for public Collection Point form submissions
--   (newsletter, lead_capture, booking, digital_download) captured by
--   published Weaver apps on <handle>.itsyouonline.com.
--
-- Critical Data Boundary:
--   - Every row is strictly scoped to `youniverse_id`.
--   - Public callers may only INSERT via resolved handle; only the
--     authenticated owner of `youniverse_id` may SELECT their submissions.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_point_submissions (
  id TEXT PRIMARY KEY,
  youniverse_id TEXT NOT NULL,
  widget_id TEXT,
  collection_type TEXT NOT NULL CHECK (
    collection_type IN ('newsletter', 'lead_capture', 'booking', 'digital_download')
  ),
  email TEXT,
  name TEXT,
  message TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Owner chronological listing
CREATE INDEX IF NOT EXISTS idx_collection_points_owner_created
  ON public.collection_point_submissions (youniverse_id, created_at DESC);

-- Owner filter by collection type
CREATE INDEX IF NOT EXISTS idx_collection_points_owner_type
  ON public.collection_point_submissions (youniverse_id, collection_type);

-- Owner filter by source Weaver widget
CREATE INDEX IF NOT EXISTS idx_collection_points_owner_widget
  ON public.collection_point_submissions (youniverse_id, widget_id)
  WHERE widget_id IS NOT NULL;

COMMIT;
