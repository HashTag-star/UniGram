-- ============================================================================
-- 065_security_hardening.sql
-- Security audit fixes. Safe to re-run (OR REPLACE / IF EXISTS / guarded DO blocks).
--
-- KEY FACT: SECURITY DEFINER functions run as the function owner (postgres), so
-- `current_user` inside them is 'postgres' no matter who called. Trigger guards
-- that test `current_user IN ('authenticated','anon')` therefore only work when the
-- trigger function is SECURITY INVOKER. Definer RPCs that legitimately write
-- protected columns run as postgres and are trusted by those guards.
-- ============================================================================

-- ─── 1. profiles: privileged-column guard + column-level grants ──────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Server paths (definer RPCs = postgres, edge functions = service_role, SQL editor) are trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Never writable through the client API, not even by admins:
  IF NEW.is_admin          IS DISTINCT FROM OLD.is_admin
     OR NEW.is_pro            IS DISTINCT FROM OLD.is_pro
     OR NEW.pro_expires_at    IS DISTINCT FROM OLD.pro_expires_at
     OR NEW.ad_credit_pesewas IS DISTINCT FROM OLD.ad_credit_pesewas THEN
    RAISE EXCEPTION 'Cannot modify privileged profile fields';
  END IF;

  -- Moderation columns: admins only (AdminScreen / reports.ts write these as the admin user).
  IF (NEW.is_banned         IS DISTINCT FROM OLD.is_banned
      OR NEW.is_suspended      IS DISTINCT FROM OLD.is_suspended
      OR NEW.is_verified       IS DISTINCT FROM OLD.is_verified
      OR NEW.verification_type IS DISTINCT FROM OLD.verification_type)
     AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Cannot modify privileged profile fields';
  END IF;

  -- Denormalised counters are maintained by triggers (nested trigger depth > 1).
  -- A direct client UPDATE has depth 1.
  IF pg_trigger_depth() <= 1
     AND (NEW.followers_count IS DISTINCT FROM OLD.followers_count
          OR NEW.following_count IS DISTINCT FROM OLD.following_count
          OR NEW.posts_count     IS DISTINCT FROM OLD.posts_count)
     AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Cannot modify profile counters';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_privileged_guard ON public.profiles;
CREATE TRIGGER profiles_privileged_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_cols();

-- Column-level privileges (defence in depth). is_admin / is_pro / pro_expires_at /
-- ad_credit_pesewas are NOT grantable to clients at all.
-- NOTE: any column added to profiles later that clients must edit needs its own GRANT UPDATE.
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (
  username, full_name, avatar_url, cover_url, bio, university, major, year, pronouns, website,
  onboarding_completed, last_seen_at, last_seen, pro_disabled, pro_auto_renew,
  -- guarded by the trigger above (admin only):
  is_verified, verification_type, is_banned, is_suspended,
  -- written by nested (non-definer) counter triggers; direct edits blocked by the trigger above:
  followers_count, following_count, posts_count
) ON public.profiles TO authenticated;

-- ─── 2. campus_ads: guard / reach / refund, grants, policies ─────────────────
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS sim_funded_pesewas integer NOT NULL DEFAULT 0;

-- Backfill: how much of each campaign's funding came from simulated (test mode) payments.
UPDATE public.campus_ads c
SET sim_funded_pesewas = LEAST(c.funded_pesewas, s.total)
FROM (
  SELECT campaign_id, sum(pesewas)::int AS total
  FROM public.ad_funding_events
  WHERE reference LIKE 'sim\_%' AND campaign_id IS NOT NULL
  GROUP BY campaign_id
) s
WHERE c.id = s.campaign_id AND c.sim_funded_pesewas = 0;

CREATE OR REPLACE FUNCTION public.fn_ad_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  p public.ad_pricing%ROWTYPE;
  v_admin boolean;
