-- ============================================================
-- 023_live_ended_notification.sql
-- Notify followers when a live stream ends
-- ============================================================

-- Function: notify followers that a live stream has ended
CREATE OR REPLACE FUNCTION public.notify_followers_live_ended()
RETURNS TRIGGER AS $$
DECLARE
    follower_record RECORD;
    broadcaster_username TEXT;
BEGIN
    -- Only fire when status transitions to 'ended'
    IF OLD.status = 'ended' OR NEW.status != 'ended' THEN
        RETURN NEW;
    END IF;

    SELECT username INTO broadcaster_username
    FROM public.profiles
    WHERE id = NEW.creator_id;

    FOR follower_record IN
        SELECT follower_id
        FROM public.follows f
        WHERE f.following_id = NEW.creator_id
        AND NOT EXISTS (
            SELECT 1 FROM public.blocks b
            WHERE (b.blocker_id = f.follower_id AND b.blocked_id = NEW.creator_id)
               OR (b.blocker_id = NEW.creator_id AND b.blocked_id = f.follower_id)
        )
    LOOP
        INSERT INTO public.notifications (
            user_id, actor_id, type, target_id, text
        ) VALUES (
            follower_record.follower_id,
            NEW.creator_id,
            'live_ended',
            NEW.id,
            broadcaster_username || '''s live stream has ended.'
        )
        ON CONFLICT DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on UPDATE of live_sessions
DROP TRIGGER IF EXISTS on_live_ended ON public.live_sessions;
CREATE TRIGGER on_live_ended
    AFTER UPDATE ON public.live_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_followers_live_ended();
