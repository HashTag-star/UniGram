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
  extras?: { 
    location?: string; 
    song?: string; 
    taggedUsers?: string[]; 
    mimeType?: string;
    aspectRatio?: number;
  },
): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const uploadedUrls: string[] = [];
  if (mediaUris && mediaUris.length > 0) {
    const uploadPromises = mediaUris.map(async (uri) => {
      const isVideo = type === 'video';
      let ext = uri.split('.').pop()?.toLowerCase();
      if (!ext || ext.length > 5 || ext === uri.toLowerCase()) {
        ext = isVideo ? 'mp4' : 'jpg';
      }
      const bucket = isVideo ? 'videos' : 'post-media';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
      return uploadFile(bucket, path, uri, extras?.mimeType ?? fallbackMime);
    });

    const results = await Promise.all(uploadPromises);
    uploadedUrls.push(...results);
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
      aspect_ratio: extras?.aspectRatio ?? 1.0,
    })
    .select(`*, profiles!posts_user_id_fkey(*)`)
    .single();

  if (error) throw error;

  // Notification logic for tags/mentions
  const actor = data.profiles;
  const notifyUserIds = new Set<string>();

  // 1. Explicitly tagged users
  if (extras?.taggedUsers && extras.taggedUsers.length > 0) {
    const { data: taggedProfiles } = await supabase.from('profiles').select('id').in('username', extras.taggedUsers);
    taggedProfiles?.forEach(p => { if (p.id !== userId) notifyUserIds.add(p.id); });
  }

  // 2. Mentions in caption
  const captionMentions = caption.match(/@(\w+)/g);
  if (captionMentions) {
    const mentionUsernames = captionMentions.map(m => m.substring(1));
    const { data: mentionProfiles } = await supabase.from('profiles').select('id').in('username', mentionUsernames);
    mentionProfiles?.forEach(p => { if (p.id !== userId) notifyUserIds.add(p.id); });
  }

  // Send mention/tag notifications
  notifyUserIds.forEach(async (tid) => {
    try {
      const notifText = `tagged you in a post: "${caption.substring(0, 30)}..."`;
      await createNotification({
        user_id: tid,
        actor_id: userId,
        type: 'mention',
        post_id: data.id,
        text: notifText
      });
      sendPushToUser(tid, actor?.username || 'Someone', notifText, {
        type: 'post', postId: data.id, userId,
      }, uploadedUrls[0] ?? undefined, actor?.avatar_url ?? undefined).catch(() => {});
    } catch (e) {}
  });

  // Notify followers that someone they follow posted (fire-and-forget, capped at 500)
  (async () => {
    try {
      const { data: followers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId)
        .limit(500);

      if (!followers?.length) return;

      const username = actor?.username || 'Someone';
      const pushBody = caption.trim()
        ? `${username} posted: "${caption.substring(0, 60)}"`
        : `${username} shared a new post`;

      const notifRows = followers.map((f: any) => ({
        user_id: f.follower_id,
        actor_id: userId,
        type: 'new_post',
        post_id: data.id,
        text: pushBody,
        is_read: false,
      }));

      // Batch insert in-app notifications
      for (let i = 0; i < notifRows.length; i += 500) {
        await supabase.from('notifications').insert(notifRows.slice(i, i + 500)).catch(() => {});
      }

      // Push devices — fire-and-forget per follower
      followers.forEach((f: any) => {
        sendPushToUser(
          f.follower_id,
          username,
          pushBody,
          { type: 'new_post', postId: data.id, userId },
          uploadedUrls[0] ?? undefined,
          actor?.avatar_url ?? undefined,
        ).catch(() => {});
      });
    } catch (_) {}
  })();

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
    const { data: post } = await supabase.from('posts').select('user_id, caption, media_urls').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      const { data: actor } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
      const text = post.caption?.trim()
        ? `liked your post: "${post.caption.substring(0, 40)}${post.caption.length > 40 ? '…' : ''}"`
        : 'liked your post.';
      await createNotification({
        user_id: post.user_id,
        actor_id: userId,
        type: 'like',
        post_id: postId,
        text
      });
      sendPushToUser(post.user_id, actor?.username || 'Someone', text, {
        type: 'like', postId, userId,
      }, post.media_urls?.[0] ?? undefined, actor?.avatar_url ?? undefined).catch(() => {});
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

