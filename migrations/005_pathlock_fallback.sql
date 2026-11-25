-- =================================================================
-- MIGRATION 005 : PathLock Tunnel Fallback Action & Target Path
-- Apply remote: wrangler d1 execute quicklink-db --remote --file=migrations/005_pathlock_fallback.sql
-- Apply local : wrangler d1 execute quicklink-db --local --file=migrations/005_pathlock_fallback.sql
-- =================================================================

ALTER TABLE links ADD COLUMN path_lock_action TEXT DEFAULT 'block';
ALTER TABLE links ADD COLUMN path_lock_fallback_path TEXT DEFAULT NULL;
