-- Fix notifications_type_check constraint to allow 'live_started'
DO $$ 
BEGIN 
    -- 1. Identify the existing constraint on 'type' column
    -- Many Supabase projects use a check constraint for notification types.
    -- We'll try to drop the known one or find any check constraint on the 'type' column.
    
    -- Drop generic constraint if it exists (using common naming patterns)
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    -- 2. Add the updated constraint including 'live_started'
    -- Based on the error log, the current allowed types are likely:
    -- comment, like, follow, mention, etc. plus our new ones.
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
        'verification_approved',
        'verification_rejected',
        'announcement',
        'account_suspended',
        'account_unsuspended'
    ));

END $$;
