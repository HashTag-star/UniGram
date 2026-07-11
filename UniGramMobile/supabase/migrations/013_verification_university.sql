-- Add university column to verification_requests
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS university TEXT;
