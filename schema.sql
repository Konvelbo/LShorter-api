-- =================================================================
-- CLOUDFLARE D1 (SQLite) SCHEMA — QuickLink API v3 (LShorter Master)
-- =================================================================

PRAGMA foreign_keys = ON;

-- 1. Table Utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    avatar_url TEXT,
    plan TEXT CHECK(plan IN ('FREEMIUM', 'PRO', 'BUSINESS', 'STARTER', 'ENTERPRISE')) DEFAULT 'FREEMIUM',
    clicks_this_month INTEGER DEFAULT 0,
    clicks_limit INTEGER DEFAULT 100000,
    domains_limit INTEGER DEFAULT 3,
    links_limit INTEGER DEFAULT 1000,
    two_factor_enabled BOOLEAN DEFAULT 0,
    two_factor_secret TEXT,
    language TEXT DEFAULT 'fr',
    timezone TEXT DEFAULT 'Europe/Paris',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table Domaines Personnalisés
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

-- 3. Table Liens Courts
CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain_id TEXT,
    domain_name TEXT DEFAULT 'lsho.cc',
    slug TEXT NOT NULL,
    short_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    qr_code_config TEXT, -- JSON
    clicks_count INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    conversions_count INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0.0,
    routing_rules TEXT, -- JSON array
    geo_targeting TEXT, -- JSON
    device_targeting TEXT, -- JSON
    password_hash TEXT,
    is_password_protected BOOLEAN DEFAULT 0,
    is_cloaked BOOLEAN DEFAULT 0,
    meta_title TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    twitter_card TEXT DEFAULT 'summary_large_image',
    hide_referrer BOOLEAN DEFAULT 0,
    tags TEXT, -- JSON array
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(domain_name, slug)
);

-- 4. Table Événements de Clics
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
    customer_email TEXT,
    customer_name TEXT,
    customer_avatar TEXT,
    conversion_amount REAL DEFAULT 0.0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
);

-- 4b. Table Conversions & Achats
CREATE TABLE IF NOT EXISTS conversions (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    amount REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'EUR',
    customer_id TEXT,
    customer_email TEXT,
    customer_name TEXT,
    customer_avatar TEXT,
    click_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Table Clés API Développeurs
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL DEFAULT 'lsh_live_',
    key_hash TEXT NOT NULL,
    scope TEXT CHECK(scope IN ('read', 'read_write', 'admin')) DEFAULT 'read_write',
    rate_limit INTEGER DEFAULT 60,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Table Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array
    secret_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    last_triggered_at DATETIME,
    last_status INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Table Pixels de Retargeting
CREATE TABLE IF NOT EXISTS retargeting_pixels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK(platform IN ('facebook', 'google_tag', 'tiktok', 'linkedin')) NOT NULL,
    pixel_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    events_tracked_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_links_domain_slug ON links(domain_name, slug);
CREATE INDEX IF NOT EXISTS idx_clicks_link_timestamp ON click_events(link_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_clicks_user_timestamp ON click_events(user_id, timestamp);
