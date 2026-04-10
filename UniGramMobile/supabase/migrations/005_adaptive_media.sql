-- Add aspect ratio to posts for adaptive frames (IG Style)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS aspect_ratio DECIMAL DEFAULT 1.0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_metadata JSONB DEFAULT '{}'::jsonb;
