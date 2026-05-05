import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';

export const PRO_PRICE_GHS = 20;
export const PRO_DURATION_DAYS = 30;

export interface PostAnalyticsRow {
  post_id: string;
  caption: string | null;
  media_url: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  views: number;
  reach: number;
}

export interface ProfileAnalytics {
  followers: number;
  following: number;
  profile_views_7d: number;
  profile_views_30d: number;
  profile_views_prev_7d: number;
  profile_views_prev_30d: number;
  total_posts: number;
  total_likes: number;
  total_comments: number;
  likes_30d: number;
  comments_30d: number;
  total_views_30d: number;
  total_views_prev_30d: number;
}

export interface AIInsightsResult {
  insights: string[];
  outlook: 'positive' | 'neutral' | 'needs_work';
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

export function isProActive(profile: { is_pro?: boolean; pro_expires_at?: string | null } | null): boolean {
  if (!profile?.is_pro) return false;
  if (!profile.pro_expires_at) return true;
  return new Date(profile.pro_expires_at).getTime() > Date.now();
}

export async function initProPayment(): Promise<{ authorization_url: string; reference: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Account email required for payment');
  return callEdgeFunction('paystack-init', {
    amount_ghs: PRO_PRICE_GHS,
    email: user.email,
    product_type: 'pro_sub',
  }) as Promise<{ authorization_url: string; reference: string }>;
}

async function verifyPayment(reference: string) {
  return callEdgeFunction('paystack-verify', { reference }) as Promise<{ status: string }>;
}

export async function openProCheckout(): Promise<boolean> {
  const { authorization_url, reference } = await initProPayment();
  await WebBrowser.openAuthSessionAsync(authorization_url, 'unigram://payment-callback');
  try {
    const data = await verifyPayment(reference);
    return data.status === 'success';
  } catch {
    return false;
  }
}

export async function getPostAnalytics(userId: string, days = 30): Promise<PostAnalyticsRow[]> {
  const { data, error } = await supabase.rpc('get_post_analytics', { p_user_id: userId, p_days: days });
  if (error) throw error;
  return (data ?? []) as PostAnalyticsRow[];
}

export async function getProfileAnalytics(userId: string): Promise<ProfileAnalytics> {
  const { data, error } = await supabase.rpc('get_profile_analytics', { p_user_id: userId });
  if (error) throw error;
  return data as ProfileAnalytics;
}

export async function recordProfileViewAnalytics(profileId: string, viewerId: string): Promise<void> {
  if (profileId === viewerId) return;
  try {
    await supabase.rpc('record_profile_view_analytics', {
      p_profile_id: profileId,
      p_viewer_id: viewerId,
    });
  } catch (_) {}
}

export async function getAIInsights(userId: string): Promise<AIInsightsResult> {
  return callEdgeFunction('analytics-insights', {}) as Promise<AIInsightsResult>;
}
