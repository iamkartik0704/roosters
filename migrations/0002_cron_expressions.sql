-- Migration 0002: Add cron expressions support
ALTER TABLE jobs ADD COLUMN cron_expression TEXT;
ALTER TABLE jobs ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE jobs ADD COLUMN next_run_at INTEGER;
