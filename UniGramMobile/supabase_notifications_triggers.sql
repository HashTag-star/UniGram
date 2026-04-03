-- ============================================================
-- UniGram — Notification Triggers
-- Run this in Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- 1. FUNCTION: create notification helper
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id   uuid,
  p_actor_id  uuid,
  p_type      text,
  p_post_id   uuid DEFAULT NULL,
  p_text      text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Don't notify yourself
  IF p_user_id = p_actor_id THEN RETURN; END IF;
  INSERT INTO notifications (user_id, actor_id, type, post_id, text, is_read, created_at)
  VALUES (p_user_id, p_actor_id, p_type, p_post_id, p_text, false, now());
END;
$$;

-- ============================================================
-- 2. TRIGGER: post liked → notify post owner
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_post_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM posts WHERE id = NEW.post_id;
  PERFORM create_notification(v_owner, NEW.user_id, 'like', NEW.post_id, 'liked your post.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_post_like ON post_likes;
CREATE TRIGGER trg_notif_post_like
AFTER INSERT ON post_likes
FOR EACH ROW EXECUTE FUNCTION notif_on_post_like();

-- ============================================================
-- 3. TRIGGER: post commented → notify post owner
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_post_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
  v_preview text;
BEGIN
  SELECT user_id INTO v_owner FROM posts WHERE id = NEW.post_id;
  v_preview := LEFT(NEW.text, 60);
  PERFORM create_notification(v_owner, NEW.user_id, 'comment', NEW.post_id,
    'commented: "' || v_preview || '"');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_post_comment ON post_comments;
CREATE TRIGGER trg_notif_post_comment
AFTER INSERT ON post_comments
FOR EACH ROW EXECUTE FUNCTION notif_on_post_comment();

-- ============================================================
-- 4. TRIGGER: new follower → notify followee
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM create_notification(NEW.following_id, NEW.follower_id, 'follow', NULL, 'started following you.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_follow ON follows;
CREATE TRIGGER trg_notif_follow
AFTER INSERT ON follows
FOR EACH ROW EXECUTE FUNCTION notif_on_follow();

-- ============================================================
-- 5. TRIGGER: reel liked → notify reel owner
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_reel_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM reels WHERE id = NEW.reel_id;
  PERFORM create_notification(v_owner, NEW.user_id, 'reel_like', NULL, 'liked your reel.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_reel_like ON reel_likes;
CREATE TRIGGER trg_notif_reel_like
AFTER INSERT ON reel_likes
FOR EACH ROW EXECUTE FUNCTION notif_on_reel_like();

-- ============================================================
-- 6. TRIGGER: reel commented → notify reel owner
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_reel_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
  v_preview text;
BEGIN
  SELECT user_id INTO v_owner FROM reels WHERE id = NEW.reel_id;
  v_preview := LEFT(NEW.text, 60);
  PERFORM create_notification(v_owner, NEW.user_id, 'reel_comment', NULL,
    'commented on your reel: "' || v_preview || '"');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_reel_comment ON reel_comments;
CREATE TRIGGER trg_notif_reel_comment
AFTER INSERT ON reel_comments
FOR EACH ROW EXECUTE FUNCTION notif_on_reel_comment();

-- ============================================================
-- 7. Ensure notifications table has proper RLS
-- ============================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
DROP POLICY IF EXISTS "notifs_select" ON notifications;
CREATE POLICY "notifs_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
DROP POLICY IF EXISTS "notifs_update" ON notifications;
CREATE POLICY "notifs_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Only service role / triggers can insert (SECURITY DEFINER functions bypass RLS)
DROP POLICY IF EXISTS "notifs_insert_service" ON notifications;
CREATE POLICY "notifs_insert_service" ON notifications
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- 8. ADMIN NOTIFICATIONS
-- Notify all admins when: new verification request, new report
-- ============================================================

CREATE OR REPLACE FUNCTION notify_admins(
  p_actor_id  uuid,
  p_type      text,
  p_text      text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin record;
BEGIN
  FOR v_admin IN SELECT id FROM profiles WHERE is_admin = true LOOP
    IF v_admin.id <> p_actor_id THEN
      INSERT INTO notifications (user_id, actor_id, type, text, is_read, created_at)
      VALUES (v_admin.id, p_actor_id, p_type, p_text, false, now());
    END IF;
  END LOOP;
END;
$$;

-- New verification request → notify admins
CREATE OR REPLACE FUNCTION notif_admin_on_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_admins(NEW.user_id, 'admin_verification',
    'New verification request: ' || NEW.type || ' (' || NEW.full_name || ')');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_admin_verification ON verification_requests;
CREATE TRIGGER trg_notif_admin_verification
AFTER INSERT ON verification_requests
FOR EACH ROW EXECUTE FUNCTION notif_admin_on_verification();

-- New report → notify admins
CREATE OR REPLACE FUNCTION notif_admin_on_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_admins(NEW.reporter_id, 'admin_report',
    'New report: ' || NEW.target_type || ' — ' || LEFT(NEW.reason, 80));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_admin_report ON reports;
CREATE TRIGGER trg_notif_admin_report
AFTER INSERT ON reports
FOR EACH ROW EXECUTE FUNCTION notif_admin_on_report();

-- ============================================================
-- 9. push_tokens table (if not exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_tokens_own" ON push_tokens;
CREATE POLICY "push_tokens_own" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 10. VERIFICATION STATUS → notify the requesting user
-- Fires when admin approves or rejects a verification request
-- ============================================================
CREATE OR REPLACE FUNCTION notif_on_verification_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id uuid;
  v_msg text;
BEGIN
  -- Only act when status actually changes
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Find an admin to use as actor (first admin, or null if none)
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true LIMIT 1;

  IF NEW.status = 'approved' THEN
    v_msg := 'Your verification request has been approved! Your profile is now verified.';
    INSERT INTO notifications (user_id, actor_id, type, text, is_read, created_at)
    VALUES (NEW.user_id, v_admin_id, 'verification_approved', v_msg, false, now());

  ELSIF NEW.status = 'rejected' THEN
    v_msg := 'Your verification request was not approved.';
    IF NEW.rejection_reason IS NOT NULL AND NEW.rejection_reason <> '' THEN
      v_msg := v_msg || ' Reason: ' || NEW.rejection_reason;
    END IF;
    INSERT INTO notifications (user_id, actor_id, type, text, is_read, created_at)
    VALUES (NEW.user_id, v_admin_id, 'verification_rejected', v_msg, false, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_verification_status ON verification_requests;
CREATE TRIGGER trg_notif_verification_status
AFTER UPDATE ON verification_requests
FOR EACH ROW EXECUTE FUNCTION notif_on_verification_status_change();
