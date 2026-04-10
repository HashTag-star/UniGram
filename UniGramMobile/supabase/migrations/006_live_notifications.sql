-- Function to notify followers when someone starts a live stream
CREATE OR REPLACE FUNCTION public.notify_followers_of_live()
RETURNS TRIGGER AS $$
DECLARE
    follower_record RECORD;
    broadcaster_username TEXT;
BEGIN
    -- Get broadcaster details
    SELECT username INTO broadcaster_username FROM public.profiles WHERE id = NEW.creator_id;

    -- Loop through all followers
    FOR follower_record IN 
        SELECT follower_id 
        FROM public.follows f
        WHERE f.following_id = NEW.creator_id
        -- SAFETY: Skip followers who have blocked the broadcaster OR broadcaster has blocked them
        AND NOT EXISTS (
            SELECT 1 FROM public.blocks b 
            WHERE (b.blocker_id = f.follower_id AND b.blocked_id = NEW.creator_id)
            OR (b.blocker_id = NEW.creator_id AND b.blocked_id = f.follower_id)
        )
    LOOP
        -- Insert into notifications table
        INSERT INTO public.notifications (
            user_id,
            actor_id,
            type,
            target_id,
            text
        ) VALUES (
            follower_record.follower_id,
            NEW.creator_id,
            'live_started',
            NEW.id,
            broadcaster_username || ' is now live! Tap to join.'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to fire after a live session starts
DROP TRIGGER IF EXISTS on_live_started ON public.live_sessions;
CREATE TRIGGER on_live_started
    AFTER INSERT ON public.live_sessions
    FOR EACH ROW
    WHEN (NEW.status = 'live')
    EXECUTE FUNCTION public.notify_followers_of_live();
