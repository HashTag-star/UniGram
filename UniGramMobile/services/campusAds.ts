import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import { randomId } from '../lib/uuid';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { Cache, TTL } from '../lib/cache';
import { callEdgeFunction, verifyPaymentWithPolling } from '../lib/edgeFetch';

export interface CampusAd {
  id: string;
  user_id: string;
  name: string;
  objective: string;
  format: string;
  placements: string[];
  headline: string;
  body: string | null;
  cta: string;
  link: string | null;
  media_url: string | null;
  cards: { title: string; price: string; link: string; image_url?: string }[] | null;
  status: 'active' | 'paused' | 'ended' | 'pending' | 'rejected';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  payment_ref: string | null;
  university: string | null;
  /** Multi-campus targeting (migration 061). */
  target_all_campuses?: boolean;
  target_universities?: string[] | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  // Plan / priority fields (migration 038)
  priority?: number;            // higher = wins slot first; 0–3 based on tier
  reach_multiplier?: number;    // budget × this → effective spend for frequency calc
  preview_live?: boolean;       // owner opt-in preview mode
  // Spend metering + WhatsApp + cost rules (migration 040)
  spent_pesewas?: number;
  cost_per_impression_pesewas?: number;
  cost_per_click_pesewas?: number;
  whatsapp_number?: string | null;
  // Bidding and targeting (migration 054)
  bid_amount?: number;          // bid in pesewas (or micros if changed)
  bid_type?: 'CPM' | 'CPC' | 'CPA';
  bid_strategy?: 'LOWEST_COST' | 'COST_CAP' | 'BID_CAP' | 'TARGET_COST';
  estimated_action_rate?: number; // estimated CTR for CPC, CVR for CPA, or base rate for CPM
  age_min?: number;
  age_max?: number;
  gender?: 'all' | 'male' | 'female' | 'non_binary';
  detailed_targeting?: any;     // JSONB object for interests, behaviors, etc.
  custom_audience_ids?: string[];
  lookalike_audience_id?: string | null;
  excluded_custom_audience_ids?: string[];
  // Relevance and quality score
  relevance_score?: number;     // 1-10, updated via feedback
  // Delivery and pacing controls
  delivery_type?: 'STANDARD' | 'ACCELERATED';
  ad_schedule?: any;            // JSONB schedule for dayparting
  // Engagement fields (from later migrations)
  likes_count?: number;
  comments_count?: number;
}

/** Map a Paystack budget tier to a plan-priority bucket. Higher-paying ads
 *  win the slot first when multiple ads compete, and their effective spend
 *  is boosted by reach_multiplier so they appear at a tighter cadence. */
export function planFromBudget(budget: number): { priority: number; reach_multiplier: number } {
  if (budget >= 250) return { priority: 3, reach_multiplier: 1.5 }; // Max Reach
  if (budget >= 120) return { priority: 2, reach_multiplier: 1.2 }; // Boosted
  if (budget >= 60)  return { priority: 1, reach_multiplier: 1.0 }; // Standard
  return { priority: 0, reach_multiplier: 1.0 };                    // Starter
}

export async function getCampaigns(): Promise<CampusAd[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  // RLS also exposes OTHER people's live ads for serving — always scope to the owner here,
  // otherwise every account sees (and shares) the same campaigns.
  const { data, error } = await supabase
    .from('campus_ads')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampusAd[];
}

