import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import { randomId } from '../lib/uuid';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { Cache, TTL } from '../lib/cache';

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

async function callEdgeFunction(name: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? 'Request failed');
  return json;
}

export async function getCampaigns(): Promise<CampusAd[]> {
  const { data, error } = await supabase
    .from('campus_ads')
    .select('*')
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

  // Derive cost per impression and click from bid fields if bid_amount is provided
  if (ad.bid_amount !== undefined && ad.bid_amount !== null && ad.bid_amount > 0) {
    if (ad.bid_type === 'CPM') {
      payload.cost_per_impression_pesewas = ad.bid_amount;
      // For CPM, we typically don't charge per click; set to 0 to avoid double charging
      payload.cost_per_click_pesewas = 0;
    } else if (ad.bid_type === 'CPC') {
      payload.cost_per_click_pesewas = ad.bid_amount;
      // For CPC, we typically don't charge per impression; set to 0
      payload.cost_per_impression_pesewas = 0;
    } else if (ad.bid_type === 'CPA') {
      // For CPA, we charge per conversion, not per impression or click
      payload.cost_per_impression_pesewas = 0;
      payload.cost_per_click_pesewas = 0;
    }
    // Note: If the ad already had explicit cost_per_* fields, they are overridden by bid-derived values.
    // This ensures the charging logic uses the bid-based costs.
  }
  // If bid_amount is not provided or zero, we keep the existing cost_per_* fields (they may be undefined,
  // but the database has default values from migrations).

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

    const settle = async () => {
      if (settled) return;
      settled = true;
      sub.remove();
      try {
        const data = await callEdgeFunction('paystack-verify', { reference });
        resolve(data.status === 'success');
      } catch {
        resolve(false);
      }
    };

    const sub = AppState.addEventListener('change', (nextState) => {
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

/** How long a forced reel ad plays before auto-advance (seconds). For video ads
 *  the actual clip duration takes precedence — this is the cap / fallback. */
export const FORCED_REEL_AD_SECONDS = 12;

/** Generic placement query used by feed, reels, market, stories, explore. */
export async function getActiveAdsForPlacement(
  placement: string,
  university: string | null,
  userId: string,
): Promise<any[]> {
  // Previews and eligibility are viewer-specific; do not share their cache.
  const cacheKey = `ads:placement:${placement}:uni:${university ?? 'none'}:viewer:${userId}`;
  return await Cache.getOrFetch<any[]>(cacheKey, TTL.explore, async () => {
    // NOTE: campus_ads.user_id references auth.users(id), NOT public.profiles(id),
    // so the PostgREST relationship embed `profiles:user_id(...)` can't be inferred
    // and the join silently errors out. We fetch the ads and the advertiser
    // profiles in two steps and stitch them together client-side.
    const now = new Date();
    const nowISO = now.toISOString();
    // Fetch only active, in-window campaigns and prefer higher-priority / higher-budget
    // Increase limit to get more candidates for auction
    const [{ data: activeAds, error: activeErr }, { data: previewAds }] = await Promise.all([
      supabase
        .from('campus_ads')
        .select('*')
        .eq('status', 'active')
        .lte('start_date', nowISO)
        .or('end_date.is.null,end_date.gt.' + nowISO)
        .order('priority', { ascending: false })
        .order('budget', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      // Allow the campaign owner to see preview_live campaigns (preview mode)
      supabase
        .from('campus_ads')
        .select('*')
        .eq('preview_live', true)
        .eq('user_id', userId)
        .limit(10),
    ]);

    if (activeErr) {
      console.warn('[campusAds] getActiveAdsForPlacement select failed:', activeErr.message);
      return [];
    }
    const ads = (activeAds ?? []) as CampusAd[];
    const previews = (previewAds ?? []) as CampusAd[];
    if (ads.length === 0 && previews.length === 0) return [];

    // Owners can inspect explicit previews, but paid delivery never targets them.
    const allAds = [...previews, ...ads.filter(a => a.user_id !== userId)];
    const ownerIds = Array.from(new Set(allAds.map(a => a.user_id).filter(Boolean)));
    let profileMap = new Map<string, any>();
    if (ownerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, age, gender')
        .in('id', ownerIds);
      if (profs) profileMap = new Map(profs.map((p: any) => [p.id, p]));
    }

    // Merge previews first (they are intentionally shown to the owner),
    // then active ads. Deduplicate to avoid the owner seeing their own ad twice
    // in both preview and active states.
    const combined: any[] = [];
    const seenIds = new Set<string>();

    for (const p of previews) {
      if (!seenIds.has(p.id)) {
        combined.push({ ...p, _isPreview: true, profiles: profileMap.get(p.user_id) });
        seenIds.add(p.id);
      }
    }
    for (const a of ads) {
      if (!seenIds.has(a.id)) {
        combined.push({ ...a, _isPreview: false, profiles: profileMap.get(a.user_id) });
        seenIds.add(a.id);
      }
    }

    // Filter by targeting and compute auction score
    const scoredAds = combined
      .filter((ad): ad is any => {
        if (!ad) return false;
        // Placement filtering: if placements configured, ad must include this placement
        if (placement && Array.isArray(ad.placements) && ad.placements.length > 0
            && !ad.placements.includes(placement)) return false;
        // University targeting: skip ads targeted to other campuses
        if (ad.university && ad.university !== university) return false;
        // TODO: Implement additional targeting (age, gender, etc.) using profileMap
        // For now, we skip advanced targeting to keep the MVP simple.
        return true;
      })
      .map(ad => {
        const score = computeAuctionScore(ad, profileMap.get(ad.user_id ?? ''), now, placement);
        return { ad, score };
      })
      .filter(item => item.score >= 0) // filter out any invalid scores (though we don't produce negative)
      .sort((a, b) => b.score - a.score) // descending by score
      .map(item => item.ad);

    return scoredAds;
  });
}

// Helper function to compute auction score for an ad
function computeAuctionScore(ad: CampusAd, userProfile: any | null, now: number, placement: string): number {
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
  const time = date.toTimeString().substr(0, 5); // "HH:MM"
  for (const slot of daySlots) {
    if (typeof slot === 'object' && slot.start && slot.end) {
      if (time >= slot.start && time <= slot.end) {
        return true;
      }
    }
  }
  return false;
}
      .order('created_at', { ascending: false })
      .limit(30),
    // Allow the campaign owner to see preview_live campaigns (preview mode)
    supabase
      .from('campus_ads')
      .select('*')
      .eq('preview_live', true)
      .eq('user_id', userId)
      .limit(10),
  ]);

  const error = activeErr;

  if (error) {
    console.warn('[campusAds] getActiveAdsForPlacement select failed:', error.message);
    return [];
  }
  const ads = (activeAds ?? []) as any[];
  const previews = (previewAds ?? []) as any[];
  if (ads.length === 0 && previews.length === 0) return [];

  // Owners can inspect explicit previews, but paid delivery never targets them.
  const allAds = [...previews, ...ads.filter(a => a.user_id !== userId)];
  const ownerIds = Array.from(new Set(allAds.map(a => a.user_id).filter(Boolean)));
  let profileMap = new Map<string, any>();
  if (ownerIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', ownerIds);
    if (profs) profileMap = new Map(profs.map((p: any) => [p.id, p]));
  }

  // Merge previews first (they are intentionally shown to the owner),
  // then active ads. Deduplicate to avoid the owner seeing their own ad twice
  // in both preview and active states.
  const combined: any[] = [];
  const seenIds = new Set<string>();

  for (const p of previews) {
    if (!seenIds.has(p.id)) {
      combined.push({ ...p, _isPreview: true, profiles: profileMap.get(p.user_id) });
      seenIds.add(p.id);
    }
  }
  for (const a of ads) {
    if (!seenIds.has(a.id)) {
      combined.push({ ...a, _isPreview: false, profiles: profileMap.get(a.user_id) });
      seenIds.add(a.id);
    }
  }

    return combined
    .filter((a): a is any => {
      if (!a) return false;
      // placement filtering: if placements configured, ad must include this placement
      if (placement && Array.isArray(a.placements) && a.placements.length > 0
          && !a.placements.includes(placement)) return false;
      // university targeting: skip ads targeted to other campuses
      if (a.university && a.university !== university) return false;
      return true;
    })
    // final client-side sort based on explicit priority + budget to control reach
    .sort((x, y) => {
      const px = Number(x.priority ?? 0);
      const py = Number(y.priority ?? 0);
      if (px !== py) return py - px;
      const bx = Number(x.budget ?? 0);
      const by = Number(y.budget ?? 0);
      if (bx !== by) return by - bx;
      // Randomize among equal priority/budget to ensure variety
      return Math.random() - 0.5;
    });
  }) ?? [];
}

