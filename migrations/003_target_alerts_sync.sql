-- =================================================================
-- MIGRATION 003 : Target & Limit Alerts Enhancements
-- Title, limit_value, notify_expiration, channel, schedule
-- Apply with : wrangler d1 execute quicklink-db --file=migrations/003_target_alerts_sync.sql
-- =================================================================

ALTER TABLE target_alerts ADD COLUMN title TEXT;
ALTER TABLE target_alerts ADD COLUMN limit_value REAL;
ALTER TABLE target_alerts ADD COLUMN notify_expiration INTEGER DEFAULT 0;
ALTER TABLE target_alerts ADD COLUMN channel TEXT DEFAULT 'both';
ALTER TABLE target_alerts ADD COLUMN schedule TEXT DEFAULT 'instantly';