export async function createCampaignDraft(
  ad: Omit<CampusAd, 'id' | 'user_id' | 'spent' | 'impressions' | 'clicks' | 'payment_ref' | 'created_at'>,
): Promise<CampusAd> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  // Auto-activate on creation so ads go live immediately for the creator's
  // audience — caller can still pass an explicit status if they want to keep
  // the old draft-then-pay flow. Start/end default to "now → 30 days" so the
  // active_readable RLS policy (which checks the date window) lets the row
  // through for other viewers.
  const now = new Date();
  const defaultEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const payload: any = {
    ...ad,
    user_id: user.id,
    status:     ad.status     ?? 'active',
    start_date: ad.start_date ?? now.toISOString(),
    end_date:   ad.end_date   ?? defaultEnd.toISOString(),
  };

  // bid_amount is in pesewas: CPM = per 1000 impressions, CPC = per click.
  // The database enforces floor prices (ad_pricing) and does the real billing.
  if (ad.bid_amount && ad.bid_amount > 0) {
    if (ad.bid_type === 'CPC') payload.cost_per_click_pesewas = ad.bid_amount;
    else payload.cpm_pesewas = ad.bid_amount;
  }

  const { data, error } = await supabase
    .from('campus_ads')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as CampusAd;
}

export async function setPaymentRef(id: string, ref: string): Promise<void> {
  const { error } = await supabase
    .from('campus_ads')
    .update({ payment_ref: ref })
    .eq('id', id);
  if (error) throw error;
}

export async function uploadAdMedia(localUri: string, mimeType?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const ext = localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `ads/${user.id}/${Date.now()}_${randomId(8)}.${ext}`;
  return uploadFile('ad-media', path, localUri, mimeType);
}

export async function initAdPayment(
  campaignId: string,
  budgetGhs: number,
  durationDays: number,
): Promise<{ authorization_url: string; reference: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Account email required for payment');
  const callbackUrl = Linking.createURL('payment-callback');
  return callEdgeFunction('paystack-init', {
    amount_ghs: budgetGhs,
    email: user.email,
    product_type: 'ad_payment',
    product_id: campaignId,
    callback_url: callbackUrl,
    metadata: { duration_days: durationDays },
  }) as Promise<{ authorization_url: string; reference: string }>;
}

export async function openAdCheckout(
  authorizationUrl: string,
  reference: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let wentBackground = false;
    let settled = false;
    let sub: { remove: () => void } | null = null;
    // If the user never comes back to the app, don't leak the AppState listener forever.
    const giveUp = setTimeout(() => { settle(); }, 10 * 60 * 1000);

    const settle = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      try { sub?.remove(); } catch {}
      try {
        // Webhook may lag behind the redirect — poll verify for up to ~20s.
        const data = await verifyPaymentWithPolling<{ status: string }>(reference);
        resolve(data?.status === 'success');
      } catch {
        resolve(false);
      }
    };

    sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        wentBackground = true;
      } else if (nextState === 'active' && wentBackground) {
        settle();
      }
    });

    Linking.openURL(authorizationUrl).catch(() => settle());
  });
}

/** How often to inject an ad (every N items). Higher budget → more frequent.
 *  Tuned to roughly match Instagram / X cadence (~1 ad per 7–12 organic items)
 *  rather than the previous aggressive 1-in-5 default that made the feed feel
 *  spammy. The injection sites also use a session-seeded offset (see FeedScreen)
 *  so the same slots aren't picked every cold start. */
export function adFrequencyInterval(budget: number, reachMultiplier: number = 1): number {
  const effective = budget * (reachMultiplier || 1);
  if (effective >= 250) return 7;
  if (effective >= 120) return 9;
  if (effective >= 60)  return 11;
  return 14;
}

/** Deterministic per-ad rule for whether the user must watch the whole reel ad
 *  before swiping (IG-style "forced view"). Roughly 1 in 3 ads are forced;
 *  uses a stable hash of the ad id so the same ad always falls in the same
 *  bucket for the same viewer.
 *  An explicit `ad.skippable === false` flag always wins. */
export function isReelAdUnskippable(ad: any): boolean {
  if (!ad) return false;
  if (ad.skippable === false) return true;
  if (ad.skippable === true)  return false;
  const id: string = String(ad.id ?? '');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 3 === 0; // ~33% unskippable
}

