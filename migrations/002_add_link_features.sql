-- =================================================================
-- MIGRATION 002 : Add new link features
-- Password protection, tags, cloaking, referrer hiding
-- Apply with : wrangler d1 execute quicklink-db --file=migrations/002_add_link_features.sql
-- Local only  : wrangler d1 execute quicklink-db --local --file=migrations/002_add_link_features.sql
-- =================================================================

ALTER TABLE links ADD COLUMN password_hash TEXT;            -- SHA-256 hash (NULL = public)
ALTER TABLE links ADD COLUMN tags TEXT;                     -- JSON array: ["promo", "social"]
ALTER TABLE links ADD COLUMN is_cloaked INTEGER NOT NULL DEFAULT 0;    -- 1 = iframe cloak
ALTER TABLE links ADD COLUMN hide_referrer INTEGER NOT NULL DEFAULT 0; -- 1 = no Referrer header
ALTER TABLE links ADD COLUMN meta_title TEXT;               -- Custom title for cloaked pages
