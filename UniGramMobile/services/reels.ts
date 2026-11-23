import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { uploadFile, assertVideoWithinLimits } from './upload';
import { Cache, TTL } from '../lib/cache';

/** Columns the Reels UI reads (no select('*')). */
export const REEL_COLUMNS = 'id, user_id, video_url, thumbnail_url, caption, song, likes_count, comments_count, views_count, created_at';
const REEL_PROFILE = 'id, username, full_name, avatar_url, is_verified, verification_type, university, major, is_pro, pro_disabled, pro_expires_at';
const REEL_WITH_PROFILE = `${REEL_COLUMNS}, profiles!reels_user_id_fkey(${REEL_PROFILE})`;

export async function getReels(limit = 20, offset = 0) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  // User-scoped key: blocked-user filtering differs per account.
  const cacheKey = `reels:feed:${userId ?? 'anon'}:${limit}:${offset}`;
  const rows = await Cache.getOrFetch<any[]>(cacheKey, TTL.reels, async () => {
    // 1. Blocked users (throws on failure → nothing unfiltered is ever cached)
    let blockedIds: string[] = [];
    if (userId) {
      const { getBlockedUserIds } = require('./profiles');
      blockedIds = await getBlockedUserIds();
      try { blockedIds = Array.from(new Set([...blockedIds, ...(await require('./mutes').getMutedIds())])); } catch {}
    }

    const { data, error } = await supabase
      .from('reels')
      .select(REEL_WITH_PROFILE)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const results = data ?? [];
    if (results.length === 0) return [];

    // 2. Batch check for moderated content
    const reelIds = results.map((r: any) => r.id);
    const { data: reportsData } = await supabase
      .from('reports')
      .select('target_id')
      .in('target_id', reelIds)
      .eq('status', 'pending');

    const reportCounts: Record<string, number> = {};
    (reportsData || []).forEach((r: any) => {
      reportCounts[r.target_id] = (reportCounts[r.target_id] || 0) + 1;
    });

    // 3. Filtering
    const blockedSet = new Set(blockedIds);
    return results.filter((reel: any) => {
      if (blockedSet.has(reel.user_id)) return false;
      if ((reportCounts[reel.id] || 0) >= 5) return false;
      return true;
    });
  });
  return rows ?? [];
}


export const USER_REELS_PAGE = 60;

/** Paged: up to `limit` reels from `offset` (newest first). */
export async function getUserReels(userId: string, limit = USER_REELS_PAGE, offset = 0) {
  const { data, error } = await supabase
    .from('reels')
    .select(REEL_WITH_PROFILE)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
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
  await assertVideoWithinLimits(videoUri);

  const ext = videoUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'mp4';
  const stamp = Date.now();
  const videoPath = `${userId}/${stamp}.${ext}`;
  const tExt = thumbnailUri?.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const thumbPath = `${userId}/${stamp}_thumb.${tExt}`;

  // Sequential: the video is the big one — don't compete with the thumbnail for bandwidth/RAM.
  const video_url = await uploadFile('videos', videoPath, videoUri, `video/${ext === 'mov' ? 'quicktime' : ext}`);
  const thumbnail_url = thumbnailUri ? await uploadFile('reel-thumbnails', thumbPath, thumbnailUri) : undefined;

  const { data, error } = await supabase
    .from('reels')
    .insert({ user_id: userId, video_url, thumbnail_url, caption, song })
    .select(REEL_WITH_PROFILE)
    .single();
  if (error) throw error;

  // Handle mentions in reel caption (single batched lookup, fire-and-forget)
  const mentions = caption.match(/@(\w+)/g);
  if (mentions) {
    const { createNotification } = require('./notifications');
    const { sendPushToUser } = require('./pushNotifications');
    const uniqueUsernames = Array.from(new Set(mentions.map(m => m.substring(1)))).slice(0, 10);
    (async () => {
      try {
        const { data: targets } = await supabase.from('profiles').select('id').in('username', uniqueUsernames);
        for (const target of targets ?? []) {
          if (target.id === userId) continue;
          await createNotification({ user_id: target.id, actor_id: userId, type: 'mention', text: `mentioned you in a reel: "${caption.substring(0, 20)}..."` });
          sendPushToUser(target.id, 'New mention', `@${(data as any).profiles?.username ?? 'someone'} mentioned you in a reel`).catch(() => {});
        }
      } catch {}
    })();
  }

  // Bust reels cache so feed/reels consumers see the new reel
  try { Cache.invalidatePattern('reels:'); } catch (e) {}

  return data;
}

// Invalidate reels cache on creations so users see new reels without long TTL waits
export async function invalidateReelsCache() {
  try { Cache.invalidatePattern('reels:'); } catch (e) {}
}

export async function likeReel(reelId: string, userId: string) {
  const { error } = await supabase.from('reel_likes').upsert({ reel_id: reelId, user_id: userId }, { onConflict: 'reel_id,user_id' });
  if (error) throw error;
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
  const { data } = await supabase.from('reel_likes').select('reel_id').eq('user_id', userId).limit(500).order('created_at', { ascending: false });
  return data?.map((r: any) => r.reel_id) ?? [];
}

export const REEL_COMMENTS_PAGE_SIZE = 20;

