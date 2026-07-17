-- 058: Add indexes for delivery scheduling columns to improve query performance
-- Also adds a check constraint to ensure ad_schedule is a valid JSON object (optional)

-- Index on delivery_type for potential filtering (low cardinality, but may help in combination with other indexes)
CREATE INDEX IF NOT EXISTS idx_campus_ads_delivery_type ON public.campus_ads(delivery_type);

-- GIN index on ad_schedule jsonb column to enable efficient querying of schedule properties
-- Example: check if a certain day has schedules, etc.
CREATE INDEX IF NOT EXISTS idx_campus_ads_ad_schedule_gin ON public.campus_ads USING GIN (ad_schedule);

-- Optional: Add a constraint to ensure ad_schedule is a valid JSON object (though jsonb column already ensures valid JSON)
-- We could add a check that it's an object, but not strictly necessary.
-- ALTER TABLE IF NOT EXISTS ADD CONSTRAINT chk_ad_schedule_object CHECK (jsonb_typeof(ad_schedule
-- ALTER TABLE public.campus_ads
--   ADD CONSTRAINT chk_ad_schedule_object
--   CHECK (jsonb_typeof(ad_schedule) = 'object');

-- Comment
COMMENT ON INDEX idx_campus_ads_delivery_type IS 'Index on delivery_type for potential filtering in ad delivery queries.';
COMMENT ON INDEX idx_campus_ads_ad_schedule_gin IS 'GIN index on ad_schedule JSONB column to enable efficient querying of scheduling details (e.g., checking for specific day/time ranges).';