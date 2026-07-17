-- 057: Create ad_daily_stats view for daily advertising performance metrics
-- Also enhances delivery_events table to support better analytics (optional cost column)

-- First, add an index on delivery_events for faster daily aggregation
-- We already have a unique constraint on (ad_id, viewer_id, placement, event_type, delivery_date)
-- Add a non-unique index for our queries
CREATE INDEX IF NOT EXISTS idx_campus_ad_delivery_events_ad_id_date_event
  ON public.campus_ad_delivery_events (ad_id, delivery_date, event_type);

-- Optionally, we could add a column to store the cost at the time of event for accurate historical spending.
-- For simplicity in this iteration, we will compute spend using current cost rates from the ad.
-- If we want to store historical cost, we would alter the table and update the trigger functions.
-- We'll leave that for a future improvement.

-- Create or replace the view for daily stats
CREATE OR REPLACE VIEW public.ad_daily_stats AS
  SELECT
    e.ad_id,
    e.delivery_date AS day,
    -- Count impressions and clicks
    COUNT(*) FILTER (WHERE e.event_type = 'impression') AS impressions,
    COUNT(*) FILTER (WHERE e.event_type = 'click') AS clicks,
    -- Unique users reached (based on impressions)
    COUNT(DISTINCT CASE WHEN e.event_type = 'impression' THEN e.viewer_id END) AS unique_users,
    -- Spend calculation: use current cost rates from the ad (note: if costs change over time, this will not be historically accurate)
    ( (COUNT(*) FILTER (WHERE e.event_type = 'impression') * COALESCE(c.cost_per_impression_pesewas, 0)) +
      (COUNT(*) FILTER (WHERE e.event_type = 'click') * COALESCE(c.cost_per_click_pesewas, 0)) ) / 100.0 AS spend_ghs,
    -- Conversion metrics from ad_conversions table (joined by date)
    COALESCE(MAX(conv.conversions), 0) AS conversions,
    COALESCE(MAX(conv.conversion_value), 0) AS conversion_value
  FROM public.campus_ad_delivery_events e
  LEFT JOIN public.campus_ads c ON e.ad_id = c.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS conversions,
      SUM(value) AS conversion_value
    FROM public.ad_conversions
    WHERE ad_id = e.ad_id
      AND timestamp::date = e.delivery_date
  ) conv ON true
  GROUP BY e.ad_id, e.delivery_date, c.cost_per_impression_pesewas, c.cost_per_click_pesewas;

-- Comment on the view
COMMENT ON VIEW public.ad_daily_stats IS 'Daily aggregated statistics for ads: impressions, clicks, unique users, spend, conversions. Note: spend is calculated using current cost rates from the ad, which may not reflect historical cost changes.';

-- Grant access if needed (default is that views inherit permissions from underlying tables, but we can be explicit)
-- GRANT SELECT ON PUBLIC.ad_daily_stats TO anon, authenticated; -- if needed