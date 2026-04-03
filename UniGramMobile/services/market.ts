import { supabase } from '../lib/supabase';

export async function getMarketItems(category?: string) {
  let query = supabase
    .from('market_items')
    .select(`*, profiles(*)`)
    .eq('is_sold', false)
    .order('created_at', { ascending: false });
  if (category && category !== 'all') query = query.eq('category', category);
  const { data, error } = await query;
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
}) {
  let image_url: string | undefined;
  if (item.imageUri) {
    const ext = item.imageUri.split('.').pop() ?? 'jpg';
    const path = `${sellerId}/${Date.now()}.${ext}`;
    const response = await fetch(item.imageUri);
    const blob = await response.blob();
    await supabase.storage.from('market-images').upload(path, blob, { contentType: `image/${ext}` });
    const { data } = supabase.storage.from('market-images').getPublicUrl(path);
    image_url = data.publicUrl;
  }
  const { data, error } = await supabase
    .from('market_items')
    .insert({ seller_id: sellerId, ...item, image_url })
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
