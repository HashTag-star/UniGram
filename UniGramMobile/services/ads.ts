import { supabase } from '../lib/supabase';

export interface SponsoredPost {
  id: string;
  business_name: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string;
  cta_url: string | null;
  university: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  impressions: number;
  clicks: number;
  created_at: string;
}

export async function getActiveAds(university?: string | null): Promise<SponsoredPost[]> {
  let q = supabase
    .from('sponsored_posts')
    .select('id, business_name, title, body, image_url, cta_label, cta_url, university, starts_at, ends_at, impressions, clicks, created_at')
    .eq('is_active', true)
    .lte('starts_at', new Date().toISOString())
    .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString());

  if (university) {
    q = q.or(`university.is.null,university.eq.${university}`);
  }

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) {
    console.error('[ads] getActiveAds error', error);
    return [];
  }
  return (data ?? []) as SponsoredPost[];
}

export async function getAllAds(): Promise<SponsoredPost[]> {
  const { data, error } = await supabase
    .from('sponsored_posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SponsoredPost[];
}

export async function recordImpression(adId: string): Promise<void> {
  await supabase.rpc('record_ad_impression', { p_ad_id: adId });
}

export async function recordClick(adId: string): Promise<void> {
  await supabase.rpc('record_ad_click', { p_ad_id: adId });
}

export async function createAd(data: {
  business_name: string;
  title: string;
  body?: string;
  image_url?: string;
  cta_label?: string;
  cta_url?: string;
  university?: string;
  starts_at?: string;
  ends_at?: string;
}): Promise<SponsoredPost> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: row, error } = await supabase
    .from('sponsored_posts')
    .insert({ ...data, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return row as SponsoredPost;
}

export async function updateAd(id: string, updates: Partial<{
  business_name: string;
  title: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  university: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}>): Promise<void> {
  const { error } = await supabase
    .from('sponsored_posts')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function toggleAd(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('sponsored_posts')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAd(id: string): Promise<void> {
  const { error } = await supabase
    .from('sponsored_posts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