export async function getPostLikers(postId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('profiles!post_likes_user_id_fkey(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data?.map((l: any) => l.profiles).filter(Boolean) ?? [];
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
export const COMMENTS_PAGE_SIZE = 20;

export async function getPostComments(
  postId: string,
  currentUserId?: string,
  page = 0,
): Promise<{ items: any[]; hasMore: boolean; total: number }> {
  const from = page * COMMENTS_PAGE_SIZE;
  // range() is inclusive on both ends — fetches PAGE_SIZE+1 rows to detect hasMore
  const to = from + COMMENTS_PAGE_SIZE;

  // 1. Page of root-level comments + total count in one query
  const { data: roots, count, error } = await supabase
    .from('post_comments')
    .select(`*, profiles!post_comments_user_id_fkey(*)`, { count: 'exact' })
    .eq('post_id', postId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .range(from, to);
  if (error) throw error;

  const hasMore = (roots ?? []).length > COMMENTS_PAGE_SIZE;
  const rootPage = (roots ?? []).slice(0, COMMENTS_PAGE_SIZE);
  const total = count ?? 0;
  if (rootPage.length === 0) return { items: [], hasMore: false, total };

  const rootIds = rootPage.map((c: any) => c.id);

  // 2. Parallel: replies + root-comment likes at the same time
  const [repliesResult, rootLikedResult] = await Promise.all([
    supabase
      .from('post_comments')
      .select(`*, profiles!post_comments_user_id_fkey(*)`)
      .eq('post_id', postId)
      .in('parent_id', rootIds)
      .order('created_at', { ascending: true }),
    currentUserId
      ? supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', rootIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const replies = repliesResult.data ?? [];
  const likedSet = new Set((rootLikedResult.data ?? []).map((r: any) => r.comment_id));

  // 3. Fetch reply likes only if there are replies (small targeted query)
  if (currentUserId && replies.length > 0) {
    const replyIds = replies.map((c: any) => c.id);
    const { data: replyLiked } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', currentUserId)
      .in('comment_id', replyIds);
    (replyLiked ?? []).forEach((r: any) => likedSet.add(r.comment_id));
  }

  const all = [...rootPage, ...replies];
  return {
    items: currentUserId
      ? all.map((c: any) => ({ ...c, isLiked: likedSet.has(c.id) }))
      : all,
    hasMore,
    total,
  };
}

export async function addPostComment(postId: string, userId: string, text: string, parentId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  
  // Try inserting with parent_id, fallback if column doesn't exist
  let res: any;
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, text, parent_id: parentId })
    .select(`*, profiles!post_comments_user_id_fkey(*)`)
    .single();
  
  if (error) {
    // If parent_id doesn't exist or schema cache is stale, try without it
    const isColumnError = error.message?.includes('parent_id') || 
                         error.message?.includes('schema cache') || 
                         error.code === 'PGRST205';

    if (isColumnError) {
      const { data: d2, error: e2 } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, user_id: userId, text })
        .select(`*, profiles!post_comments_user_id_fkey(*)`)
        .single();
      if (e2) throw e2;
      res = d2;
    } else {
      throw error;
    }
  } else {
    res = data;
  }

  const { data: actor } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
  const actorName = actor?.username || 'Someone';
  const actorAvatar = actor?.avatar_url ?? undefined;

  // 1. Notify post author
  try {
    const { data: post } = await supabase.from('posts').select('user_id, media_urls').eq('id', postId).single();
    if (post && post.user_id !== userId) {
      const notifText = parentId
        ? `replied to a comment: "${text.substring(0, 40)}${text.length > 40 ? '…' : ''}"`
        : `commented: "${text.substring(0, 40)}${text.length > 40 ? '…' : ''}"`;
      await createNotification({
        user_id: post.user_id,
        actor_id: userId,
        type: 'comment',
        post_id: postId,
        text: notifText
      });
      sendPushToUser(post.user_id, actorName, notifText, {
        type: 'comment', postId, userId,
      }, post.media_urls?.[0] ?? undefined, actorAvatar).catch(() => {});
    }
  } catch (e) {}

  // 2. Parse Mentions (@username)
  const mentions = text.match(/@(\w+)/g);
  if (mentions) {
    const uniqueUsernames = Array.from(new Set(mentions.map(m => m.substring(1))));
    uniqueUsernames.forEach(async (uname) => {
      try {
        const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', uname).single();
        if (targetProfile && targetProfile.id !== userId) {
          const mentionText = `mentioned you in a comment: "${text.substring(0, 40)}${text.length > 40 ? '…' : ''}"`;
          await createNotification({
            user_id: targetProfile.id,
            actor_id: userId,
            type: 'mention',
            post_id: postId,
            text: mentionText
          });
          sendPushToUser(targetProfile.id, actorName, mentionText, {
            type: 'mention', postId, userId,
          }, undefined, actorAvatar).catch(() => {});
        }
      } catch (e) {}
    });
  }

  return res;
}

export async function likeComment(commentId: string, userId: string) {
  const { error } = await supabase.from('comment_likes').upsert({ comment_id: commentId, user_id: userId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function unlikeComment(commentId: string, userId: string) {
  const { error } = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  if (error) throw error;
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
