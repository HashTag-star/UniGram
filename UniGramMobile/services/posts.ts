import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { uploadFile, assertVideoWithinLimits } from './upload';
import { PROFILE_MINI_COLUMNS } from './profiles';
import { randomId } from '../lib/uuid';
import { createNotification } from './notifications';
import { sendPushToUser } from './pushNotifications';
import { Cache, TTL } from '../lib/cache';
import { assertUuid, cleanUserText, requireText } from '../lib/contentSafety';

// Explicit post columns (no select('*')) + the compact profile embed.
export const POST_COLUMNS = 'id, user_id, type, caption, media_url, media_urls, location, song, likes_count, comments_count, reposts_count, saves_count, repost_of, quote_of, created_at, tagged_users, aspect_ratio';
const POST_WITH_PROFILE = `${POST_COLUMNS}, profiles!posts_user_id_fkey(${PROFILE_MINI_COLUMNS})`;
const COMMENT_PROFILE_EMBED = (fk: string) => `profiles!${fk}(${PROFILE_MINI_COLUMNS})`;

const POST_SELECT = `
  id, user_id, type, caption, media_url, media_urls, location, song, 
  likes_count, comments_count, reposts_count, repost_of, quote_of, 
  created_at, tagged_users, aspect_ratio,
  profiles!posts_user_id_fkey(id, username, avatar_url, is_verified, verification_type, major, university)
`;

export async function getFeedPosts(limit = 20, offset = 0) {
  // Cache key is user-scoped so accounts on one device never share a feed.
  const { data: { user } } = await supabase.auth.getUser();
  const key = `feed:${user?.id ?? 'anon'}:global:${limit}:${offset}`;
  const rows = await Cache.getOrFetch<any[]>(key, TTL.feed, async () => {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  });
  return rows ?? [];
}

export const USER_POSTS_PAGE = 60;

/** Paged: returns up to `limit` posts starting at `offset` (newest first). */
export async function getUserPosts(userId: string, limit = USER_POSTS_PAGE, offset = 0) {
  // Profile grid hits this on every visit — memory-cache only (never write the whole
  // array to AsyncStorage: a large grid blows the 6MB Android cap).
  const key = `userposts:${userId}:${limit}:${offset}`;
  const hit = Cache.getSync<any[]>(key, TTL.profile);
  if (hit) return hit;
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const result = data ?? [];
  Cache.set(key, result, { persist: false });
  return result;
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
  assertUuid(userId, 'User ID');
  const safeCaption = cleanUserText(caption, 'postCaption');
  const safeLocation = cleanUserText(extras?.location, 'location') || undefined;

  const uploadedUrls: string[] = [];
  if (mediaUris && mediaUris.length > 0) {
    // Sequential (a carousel of 10 photos in parallel = 10 simultaneous uploads / OOM risk and
    // 10 competing sockets on a weak connection). Failure of any item aborts the post.
    for (const uri of mediaUris) {
      const isVideo = type === 'video';
      let ext = uri.split('.').pop()?.toLowerCase();
      if (!ext || ext.length > 5 || ext === uri.toLowerCase()) {
        ext = isVideo ? 'mp4' : 'jpg';
      }
      const bucket = isVideo ? 'videos' : 'post-media';
      const path = `${userId}/${Date.now()}-${randomId(8)}.${ext}`;
      const fallbackMime = isVideo ? 'video/mp4' : 'image/jpeg';
      if (isVideo) await assertVideoWithinLimits(uri);
      uploadedUrls.push(await uploadFile(bucket, path, uri, extras?.mimeType ?? fallbackMime));
    }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      caption: safeCaption,
      type,
      media_url: uploadedUrls[0] || null,
      media_urls: uploadedUrls,
      location: safeLocation,
      song: extras?.song,
      tagged_users: extras?.taggedUsers,
      aspect_ratio: extras?.aspectRatio ?? 1.0,
    })
    .select(POST_WITH_PROFILE)
    .single();

  if (error) throw error;

  // Notification logic for tags/mentions
  const actor: any = (data as any).profiles;
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
  // [Ama Mensah - Lead Dev] Use Promise.allSettled — forEach+async swallows errors and gives no await
  await Promise.allSettled(Array.from(notifyUserIds).map(async (tid) => {
    try {
      const preview = caption.substring(0, 30);
      const notifText = caption.trim()
        ? `📸 tagged you: "${preview}${caption.length > 30 ? '…' : ''}"`
        : '📸 tagged you in a post';
      await createNotification({
        user_id: tid,
        actor_id: userId,
        type: 'mention',
        post_id: data.id,
        text: notifText
      });
      sendPushToUser(tid, 'New mention', notifText, {
        type: 'post', postId: data.id, userId, channelId: 'social',
      }, uploadedUrls[0] ?? undefined, actor?.avatar_url ?? undefined).catch(() => {});
    } catch (e) {}
  }));

  // [Ama Mensah - Lead Dev] New post busts feed cache for all offsets and the author's own post list
  Cache.invalidatePattern('feed:');
  Cache.invalidatePattern(`userposts:${userId}`);

  // Notify followers (fire-and-forget; server-side RPC first, small batched fallback)
  const pushBody = caption.trim()
    ? `📸 posted: "${caption.substring(0, 60)}${caption.length > 60 ? '…' : ''}"`
    : '📸 shared a new post';
  notifyFollowers({
    actorId: userId,
    type: 'new_post',
    postId: data.id,
    title: 'New post',
    body: pushBody,
    imageUrl: uploadedUrls[0] ?? undefined,
    avatarUrl: actor?.avatar_url ?? undefined,
  }).catch(() => {});

  return data;
}

