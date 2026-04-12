import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { uploadFile } from './upload';

export async function getReels(limit = 20, offset = 0) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // 1. Get blocked users to hide their content
  let blockedIds: string[] = [];
  if (userId) {
    try {
      const { getBlockedUserIds } = require('./profiles');
      blockedIds = await getBlockedUserIds(userId);
    } catch (err) {
      console.warn('Failed to fetch blocked IDs for reels filtering', err);
    }
  }

  const { data, error } = await supabase
    .from('reels')
    .select(`*, profiles!reels_user_id_fkey(*)`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const results = data ?? [];
  if (results.length === 0) return [];

  // 2. Batch check for moderated content
  const reelIds = results.map(r => r.id);
  const { data: reportsData } = await supabase
    .from('reports')
    .select('target_id')
    .in('target_id', reelIds)
    .eq('status', 'pending');
  
  const reportCounts: Record<string, number> = {};
  (reportsData || []).forEach(r => {
    reportCounts[r.target_id] = (reportCounts[r.target_id] || 0) + 1;
  });

  // 3. Filtering
  const filtered = results.filter(reel => {
    // Skip if author is blocked
    if (blockedIds.includes(reel.user_id)) return false;

    // Skip if content is moderated (threshold met: >= 5 reports)
    if ((reportCounts[reel.id] || 0) >= 5) return false;

    return true;
  });

  return filtered;
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
  const tExt = thumbnailUri?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const thumbPath = `${userId}/${Date.now()}_thumb.${tExt}`;

  const [video_url, thumbnail_url] = await Promise.all([
    uploadFile('videos', videoPath, videoUri, `video/${ext}`),
    thumbnailUri ? uploadFile('reel-thumbnails', thumbPath, thumbnailUri) : Promise.resolve(undefined)
  ]);

  const { data, error } = await supabase
    .from('reels')
    .insert({ user_id: userId, video_url, thumbnail_url, caption, song })
    .select(`*, profiles!reels_user_id_fkey(*)`)
    .single();
  if (error) throw error;

  // Handle mentions in reel caption
  const mentions = caption.match(/@(\w+)/g);
  if (mentions) {
    const { createNotification } = require('./notifications');
    const { sendPushToUser } = require('./pushNotifications');
    const uniqueUsernames = Array.from(new Set(mentions.map(m => m.substring(1))));
    uniqueUsernames.forEach(async (uname) => {
      try {
        const { data: target } = await supabase.from('profiles').select('id').eq('username', uname).single();
        if (target && target.id !== userId) {
          await createNotification({ user_id: target.id, actor_id: userId, type: 'mention', text: `mentioned you in a reel: "${caption.substring(0, 20)}..."` });
          sendPushToUser(target.id, 'New Mention', `@${data.profiles.username} mentioned you in a reel`).catch(() => {});
        }
      } catch {}
    });
  }

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

export async function getReelComments(reelId: string, currentUserId?: string) {
  const { data, error } = await supabase
    .from('reel_comments')
    .select(`*, profiles!reel_comments_user_id_fkey(*)`)
    .eq('reel_id', reelId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const comments = data ?? [];

  if (!currentUserId || comments.length === 0) return comments;

  // Batch-fetch which reel comments the current user has liked
  const ids = comments.map((c: any) => c.id);
  const { data: liked } = await supabase
    .from('reel_comment_likes')
    .select('comment_id')
    .eq('user_id', currentUserId)
    .in('comment_id', ids);

  const likedSet = new Set((liked ?? []).map((r: any) => r.comment_id));
  return comments.map((c: any) => ({ ...c, isLiked: likedSet.has(c.id) }));
}

export async function addReelComment(reelId: string, userId: string, text: string, parentId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  
  let res: any;
  const { data, error } = await supabase
    .from('reel_comments')
    .insert({ reel_id: reelId, user_id: userId, text, parent_id: parentId })
    .select(`*, profiles!reel_comments_user_id_fkey(*)`)
    .single();
  
  if (error) {
    const isColumnError = error.message?.includes('parent_id') || 
                         error.message?.includes('schema cache') || 
                         error.code === 'PGRST205';
    if (isColumnError) {
      const { data: d2, error: e2 } = await supabase
        .from('reel_comments')
        .insert({ reel_id: reelId, user_id: userId, text })
        .select(`*, profiles!reel_comments_user_id_fkey(*)`)
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
          sendPushToUser(target.id, 'New Mention', `@${res.profiles.username} mentioned you in a reel comment`).catch(() => {});
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
