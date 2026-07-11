-- 038: add ad plan/priority fields to campus_ads
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preview_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reach_multiplier numeric NOT NULL DEFAULT 1.0;

-- Optional index to help ordering by priority
CREATE INDEX IF NOT EXISTS idx_campus_ads_priority_budget
  ON public.campus_ads (priority DESC, budget DESC);

-- Backfill NULL start_date to now for active campaigns without a start_date
UPDATE public.campus_ads
SET start_date = now()
WHERE start_date IS NULL AND status = 'active';