/**
 * Fan-out "someone you follow posted / added a story" to followers WITHOUT hammering the
 * poster's phone.
 *  1. Preferred: RPC `notify_followers` inserts all notification rows server-side and returns
 *     (optionally) an array of follower ids to push to.
 *  2. Fallback (RPC missing): one batched insert per 100 rows and pushes to at most 50
 *     recipients, a few at a time. Never awaited by the caller.
 */
export async function notifyFollowers(a: {
  actorId: string;
  type: 'new_post' | 'new_story';
  postId?: string;
  storyId?: string;
  title: string;
  body: string;
  imageUrl?: string;
  avatarUrl?: string;
}): Promise<void> {
  const data: Record<string, any> = a.postId
    ? { type: 'new_post', postId: a.postId, userId: a.actorId, channelId: 'social' }
    : { type: 'new_story', storyId: a.storyId, userId: a.actorId, channelId: 'social' };
  const MAX_PUSH = 50;
  const push = async (ids: string[]) => {
    const targets = ids.slice(0, MAX_PUSH);
    for (let i = 0; i < targets.length; i += 5) {
      await Promise.allSettled(targets.slice(i, i + 5).map(id =>
        sendPushToUser(id, a.title, a.body, data, a.imageUrl, a.avatarUrl)));
    }
  };

  try {
    const args: Record<string, any> = { p_type: a.type, p_title: a.title, p_body: a.body };
    if (a.postId) args.p_post_id = a.postId;
    if (a.storyId) args.p_story_id = a.storyId;
    const { data: rpcData, error } = await supabase.rpc('notify_followers', args);
    if (!error) {
      if (Array.isArray(rpcData)) {
        push(rpcData.map((r: any) => (typeof r === 'string' ? r : r?.user_id ?? r?.follower_id)).filter(Boolean)).catch(() => {});
      }
      return;
    }
  } catch { /* fall through to the client path */ }

  const { data: followers } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', a.actorId)
    .limit(500);
  if (!followers?.length) return;
  const rows = followers.map((f: any) => ({
    user_id: f.follower_id,
    actor_id: a.actorId,
    type: a.type,
    post_id: a.postId ?? null,
    text: a.body,
    is_read: false,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    await supabase.from('notifications').insert(rows.slice(i, i + 100));
  }
  push(followers.map((f: any) => f.follower_id)).catch(() => {});
}

export async function updatePost(postId: string, userId: string, updates: { caption?: string; location?: string; tagged_users?: string[] }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  assertUuid(postId, 'Post ID');
  const safeUpdates = {
    ...updates,
    caption: updates.caption === undefined ? undefined : cleanUserText(updates.caption, 'postCaption'),
    location: updates.location === undefined ? undefined : cleanUserText(updates.location, 'location'),
  };
  const { data, error } = await supabase
    .from('posts')
    .update(safeUpdates)
    .eq('id', postId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  // [Ama Mensah - Lead Dev] Caption/location edits invalidate feed + profile grid
  Cache.invalidatePattern('feed:');
  Cache.invalidatePattern(`userposts:${userId}`);
  return data;
}

export async function deletePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  assertUuid(postId, 'Post ID');

  // 1. Get post data to find media paths (single media_url + carousel media_urls)
  // [Ama Mensah - Lead Dev] Previously only media_url was cleaned up, leaving
  // every additional entry in media_urls orphaned in storage on delete.
  const { data: post } = await supabase
    .from('posts')
    .select('media_url, media_urls')
    .eq('id', postId)
    .eq('user_id', userId)
    .single();

  // 2. Collect every storage path and remove in a single call
  const urls: string[] = [];
  if (post?.media_url) urls.push(post.media_url);
  if (Array.isArray(post?.media_urls)) urls.push(...post.media_urls.filter(Boolean));
  if (urls.length) {
    try {
      const paths = Array.from(new Set(
        urls.map(u => {
          // "https://.../bucket/userId/timestamp.ext" -> "userId/timestamp.ext"
          const parts = u.split('/');
          return parts.slice(-2).join('/');
        })
      ));
      await supabase.storage.from('post-media').remove(paths);
    } catch (err) {
      console.warn('Failed to cleanup post media:', err);
    }
  }

  // 3. Delete from database
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userId);
  if (error) throw error;
  // [Ama Mensah - Lead Dev] Deleted post must not appear in stale feed or profile grid
  Cache.invalidatePattern('feed:');
  Cache.invalidatePattern(`userposts:${userId}`);
}

export async function likePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_likes').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
  SocialSync.emit('POST_LIKE_CHANGE', { targetId: postId, isActive: true });
  emitPostLikeCount(postId, true);

  // Notify author (never block the like on notification work)
  (async () => {
    try {
      const { data: post } = await supabase.from('posts').select('user_id, caption, media_urls').eq('id', postId).single();
      if (post && post.user_id !== userId) {
        const { data: actor } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
        const hasMedia = !!(post.media_urls?.[0]);
        const text = hasMedia ? '❤️ liked your photo' : '❤️ liked your post';
        await createNotification({
          user_id: post.user_id,
          actor_id: userId,
          type: 'like',
          post_id: postId,
          text
        });
        sendPushToUser(post.user_id, 'New like', text, {
          type: 'like', postId, userId, channelId: 'social',
        }, post.media_urls?.[0] ?? undefined, actor?.avatar_url ?? undefined, 'post_like').catch(() => {});
      }
    } catch (e) {}
  })();
}

