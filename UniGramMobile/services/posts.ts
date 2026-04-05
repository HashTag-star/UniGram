import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { uploadFile } from './upload';
import { createNotification } from './notifications';
import { sendPushToUser } from './pushNotifications';

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
  mediaUris?: string[],
  extras?: { location?: string; song?: string; taggedUsers?: string[]; mimeType?: string },
): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const uploadedUrls: string[] = [];
  if (mediaUris && mediaUris.length > 0) {
    for (const uri of mediaUris) {
      const isVideo = type === 'video';
      let ext = uri.split('.').pop()?.toLowerCase();
      if (!ext || ext.length > 5 || ext === uri.toLowerCase()) {
        ext = isVideo ? 'mp4' : 'jpg';
      }
      const bucket = isVideo ? 'videos' : 'post-media';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
      const url = await uploadFile(bucket, path, uri, extras?.mimeType ?? fallbackMime);
      uploadedUrls.push(url);
    }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      caption,
      type,
      media_url: uploadedUrls[0] || null,
      media_urls: uploadedUrls,
      location: extras?.location,
      song: extras?.song,
      tagged_users: extras?.taggedUsers,
    })
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePost(postId: string, userId: string, updates: { caption?: string; location?: string; tagged_users?: string[] }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .eq('user_id', userId)
    .select()
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
  } catch (e) {}
  SocialSync.emit('POST_LIKE_CHANGE', { targetId: postId, isActive: true });
  
  // Notify author
  try {
    const { data: post } = await supabase.from('posts').select('user_id, caption').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      const { data: actor } = await supabase.from('profiles').select('username').eq('id', userId).single();
      const text = `liked your post: "${post.caption?.substring(0, 20) || ''}..."`;
      await createNotification({
        user_id: post.user_id,
        actor_id: userId,
        type: 'like',
        post_id: postId,
        text
      });
      sendPushToUser(post.user_id, 'New Like', `@${actor?.username || 'Someone'} ${text}`, { 
        type: 'like', postId, userId 
      }).catch(() => {});
    }
  } catch (e) {}
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
  SocialSync.emit('POST_LIKE_CHANGE', { targetId: postId, isActive: false });
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

  // Notify author
  try {
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      const { data: actor } = await supabase.from('profiles').select('username').eq('id', userId).single();
      const notifText = `commented: "${text.substring(0, 30)}..."`;
      await createNotification({
        user_id: post.user_id,
        actor_id: userId,
        type: 'comment',
        post_id: postId,
        text: notifText
      });
      sendPushToUser(post.user_id, 'New Comment', `@${actor?.username || 'Someone'} ${notifText}`, { 
        type: 'comment', postId, userId 
      }).catch(() => {});
    }
  } catch (e) {}

  return data;
}

export async function deletePostComment(commentId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId).eq('user_id', userId);
  if (error) throw error;
}

export async function searchPosts(query: string, limit = 20) {
  const safe = query.replace(/[%_\\]/g, '\\$&').slice(0, 100);
  const { data, error } = await supabase
    .from('posts')
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .ilike('caption', `%${safe}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPostsByHashtag(hashtag: string, limit = 30) {
  const tag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
  const safe = tag.replace(/[%_\\]/g, '\\$&').slice(0, 50);
  const { data, error } = await supabase
    .from('posts')
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .ilike('caption', `%${safe}%`)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function reportContent(
  reporterId: string,
  targetType: 'post' | 'user' | 'reel' | 'market_item',
  targetId: string,
  reason: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== reporterId) throw new Error('Unauthorized');
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
  });
  // If reports table doesn't exist yet, fail silently
  if (error && !error.message.includes('does not exist')) throw error;
}
