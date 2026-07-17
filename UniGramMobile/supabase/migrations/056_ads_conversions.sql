-- 056: Create ad_conversions table and related functions
-- Tracks conversions (purchases, sign-ups, etc.) attributed to ads

CREATE TABLE IF NOT EXISTS public.ad_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.campus_ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('purchase', 'lead', 'signup', 'app_install', 'custom')),
  value numeric, -- optional monetary value of the conversion (in GHS)
  attribution_model text NOT NULL DEFAULT 'click_through_1d', -- e.g., 'view_through_1d', 'click_through_1d', 'click_through_28d', 'view_through_28d'
  timestamp timestamptz NOT NULL DEFAULT now(),
  attachment jsonb -- additional data (e.g., product_id, order_value, currency, etc.)
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_ad_conversions_ad_id ON public.ad_conversions(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_conversions_user_id ON public.ad_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_conversions_event_type ON public.ad_conversions(event_type);
CREATE INDEX IF NOT EXISTS idx_ad_conversions_timestamp ON public.ad_conversions(timestamp);

-- Row Level Security
ALTER TABLE public.ad_conversions ENABLE ROW LEVEL SECURITY;

-- Users can only insert conversions (they can't see others' conversion data directly)
CREATE POLICY "ad_conversions_insert_own" ON public.ad_conversions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own conversions (if needed)
CREATE POLICY "ad_conversions_delete_own" ON public.ad_conversions
  FOR DELETE
  USING (user_id = auth.uid());

-- No select policy for regular users; conversions are aggregated in ad stats.
-- Admin access can be handled via existing admin policies on other tables or added later.

-- Function to record a conversion (called from edge function or service)
CREATE OR REPLACE FUNCTION public.record_ad_conversion(
  p_ad_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_value numeric DEFAULT NULL,
  p_attribution_model text DEFAULT 'click_through_1d',
  p_attachment jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.ad_conversions (ad_id, user_id, event_type, value, attribution_model, attachment)
  VALUES (p_ad_id, p_user_id, p_event_type, p_value, p_attribution_model, p_attachment);

  -- Optionally, we could update the ad's conversion count or value here if we denormalize.
  -- For now, we rely on aggregating from the ad_conversions table for reporting.
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to record conversion for ad %: %', p_ad_id, SQLERRM;
END;
$$;

-- Function to get conversion metrics for an ad (could be used in ad stats)
CREATE OR REPLACE FUNCTION public.get_ad_conversion_metrics(p_ad_id uuid)
RETURNS TABLE (
  conversions bigint,
  conversion_value numeric,
  conversions_by_type jsonb
)
LANGUAGE sql
AS $$
  SELECT
    COALESCE(SUM(cnt), 0)::bigint AS conversions,
    COALESCE(SUM(total_val), 0)::numeric AS conversion_value,
    COALESCE(jsonb_object_agg(event_type, cnt), '{}'::jsonb) AS conversions_by_type
  FROM (
    SELECT event_type, COUNT(*) AS cnt, SUM(value) AS total_val
    FROM public.ad_conversions
    WHERE ad_id = p_ad_id
    GROUP BY event_type
  ) sub;
$$;

-- Comment
COMMENT ON TABLE public.ad_conversions IS 'Stores conversion events attributed to ads (purchases, sign-ups, etc.).';
COMMENT ON COLUMN public.ad_conversions.event_type IS 'Type of conversion: purchase, lead, signup, app_install, custom.';
COMMENT ON COLUMN public.ad_conversions.value IS 'Monetary value of the conversion in GHS (optional).';
COMMENT ON COLUMN public.ad_conversions.attribution_model IS 'Attribution model used: click_through_1d, view_through_1d, etc.';
COMMENT ON COLUMN public.ad_conversions.attachment IS 'Additional JSONB data about the conversion (e.g., product details).';
COMMENT ON FUNCTION public.record_ad_conversion(uuid, uuid, text, numeric, text, jsonb) IS 'Records a conversion event for an ad.';
COMMENT ON FUNCTION public.get_ad_conversion_metrics(uuid) IS 'Returns aggregated conversion metrics for an ad.';
