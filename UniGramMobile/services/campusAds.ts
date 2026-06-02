import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import { randomId } from '../lib/uuid';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';

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
  status: 'active' | 'paused' | 'ended' | 'pending';
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
  // NOTE: campus_ads.user_id references auth.users(id), NOT public.profiles(id),
  // so the PostgREST relationship embed `profiles:user_id(...)` can't be inferred
  // and the join silently errors out. We fetch the ads and the advertiser
  // profiles in two steps and stitch them together client-side.
  const now = new Date().toISOString();
  // Fetch only active, in-window campaigns and prefer higher-priority / higher-budget
  const [{ data: activeAds, error: activeErr }, { data: previewAds }] = await Promise.all([
    supabase
      .from('campus_ads')
      .select('*')
      .eq('status', 'active')
      .lte('start_date', now)
      .or('end_date.is.null,end_date.gt.' + now)
      .order('priority', { ascending: false })
      .order('budget', { ascending: false })
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

  const allAds = [...previews, ...ads];
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
      if (a.university && university && a.university !== university) return false;
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
}

export async function getActiveFeedAds(university: string | null, userId: string): Promise<any[]> {
  return getActiveAdsForPlacement('feed', university, userId);
}

export async function pauseCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').update({ status: 'paused' }).eq('id', id);
  if (error) throw error;
}

export async function resumeCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('campus_ads').delete().eq('id', id);
  if (error) throw error;
}

export async function recordCampusAdImpression(adId: string): Promise<void> {
  await supabase.rpc('record_campus_ad_impression', { p_ad_id: adId });
}

export async function recordCampusAdClick(adId: string): Promise<void> {
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