/**
 * The three mid-roll styles a reel ad can have:
 *   'skippable' - "Skip in 5s" then Skip Ad; ends by itself at 15s
 *   'timed'     - plays a fixed 15s, no skip ("Reel continues in Ns")
 *   'full'      - plays the whole ad, no skip ("Your reel will continue after this ad")
 * An explicit `ad.skippable` flag wins; otherwise the style is a stable bucket of the
 * ad id so the same ad always behaves the same for every viewer.
 */
export type ReelAdKind = 'skippable' | 'timed' | 'full';
export function getReelAdKind(ad: any): ReelAdKind {
  if (!ad) return 'skippable';
  if (ad.skippable === true) return 'skippable';
  if (ad.skippable === false) return 'full';
  const id: string = String(ad.id ?? '');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const b = Math.abs(h) % 3;
  return b === 0 ? 'timed' : b === 1 ? 'full' : 'skippable';
}

/** How long a forced reel ad plays before auto-advance (seconds). For video ads
 *  the actual clip duration takes precedence — this is the cap / fallback. */
export const FORCED_REEL_AD_SECONDS = 12;

/**
 * Is this viewer's campus inside the ad's audience?
 *   - target_all_campuses            -> everyone
 *   - target_universities = [...]    -> only students at those campuses
 *   - neither (legacy campaigns)     -> the advertiser's own campus (null = everyone)
 */
export function isInAudience(ad: any, viewerUniversity: string | null): boolean {
  if (ad.target_all_campuses) return true;
  const list: string[] = Array.isArray(ad.target_universities) ? ad.target_universities : [];
  if (list.length > 0) return !!viewerUniversity && list.includes(viewerUniversity);
  return !ad.university || ad.university === viewerUniversity;
}

// Columns the UI + auction (computeAuctionScore / pacing / schedule / targeting) actually read.
// Deliberately excludes payment_ref, audiences, lookalikes etc. — the list is shared by every
// placement and must not ship advertiser internals to every viewer.
const AD_SERVE_COLUMNS =
  'id, user_id, name, objective, format, placements, headline, body, cta, link, media_url, cards, status, ' +
  'budget, spent, spent_pesewas, start_date, end_date, created_at, university, target_all_campuses, target_universities, ' +
  'priority, reach_multiplier, preview_live, whatsapp_number, likes_count, comments_count, ' +
  'bid_amount, bid_type, estimated_action_rate, relevance_score, delivery_type, ad_schedule, skippable';

const RAW_ADS_TTL = 2 * 60 * 1000;

/**
 * Fetches the active-ad pool ONCE per viewer and shares it across every placement
 * (feed / reels / stories / market / explore used to run 5 identical 100-row queries).
 * Throws on failure so a failed query is never cached as "no ads".
 */
async function getRawAdPool(userId: string): Promise<{ ads: CampusAd[]; previews: CampusAd[]; profileMap: Map<string, any> }> {
  const key = `ads:raw:${userId}`;
  const pool = await Cache.getOrFetch<{ ads: CampusAd[]; previews: CampusAd[]; profiles: [string, any][] }>(key, RAW_ADS_TTL, async () => {
    const nowISO = new Date().toISOString();
    const run = (cols: string) => Promise.all([
      supabase
        .from('campus_ads')
        .select(cols)
        .eq('status', 'active')
        .lte('start_date', nowISO)
        .or('end_date.is.null,end_date.gt.' + nowISO)
        .order('priority', { ascending: false })
        .order('budget', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60),
      // Allow the campaign owner to see preview_live campaigns (preview mode)
      supabase
        .from('campus_ads')
        .select(cols)
        .eq('preview_live', true)
        .eq('user_id', userId)
        .limit(10),
    ]);
    let [activeRes, previewRes] = await run(AD_SERVE_COLUMNS);
    // A column in the list may not exist on an older schema — fall back to the old '*'.
    if (activeRes.error) [activeRes, previewRes] = await run('*');
    if (activeRes.error) throw activeRes.error;

    const ads = ((activeRes.data ?? []) as unknown as CampusAd[]);
    const previews = ((previewRes.data ?? []) as unknown as CampusAd[]);

    // campus_ads.user_id references auth.users(id), NOT public.profiles(id), so the
    // PostgREST embed can't be inferred — fetch advertiser profiles separately.
    const ownerIds = Array.from(new Set([...previews, ...ads.filter(a => a.user_id !== userId)].map(a => a.user_id).filter(Boolean)));
    let profiles: [string, any][] = [];
    if (ownerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', ownerIds);
      if (profs) profiles = profs.map((p: any) => [p.id, p]);
    }
    return { ads, previews, profiles };
  });
  return { ads: pool?.ads ?? [], previews: pool?.previews ?? [], profileMap: new Map(pool?.profiles ?? []) };
}

