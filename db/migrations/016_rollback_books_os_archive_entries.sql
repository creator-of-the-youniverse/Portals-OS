-- =============================================================================
-- Rollback 016: Books OS Archive Entries
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_books_os_archive_source_artifact;
DROP INDEX IF EXISTS public.idx_books_os_archive_coordinates;
DROP INDEX IF EXISTS public.idx_books_os_archive_owner_created;
DROP INDEX IF EXISTS public.idx_books_os_archive_idempotent_version;
DROP TABLE IF EXISTS public.books_os_archive_entries;

COMMIT;
