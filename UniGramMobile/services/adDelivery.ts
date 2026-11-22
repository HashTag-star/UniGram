/**
 * Viewer-side ad delivery rules.
 *
 * Campaign-side rules (budget tier, targeting, bids, schedule, pacing) already live
 * in services/campusAds.ts and decide WHICH ads are eligible and how they rank.
 * This module decides HOW MUCH and WHEN a given viewer sees them, based on the
 * viewer's plan:
 *
 *   Free  -> "standard" ad load
 *   Pro   -> "light" ad load (roughly half as many ads, later first ad, longer gaps)
 *
 * It also enforces per-ad daily frequency caps and remembers ads the viewer hid.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export type AdTier = 'standard' | 'light';
export type AdPlacementKey = 'feed' | 'reels';

export interface PlacementPolicy {
  /** Organic items the viewer must see before the first ad of a session. */
  firstAfter: number;
  /** Organic items between ads (scaled per campaign tier, jittered per session). */
  interval: number;
  /** Max ads shown per app session in this placement. */
  sessionCap: number;
  /** Minimum time between two ads (ms) — "timed" pacing. 0 = position-only. */
  minGapMs: number;
  /** How long an ad must be on screen before it counts as an impression (ms). */
  dwellMs: number;
}

export interface AdPolicy {
  tier: AdTier;
  label: string;
  summary: string;
  feed: PlacementPolicy;
  reels: PlacementPolicy;
  /** Max times the same ad can be shown to the same viewer per day. */
  perAdDailyCap: number;
}

const STANDARD: AdPolicy = {
  tier: 'standard',
  label: 'Standard ads',
  summary: 'You see a regular amount of ads between posts and reels.',
  feed: { firstAfter: 4, interval: 8, sessionCap: 10, minGapMs: 0, dwellMs: 1000 },
  reels: { firstAfter: 4, interval: 7, sessionCap: 8, minGapMs: 45_000, dwellMs: 2000 },
  perAdDailyCap: 3,
};

const LIGHT: AdPolicy = {
  tier: 'light',
  label: 'Light ads · Pro',
  summary: 'Pro gives you roughly half as many ads, spaced further apart.',
  feed: { firstAfter: 8, interval: 16, sessionCap: 4, minGapMs: 0, dwellMs: 1000 },
  reels: { firstAfter: 8, interval: 14, sessionCap: 3, minGapMs: 120_000, dwellMs: 2000 },
  perAdDailyCap: 2,
};

export function getAdPolicy(isPro: boolean): AdPolicy {
  return isPro ? LIGHT : STANDARD;
}

/**
 * Campaign tier nudges spacing a little: higher-paying campaigns (smaller campus
 * interval) appear slightly more often, lower tiers slightly less. Clamped so a plan
 * can never override the viewer's own ad-load setting by more than ±30%.
 */
export function scaleIntervalForCampaign(baseInterval: number, campaignInterval: number): number {
  const factor = Math.min(1.3, Math.max(0.7, campaignInterval / 11));
  return Math.max(3, Math.round(baseInterval * factor));
}

// ─── Per-day frequency caps + hidden ads (device-local) ───────────────────────
const FREQ_KEY = 'ug_ad_freq:v1';
const HIDDEN_KEY = 'ug_ad_hidden:v1';

let freq: { day: string; counts: Record<string, number> } | null = null;
let hidden: Set<string> | null = null;
const today = () => new Date().toISOString().slice(0, 10);

async function loadFreq() {
  if (freq && freq.day === today()) return freq;
  try {
    const raw = await AsyncStorage.getItem(FREQ_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    freq = parsed && parsed.day === today() ? parsed : { day: today(), counts: {} };
  } catch { freq = { day: today(), counts: {} }; }
  return freq!;
}

async function loadHidden() {
  if (hidden) return hidden;
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    hidden = new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { hidden = new Set(); }
  return hidden;
}

/**
 * Drops ads the viewer hid, and applies the per-day frequency cap as a SOFT cap:
 * ads under the cap come first (least-shown first); ads already at the cap are only
 * used when nothing else is available. A hard cap would leave small inventories
 * (a handful of campaigns) with no ads at all after a few views.
 */
export async function filterEligibleAds<T extends { id: string }>(ads: T[], policy: AdPolicy): Promise<T[]> {
  if (!ads?.length) return [];
  const [f, h] = await Promise.all([loadFreq(), loadHidden()]);
  const visible = ads.filter(a => !h.has(a.id));
  const shown = (a: T) => f.counts[a.id] ?? 0;
  const byLeastShown = [...visible].sort((a, b) => shown(a) - shown(b));
  const underCap = byLeastShown.filter(a => shown(a) < policy.perAdDailyCap);
  return underCap.length > 0 ? underCap : byLeastShown;
}

/** Call when an ad actually counted as seen (dwell satisfied). */
export async function noteAdShown(adId: string): Promise<void> {
  const f = await loadFreq();
  f.counts[adId] = (f.counts[adId] ?? 0) + 1;
  AsyncStorage.setItem(FREQ_KEY, JSON.stringify(f)).catch(() => {});
}

export async function hideAd(adId: string, feedback: 'hide' | 'report' = 'hide'): Promise<void> {
  const h = await loadHidden();
  h.add(adId);
  AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...h].slice(-300))).catch(() => {});
  // Feeds the advertiser's relevance score (migration 055). Best effort.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('ad_feedback').insert({ ad_id: adId, user_id: user.id, feedback_type: feedback });
  } catch {}
}

export const AD_WHY_TEXT =
  "Advertisers on UniGram can target by campus and schedule. You're seeing this because it's running " +
  'on your campus right now. Your plan controls how many ads you see.';
