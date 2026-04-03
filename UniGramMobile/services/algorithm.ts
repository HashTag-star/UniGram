import { supabase } from '../lib/supabase';

export async function getPersonalizedFeed(userId: string, limit = 20, offset = 0) {
  const { data, error } = await supabase.rpc('get_personalized_feed', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    // Fallback to regular feed if algo fails
    console.warn('Algorithm fallback:', error.message);
    const { data: fallback } = await supabase
      .from('posts')
      .select('*, profiles!posts_user_id_fkey(*)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return fallback ?? [];
  }
  // Attach profiles as nested object (RPC returns profiles as jsonb)
  return (data ?? []).map((row: any) => ({
    ...row,
    profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles,
  }));
}

export async function recordImpression(postId: string, userId: string) {
  await supabase
    .from('post_impressions')
    .upsert({ post_id: postId, user_id: userId })
    .then(() => {});
}

export async function getTrendingHashtags(limit = 10) {
  const { data, error } = await supabase.rpc('get_trending_hashtags', { p_limit: limit });
  if (error) return [];
  return data ?? [];
}
