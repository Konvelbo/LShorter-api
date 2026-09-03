-- =================================================================
-- MIGRATION : Add role column to users table
-- Apply with : wrangler d1 execute quicklink-db --file=migrations/001_add_role.sql
-- Local only  : wrangler d1 execute quicklink-db --local --file=migrations/001_add_role.sql
-- =================================================================

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));