BEGIN
  -- Server paths (definer RPCs run as postgres, edge functions as service_role) are trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  v_admin := public.is_admin_user();
  SELECT * INTO p FROM public.ad_pricing WHERE id = 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Campaigns can only be created for your own account';
    END IF;
    NEW.status := 'pending';
    NEW.funded_pesewas := 0;  NEW.sim_funded_pesewas := 0;
    NEW.spent_pesewas := 0;   NEW.spent := 0;
    NEW.impressions := 0;     NEW.clicks := 0;
    NEW.likes_count := 0;     NEW.comments_count := 0;
    NEW.daily_spent_pesewas := 0; NEW.daily_spent_date := NULL; NEW.daily_throttled_date := NULL;
    NEW.ai_review_status := 'pending'; NEW.ai_review_reason := NULL; NEW.ai_reviewed_at := NULL;
    NEW.admin_review_reason := NULL;
    NEW.relevance_score := 5.0;
    -- Plan tier is derived from the budget (mirror of planFromBudget in services/campusAds.ts)
    NEW.priority := CASE WHEN NEW.budget >= 250 THEN 3 WHEN NEW.budget >= 120 THEN 2 WHEN NEW.budget >= 60 THEN 1 ELSE 0 END;
    NEW.reach_multiplier := CASE WHEN NEW.budget >= 250 THEN 1.5 WHEN NEW.budget >= 120 THEN 1.2 ELSE 1.0 END;
    IF NEW.budget < p.min_budget_ghs THEN
      RAISE EXCEPTION 'Minimum campaign budget is GHS %', p.min_budget_ghs;
    END IF;
  ELSE
    -- Ownership, counters, money and review state are server-owned
    NEW.user_id            := OLD.user_id;
    NEW.funded_pesewas     := OLD.funded_pesewas;
    NEW.sim_funded_pesewas := OLD.sim_funded_pesewas;
    NEW.spent_pesewas      := OLD.spent_pesewas;
    NEW.spent              := OLD.spent;
    NEW.impressions        := OLD.impressions;
    NEW.clicks             := OLD.clicks;
    NEW.likes_count        := OLD.likes_count;
    NEW.comments_count     := OLD.comments_count;
    NEW.daily_spent_pesewas  := OLD.daily_spent_pesewas;
    NEW.daily_spent_date     := OLD.daily_spent_date;
    NEW.daily_throttled_date := OLD.daily_throttled_date;
    NEW.reach_factor       := OLD.reach_factor;  -- recomputed by fn_ad_reach while unfunded
    IF NOT v_admin THEN
      NEW.ai_review_status    := OLD.ai_review_status;
      NEW.ai_review_reason    := OLD.ai_review_reason;
      NEW.ai_reviewed_at      := OLD.ai_reviewed_at;
      NEW.admin_review_reason := OLD.admin_review_reason;
      NEW.relevance_score     := OLD.relevance_score;
    END IF;

    -- Once money is on the campaign, pricing/budget/schedule are locked
    IF OLD.funded_pesewas > 0 THEN
      NEW.budget := OLD.budget;
      NEW.cpm_pesewas := OLD.cpm_pesewas;
      NEW.cost_per_click_pesewas := OLD.cost_per_click_pesewas;
      NEW.cost_per_impression_pesewas := OLD.cost_per_impression_pesewas;
      NEW.bid_type := OLD.bid_type;
      NEW.end_date := OLD.end_date;
      NEW.start_date := OLD.start_date;
      NEW.priority := OLD.priority;
      NEW.reach_multiplier := OLD.reach_multiplier;
    ELSE
      NEW.priority := CASE WHEN NEW.budget >= 250 THEN 3 WHEN NEW.budget >= 120 THEN 2 WHEN NEW.budget >= 60 THEN 1 ELSE 0 END;
      NEW.reach_multiplier := CASE WHEN NEW.budget >= 250 THEN 1.5 WHEN NEW.budget >= 120 THEN 1.2 ELSE 1.0 END;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT v_admin THEN
        -- Owners may only pause / resume. Everything else (going live, ending, rejecting) is server-side.
        IF NOT ((OLD.status = 'active' AND NEW.status = 'paused')
             OR (OLD.status = 'paused' AND NEW.status = 'active')) THEN
          RAISE EXCEPTION 'Campaign status can only be switched between active and paused';
        END IF;
        IF NEW.status = 'active' AND OLD.ai_review_status = 'rejected' THEN
          RAISE EXCEPTION 'This campaign was rejected and cannot be resumed';
        END IF;
      END IF;
      -- Terminal states are final (even for admins editing via the table)
      IF OLD.status IN ('ended', 'rejected') THEN NEW.status := OLD.status; END IF;
      -- Going live needs full funding
      IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
        IF NEW.funded_pesewas < NEW.budget * 100 OR NEW.spent_pesewas >= NEW.funded_pesewas THEN
          RAISE EXCEPTION 'Campaign must be fully paid before it can run';
        END IF;
        IF NEW.end_date IS NOT NULL AND NEW.end_date <= now() THEN
          RAISE EXCEPTION 'Campaign has expired';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Floor prices
  IF COALESCE(NEW.bid_type, 'CPM') = 'CPC' THEN
    IF COALESCE(NEW.cost_per_click_pesewas, 0) < p.min_cpc_pesewas THEN
      NEW.cost_per_click_pesewas := p.min_cpc_pesewas;
    END IF;
  ELSE
    IF COALESCE(NEW.cpm_pesewas, 0) < p.min_cpm_pesewas THEN
      NEW.cpm_pesewas := p.default_cpm_pesewas;
    END IF;
  END IF;
  NEW.cost_per_impression_pesewas :=
    CASE WHEN COALESCE(NEW.cpm_pesewas, 0) > 0 AND COALESCE(NEW.bid_type, 'CPM') <> 'CPC'
         THEN GREATEST(1, round(NEW.cpm_pesewas / 1000.0)::int) ELSE 0 END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ad_reach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE pr public.ad_pricing%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.funded_pesewas > 0 THEN
    NEW.reach_factor := OLD.reach_factor;
    NEW.target_all_campuses := OLD.target_all_campuses;
    NEW.target_universities := OLD.target_universities;
    RETURN NEW;
  END IF;
  NEW.reach_factor := public.ad_reach_factor(NEW.target_all_campuses, NEW.target_universities, NEW.university);
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT * INTO pr FROM public.ad_pricing WHERE id = 1;
    IF NEW.budget < ceil(pr.min_budget_ghs * NEW.reach_factor) THEN
      RAISE EXCEPTION 'Minimum budget for this audience is GHS %', ceil(pr.min_budget_ghs * NEW.reach_factor);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Refund of unspent REAL money to ad credit. Simulated (test mode) funding is never refundable.
