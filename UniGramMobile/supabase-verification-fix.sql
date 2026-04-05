-- ============================================================
-- UniGram — Verification Fix Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Update the verification status trigger to ALSO update the profile.
--    SECURITY DEFINER bypasses RLS so it can update any profile.
CREATE OR REPLACE FUNCTION notif_on_verification_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id uuid;
  v_msg text;
BEGIN
  -- Only act when status actually changes
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Find an admin to use as actor
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true LIMIT 1;

  IF NEW.status = 'approved' THEN
    -- ✅ Update the user's profile (SECURITY DEFINER bypasses RLS)
    UPDATE profiles
    SET is_verified = true, verification_type = NEW.type
    WHERE id = NEW.user_id;

    v_msg := 'Congratulations! Your ' ||
      CASE NEW.type
        WHEN 'influencer' THEN 'Notable Account'
        ELSE initcap(NEW.type)
      END ||
      ' verification has been approved. Your profile is now verified!';

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

-- Re-attach the trigger (in case it was dropped)
DROP TRIGGER IF EXISTS trg_notif_verification_status ON verification_requests;
CREATE TRIGGER trg_notif_verification_status
AFTER UPDATE ON verification_requests
FOR EACH ROW EXECUTE FUNCTION notif_on_verification_status_change();


-- 2. Allow admins to update any user's profile (belt-and-suspenders for app-side updates).
--    Uses a security definer helper to avoid RLS recursion on the profiles table.
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  );
$$;

DROP POLICY IF EXISTS "admins_update_any_profile" ON profiles;
CREATE POLICY "admins_update_any_profile" ON profiles
  FOR UPDATE USING (is_admin_user());


-- 3. Ensure push_tokens table exists and has proper policies
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

-- Admins can read any push token (needed to send notifications to users)
DROP POLICY IF EXISTS "push_tokens_admin_read" ON push_tokens;
CREATE POLICY "push_tokens_admin_read" ON push_tokens
  FOR SELECT USING (is_admin_user());
