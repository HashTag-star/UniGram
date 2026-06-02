-- 039: flip already-created test/preview ads to active so they reach real users
-- (Kofi Asante — Backend Engineer)
--
-- Background:
--   Until now, createCampaignDraft persisted new ads with status='pending'
--   and the feed/reels surfaced them only because the service forced an
--   `_isPreview` flag on every result, drawing the "Ad preview — not yet live"
--   banner over real ads. We now auto-activate on creation in the service
--   layer; this migration brings the existing pending rows along so the
--   user's already-created ads start serving immediately.
--
-- Rules applied:
--   * Only rows currently in status='pending' are touched.
--   * status -> 'active'
--   * start_date defaults to now() if NULL
--   * end_date  defaults to now() + 30 days if NULL (matches the new code path)
--   * priority is left untouched (default 0 from migration 038 is fine)
--   * preview_live is left untouched (owner-only preview opt-in stays off)
--
-- Rows that were 'paused' / 'ended' / 'rejected' are intentionally NOT
-- changed; they were paused or ended on purpose.

UPDATE public.campus_ads
SET
  status     = 'active',
  start_date = COALESCE(start_date, now()),
  end_date   = COALESCE(end_date,   now() + INTERVAL '30 days')
WHERE status = 'pending';
