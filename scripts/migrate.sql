-- =================================================================
-- RECRÉATION COMPLÈTE DE LA TABLE LINKS D1 (Toutes les 24 colonnes)
-- Exécuter via: npx wrangler d1 execute quicklink-db --remote --file=./scripts/migrate.sql
-- =================================================================

DROP TABLE IF EXISTS links;

CREATE TABLE links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain_id TEXT,
    domain_name TEXT DEFAULT 'lsho.cc',
    slug TEXT NOT NULL,
    short_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    qr_code_config TEXT,
    clicks_count INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    conversions_count INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0.0,
    routing_rules TEXT,
    geo_targeting TEXT,
    device_targeting TEXT,
    password_hash TEXT,
    is_password_protected BOOLEAN DEFAULT 0,
    is_cloaked BOOLEAN DEFAULT 0,
    meta_title TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    twitter_card TEXT DEFAULT 'summary_large_image',
    hide_referrer BOOLEAN DEFAULT 0,
    tags TEXT,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(domain_name, slug)
);

CREATE INDEX IF NOT EXISTS idx_links_domain_slug ON links(domain_name, slug);

CREATE TABLE IF NOT EXISTS custom_domains (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    status TEXT CHECK(status IN ('active', 'pending', 'failed')) DEFAULT 'pending',
    is_default BOOLEAN DEFAULT 0,
    ssl_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS click_events (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    ip_masked TEXT NOT NULL,
    country_code TEXT,
    country_name TEXT,
    city TEXT,
    device TEXT,
    browser TEXT,
    os TEXT,
    referrer TEXT,
    resolved_url TEXT NOT NULL,
    is_unique BOOLEAN DEFAULT 1,
    conversion_amount REAL DEFAULT 0.0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_timestamp ON click_events(link_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_clicks_user_timestamp ON click_events(user_id, timestamp);