export async function getActiveFeedAds(university: string | null, userId: string): Promise<any[]> {
  return getActiveAdsForPlacement('feed', university, userId);
}

export async function pauseCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').update({ status: 'paused' }).eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function resumeCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').delete().eq('id', id);
  if (error) throw error;
  try { Cache.invalidatePattern('ads:'); } catch (e) {}
}

export async function recordCampusAdImpression(adId: string, placement?: string): Promise<void> {
  if (placement) {
    const { error } = await supabase.rpc('record_campus_ad_delivery', { p_ad_id: adId, p_placement: placement });
    // Compatibility for installations that have not yet applied migration 053.
    if (!error) return;
    if (error.code !== '42883') throw error;
  }
  await supabase.rpc('record_campus_ad_impression', { p_ad_id: adId });
}

export async function recordCampusAdClick(adId: string, placement?: string): Promise<void> {
  if (placement) {
    const { error } = await supabase.rpc('record_campus_ad_click_event', { p_ad_id: adId, p_placement: placement });
    if (!error) return;
    if (error.code !== '42883') throw error;
  }
  await supabase.rpc('record_campus_ad_click', { p_ad_id: adId });
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
): Promise<number> {
  const { data, error } = await supabase.rpc('consume_ad_credit', {
    p_campaign_id: campaignId,
    p_max_pesewas: maxPesewas,
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
    .select(`*, profiles!campus_ad_comments_user_id_fkey(*)`, { count: 'exact' })
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
  const { data, error } = await supabase
    .from('campus_ad_comments')
    .insert({ ad_id: adId, user_id: userId, content })
    .select(`*, profiles!campus_ad_comments_user_id_fkey(*)`)
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
