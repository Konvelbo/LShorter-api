-- Migration 004: Expand retargeting_pixels.platform CHECK constraint to all 9 ad networks + aliases
PRAGMA foreign_keys = OFF;

CREATE TABLE retargeting_pixels_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT CHECK(platform IN (
        'meta',
        'facebook',
        'instagram',
        'google',
        'google_tag',
        'youtube',
        'tiktok',
        'linkedin',
        'pinterest',
        'snapchat',
        'x',
        'twitter'
    )) NOT NULL,
    pixel_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    events_tracked_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO retargeting_pixels_new (id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at)
SELECT id, user_id, platform, pixel_id, name, is_active, events_tracked_count, created_at
FROM retargeting_pixels;

DROP TABLE retargeting_pixels;
ALTER TABLE retargeting_pixels_new RENAME TO retargeting_pixels;

CREATE INDEX IF NOT EXISTS idx_retargeting_pixels_user_id ON retargeting_pixels(user_id);

PRAGMA foreign_keys = ON;
