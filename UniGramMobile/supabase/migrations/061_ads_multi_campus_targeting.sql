-- ============================================================
-- 061_ads_multi_campus_targeting.sql
-- Let advertisers target more than their own campus.
--
--   target_all_campuses  true  -> shown to every campus
--   target_universities  [..]  -> shown ONLY to students at these campuses
--   (both empty/false)         -> legacy behaviour: the advertiser's own campus
--                                 (campus_ads.university; NULL = everyone)
--
-- Delivery filtering happens in the app (services/campusAds.ts) exactly like the
-- existing campus check, so no policy changes are needed: ads stay readable by
-- the existing campus_ads_active_readable policy.
-- ============================================================
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS target_all_campuses boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_universities text[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_campus_ads_target_universities
  ON public.campus_ads USING gin (target_universities);

COMMENT ON COLUMN public.campus_ads.target_all_campuses IS 'When true the ad is delivered to every campus.';
COMMENT ON COLUMN public.campus_ads.target_universities IS 'Campuses the ad is delivered to. Empty = fall back to campus_ads.university.';
