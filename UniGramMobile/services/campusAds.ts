import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import * as WebBrowser from 'expo-web-browser';

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
  const { data, error } = await supabase
    .from('campus_ads')
    .insert({ ...ad, user_id: user.id })
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
  const path = `ads/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  return uploadFile('ad-media', path, localUri, mimeType);
}

export async function initAdPayment(
  campaignId: string,
  budgetGhs: number,
  durationDays: number,
): Promise<{ authorization_url: string; reference: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Account email required for payment');
  return callEdgeFunction('paystack-init', {
    amount_ghs: budgetGhs,
    email: user.email,
    product_type: 'ad_payment',
    product_id: campaignId,
    metadata: { duration_days: durationDays },
  }) as Promise<{ authorization_url: string; reference: string }>;
}

export async function openAdCheckout(
  authorizationUrl: string,
  reference: string,
): Promise<boolean> {
  await WebBrowser.openAuthSessionAsync(authorizationUrl, 'unigram://payment-callback');
  try {
    const data = await callEdgeFunction('paystack-verify', { reference });
    return data.status === 'success';
  } catch {
    return false;
  }
}

/** How often to inject an ad (every N items). Higher budget → more frequent. */
export function adFrequencyInterval(budget: number): number {
  if (budget >= 250) return 3;
  if (budget >= 120) return 4;
  if (budget >= 60)  return 5;
  return 8;
}

/** Generic placement query used by feed, reels, market, stories, explore. */
export async function getActiveAdsForPlacement(
  placement: string,
  university: string | null,
  userId: string,
): Promise<any[]> {
  const { data } = await supabase
    .from('campus_ads')
    .select('*, profiles:user_id(id, username, full_name, avatar_url)')
    .contains('placements', [placement])
    .order('created_at', { ascending: false })
    .limit(15);

  if (!data) return [];

  return (data as any[])
    .map(a => {
      if (a.status === 'active') return a;
      if (a.user_id === userId) return { ...a, _isPreview: true };
      return null;
    })
    .filter((a): a is any => {
      if (!a) return false;
      if (a.university && university && a.university !== university) return false;
      return true;
    });
}

export async function getActiveFeedAds(university: string | null, userId: string): Promise<any[]> {
  return getActiveAdsForPlacement('feed', university, userId);
}

export async function recordCampusAdImpression(adId: string): Promise<void> {
  await supabase.rpc('record_campus_ad_impression', { p_ad_id: adId });
}

export async function recordCampusAdClick(adId: string): Promise<void> {
  await supabase.rpc('record_campus_ad_click', { p_ad_id: adId });
}
