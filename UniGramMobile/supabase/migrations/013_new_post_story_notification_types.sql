-- Add new_post and new_story notification types, and fix the constraint to
-- include all types currently used across the codebase.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'like',
    'comment',
    'follow',
    'mention',
    'repost',
    'save',
    'live_started',
    'reel_like',
    'reel_comment',
    'follow_suggestion',
    'new_post',
    'new_story',
    'admin_report',
    'admin_verification',
    'admin_ban',
    'verification_approved',
    'verification_rejected',
    'announcement',
    'account_suspended',
    'account_unsuspended'
));
