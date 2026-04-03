import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketItem {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  image_url: string | null;
  is_sold: boolean;
  views_count: number;
  created_at: string;
  profiles: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    is_verified: boolean;
    verification_type: string | null;
    university: string | null;
  } | null;
}

export interface CreateItemPayload {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  imageUris: string[];
}

export interface UpdateItemPayload {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  condition?: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Paginated browse: filter by category + full-text ilike search on title and description.
 */
export async function getMarketItems(
  category?: string,
  search?: string,
  limit = 20,
  offset = 0,
): Promise<MarketItem[]> {
  let query = supabase
    .from('market_items')
    .select('*, profiles(*)')
    .eq('is_sold', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`title.ilike.${term},description.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as MarketItem[]) ?? [];
}

/**
 * All items where seller_id = userId, newest first.
 */
export async function getMyListings(userId: string): Promise<MarketItem[]> {
  const { data, error } = await supabase
    .from('market_items')
    .select('*, profiles(*)')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as MarketItem[]) ?? [];
}

/**
 * Items saved by this user, via market_saves join.
 */
export async function getSavedItems(userId: string): Promise<MarketItem[]> {
  const { data, error } = await supabase
    .from('market_saves')
    .select('item_id, market_items(*, profiles(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.market_items)
    .filter(Boolean) as MarketItem[];
}

/**
 * Returns an array of item IDs the user has saved — used for fast local lookup.
 */
export async function getSavedItemIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('market_saves')
    .select('item_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.item_id as string);
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Create a new market listing.
 * Uses uploadFile (expo-file-system based) to upload the first image in imageUris
 * to the 'market-images' bucket — fixes the broken fetch().blob() approach.
 */
export async function createMarketItem(
  sellerId: string,
  item: CreateItemPayload,
): Promise<MarketItem> {
  let image_url: string | undefined;

  if (item.imageUris && item.imageUris.length > 0) {
    const uri = item.imageUris[0];
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${sellerId}/${Date.now()}_0.${ext}`;
    image_url = await uploadFile('market-images', path, uri);
  }

  const { data, error } = await supabase
    .from('market_items')
    .insert({
      seller_id: sellerId,
      title: item.title.trim(),
      description: item.description.trim(),
      price: item.price,
      category: item.category,
      condition: item.condition,
      image_url: image_url ?? null,
      is_sold: false,
      views_count: 0,
    })
    .select('*, profiles(*)')
    .single();

  if (error) throw error;
  return data as MarketItem;
}

/**
 * Update a listing's editable fields. Verifies ownership before updating.
 */
export async function updateMarketItem(
  itemId: string,
  userId: string,
  updates: UpdateItemPayload,
): Promise<MarketItem> {
  // Auth check
  const { data: existing, error: fetchErr } = await supabase
    .from('market_items')
    .select('seller_id')
    .eq('id', itemId)
    .single();
  if (fetchErr) throw fetchErr;
  if (existing.seller_id !== userId) throw new Error('Not authorised to edit this listing.');

  const { data, error } = await supabase
    .from('market_items')
    .update({
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      ...(updates.description !== undefined && { description: updates.description.trim() }),
      ...(updates.price !== undefined && { price: updates.price }),
      ...(updates.category !== undefined && { category: updates.category }),
      ...(updates.condition !== undefined && { condition: updates.condition }),
    })
    .eq('id', itemId)
    .select('*, profiles(*)')
    .single();

  if (error) throw error;
  return data as MarketItem;
}

/**
 * Permanently delete a listing. Verifies ownership before deleting.
 */
export async function deleteMarketItem(itemId: string, userId: string): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('market_items')
    .select('seller_id')
    .eq('id', itemId)
    .single();
  if (fetchErr) throw fetchErr;
  if (existing.seller_id !== userId) throw new Error('Not authorised to delete this listing.');

  const { error } = await supabase.from('market_items').delete().eq('id', itemId);
  if (error) throw error;
}

/**
 * Mark an item as sold. Verifies ownership before updating.
 */
export async function markItemSold(itemId: string, userId: string): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('market_items')
    .select('seller_id')
    .eq('id', itemId)
    .single();
  if (fetchErr) throw fetchErr;
  if (existing.seller_id !== userId) throw new Error('Not authorised to mark this item as sold.');

  const { error } = await supabase
    .from('market_items')
    .update({ is_sold: true })
    .eq('id', itemId);
  if (error) throw error;
}

/**
 * Toggle bookmark on a market item with DB persistence.
 * Returns { saved: true } if the item is now saved, { saved: false } if unsaved.
 */
export async function toggleSaveItem(
  userId: string,
  itemId: string,
): Promise<{ saved: boolean }> {
  // Check current state
  const { data: existing, error: checkErr } = await supabase
    .from('market_saves')
    .select('id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();
  if (checkErr) throw checkErr;

  if (existing) {
    // Already saved — remove it
    const { error } = await supabase
      .from('market_saves')
      .delete()
      .eq('user_id', userId)
      .eq('item_id', itemId);
    if (error) throw error;
    return { saved: false };
  } else {
    // Not saved — insert it (ignore duplicate constraint gracefully)
    const { error } = await supabase
      .from('market_saves')
      .insert({ user_id: userId, item_id: itemId });
    if (error && error.code !== '23505') throw error;
    return { saved: true };
  }
}

/**
 * Increment view count for an item. Uses RPC if available, falls back to a
 * read-then-write (best effort — never throws so callers don't break).
 */
export async function incrementViewCount(itemId: string): Promise<void> {
  try {
    const { error: rpcErr } = await supabase.rpc('increment_market_views', {
      item_id: itemId,
    });
    if (!rpcErr) return;

    // RPC not found — fall back to manual increment
    const { data } = await supabase
      .from('market_items')
      .select('views_count')
      .eq('id', itemId)
      .single();
    if (!data) return;
    await supabase
      .from('market_items')
      .update({ views_count: (data.views_count ?? 0) + 1 })
      .eq('id', itemId);
  } catch {
    // Best-effort — never surface view count errors
  }
}