export async function getReelComments(
  reelId: string,
  currentUserId?: string,
  page = 0,
): Promise<{ items: any[]; hasMore: boolean; total: number }> {
  const from = page * REEL_COMMENTS_PAGE_SIZE;
  // range() is inclusive on both ends — fetches PAGE_SIZE+1 rows to detect hasMore
  const to = from + REEL_COMMENTS_PAGE_SIZE;

  // 1. Page of root-level comments + total count in one query
  const { data: roots, count, error } = await supabase
    .from('reel_comments')
    .select(`*, profiles!reel_comments_user_id_fkey(${REEL_PROFILE})`, { count: 'exact' })
    .eq('reel_id', reelId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .range(from, to);
  if (error) throw error;

  const hasMore = (roots ?? []).length > REEL_COMMENTS_PAGE_SIZE;
  const rootPage = (roots ?? []).slice(0, REEL_COMMENTS_PAGE_SIZE);
  const total = count ?? 0;
  if (rootPage.length === 0) return { items: [], hasMore: false, total };

  const rootIds = rootPage.map((c: any) => c.id);

  // 2. Parallel: replies + root-comment likes at the same time
  const [repliesResult, rootLikedResult] = await Promise.all([
    supabase
      .from('reel_comments')
      .select(`*, profiles!reel_comments_user_id_fkey(${REEL_PROFILE})`)
      .eq('reel_id', reelId)
      .in('parent_id', rootIds)
      .order('created_at', { ascending: true }),
    currentUserId
      ? supabase
          .from('reel_comment_likes')
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
      .from('reel_comment_likes')
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

export async function addReelComment(reelId: string, userId: string, text: string, parentId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const { cleanUserText } = require('../lib/contentSafety');
  const sanitized = cleanUserText(text, 'comment');

  let res: any;
  const { data, error } = await supabase
    .from('reel_comments')
    .insert({ reel_id: reelId, user_id: userId, text: sanitized, parent_id: parentId })
    .select(`*, profiles!reel_comments_user_id_fkey(${REEL_PROFILE})`)
    .single();
  
  if (error) {
    const isColumnError = error.message?.includes('parent_id') || 
                         error.message?.includes('schema cache') || 
                         error.code === 'PGRST205';
    if (isColumnError) {
      const { data: d2, error: e2 } = await supabase
        .from('reel_comments')
        .insert({ reel_id: reelId, user_id: userId, text })
        .select(`*, profiles!reel_comments_user_id_fkey(${REEL_PROFILE})`)
        .single();
      if (e2) throw e2;
      res = d2;
    } else {
      throw error;
    }
  } else {
    res = data;
  }

  // Mention logic for reel comments
  const mentions = text.match(/@(\w+)/g);
  if (mentions) {
    const { createNotification } = require('./notifications');
    const { sendPushToUser } = require('./pushNotifications');
    const uniqueUsernames = Array.from(new Set(mentions.map(m => m.substring(1))));
    uniqueUsernames.forEach(async (uname) => {
      try {
        const { data: target } = await supabase.from('profiles').select('id').eq('username', uname).single();
        if (target && target.id !== userId) {
          await createNotification({ user_id: target.id, actor_id: userId, type: 'mention', text: `mentioned you in a reel comment: "${text.substring(0, 20)}..."` });
          sendPushToUser(target.id, 'New mention', `@${res.profiles.username} mentioned you in a reel comment`).catch(() => {});
        }
      } catch {}
    });
  }

  return res;
}

export async function deleteReelComment(commentId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { error } = await supabase.from('reel_comments').delete().eq('id', commentId).eq('user_id', userId);
  if (error) throw error;
}

export async function likeReelComment(commentId: string, userId: string) {
  const { error } = await supabase.from('reel_comment_likes').insert({ comment_id: commentId, user_id: userId });
  if (error && !error.message?.includes('duplicate')) throw error;
}

export async function unlikeReelComment(commentId: string, userId: string) {
  const { error } = await supabase.from('reel_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  if (error) throw error;
}

export async function incrementReelView(reelId: string): Promise<void> {
  // Atomic server-side increment (no read-modify-write race between concurrent viewers).
  try {
    const { error } = await supabase.rpc('increment_reel_views', { p_reel_id: reelId });
    if (!error) return;
  } catch { /* RPC missing → legacy path */ }

  const { data, error: readErr } = await supabase
    .from('reels')
    .select('views_count')
    .eq('id', reelId)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase
    .from('reels')
    .update({ views_count: (data?.views_count ?? 0) + 1 })
    .eq('id', reelId);
  if (error) throw error;
}

export async function deleteReel(reelId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // 1. Get reel data to find file paths
  const { data: reel, error: fetchError } = await supabase
    .from('reels')
    .select('video_url, thumbnail_url')
    .eq('id', reelId)
    .eq('user_id', userId)
    .single();
  
  if (fetchError || !reel) throw new Error('Reel not found or unauthorized');

  // 2. Delete associated files from storage
  if (reel.video_url) {
    const videoPath = reel.video_url.split('/').slice(-2).join('/');
    await supabase.storage.from('videos').remove([videoPath]).catch(console.warn);
  }
  if (reel.thumbnail_url) {
    const thumbPath = reel.thumbnail_url.split('/').slice(-2).join('/');
    await supabase.storage.from('reel-thumbnails').remove([thumbPath]).catch(console.warn);
  }

  // 3. Delete from database (reel_likes and reel_comments will be deleted via cascade if set up, otherwise we should delete them)
  // Assuming cascade is set up in Supabase schema. If not, we'd delete them here.
  const { error: deleteError } = await supabase
    .from('reels')
    .delete()
    .eq('id', reelId)
    .eq('user_id', userId);

  if (deleteError) throw deleteError;

  SocialSync.emit('REEL_DELETE', { targetId: reelId });
}
