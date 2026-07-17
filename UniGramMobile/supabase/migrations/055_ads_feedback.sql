-- 055: Create ad_feedback table and related functions
-- Stores user feedback on ads (hide, report, etc.) used to compute relevance score

CREATE TABLE IF NOT EXISTS public.ad_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.campus_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('hide', 'report', 'hide_all_from_advertiser')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookup of feedback per ad
CREATE INDEX IF NOT EXISTS idx_ad_feedback_ad_id ON public.ad_feedback(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_feedback_user_id ON public.ad_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_feedback_created_at_feedback_type ON public.ad_feedback(feedback_type);

-- Row Level Security
ALTER TABLE public.ad_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only insert feedback (they can't see others' feedback)
CREATE POLICY "ad_feedback_insert_own" ON public.ad_feedback
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own feedback (if they want to undo?)
CREATE POLICY "ad_feedback_delete_own" ON public.ad_feedback
  FOR DELETE
  USING (user_id = auth.uid());

-- No select policy: we don't let users see feedback aggregates directly (only via relevance score function)
-- Admins can see all feedback if needed (but we rely on admin policies on other tables; we can add an admin select policy if desired)
-- For simplicity, we'll not add a select policy; admins can bypass RLS if needed, or we can add later.

-- Function to update relevance_score for an ad based on feedback
-- This could be called periodically (e.g., nightly) to refresh scores.
-- Formula: relevance_score = 5.0 * (1 - (negative_feedback_weight * negative_feedback_count) / (total_impressions + 1))
-- We'll cap between 1 and 10.
-- We'll define negative feedback as 'hide' and 'report'. 'hide_all_from_advertiser' counts as multiple negatives?
-- For simplicity, we'll count each feedback as one negative signal.
-- We need to know impressions per ad to normalize. We'll use the impressions column.

CREATE OR REPLACE FUNCTION public.update_ad_relevance_score(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_negative_count integer;
  v_impressions integer;
  v_score numeric;
BEGIN
  -- Count negative feedback (hide, report, hide_all_from_advertiser) for this ad
  SELECT COUNT(*) INTO v_negative_count
  FROM public.ad_feedback
  WHERE ad_id = p_ad_id
    AND feedback_type IN ('hide', 'report', 'hide_all_from_advertiser');

  -- Get impression count for the ad
  SELECT impressions INTO v_impressions
  FROM public.campus_ads
  WHERE id = p_ad_id;

  IF v_impressions IS NULL THEN
    v_impressions := 0;
  END IF;

  -- Calculate score: start at 5, decrease by 0.5 for each negative feedback per 1000 impressions? Let's define:
  -- We want the score to move between 1 and 10.
  -- Let's use a logistic-like function: score = 5 * (1 - (negative_feedback / (impressions + 1000)) * 2) clamped to [1,10]
  -- This means if negative_feedback equals impressions+1000, score goes to 0 -> clamp to 1.
  -- If no negative feedback, score = 5 * (1 - 0) = 5.
  -- Actually, we want baseline 5, and negative feedback pushes down, positive feedback (if we had) would push up.
  -- Since we only have negative feedback for now, we'll do:
  -- score = 5 * (1 - (negative_feedback::numeric / GREATEST(v_impressions, 1000)) * 2)
  -- Ensure it doesn't go below 1.

  IF v_impressions > 0 THEN
    v_score := 5.0 * (1.0 - (LEAST(v_negative_count::numeric, v_impressions * 2.0) / (v_impressions * 2.0)) * 2.0);
  ELSE
    -- No impressions yet, keep default score (but we could adjust based on feedback velocity?)
    v_score := 5.0;
  END IF;

  -- Clamp between 1 and 10
  v_score := GREATEST(1.0, LEAST(10.0, v_score));

  -- Update the ad
  UPDATE public.campus_ads
  SET relevance_score = v_score
  WHERE id = p_ad_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error (we could insert into a log table, but for now just raise notice)
    RAISE NOTICE 'Error updating relevance score for ad %: %', p_ad_id, SQLERRM;
END;
$$;

-- We can also create a view or materialized view for feedback aggregation if needed, but the function above updates the ad directly.

-- Optionally, create a trigger to update relevance_score when new feedback is inserted (but we might want to batch updates for performance)
-- For now, we'll rely on a periodic job (e.g., cron) to run the update function for all ads that have received feedback since last run.
-- We'll leave the scheduling to the application layer (e.g., a cloud function) or a simple cron in Supabase if available.

-- Comment
COMMENT ON TABLE public.ad_feedback IS 'Stores user feedback on ads (hide, report, etc.) used to compute relevance score.';
COMMENT ON COLUMN public.ad_feedback.feedback_type IS 'Type of feedback: hide (user hid this ad), report (user reported ad), hide_all_from_advertiser (user wants to see no ads from this advertiser).';
COMMENT ON FUNCTION public.update_ad_relevance_score(uuid) IS 'Recalculates and updates the relevance_score for a given ad based on accumulated feedback.';