import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { uploadFile } from './upload';

export async function getReels(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('reels')
    .select(`*, profiles!reels_user_id_fkey(*)`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function getUserReels(userId: string) {
  const { data, error } = await supabase
    .from('reels')
    .select(`*, profiles!reels_user_id_fkey(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createReel(
  userId: string,
  videoUri: string,
  caption: string,
  song?: string,
  thumbnailUri?: string,
): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const ext = videoUri.split('.').pop()?.toLowerCase() ?? 'mp4';
  const videoPath = `${userId}/${Date.now()}.${ext}`;
  const video_url = await uploadFile('videos', videoPath, videoUri, `video/${ext}`);

  let thumbnail_url: string | undefined;
  if (thumbnailUri) {
    const tExt = thumbnailUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const thumbPath = `${userId}/${Date.now()}_thumb.${tExt}`;
    thumbnail_url = await uploadFile('reel-thumbnails', thumbPath, thumbnailUri);
  }

  const { data, error } = await supabase
    .from('reels')
    .insert({ user_id: userId, video_url, thumbnail_url, caption, song })
    .select(`*, profiles!reels_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function likeReel(reelId: string, userId: string) {
  const { error } = await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userId });
  if (error && error.code !== '23505') throw error;
  SocialSync.emit('REEL_LIKE_CHANGE', { targetId: reelId, isActive: true });
}

export async function unlikeReel(reelId: string, userId: string) {
  const { error } = await supabase
    .from('reel_likes')
    .delete()
    .eq('reel_id', reelId)
    .eq('user_id', userId);
  if (error) throw error;
  SocialSync.emit('REEL_LIKE_CHANGE', { targetId: reelId, isActive: false });
}

export async function getLikedReelIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('reel_likes').select('reel_id').eq('user_id', userId);
  return data?.map((r: any) => r.reel_id) ?? [];
}

export async function getReelComments(reelId: string) {
  const { data, error } = await supabase
    .from('reel_comments')
    .select(`*, profiles!reel_comments_user_id_fkey(*)`)
    .eq('reel_id', reelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addReelComment(reelId: string, userId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('reel_comments')
    .insert({ reel_id: reelId, user_id: userId, text })
    .select(`*, profiles!reel_comments_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}
