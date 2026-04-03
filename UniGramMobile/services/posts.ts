import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';

export async function getFeedPosts(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data ?? [];
}

export async function getUserPosts(userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPost(
  userId: string,
  caption: string,
  type: 'image' | 'video' | 'thread' = 'thread',
  mediaUri?: string,
  extras?: { location?: string; song?: string; taggedUsers?: string[]; mimeType?: string },
): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  let media_url: string | undefined;
  if (mediaUri) {
    const isVideo = type === 'video';
    let ext = mediaUri.split('.').pop()?.toLowerCase();
    if (!ext || ext.length > 5 || ext === mediaUri.toLowerCase()) {
      ext = isVideo ? 'mp4' : 'jpg';
    }
    const bucket = isVideo ? 'videos' : 'post-media';
    const path = `${userId}/${Date.now()}.${ext}`;
    const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
    media_url = await uploadFile(bucket, path, mediaUri, extras?.mimeType ?? fallbackMime);
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      caption,
      type,
      media_url,
      location: extras?.location,
      song: extras?.song,
      tagged_users: extras?.taggedUsers,
    })
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function deletePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function likePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
  try {
    await supabase.rpc('increment_post_likes', { p_post_id: postId });
  } catch (e) {
    // fallback - count stays via DB trigger
  }
}

export async function unlikePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function savePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_saves').insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function unsavePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase
    .from('post_saves')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getLikedPostIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('post_likes').select('post_id').eq('user_id', userId);
  return data?.map((r: any) => r.post_id) ?? [];
}

export async function getSavedPostIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('post_saves').select('post_id').eq('user_id', userId);
  return data?.map((r: any) => r.post_id) ?? [];
}

export async function getSavedPosts(userId: string) {
  const { data, error } = await supabase
    .from('post_saves')
    .select('post_id, posts(*, profiles!posts_user_id_fkey(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data?.map((r: any) => r.posts) ?? [];
}

// Comments
export async function getPostComments(postId: string) {
  const { data, error } = await supabase
    .from('post_comments')
    .select(`*, profiles!post_comments_user_id_fkey(*)`)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addPostComment(postId: string, userId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, text })
    .select(`*, profiles!post_comments_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function deletePostComment(commentId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId).eq('user_id', userId);
  if (error) throw error;
}
