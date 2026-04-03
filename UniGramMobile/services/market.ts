import { supabase } from '../lib/supabase';

export async function getMarketItems(category?: string, search?: string) {
  let query = supabase
    .from('market_items')
    .select(`*, profiles(*)`)
    .eq('is_sold', false)
    .order('created_at', { ascending: false });
  if (category && category !== 'all') query = query.eq('category', category);
  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getMyListings(userId: string) {
  const { data, error } = await supabase
    .from('market_items')
    .select(`*, profiles(*)`)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createMarketItem(sellerId: string, item: {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  imageUri?: string;
  extraImageUris?: string[];
  isNegotiable?: boolean;
}) {
  // Upload primary image
  let image_url: string | undefined;
  if (item.imageUri) {
    const ext = item.imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${sellerId}/${Date.now()}_0.${ext}`;
    const response = await fetch(item.imageUri);
    const blob = await response.blob();
    const { error: upErr } = await supabase.storage
      .from('market-images')
      .upload(path, blob, { contentType: `image/${ext}` });
    if (!upErr) {
      const { data } = supabase.storage.from('market-images').getPublicUrl(path);
      image_url = data.publicUrl;
    }
  }

  // Upload extra images
  const image_urls: string[] = image_url ? [image_url] : [];
  for (let i = 0; i < (item.extraImageUris ?? []).length; i++) {
    const uri = item.extraImageUris![i];
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${sellerId}/${Date.now()}_${i + 1}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: upErr } = await supabase.storage
      .from('market-images')
      .upload(path, blob, { contentType: `image/${ext}` });
    if (!upErr) {
      const { data } = supabase.storage.from('market-images').getPublicUrl(path);
      image_urls.push(data.publicUrl);
    }
  }

  const { data, error } = await supabase
    .from('market_items')
    .insert({
      seller_id: sellerId,
      title: item.title,
      description: item.description,
      price: item.price,
      category: item.category,
      condition: item.condition,
      image_url,
      image_urls,
      is_negotiable: item.isNegotiable ?? false,
    })
    .select(`*, profiles(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function markItemSold(itemId: string) {
  const { error } = await supabase.from('market_items').update({ is_sold: true }).eq('id', itemId);
  if (error) throw error;
}

export async function deleteMarketItem(itemId: string) {
  const { error } = await supabase.from('market_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function getSavedItemIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('market_saves')
    .select('item_id')
    .eq('user_id', userId);
  return data?.map((r: any) => r.item_id) ?? [];
}

export async function saveMarketItem(userId: string, itemId: string) {
  const { error } = await supabase
    .from('market_saves')
    .insert({ user_id: userId, item_id: itemId });
  if (error && error.code !== '23505') throw error;
}

export async function unsaveMarketItem(userId: string, itemId: string) {
  const { error } = await supabase
    .from('market_saves')
    .delete()
    .eq('user_id', userId)
    .eq('item_id', itemId);
  if (error) throw error;
}

export async function getSavedItems(userId: string) {
  const { data, error } = await supabase
    .from('market_saves')
    .select(`item_id, market_items(*, profiles(*))`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data?.map((r: any) => r.market_items).filter(Boolean) ?? [];
}

export async function incrementItemViews(itemId: string) {
  await supabase.rpc('increment_market_views', { item_id: itemId }).catch(() => {});
}
