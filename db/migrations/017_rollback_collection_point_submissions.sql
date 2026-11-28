-- =============================================================================
-- Rollback 017: Collection Point Submissions
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_collection_points_owner_widget;
DROP INDEX IF EXISTS public.idx_collection_points_owner_type;
DROP INDEX IF EXISTS public.idx_collection_points_owner_created;
DROP TABLE IF EXISTS public.collection_point_submissions;

COMMIT;
