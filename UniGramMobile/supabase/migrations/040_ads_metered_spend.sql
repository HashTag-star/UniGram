-- 040: metered ad spend + credit-on-account refunds + click-to-WhatsApp
-- (Kofi Asante — Backend Engineer)
--
-- What this migration delivers:
--
--   A. Spend metering
--      Every impression/click now actually debits a rate from the campaign's
--      budget. When the running spend reaches the budget, the ad is auto-paused
--      with status='ended' — no more "campaign keeps serving after the money
--      is gone" behaviour.
--
--      Money is stored in pesewas (1 GHS = 100 pesewas) so we can use integer
--      math safely. The existing `spent` column (GHS) is kept as a mirror of
--      `spent_pesewas / 100` for display compatibility.
--
--   B. Per-campaign cost rules
--      Two new columns hold what an impression and a click cost. Defaults are
--      sensible (5 pesewas / impression  → GHS 5 per 1000, and
--      100 pesewas / click → GHS 1 per click) but each campaign can override
--      so a "Max Reach" plan can charge less per impression as a quantity
--      discount, etc.
--
--   C. Credit-on-account refunds
--      When a campaign is paused or ended before the full budget is spent, the
--      unspent portion lands as a credit on the advertiser's profile. The next
--      time they create a campaign that uses paid placement, we burn down the
--      credit before charging Paystack. This is safer than calling Paystack's
--      refund API on every pause — no automatic outbound money movement.
--
--      All credit movements are journalled in `ad_credit_ledger` so we have an
--      audit trail (delta, reason, related campaign / payment ref).
--
--   D. Click-to-WhatsApp ads
--      New `whatsapp_number` column on campus_ads. When set, the SponsoredAdCard
--      / ReelAdCard CTA opens a wa.me deep-link with the campaign's body
--      pre-filled as the first message, instead of opening a generic link.

-- ─── A & B: pesewa fields + cost rules ──────────────────────────────────────
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS spent_pesewas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_impression_pesewas integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cost_per_click_pesewas      integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- Carry pre-existing GHS spend into pesewa units one time.
UPDATE public.campus_ads
SET spent_pesewas = COALESCE(spent, 0) * 100
WHERE spent_pesewas = 0;

-- ─── C: credit-on-account columns + ledger ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ad_credit_pesewas integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ad_credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campus_ads(id) ON DELETE SET NULL,
  delta_pesewas integer NOT NULL, -- positive = credit added, negative = credit consumed
  reason      text NOT NULL,       -- 'refund_paused' | 'refund_ended' | 'consumed_on_create'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_credit_ledger_user_idx
  ON public.ad_credit_ledger(user_id, created_at DESC);

ALTER TABLE public.ad_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_credit_ledger_owner_select" ON public.ad_credit_ledger
  FOR SELECT USING (user_id = auth.uid());

