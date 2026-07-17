-- 054: Add bidding and targeting columns to campus_ads
-- Adds columns for auction-based bidding, advanced targeting, relevance score, and delivery controls

-- Bidding columns
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS bid_amount integer NOT NULL DEFAULT 0,           -- bid in pesewas (or micros if we change later)
  ADD COLUMN IF NOT EXISTS bid_type text NOT NULL DEFAULT 'CPM' CHECK (bid_type IN ('CPM', 'CPC', 'CPA')),
  ADD COLUMN IF NOT EXISTS bid_strategy text NOT NULL DEFAULT 'LOWEST_COST' CHECK (bid_strategy IN ('LOWEST_COST', 'COST_CAP', 'BID_CAP', 'TARGET_COST')),
  ADD COLUMN IF NOT EXISTS estimated_action_rate numeric NOT NULL DEFAULT 0.01; -- estimated CTR or CVR (e.g., 0.01 = 1%)

-- Targeting columns
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS age_min integer,
  ADD COLUMN IF NOT EXISTS age_max integer,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('all', 'male', 'female', 'non_binary')),
  ADD COLUMN IF NOT EXISTS detailed_targeting jsonb DEFAULT '{}'::jsonb,   -- e.g., {"interests": [...], "behaviors": [...]}
  ADD COLUMN IF NOT EXISTS custom_audience_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lookalike_audience_id uuid,
  ADD COLUMN IF NOT EXISTS excluded_custom_audience_ids uuid[] DEFAULT '{}';

-- Relevance and quality score
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS relevance_score numeric NOT NULL DEFAULT 5.0;   -- 1-10 scale, updated via feedback

-- Delivery and pacing controls
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'STANDARD' CHECK (delivery_type IN ('STANDARD', 'ACCELERATED')),
  ADD COLUMN IF NOT EXISTS ad_schedule jsonb DEFAULT '{}'::jsonb;         -- e.g., {"mon": [{"start":"09:00","end":"17:00"}], ...}

-- Extend placements array to include additional options (note: we cannot change the default array values easily, but we can document)
-- The placements column currently is text[] NOT NULL DEFAULT '{}'
-- We will allow new values: 'search', 'messages' (in addition to existing 'feed','stories','reels','explore','market')
-- We'll rely on application logic to validate; we could add a check constraint but it's tricky with arrays.
-- For now, we'll update the application to allow these values.

-- Indexes for new targeting columns to speed up filtering
CREATE INDEX IF NOT EXISTS idx_campus_ads_age_min ON public.campus_ads(age_min);
CREATE INDEX IF NOT EXISTS idx_campus_ads_age_max ON public.campus_ads(age_max);
CREATE INDEX IF NOT EXISTS idx_campus_ads_gender ON public.campus_ads(gender);
-- Note: indexing jsonb and array columns can be done with gin or gist if needed, but we'll start without for simplicity.
-- We can add GIN indexes on detailed_targeting and array columns later if queries become slow.

-- Update existing ads to have a sensible bid_amount based on historical CPC/CPM
-- We'll set a default bid_amount based on the old fixed cost model:
-- For CPM: we had 5 pesewas per impression -> 5000 pesewas per 1000 impressions
-- For CPC: we had 100 pesewas per click
-- Since we don't know the bid_type yet, we'll set bid_amount to 0 and require advertisers to set it on new/edit.
-- Alternatively, we could migrate based on budget and historical performance, but that's complex.
-- We'll leave it as 0 and the UI will prompt to set a bid.