/** Re-emits POST_LIKE_CHANGE with the authoritative likes_count so every screen shows the same number. */
function emitPostLikeCount(postId: string, isActive: boolean) {
  (async () => {
    try {
      const { data } = await supabase.from('posts').select('likes_count').eq('id', postId).maybeSingle();
      if (data && typeof data.likes_count === 'number') {
        SocialSync.emit('POST_LIKE_CHANGE', { targetId: postId, isActive, newCount: data.likes_count });
      }
    } catch {}
  })();
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
  emitPostLikeCount(postId, false);
}

export async function savePost(postId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('post_saves').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
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
  const { data } = await supabase.from('post_likes').select('post_id').eq('user_id', userId).limit(500).order('created_at', { ascending: false });
  return data?.map((r: any) => r.post_id) ?? [];
}

// ─── Reposts ──────────────────────────────────────────────────────────────────

export async function repostPost(postId: string, userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const { error } = await supabase.from('post_reposts').insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error;

  // Create a repost entry so it appears in the user's profile + followers' feeds
  await supabase.from('posts').insert({
    user_id: userId,
    type: 'repost',
    repost_of: postId,
    caption: null,
    media_urls: [],
  });

  try { await supabase.rpc('increment_post_reposts', { p_post_id: postId, delta: 1 }); } catch {}

  // Notify original author
  try {
    const { data: orig } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    const { data: actor } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
    if (orig && orig.user_id !== userId) {
      await createNotification({
        user_id: orig.user_id,
        actor_id: userId,
        type: 'repost',
        post_id: postId,
        text: `🔁 @${actor?.username || 'someone'} reposted your post`,
      });
    }
  } catch {}
}