-- Stays SECURITY DEFINER (it writes profiles.ad_credit_pesewas); owners cannot reach it because the
-- guard above only lets them toggle active<->paused (never 'ended' / 'rejected').
CREATE OR REPLACE FUNCTION public.fn_refund_unused_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_refund integer;
BEGIN
  IF NEW.status IN ('ended', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Spend is assumed to consume simulated funds first, so real unspent = funded - max(spent, simulated)
    v_refund := floor(NEW.funded_pesewas - GREATEST(NEW.spent_pesewas, NEW.sim_funded_pesewas::numeric))::int;
    IF v_refund > 0 THEN
      UPDATE public.profiles SET ad_credit_pesewas = ad_credit_pesewas + v_refund WHERE id = NEW.user_id;
      INSERT INTO public.ad_credit_ledger (user_id, campaign_id, delta_pesewas, reason)
      VALUES (NEW.user_id, NEW.id, v_refund, CASE WHEN NEW.status = 'ended' THEN 'refund_ended' ELSE 'refund_rejected' END);
    END IF;
    NEW.funded_pesewas := floor(NEW.spent_pesewas)::int;   -- can't be refunded twice
    NEW.sim_funded_pesewas := LEAST(NEW.sim_funded_pesewas, NEW.funded_pesewas);
    IF NEW.end_date IS NULL OR NEW.end_date > now() THEN NEW.end_date := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Policies: owners may only create/update their own rows (WITH CHECK was missing -> user_id hijack)
DROP POLICY IF EXISTS "campus_ads_insert" ON public.campus_ads;
CREATE POLICY "campus_ads_insert" ON public.campus_ads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "campus_ads_owner_update" ON public.campus_ads;
CREATE POLICY "campus_ads_owner_update" ON public.campus_ads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Column-level privileges: clients may write content/targeting columns only.
-- (money, counters, review state and sim_funded_pesewas are server-owned; the guard trigger is the 2nd layer)
REVOKE INSERT, UPDATE ON public.campus_ads FROM authenticated, anon;
GRANT INSERT (
  user_id, name, objective, format, placements, headline, body, cta, link, media_url, cards,
  status, budget, priority, reach_multiplier, preview_live, university, start_date, end_date,
  payment_ref, whatsapp_number, cpm_pesewas, cost_per_click_pesewas,
  bid_amount, bid_type, bid_strategy, estimated_action_rate,
  age_min, age_max, gender, detailed_targeting, custom_audience_ids, lookalike_audience_id,
  excluded_custom_audience_ids, relevance_score, delivery_type, ad_schedule,
  target_all_campuses, target_universities
) ON public.campus_ads TO authenticated;
GRANT UPDATE (
  name, objective, format, placements, headline, body, cta, link, media_url, cards,
  status, budget, preview_live, university, start_date, end_date,
  payment_ref, whatsapp_number, cpm_pesewas, cost_per_click_pesewas,
  bid_amount, bid_type, bid_strategy, estimated_action_rate,
  age_min, age_max, gender, detailed_targeting, custom_audience_ids, lookalike_audience_id,
  excluded_custom_audience_ids, delivery_type, ad_schedule,
  target_all_campuses, target_universities
) ON public.campus_ads TO authenticated;

-- ─── 3. simulate_fund_campaign: test-mode funding can never become spendable credit ──
CREATE OR REPLACE FUNCTION public.simulate_fund_campaign(p_campaign_id uuid, p_days integer DEFAULT 7)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a public.campus_ads%ROWTYPE; v_need integer; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((SELECT simulated_payments FROM public.ad_pricing WHERE id = 1), false) THEN
    RAISE EXCEPTION 'Simulated payments are disabled';
  END IF;
  SELECT * INTO a FROM public.campus_ads WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR a.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your campaign'; END IF;
  IF a.status NOT IN ('pending', 'paused') THEN RETURN false; END IF;
  v_need := a.budget * 100 - a.funded_pesewas;
  IF v_need <= 0 THEN RETURN true; END IF;

  v_ok := public.fund_campus_ad(p_campaign_id, 'sim_' || gen_random_uuid()::text, v_need, p_days);
  IF v_ok THEN
    -- Track simulated money separately so fn_refund_unused_budget never converts it into ad credit.
    UPDATE public.campus_ads SET sim_funded_pesewas = sim_funded_pesewas + v_need WHERE id = p_campaign_id;
  END IF;
  RETURN v_ok;
END;
$$;
REVOKE ALL ON FUNCTION public.simulate_fund_campaign(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_fund_campaign(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_ad_credit(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ad_credit(uuid, integer, integer) TO authenticated;

-- ─── 4. admin_approve_ad / admin_reject_ad ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_ad(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ad public.campus_ads%ROWTYPE;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Admin privilege required'; END IF;
  SELECT * INTO v_ad FROM public.campus_ads WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ad not found'; END IF;
  IF v_ad.funded_pesewas < v_ad.budget * 100 THEN
    RAISE EXCEPTION 'Campaign is not fully funded';
  END IF;

  UPDATE public.campus_ads
  SET
    status           = 'active',
    ai_review_status = CASE WHEN ai_review_status = 'rejected' THEN 'approved' ELSE ai_review_status END,
    start_date       = COALESCE(start_date, now()),
    end_date         = COALESCE(end_date, now() + INTERVAL '7 days')
  WHERE id = p_ad_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_ad(p_ad_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Admin privilege required'; END IF;
  UPDATE public.campus_ads
  SET status = 'rejected', admin_review_reason = left(p_reason, 500)
  WHERE id = p_ad_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approve_ad(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_ad(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_ad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_ad(uuid, text) TO authenticated;

-- ─── 5. Ad delivery: billing primitives are server-only, wrappers are hardened ──
CREATE INDEX IF NOT EXISTS idx_campus_ad_delivery_viewer_day
  ON public.campus_ad_delivery_events (viewer_id, delivery_date, event_type);

-- Events can only be created by the definer RPCs below (they enforce caps / ownership / placement).
DROP POLICY IF EXISTS "ad_delivery_viewer_insert" ON public.campus_ad_delivery_events;

CREATE OR REPLACE FUNCTION public.record_campus_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpm int; v_type text; v_f numeric;
BEGIN
  SELECT cpm_pesewas, bid_type, reach_factor INTO v_cpm, v_type, v_f
  FROM public.campus_ads WHERE id = p_ad_id AND status = 'active';
  IF v_cpm IS NULL THEN RETURN; END IF;
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN COALESCE(v_type, 'CPM') = 'CPC' THEN 0 ELSE v_cpm / 1000.0 * v_f END, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpc int; v_type text; v_f numeric;
BEGIN
  SELECT cost_per_click_pesewas, bid_type, reach_factor INTO v_cpc, v_type, v_f
  FROM public.campus_ads WHERE id = p_ad_id AND status = 'active';
  IF v_cpc IS NULL THEN RETURN; END IF;
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN v_type = 'CPC' THEN v_cpc * v_f ELSE 0 END, true);
END;
$$;
REVOKE ALL ON FUNCTION public.record_campus_ad_impression(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_campus_ad_click(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_campus_ad_delivery(p_ad_id uuid, p_placement text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid; v_status text; v_pl text[]; v_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT user_id, status, placements INTO v_owner, v_status, v_pl FROM public.campus_ads WHERE id = p_ad_id;
  IF NOT FOUND OR v_status <> 'active' THEN RETURN false; END IF;
  IF v_owner = v_uid THEN RETURN false; END IF;                       -- advertisers can't bill themselves
  IF cardinality(COALESCE(v_pl, '{}')) > 0 AND NOT (p_placement = ANY (v_pl)) THEN RETURN false; END IF;
  SELECT count(*) INTO v_n FROM public.campus_ad_delivery_events
   WHERE viewer_id = v_uid AND delivery_date = CURRENT_DATE AND event_type = 'impression';
  IF v_n >= 200 THEN RETURN false; END IF;                            -- per-viewer daily cap

  INSERT INTO public.campus_ad_delivery_events (ad_id, viewer_id, placement, event_type)
  VALUES (p_ad_id, v_uid, p_placement, 'impression') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    PERFORM public.record_campus_ad_impression(p_ad_id);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_ad_click_event(p_ad_id uuid, p_placement text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid; v_status text; v_pl text[]; v_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT user_id, status, placements INTO v_owner, v_status, v_pl FROM public.campus_ads WHERE id = p_ad_id;
  IF NOT FOUND OR v_status <> 'active' THEN RETURN false; END IF;
  IF v_owner = v_uid THEN RETURN false; END IF;
  IF cardinality(COALESCE(v_pl, '{}')) > 0 AND NOT (p_placement = ANY (v_pl)) THEN RETURN false; END IF;
  SELECT count(*) INTO v_n FROM public.campus_ad_delivery_events
   WHERE viewer_id = v_uid AND delivery_date = CURRENT_DATE AND event_type = 'click';
  IF v_n >= 30 THEN RETURN false; END IF;

  INSERT INTO public.campus_ad_delivery_events (ad_id, viewer_id, placement, event_type)
  VALUES (p_ad_id, v_uid, p_placement, 'click') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    PERFORM public.record_campus_ad_click(p_ad_id);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.record_campus_ad_delivery(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_campus_ad_click_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_campus_ad_delivery(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_campus_ad_click_event(uuid, text) TO authenticated;

-- Legacy sponsored_posts counters: signed-in users only
REVOKE ALL ON FUNCTION public.record_ad_impression(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_ad_click(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_click(uuid) TO authenticated;

-- ─── 6. Messaging RPCs ───────────────────────────────────────────────────────
-- p_user_id is kept for client compatibility but IGNORED: the caller's identity is auth.uid().
CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.last_message_at DESC NULLS LAST), '[]'::json)
  FROM (
    SELECT
      c.id,
      c.is_group,
      c.group_name,
      c.last_message,
      c.last_message_at,
      cp_me.unread_count,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'user_id',          cp2.user_id,
          'unread_count',     cp2.unread_count,
          'profiles', json_build_object(
            'id',                p.id,
            'username',          p.username,
            'full_name',         p.full_name,
            'avatar_url',        p.avatar_url,
            'is_verified',       p.is_verified,
            'verification_type', p.verification_type
          )
        )), '[]'::json)
        FROM conversation_participants cp2
        JOIN profiles p ON p.id = cp2.user_id
        WHERE cp2.conversation_id = c.id
      ) AS conversation_participants
    FROM conversation_participants cp_me
    JOIN conversations c ON c.id = cp_me.conversation_id
    WHERE cp_me.user_id = auth.uid()
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.get_user_conversations_v2(p_user_id uuid, p_archived boolean DEFAULT false)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.last_message_at DESC NULLS LAST), '[]'::json)
  FROM (
    SELECT
      c.id,
      c.is_group,
      c.group_name,
      c.last_message,
      c.last_message_at,
      c.pinned_message_id,
      cp_me.unread_count,
      cp_me.is_archived,
      cp_me.is_muted,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'user_id',          cp2.user_id,
          'unread_count',     cp2.unread_count,
          'profiles', json_build_object(
            'id',                p.id,
            'username',          p.username,
            'full_name',         p.full_name,
            'avatar_url',        p.avatar_url,
            'is_verified',       p.is_verified,
            'verification_type', p.verification_type
          )
        )), '[]'::json)
        FROM conversation_participants cp2
        JOIN profiles p ON p.id = cp2.user_id
        WHERE cp2.conversation_id = c.id
      ) AS conversation_participants
    FROM conversation_participants cp_me
    JOIN conversations c ON c.id = cp_me.conversation_id
    WHERE cp_me.user_id = auth.uid()
    AND cp_me.is_archived = p_archived
  ) t;
$$;
REVOKE ALL ON FUNCTION public.get_user_conversations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_conversations_v2(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversations_v2(uuid, boolean) TO authenticated;

-- Vulnerable overload (caller-controlled user id). The one-argument version from 040 remains.
DROP FUNCTION IF EXISTS public.delete_message_for_me(uuid, uuid);
REVOKE ALL ON FUNCTION public.delete_message_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_for_me(uuid) TO authenticated;

-- create_dm / create_group_v2 trusted caller-supplied user ids
CREATE OR REPLACE FUNCTION public.create_dm(user1 uuid, user2 uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_conv_id uuid;
  new_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() NOT IN (user1, user2) OR user1 = user2 THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT c.id INTO existing_conv_id
  FROM conversations c
  JOIN conversation_participants p1 ON c.id = p1.conversation_id
  JOIN conversation_participants p2 ON c.id = p2.conversation_id
  WHERE c.is_group = false
    AND p1.user_id = user1
    AND p2.user_id = user2
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  INSERT INTO conversations (is_group) VALUES (false) RETURNING id INTO new_conv_id;
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (new_conv_id, user1), (new_conv_id, user2);
  RETURN new_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_group_v2(owner_id uuid, member_ids uuid[], group_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_conv_id uuid;
  member_id_var uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF COALESCE(cardinality(member_ids), 0) > 100 THEN RAISE EXCEPTION 'Too many members'; END IF;

  INSERT INTO conversations (is_group, group_name)
  VALUES (true, left(group_name, 100))
  RETURNING id INTO new_conv_id;

  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (new_conv_id, auth.uid());

  FOREACH member_id_var IN ARRAY COALESCE(member_ids, '{}'::uuid[])
  LOOP
    IF member_id_var <> auth.uid() THEN
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (new_conv_id, member_id_var);
    END IF;
  END LOOP;
  RETURN new_conv_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_dm(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_v2(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dm(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_v2(uuid, uuid[], text) TO authenticated;

-- Notification / push fan-out helpers are server-only (called from definer triggers/functions)
REVOKE ALL ON FUNCTION public.create_notification(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_push_via_db(uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- update_rel_strength: actor must be the caller, delta clamped
CREATE OR REPLACE FUNCTION public.update_rel_strength(p_actor uuid, p_target uuid, p_delta double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct client RPC call (not nested inside a DB trigger): actor must be the caller.
  IF pg_trigger_depth() = 0 AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL OR p_actor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
  END IF;
  INSERT INTO user_relationships (user_a, user_b, strength, last_interact)
  VALUES (p_actor, p_target, LEAST(10, GREATEST(-10, p_delta)), now())
  ON CONFLICT (user_a, user_b) DO UPDATE
  SET strength = user_relationships.strength + LEAST(10, GREATEST(-10, p_delta)),
      last_interact = now();
END;
$$;
REVOKE ALL ON FUNCTION public.update_rel_strength(uuid, uuid, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rel_strength(uuid, uuid, double precision) TO authenticated;

REVOKE ALL ON FUNCTION public.match_contacts(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contacts(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated;

-- ─── 7. like_ad / unlike_ad ──────────────────────────────────────────────────
-- p_user_id is kept for client compatibility but IGNORED (auth.uid() is used).
CREATE OR REPLACE FUNCTION public.like_ad(p_ad_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.campus_ad_likes(ad_id, user_id)
  VALUES (p_ad_id, auth.uid())
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.campus_ads SET likes_count = likes_count + 1 WHERE id = p_ad_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlike_ad(p_ad_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.campus_ad_likes WHERE ad_id = p_ad_id AND user_id = auth.uid();
  IF FOUND THEN
    UPDATE public.campus_ads SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_ad_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.like_ad(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlike_ad(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.like_ad(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlike_ad(uuid, uuid) TO authenticated;

-- ─── 8. ad_daily_stats view, conversions, feedback, comments ─────────────────
ALTER VIEW public.ad_daily_stats SET (security_invoker = true);
REVOKE ALL ON public.ad_daily_stats FROM PUBLIC, anon;
GRANT SELECT ON public.ad_daily_stats TO authenticated;

-- Conversions: the user id is the caller; only users who actually saw the ad can convert.
DROP FUNCTION IF EXISTS public.record_ad_conversion(uuid, uuid, text, numeric, text, jsonb);
CREATE OR REPLACE FUNCTION public.record_ad_conversion(
  p_ad_id uuid,
  p_event_type text,
  p_value numeric DEFAULT NULL,
  p_attribution_model text DEFAULT 'click_through_1d',
  p_attachment jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_event_type NOT IN ('purchase', 'lead', 'signup', 'app_install', 'custom') THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;
  IF p_attribution_model NOT IN ('click_through_1d', 'view_through_1d', 'click_through_28d', 'view_through_28d') THEN
    RAISE EXCEPTION 'Invalid attribution model';
  END IF;
  IF p_value IS NOT NULL AND (p_value < 0 OR p_value > 1000000) THEN RAISE EXCEPTION 'Invalid value'; END IF;
  IF pg_column_size(COALESCE(p_attachment, '{}'::jsonb)) > 2048 THEN RAISE EXCEPTION 'Attachment too large'; END IF;
  IF EXISTS (SELECT 1 FROM public.campus_ads WHERE id = p_ad_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Advertisers cannot convert on their own ads';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campus_ad_delivery_events WHERE ad_id = p_ad_id AND viewer_id = v_uid) THEN
    RAISE EXCEPTION 'No ad interaction recorded';
  END IF;
  -- one conversion per user / ad / event type / day
  IF EXISTS (SELECT 1 FROM public.ad_conversions
              WHERE ad_id = p_ad_id AND user_id = v_uid AND event_type = p_event_type
                AND "timestamp" >= date_trunc('day', now())) THEN
    RETURN;
  END IF;
  INSERT INTO public.ad_conversions (ad_id, user_id, event_type, value, attribution_model, attachment)
  VALUES (p_ad_id, v_uid, p_event_type, p_value, p_attribution_model, COALESCE(p_attachment, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.record_ad_conversion(uuid, text, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_ad_conversion(uuid, text, numeric, text, jsonb) TO authenticated;

DROP POLICY IF EXISTS "ad_conversions_insert_own" ON public.ad_conversions;
REVOKE INSERT, UPDATE ON public.ad_conversions FROM authenticated, anon;

-- ad_feedback: one row per (ad, user, type)
DELETE FROM public.ad_feedback a
USING public.ad_feedback b
WHERE a.ad_id = b.ad_id AND a.user_id = b.user_id AND a.feedback_type = b.feedback_type
  AND (a.created_at, a.id) > (b.created_at, b.id);
CREATE UNIQUE INDEX IF NOT EXISTS ad_feedback_unique_per_user
  ON public.ad_feedback (ad_id, user_id, feedback_type);

-- update_ad_relevance_score mutates campus_ads: server-side only
REVOKE ALL ON FUNCTION public.update_ad_relevance_score(uuid) FROM PUBLIC, anon, authenticated;

-- campus_ad_comments length (NOT VALID: don't fail on legacy rows, enforced for new writes)
ALTER TABLE public.campus_ad_comments DROP CONSTRAINT IF EXISTS campus_ad_comments_content_len;
ALTER TABLE public.campus_ad_comments
  ADD CONSTRAINT campus_ad_comments_content_len CHECK (char_length(content) BETWEEN 1 AND 500) NOT VALID;

-- ─── 9. Analytics RPCs: self + active Pro only ───────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_pro_self(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;   -- edge functions (they gate Pro themselves)
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND is_pro AND (pro_expires_at IS NULL OR pro_expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Pro subscription required';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_pro_self(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_post_analytics(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(post_id uuid, caption text, media_url text, created_at timestamptz, likes_count integer,
              comments_count integer, reposts_count integer, views bigint, reach bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.caption, p.media_url, p.created_at, p.likes_count, p.comments_count, p.reposts_count,
    COUNT(pi.post_id)          AS views,
    COUNT(DISTINCT pi.user_id) AS reach
  FROM posts p
  LEFT JOIN post_impressions pi ON pi.post_id = p.id
  WHERE public._assert_pro_self(p_user_id)
    AND p.user_id = p_user_id
    AND p.created_at > now() - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 365) || ' days')::interval
  GROUP BY p.id
  ORDER BY p.created_at DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public._assert_pro_self(p_user_id) THEN jsonb_build_object(
    'followers',              (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id),
    'following',              (SELECT COUNT(*) FROM follows WHERE follower_id  = p_user_id),
    'profile_views_7d',       (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '7 days'),
    'profile_views_30d',      (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '30 days'),
    'profile_views_prev_7d',  (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'),
    'profile_views_prev_30d', (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'),
    'total_posts',            (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id),
    'total_likes',            (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id),
    'total_comments',         (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id),
    'likes_30d',              (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),
    'comments_30d',           (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),
    'total_views_30d',        (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at > now() - interval '30 days'
    ),
    'total_views_prev_30d',   (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
    )
  ) END;
$$;
REVOKE ALL ON FUNCTION public.get_post_analytics(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_profile_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_analytics(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_analytics(uuid) TO authenticated, service_role;

-- Profile views: viewer is the caller, deduped per viewer/profile/day, no direct INSERT
CREATE OR REPLACE FUNCTION public.record_profile_view_analytics(p_profile_id uuid, p_viewer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_profile_id IS NULL OR p_profile_id = v_uid THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.profile_views
              WHERE profile_id = p_profile_id AND viewer_id = v_uid
                AND viewed_at >= date_trunc('day', now())) THEN
    RETURN;
  END IF;
  INSERT INTO public.profile_views(profile_id, viewer_id) VALUES (p_profile_id, v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.record_profile_view_analytics(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_profile_view_analytics(uuid, uuid) TO authenticated;
DROP POLICY IF EXISTS "authenticated_can_record_view" ON public.profile_views;

-- ─── 10. Counter RPCs, interactions, search_path, trigger-function EXECUTE ────
CREATE OR REPLACE FUNCTION public.increment_post_reposts(p_post_id uuid, delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.posts
  SET reposts_count = GREATEST(0, COALESCE(reposts_count, 0) + LEAST(1, GREATEST(-1, COALESCE(delta, 0))))
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_post_shares(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_viewer_count(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.live_sessions
  SET viewer_count = viewer_count + 1
  WHERE id = p_session_id AND status = 'live';
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_viewer_count(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.live_sessions
  SET viewer_count = GREATEST(0, viewer_count - 1)
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_interactions_processed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.interactions
  SET processed = true
  WHERE user_id = auth.uid()
    AND processed = false;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_post_reposts(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_post_shares(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_viewer_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decrement_viewer_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_interactions_processed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_post_reposts(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_shares(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_viewer_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_viewer_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_interactions_processed(uuid) TO authenticated;

-- Definer trigger functions without a pinned search_path
CREATE OR REPLACE FUNCTION public.increment_ad_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.campus_ads SET comments_count = comments_count + 1 WHERE id = NEW.ad_id;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.decrement_ad_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.campus_ads SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.ad_id;
  RETURN OLD;
END;
$$;
ALTER FUNCTION public.notify_followers_of_live()    SET search_path = public;
ALTER FUNCTION public.notify_followers_live_ended() SET search_path = public;

-- Trigger functions must not be callable as RPCs (triggers fire regardless of EXECUTE grants)
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$do$;

-- ─── 11. ai_action_log columns used by ai-regulation-scan ────────────────────
ALTER TABLE public.ai_action_log
  ADD COLUMN IF NOT EXISTS confidence float8,
  ADD COLUMN IF NOT EXISTS ai_reason  text;

-- ─── 12. Pro expiry sweep + housekeeping crons ───────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_pro_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.profiles SET is_pro = false
  WHERE is_pro AND pro_expires_at IS NOT NULL AND pro_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_pro_subscriptions() FROM PUBLIC, anon, authenticated;

-- ─── AI usage quota + push rate limiting (used by edge functions) ────────────
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL,
  day     date NOT NULL DEFAULT CURRENT_DATE,
  fn      text NOT NULL,
  n       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, fn)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;   -- no policies: service/definer only
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_ai_quota_for(p_user uuid, p_fn text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.ai_usage AS u (user_id, day, fn, n) VALUES (p_user, CURRENT_DATE, p_fn, 1)
  ON CONFLICT (user_id, day, fn) DO UPDATE SET n = u.n + 1
  RETURNING u.n INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.check_ai_quota_for(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota_for(uuid, text, integer) TO service_role;

-- Signed-in variant: increments the caller's counter and returns false once over `p_limit` per day
CREATE OR REPLACE FUNCTION public.check_ai_quota(p_fn text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN public.check_ai_quota_for(auth.uid(), p_fn, p_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.check_ai_quota(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_quota(text, integer) TO authenticated;

CREATE TABLE IF NOT EXISTS public.push_rate_limit (
  sender_id uuid NOT NULL,
  bucket    timestamptz NOT NULL,
  n         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (sender_id, bucket)
);
ALTER TABLE public.push_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_rate_limit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_push_rate(p_sender uuid, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.push_rate_limit AS r (sender_id, bucket, n) VALUES (p_sender, date_trunc('minute', now()), 1)
  ON CONFLICT (sender_id, bucket) DO UPDATE SET n = r.n + 1
  RETURNING r.n INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.check_push_rate(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_push_rate(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_security_housekeeping()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.ai_usage WHERE day < CURRENT_DATE - 7;
  DELETE FROM public.push_rate_limit WHERE bucket < now() - interval '1 hour';
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_security_housekeeping() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('expire-pro-subscriptions', 'security-housekeeping');
    PERFORM cron.schedule('expire-pro-subscriptions', '*/15 * * * *', 'SELECT public.expire_pro_subscriptions()');
    PERFORM cron.schedule('security-housekeeping', '30 3 * * *', 'SELECT public.cleanup_security_housekeeping()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END
$do$;

SELECT public.expire_pro_subscriptions();

-- ─── 15. Indexes + LIMIT clamps on feed / explore RPCs ───────────────────────
CREATE INDEX IF NOT EXISTS idx_post_impressions_post_seen ON public.post_impressions (post_id, seen_at);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);

-- Rewrites the live definitions so `LIMIT p_limit` becomes `LIMIT LEAST(GREATEST(COALESCE(p_limit,1),1),50)`.
-- Works off pg_get_functiondef so it can't drift from what is deployed; re-running is a no-op.
DO $do$
DECLARE r record; d text; nd text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('get_explore_posts', 'get_hybrid_campus_feed', 'get_personalized_feed',
                        'get_suggested_users', 'get_vector_explore_posts', 'get_trending_hashtags')
  LOOP
    d  := pg_get_functiondef(r.oid);
    nd := regexp_replace(d, '\mlimit\s+p_limit\M', 'LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 50)', 'gi');
    IF nd <> d THEN EXECUTE nd; END IF;
  END LOOP;
END
$do$;

-- ─── 13. Storage: ownership-bound uploads, size + mime limits ────────────────
-- Remove every permissive legacy INSERT policy, then add one strict policy per bucket.
DO $do$
DECLARE pol text;
BEGIN
  FOREACH pol IN ARRAY ARRAY[
    'Allow authenticated upload for verifications', 'Allow authenticated uploads to message-media',
    'Authenticated upload chat images', 'Authenticated users can upload verification docs',
    'Users can upload market images', 'Users can upload post media', 'Users can upload reel thumbnails',
    'Users can upload their own avatar', 'Users can upload videos',
    'ad_media_auth_insert', 'avatars_auth_insert', 'market_images_auth_insert', 'message_media_auth_insert',
    'post_media_auth_insert', 'reel_thumbnails_auth_insert', 'verifications_auth_insert', 'videos_auth_insert'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol);
  END LOOP;
END
$do$;

-- <uid>/<file> convention (posts, stories, reels, market, messages, avatars, chat images)
DO $do$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['avatars', 'post-media', 'videos', 'market-images', 'message-media', 'reel-thumbnails', 'chat-images'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', replace(b, '-', '_') || '_owner_insert');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)',
      replace(b, '-', '_') || '_owner_insert', b);
  END LOOP;
END
$do$;

-- ad-media: ads/<uid>/<file>
DROP POLICY IF EXISTS "ad_media_owner_insert" ON storage.objects;
CREATE POLICY "ad_media_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media'
              AND (storage.foldername(name))[1] = 'ads'
              AND (storage.foldername(name))[2] = auth.uid()::text);

-- verifications: client uploads flat names "<uid>_<ts>_<rand>.<ext>" (also accept <uid>/...)
DROP POLICY IF EXISTS "verifications_owner_insert" ON storage.objects;
CREATE POLICY "verifications_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verifications'
              AND ((storage.foldername(name))[1] = auth.uid()::text OR starts_with(name, auth.uid()::text || '_')));

-- Verification documents (IDs) must NEVER be publicly readable: owner or admin only.
DROP POLICY IF EXISTS "Allow public read access for verifications" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view verification docs" ON storage.objects;
DROP POLICY IF EXISTS "verifications_admin_read" ON storage.objects;
CREATE POLICY "verifications_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verifications'
         AND (public.is_admin_user()
              OR (storage.foldername(name))[1] = auth.uid()::text
              OR starts_with(name, auth.uid()::text || '_')));

-- Size + MIME limits. message-media stays PUBLIC: the client stores getPublicUrl() links in messages.
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif']
  WHERE id IN ('avatars', 'market-images', 'reel-thumbnails');
UPDATE storage.buckets SET file_size_limit = 104857600,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif',
                             'video/mp4','video/quicktime','video/mov','video/webm','video/x-m4v','video/3gpp']
  WHERE id IN ('post-media', 'ad-media');
UPDATE storage.buckets SET file_size_limit = 104857600,
  allowed_mime_types = ARRAY['video/mp4','video/quicktime','video/mov','video/webm','video/x-m4v','video/3gpp']
  WHERE id = 'videos';
UPDATE storage.buckets SET file_size_limit = 26214400,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif',
                             'audio/m4a','audio/x-m4a','audio/mp4','audio/aac','audio/mpeg','audio/mp3','audio/wav',
                             'audio/x-wav','audio/webm','audio/ogg','audio/3gpp','audio/amr','audio/x-caf']
  WHERE id = 'message-media';
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif','application/pdf']
  WHERE id = 'verifications';

-- ─── 14. One-time payment-effect claims (paystack-verify / paystack-webhook) ─
CREATE OR REPLACE FUNCTION public.claim_payment_effect(p_reference text, p_flag text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.payments
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(p_flag, true)
  WHERE reference = p_reference
    AND COALESCE(metadata ->> p_flag, 'false') <> 'true';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_payment_effect(p_reference text, p_flag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.payments SET metadata = COALESCE(metadata, '{}'::jsonb) - p_flag WHERE reference = p_reference;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_payment_effect(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_payment_effect(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_effect(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_payment_effect(text, text) TO service_role;