-- Update estimated_action_rate based on objective as a starting point
-- We'll set a default per objective (these are rough estimates)
UPDATE public.campus_ads
SET estimated_action_rate = CASE
  WHEN objective = 'awareness' THEN 0.001   -- 0.1% CTR equivalent for awareness (we'll use this as base for CPM)
  WHEN objective = 'traffic' THEN 0.02      -- 2% CTR
  WHEN objective = 'engagement' THEN 0.05   -- 5% engagement rate
  WHEN objective = 'sales' THEN 0.01        -- 1% conversion rate
  ELSE 0.01
END
WHERE bid_amount = 0; -- only update if bid_amount is still default (new column)

-- For ads that already have bid_amount set (if any), we leave estimated_action_rate as is.
-- We'll also set bid_type to 'CPM' for awareness, 'CPC' for traffic, 'engagement' and 'sales'?
-- Actually, we can't assume. We'll leave bid_type as 'CPM' (default) and let advertisers change it.
-- But we can set a sensible default bid_type based on objective:
UPDATE public.campus_ads
SET bid_type = CASE
  WHEN objective = 'awareness' THEN 'CPM'
  WHEN objective = 'traffic' THEN 'CPC'
  WHEN objective = 'engagement' THEN 'CPC'   -- or maybe CPE (cost per engagement) but we don't have that, so use CPC as proxy
  WHEN objective = 'sales' THEN 'CPA'
  ELSE bid_type
END
WHERE bid_amount = 0;

-- Set bid_strategy to default (already set)

-- Set delivery_type default (already set)

-- Set ad_schedule to empty object (already set)

-- Set relevance_score to 5.0 (already set)

-- Note: We are not changing the existing budget, spent, etc. columns.
-- The bidding system will coexist with the old budget-based priority for a transition period?
-- Actually, we want to replace the old ranking with the auction score.
-- We'll keep the budget column for now (used for pacing and total spend limit) but the ranking will use bid_amount * estimated_action_rate * relevance_score/5.0
-- We'll also keep the priority and reach_multiplier columns for now, but they will be ignored in the new auction ranking.
-- We can eventually deprecate them.

-- However, to avoid breaking existing campaigns immediately, we can make the auction score fall back to the old priority/budget if bid_amount is 0.
-- We'll handle that in the application logic (getActiveAdsForPlacement).

-- Let's also add a comment to document the change.
COMMENT ON COLUMN public.campus_ads.bid_amount IS 'Bid amount in pesewas (or micros if changed). Used in auction score calculation.';
COMMENT ON COLUMN public.campus_ads.bid_type IS 'Type of bid: CPM (per 1000 impressions), CPC (per click), CPA (per action).';
COMMENT ON COLUMN public.campus_ads.bid_strategy IS 'Bid strategy: LOWEST_COST, COST_CAP, BID_CAP, TARGET_COST.';
COMMENT ON COLUMN public.campus_ads.estimated_action_rate IS 'Estimated action rate (CTR for CPC, CVR for CPA, or base rate for CPM).';
COMMENT ON COLUMN public.campus_ads.age_min IS 'Minimum age of target audience.';
COMMENT ON COLUMN public.campus_ads.age_max IS 'Maximum age of target audience.';
COMMENT ON COLUMN public.campus_ads.gender IS 'Target gender: all, male, female, non_binary.';
COMMENT ON COLUMN public.campus_ads.detailed_targeting IS 'JSONB object for detailed targeting (interests, behaviors, etc.).';
COMMENT ON COLUMN public.campus_ads.custom_audience_ids IS 'Array of custom audience IDs to target.';
COMMENT ON COLUMN public.campus_ads.lookalike_audience_id IS 'Seed audience ID for lookalike expansion.';
COMMENT ON COLUMN public.campus_ads.excluded_custom_audience_ids IS 'Array of custom audience IDs to exclude.';
COMMENT ON COLUMN public.campus_ads.relevance_score IS 'Relevance score (1-10) based on user feedback, used as quality adjustment in auction.';
COMMENT ON COLUMN public.campus_ads.delivery_type IS 'Delivery pacing: STANDARD (even) or ACCELERATED (as fast as possible).';
COMMENT ON COLUMN public.campus_ads.ad_schedule IS 'JSONB schedule for dayparting, e.g., {\"mon\": [{\"start\":\"09:00\",\"end\":\"17:00\"}]}';