export async function unrepostPost(postId: string, userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  await supabase.from('post_reposts').delete().eq('post_id', postId).eq('user_id', userId);
  await supabase.from('posts').delete().eq('repost_of', postId).eq('user_id', userId);
  try { await supabase.rpc('increment_post_reposts', { p_post_id: postId, delta: -1 }); } catch {}
}

export async function getRepostedPostIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('post_reposts').select('post_id').eq('user_id', userId).limit(500).order('created_at', { ascending: false });
  return data?.map((r: any) => r.post_id) ?? [];
}

export async function quotePost(postId: string, userId: string, caption: string): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  assertUuid(postId, 'Post ID');
  const safeCaption = requireText(cleanUserText(caption, 'postCaption'), 'Quote');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      type: 'quote',
      quote_of: postId,
      caption: safeCaption,
      media_urls: [],
    })
    .select(POST_WITH_PROFILE)
    .single();
  if (error) throw error;

  // Notify original author
  try {
    const { data: orig } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    const { data: actor } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
    if (orig && orig.user_id !== userId) {
      const preview = caption.substring(0, 40) + (caption.length > 40 ? '…' : '');
      await createNotification({
        user_id: orig.user_id,
        actor_id: userId,
        type: 'quote',
        post_id: postId,
        text: `💬 @${actor?.username || 'someone'} quoted your post: "${preview}"`,
      });
    }
  } catch {}

  return data;
}

// Batch-enriches a post list with the original post data for reposts/quotes.
// Avoids N+1 queries by collecting all IDs and doing one SELECT.
export async function enrichWithOriginalPosts(posts: any[]): Promise<any[]> {
  const ids = new Set<string>();
  posts.forEach((p: any) => {
    if (p.repost_of) ids.add(p.repost_of);
    if (p.quote_of) ids.add(p.quote_of);
  });
  if (ids.size === 0) return posts;

  const { data: originals } = await supabase
    .from('posts')
    .select(POST_WITH_PROFILE)
    .in('id', Array.from(ids));

  const map = new Map((originals ?? []).map((p: any) => [p.id, p]));

  return posts.map((p: any) => ({
    ...p,
    repost_post: p.repost_of ? (map.get(p.repost_of) ?? null) : null,
    quote_post: p.quote_of ? (map.get(p.quote_of) ?? null) : null,
  }));
}

export async function getPostLikers(postId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('post_likes')
    .select(`profiles!post_likes_user_id_fkey(${PROFILE_MINI_COLUMNS})`)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data?.map((l: any) => l.profiles).filter(Boolean) ?? [];
}

export async function getSavedPostIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('post_saves').select('post_id').eq('user_id', userId).limit(500).order('created_at', { ascending: false });
  return data?.map((r: any) => r.post_id) ?? [];
}