-- ─── Metered impression RPC ─────────────────────────────────────────────────
-- Increments impressions, debits spend, and ends the campaign when budget is
-- fully spent. SECURITY DEFINER so anyone serving an ad can call it without
-- having UPDATE on the table.
CREATE OR REPLACE FUNCTION public.record_campus_ad_impression(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost   integer;
  v_budget integer;
  v_spent  integer;
BEGIN
  SELECT cost_per_impression_pesewas, budget * 100, spent_pesewas
    INTO v_cost, v_budget, v_spent
  FROM public.campus_ads
  WHERE id = p_ad_id;

  IF v_cost IS NULL THEN RETURN; END IF;

  -- Don't bill past the budget cap
  IF v_spent >= v_budget THEN RETURN; END IF;

  UPDATE public.campus_ads
  SET impressions   = impressions + 1,
      spent_pesewas = spent_pesewas + v_cost,
      spent         = (spent_pesewas + v_cost) / 100,
      status        = CASE
                        WHEN spent_pesewas + v_cost >= budget * 100 THEN 'ended'
                        ELSE status
                      END,
      end_date      = CASE
                        WHEN spent_pesewas + v_cost >= budget * 100
                          THEN COALESCE(end_date, now())
                        ELSE end_date
                      END
  WHERE id = p_ad_id;
END;
$$;

-- ─── Metered click RPC (same pattern, costlier per event) ───────────────────
CREATE OR REPLACE FUNCTION public.record_campus_ad_click(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost   integer;
  v_budget integer;
  v_spent  integer;
BEGIN
  SELECT cost_per_click_pesewas, budget * 100, spent_pesewas
    INTO v_cost, v_budget, v_spent
  FROM public.campus_ads
  WHERE id = p_ad_id;

  IF v_cost IS NULL THEN RETURN; END IF;
  IF v_spent >= v_budget THEN RETURN; END IF;

  UPDATE public.campus_ads
  SET clicks        = clicks + 1,
      spent_pesewas = spent_pesewas + v_cost,
      spent         = (spent_pesewas + v_cost) / 100,
      status        = CASE
                        WHEN spent_pesewas + v_cost >= budget * 100 THEN 'ended'
                        ELSE status
                      END,
      end_date      = CASE
                        WHEN spent_pesewas + v_cost >= budget * 100
                          THEN COALESCE(end_date, now())
                        ELSE end_date
                      END
  WHERE id = p_ad_id;
END;
$$;

-- ─── Pause / end → refund unused budget to user credit ──────────────────────
-- Trigger fires when status transitions out of 'active' to a terminal-ish
-- state. Refund = budget - spent (pesewas). Skipped when refund <= 0 or
-- when the new status is 'pending' (still in draft).
CREATE OR REPLACE FUNCTION public.fn_refund_unused_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund integer;
BEGIN
  IF NEW.status IN ('paused','ended','rejected') AND OLD.status = 'active' THEN
    v_refund := (NEW.budget * 100) - NEW.spent_pesewas;
    IF v_refund > 0 THEN
      UPDATE public.profiles
      SET ad_credit_pesewas = ad_credit_pesewas + v_refund
      WHERE id = NEW.user_id;

      INSERT INTO public.ad_credit_ledger (user_id, campaign_id, delta_pesewas, reason)
      VALUES (NEW.user_id, NEW.id, v_refund,
              CASE WHEN NEW.status = 'paused' THEN 'refund_paused' ELSE 'refund_ended' END);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_unused_budget ON public.campus_ads;
CREATE TRIGGER trg_refund_unused_budget
  AFTER UPDATE OF status ON public.campus_ads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_refund_unused_budget();

-- ─── Consume credit when creating a new paid campaign ───────────────────────
-- Caller invokes this AFTER successful insert (or right before initiating
-- Paystack) to reduce the Paystack charge by the user's available credit.
-- Returns how much credit was consumed (pesewas) so the caller can charge
-- (budget * 100 - consumed) to Paystack.
CREATE OR REPLACE FUNCTION public.consume_ad_credit(p_campaign_id uuid, p_max_pesewas integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available integer;
  v_consume   integer;
  v_user_id   uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.campus_ads WHERE id = p_campaign_id;
  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your campaign';
  END IF;

  SELECT ad_credit_pesewas INTO v_available FROM public.profiles WHERE id = v_user_id;
  v_consume := LEAST(COALESCE(v_available, 0), GREATEST(p_max_pesewas, 0));
  IF v_consume <= 0 THEN RETURN 0; END IF;

  UPDATE public.profiles
  SET ad_credit_pesewas = ad_credit_pesewas - v_consume
  WHERE id = v_user_id;

  -- Treat consumed credit as instant spend on the campaign
  UPDATE public.campus_ads
  SET spent_pesewas = spent_pesewas + v_consume,
      spent         = (spent_pesewas + v_consume) / 100
  WHERE id = p_campaign_id;

  INSERT INTO public.ad_credit_ledger (user_id, campaign_id, delta_pesewas, reason)
  VALUES (v_user_id, p_campaign_id, -v_consume, 'consumed_on_create');

  RETURN v_consume;
END;
$$;
