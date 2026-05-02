-- 025: Fix post_type_check constraint
-- Adds 'repost' and 'quote' to the allowed post types.

DO $$ 
BEGIN
    -- Drop the existing constraint if it exists
    ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS post_type_check;
    
    -- Re-add the constraint with the new allowed types
    -- Includes 'image', 'video', 'thread' (original) + 'repost', 'quote' (new)
    ALTER TABLE public.posts 
    ADD CONSTRAINT post_type_check 
    CHECK (type IN ('image', 'video', 'thread', 'repost', 'quote'));

    -- Also update notifications table to allow 'quote' type
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'like', 'comment', 'follow', 'mention', 'repost', 'quote', 'save',
        'live_started', 'live_ended', 'reel_like', 'reel_comment',
        'follow_suggestion', 'new_post', 'new_story', 'message', 'story_view',
        'admin_report', 'admin_verification', 'admin_ban',
        'verification_approved', 'verification_rejected',
        'announcement', 'account_suspended', 'account_unsuspended'
    ));
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating post_type_check: %', SQLERRM;
END $$;