export async function getSavedPosts(userId: string, limit = 60, offset = 0) {
  const { data, error } = await supabase
    .from('post_saves')
    .select(`post_id, posts(${POST_WITH_PROFILE})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data?.map((r: any) => r.posts).filter(Boolean) ?? [];
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
    .select(`*, ${COMMENT_PROFILE_EMBED('post_comments_user_id_fkey')}`, { count: 'exact' })
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
      .select(`*, ${COMMENT_PROFILE_EMBED('post_comments_user_id_fkey')}`)
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
  assertUuid(postId, 'Post ID');
  if (parentId) assertUuid(parentId, 'Parent comment ID');
  const safeText = requireText(cleanUserText(text, 'comment'), 'Comment');
  
  // Try inserting with parent_id, fallback if column doesn't exist
  let res: any;
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, text: safeText, parent_id: parentId })
    .select(`*, ${COMMENT_PROFILE_EMBED('post_comments_user_id_fkey')}`)
    .single();
  
  if (error) {
    // If parent_id doesn't exist or schema cache is stale, try without it
    const isColumnError = error.message?.includes('parent_id') || 
                         error.message?.includes('schema cache') || 
                         error.code === 'PGRST205';

    if (isColumnError) {
      const { data: d2, error: e2 } = await supabase
        .from('post_comments')
        .insert({ post_id: postId, user_id: userId, text: safeText })
        .select(`*, ${COMMENT_PROFILE_EMBED('post_comments_user_id_fkey')}`)
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
      const preview = text.substring(0, 40) + (text.length > 40 ? '…' : '');
      const notifText = parentId
        ? `💬 replied: "${preview}"`
        : `💬 commented: "${preview}"`;
      await createNotification({
        user_id: post.user_id,
        actor_id: userId,
        type: 'comment',
        post_id: postId,
        comment_id: res.id,
        text: notifText
      });
      sendPushToUser(post.user_id, 'New comment', notifText, {
        type: 'comment', postId, commentId: res.id, userId, channelId: 'social',
      }, post.media_urls?.[0] ?? undefined, actorAvatar, 'post_comment').catch(() => {});
    }
  } catch (e) {}

  // 2. Parse Mentions (@username)
  // [Ama Mensah - Lead Dev] Use Promise.allSettled — forEach+async swallows errors and gives no await
  const mentions = safeText.match(/@(\w+)/g);
  if (mentions) {
    const uniqueUsernames = Array.from(new Set(mentions.map(m => m.substring(1))));
    await Promise.allSettled(uniqueUsernames.map(async (uname) => {
      try {
        const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', uname).single();
        if (targetProfile && targetProfile.id !== userId) {
          const preview = text.substring(0, 40) + (text.length > 40 ? '…' : '');
          const mentionText = `💬 mentioned you: "${preview}"`;
          await createNotification({
            user_id: targetProfile.id,
            actor_id: userId,
            type: 'mention',
            post_id: postId,
            comment_id: res.id,
            text: mentionText
          });
          sendPushToUser(targetProfile.id, 'New mention', mentionText, {
            type: 'mention', postId, commentId: res.id, userId, channelId: 'social',
          }, undefined, actorAvatar, 'post_comment').catch(() => {});
        }
      } catch (e) {}
    }));
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
    .select(POST_WITH_PROFILE)
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
    .select(POST_WITH_PROFILE)
    .ilike('caption', `%${safe}%`)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function reportContent(
  reporterId: string,
  targetType: 'post' | 'user' | 'member' | 'reel' | 'market_item',
  targetId: string,
  reason: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== reporterId) throw new Error('Unauthorized');
  assertUuid(reporterId, 'Reporter ID');
  assertUuid(targetId, 'Target ID');
  const safeReason = requireText(cleanUserText(reason, 'reportReason'), 'Report reason');
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    // The reports table / admin UI use 'member' for people ('user' was a historic mismatch)
    target_type: targetType === 'user' ? 'member' : targetType,
    target_id: targetId,
    reason: safeReason,
  });
  // If reports table doesn't exist yet, fail silently
  if (error && !error.message.includes('does not exist')) throw error;
}