/** Generic placement query used by feed, reels, market, stories, explore. */
export async function getActiveAdsForPlacement(
  placement: string,
  university: string | null,
  userId: string,
): Promise<any[]> {
  let pool;
  try {
    pool = await getRawAdPool(userId);
  } catch (e: any) {
    // Failure is NOT cached anywhere (the pool fetcher threw) — next call retries.
    console.warn('[campusAds] getActiveAdsForPlacement failed:', e?.message);
    return [];
  }
  const { ads, previews, profileMap } = pool;
  if (ads.length === 0 && previews.length === 0) return [];
  const now = Date.now();

  // Owners can inspect explicit previews, but paid delivery never targets them.
  const combined: any[] = [];
  const seenIds = new Set<string>();
  for (const p of previews) {
    if (!seenIds.has(p.id)) {
      combined.push({ ...p, _isPreview: true, profiles: profileMap.get(p.user_id) });
      seenIds.add(p.id);
    }
  }
  for (const a of ads) {
    if (a.user_id === userId) continue;
    if (!seenIds.has(a.id)) {
      combined.push({ ...a, _isPreview: false, profiles: profileMap.get(a.user_id) });
      seenIds.add(a.id);
    }
  }

  return combined
    .filter((ad): ad is any => {
      if (!ad) return false;
      // Placement filtering: if placements configured, ad must include this placement
      if (placement && Array.isArray(ad.placements) && ad.placements.length > 0
          && !ad.placements.includes(placement)) return false;
      // University targeting: skip ads targeted to other campuses
      if (!isInAudience(ad, university)) return false;
      return true;
    })
    .map(ad => ({ ad, score: computeAuctionScore(ad, now) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.ad);
}

// Helper function to compute auction score for an ad
function computeAuctionScore(ad: CampusAd, now: number): number {
  // If ad is not active, return -1 (should not happen as we filter active ads earlier)
  if (ad.status !== 'active') return -1;

  // Fetch targeting fields from ad (with defaults)
  const bidAmount = ad.bid_amount ?? 0;
  const bidType = ad.bid_type ?? 'CPM';
  const estimatedActionRate = ad.estimated_action_rate ?? 0.01; // default 1%
  const relevanceScore = ad.relevance_score ?? 5.0; // default 5 (neutral)

  // Compute base bid per impression in pesewas
  let bidPerImpression = 0;
  if (bidType === 'CPM') {
    bidPerImpression = bidAmount / 1000.0; // pesewas per impression
  } else if (bidType === 'CPC') {
    bidPerImpression = bidAmount * estimatedActionRate; // pesewas per impression (expected clicks per impression * bid per click)
  } else if (bidType === 'CPA') {
    bidPerImpression = bidAmount * estimatedActionRate; // pesewas per impression (expected conversions per impression * bid per conversion)
  } else {
    // Fallback to CPM interpretation
    bidPerImpression = bidAmount / 1000.0;
  }

  // Apply relevance score as a quality multiplier (1.0 = average)
  const relevanceFactor = Math.max(0.1, Math.min(2.0, relevanceScore / 5.0)); // clamp to avoid extreme values
  let score = bidPerImpression * relevanceFactor;

  // Apply pacing multiplier based on delivery type and schedule
  const pacingMultiplier = computePacingMultiplier(ad, now);
  score *= pacingMultiplier;

  // Apply schedule filter: if ad has a schedule, check if now is within allowed time
  if (!isWithinSchedule(ad, now)) {
    return -1; // outside schedule, treat as ineligible
  }

  // Ensure score is non-negative
  return Math.max(0, score);
}

// Helper to compute pacing multiplier (0.5 to 2.0)
function computePacingMultiplier(ad: CampusAd, now: number): number {
  // If no start/end date, assume even pacing
  if (!ad.start_date || !ad.end_date) return 1.0;
  const start = new Date(ad.start_date).getTime();
  const end = new Date(ad.end_date).getTime();
  if (isNaN(start) || isNaN(end)) return 1.0;
  const totalDuration = end - start;
  if (totalDuration <= 0) return 1.0;
  const elapsed = now - start;
  // Clamp elapsed to [0, totalDuration]
  const elapsedClamped = Math.max(0, Math.min(elapsed, totalDuration));
  const expectedSpendRatio = elapsedClamped / totalDuration; // 0 to 1
  const budgetPesewas = (ad.budget ?? 0) * 100; // convert GHS to pesewas
  const spentPesewas = ad.spent_pesewas ?? (ad.spent ?? 0) * 100;
  const expectedSpendByNow = expectedSpendRatio * budgetPesewas;
  if (expectedSpendByNow === 0) return 1.0; // avoid division by zero
  // Simple proportional controller: if spent < expected, increase pace (>1); if spent > expected, decrease pace (<1)
  // We use a formula that yields 1.0 when spent == expected, and scales linearly.
  // To avoid extreme values, we clamp between 0.5 and 2.0.
  let pace = expectedSpendByNow / Math.max(spentPesewas, 0.1); // avoid division by zero
  pace = Math.max(0.5, Math.min(2.0, pace));
  return pace;
}

// Helper to check if current time falls within ad's schedule
function isWithinSchedule(ad: CampusAd, now: number): boolean {
  const schedule = ad.ad_schedule;
  if (!schedule || typeof schedule !== 'object' || Object.keys(schedule).length === 0) {
    return true; // no schedule restriction
  }
  const date = new Date(now);
  const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayMap[dayIndex];
  const daySlots = schedule[dayKey];
  if (!Array.isArray(daySlots) || daySlots.length === 0) {
    return false; // no slots for this day
  }
  const time = date.toTimeString().slice(0, 5); // "HH:MM"
  for (const slot of daySlots) {
    if (typeof slot === 'object' && slot.start && slot.end) {
      if (time >= slot.start && time <= slot.end) {
        return true;
      }
    }
  }
  return false;
}
      
export async function getActiveFeedAds(university: string | null, userId: string): Promise<any[]> {
  return getActiveAdsForPlacement('feed', university, userId);
}

async function assertCampaignOwnership(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: campaign, error } = await supabase
    .from('campus_ads')
    .select('user_id')
    .eq('id', id)
    .single();
  if (error || !campaign) throw new Error('Campaign not found');
  if (campaign.user_id !== user.id) throw new Error('Unauthorized');
}

export async function pauseCampaign(id: string): Promise<void> {
  await assertCampaignOwnership(id);
  const { error } = await supabase.from('campus_ads').update({ status: 'paused' }).eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function resumeCampaign(id: string): Promise<void> {
  await assertCampaignOwnership(id);
  const { error } = await supabase.from('campus_ads').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function deleteCampaign(id: string): Promise<void> {
  await assertCampaignOwnership(id);
  const { error } = await supabase.from('campus_ads').delete().eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function recordCampusAdImpression(adId: string, placement?: string): Promise<void> {
  // Billing RPCs are server-only now; delivery events are the supported client path.
  const { error } = await supabase.rpc('record_campus_ad_delivery', { p_ad_id: adId, p_placement: placement ?? 'feed' });
  if (error) throw error;
}

export async function recordCampusAdClick(adId: string, placement?: string): Promise<void> {
  const { error } = await supabase.rpc('record_campus_ad_click_event', { p_ad_id: adId, p_placement: placement ?? 'feed' });
  if (error) throw error;
}

/** Build a wa.me deep-link from an ad's `whatsapp_number` field. We strip
 *  everything that isn't a digit (wa.me only accepts the raw international
 *  number, no `+`/spaces/dashes) and pre-fill the message with the ad headline
 *  so the chat opens with usable context for the advertiser. Returns null if
 *  the ad doesn't have a WhatsApp number set. */
export function buildWhatsAppCtaUrl(ad: any): string | null {
  const raw = ad?.whatsapp_number;
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length < 7) return null; // sanity check
  const prefill = ad.headline
    ? encodeURIComponent(`Hi! I saw your "${ad.headline}" on UniGram.`)
    : encodeURIComponent("Hi! I saw your ad on UniGram.");
  return `https://wa.me/${digits}?text=${prefill}`;
}

/** Current advertiser's accumulated credit balance (in pesewas + GHS for UI). */
export async function getAdCreditBalance(): Promise<{ pesewas: number; ghs: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pesewas: 0, ghs: 0 };
  const { data } = await supabase
    .from('profiles')
    .select('ad_credit_pesewas')
    .eq('id', user.id)
    .single();
  const p = (data as any)?.ad_credit_pesewas ?? 0;
  return { pesewas: p, ghs: p / 100 };
}

/** Audit trail of credit movements for the current user. */
export async function getAdCreditLedger(limit = 25): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('ad_credit_ledger')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Burn down the user's ad credit against an unpaid campaign. Returns the
 *  pesewa amount consumed so the caller can subtract it from the Paystack
 *  charge (or skip Paystack entirely when the credit covers the whole bill). */
export async function consumeAdCredit(
  campaignId: string,
  maxPesewas: number,
  durationDays: number = 7,
): Promise<number> {
  const { data, error } = await supabase.rpc('consume_ad_credit', {
    p_campaign_id: campaignId,
    p_max_pesewas: maxPesewas,
    p_duration_days: durationDays,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function likeAd(adId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('like_ad', { p_ad_id: adId, p_user_id: userId });
  if (error) throw error;
}

export async function unlikeAd(adId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('unlike_ad', { p_ad_id: adId, p_user_id: userId });
  if (error) throw error;
}

export async function getLikedAdIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('campus_ad_likes')
    .select('ad_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data?.map((r: any) => r.ad_id) ?? [];
}

export const AD_COMMENTS_PAGE_SIZE = 20;

export async function getAdComments(
  adId: string,
  currentUserId?: string,
  page = 0,
): Promise<{ items: any[]; hasMore: boolean; total: number }> {
  const from = page * AD_COMMENTS_PAGE_SIZE;
  const to = from + AD_COMMENTS_PAGE_SIZE;

  const { data, count, error } = await supabase
    .from('campus_ad_comments')
    .select(`*, profiles!campus_ad_comments_user_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`, { count: 'exact' })
    .eq('ad_id', adId)
    .order('created_at', { ascending: true })
    .range(from, to);

  if (error) throw error;

  const hasMore = (data ?? []).length > AD_COMMENTS_PAGE_SIZE;
  const items = (data ?? []).slice(0, AD_COMMENTS_PAGE_SIZE);
  const total = count ?? 0;

  return { items, hasMore, total };
}

export async function addAdComment(
  adId: string,
  userId: string,
  content: string,
): Promise<any> {
  const { cleanUserText } = require('../lib/contentSafety');
  const sanitized = cleanUserText(content, 'comment');
  const { data, error } = await supabase
    .from('campus_ad_comments')
    .insert({ ad_id: adId, user_id: userId, content: sanitized })
    .select(`*, profiles!campus_ad_comments_user_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAdComment(commentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('campus_ad_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId);

  if (error) throw error;
}
