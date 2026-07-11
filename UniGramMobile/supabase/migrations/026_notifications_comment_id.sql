-- Add comment_id to notifications for direct comment deep-link navigation
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS comment_id uuid;

-- Add metadata JSONB for structured extra data (e.g. follow_suggestion_ids)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb;
