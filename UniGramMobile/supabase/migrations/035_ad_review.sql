-- ─── Ad Review System ──────────────────────────────────────────────────────
-- Adds AI + admin review columns to campus_ads, extends the status enum,
-- and provides SECURITY DEFINER RPCs for admin approval/rejection.

-- 1. New columns
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS ai_review_status   text    DEFAULT 'pending'
    CHECK (ai_review_status IN ('pending','approved','rejected','flagged')),
  ADD COLUMN IF NOT EXISTS ai_review_reason   text,
  ADD COLUMN IF NOT EXISTS ai_reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS admin_review_reason text;

-- 2. Extend status to allow 'rejected'
ALTER TABLE public.campus_ads
  DROP CONSTRAINT IF EXISTS campus_ads_status_check;
ALTER TABLE public.campus_ads
  ADD CONSTRAINT campus_ads_status_check
    CHECK (status IN ('active','paused','ended','pending','rejected'));

-- 3. Admin can read and write ALL campus_ads rows (for moderation)
DROP POLICY IF EXISTS "campus_ads_admin_all" ON public.campus_ads;
CREATE POLICY "campus_ads_admin_all" ON public.campus_ads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 4. Admin approve: activate the ad (regardless of payment state)
CREATE OR REPLACE FUNCTION public.admin_approve_ad(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.campus_ads%ROWTYPE;
BEGIN
  SELECT * INTO v_ad FROM public.campus_ads WHERE id = p_ad_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ad not found'; END IF;

  UPDATE public.campus_ads
  SET
    status          = 'active',
    ai_review_status = CASE WHEN ai_review_status = 'rejected' THEN 'approved' ELSE ai_review_status END,
    start_date      = COALESCE(start_date, now()),
    end_date        = COALESCE(end_date, now() + INTERVAL '7 days')
  WHERE id = p_ad_id;
END;
$$;

-- 5. Admin reject: block the ad and record the reason
CREATE OR REPLACE FUNCTION public.admin_reject_ad(p_ad_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campus_ads
  SET
    status              = 'rejected',
    admin_review_reason = p_reason
  WHERE id = p_ad_id;
END;
$$;
