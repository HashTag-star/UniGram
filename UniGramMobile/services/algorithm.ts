import { supabase } from '../lib/supabase';
import { getUserInterests } from './onboarding';
import { INTERESTS } from '../data/interests';

// ─── Engagement weights ────────────────────────────────────────────────────────
// Likes (+2), comments (+5), follows (+15), saves (+8) are handled automatically
// by DB triggers (trg_algo_post_like, trg_algo_post_comment, trg_algo_follow,
// trg_algo_post_save). Only signals WITHOUT a DB trigger need client-side calls.
//
// Client-side only:
//   share  (+6)  — no post_shares table, no trigger
//   watch  (proportional) — computed from video viewport time
//   profile_view (+1) — no trigger on profile reads

// ─── Feed ─────────────────────────────────────────────────────────────────────

export async function getPersonalizedFeed(userId: string, limit = 20, offset = 0) {
  const { data, error } = await supabase.rpc('get_personalized_feed', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    // Fallback: followed users' posts, most recent first
    console.warn('Feed RPC fallback:', error.message);
    const { data: fallback } = await supabase
      .from('posts')
      .select(`
        id, user_id, caption, type, media_url, media_urls,
        likes_count, comments_count, location, song, tagged_users, created_at,
        profiles!posts_user_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return fallback ?? [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles,
  }));
}

export async function recordImpression(postId: string, userId: string) {
  await supabase
    .from('post_impressions')
    .upsert({ post_id: postId, user_id: userId })
    .then(() => {}).catch(() => {});
}

export async function recordProfileView(actorId: string, targetId: string) {
  if (actorId === targetId) return;
  await supabase.rpc('update_rel_strength', {
    p_actor: actorId,
    p_target: targetId,
    p_delta: 1.0,
  }).then(() => {}).catch(() => {});
}

/**
 * Records a share signal (+6). Call this only for shares — likes, saves,
 * comments, and follows are already captured by server-side triggers and
 * should NOT be sent here (would double-count the score).
 */
export async function recordShare(postId: string, authorId: string, viewerId: string) {
  if (!authorId || !viewerId || viewerId === authorId) return;
  await Promise.allSettled([
    supabase.rpc('update_rel_strength', {
      p_actor: viewerId,
      p_target: authorId,
      p_delta: 6.0,
    }),
    supabase.rpc('increment_post_shares', { p_post_id: postId }),
  ]);
}

/**
 * Records video watch time as a relationship signal proportional to
 * completion rate. Fires when a video leaves the viewport.
 * Ignored if watched < 10% of the video.
 */
export async function recordVideoWatch(
  postId: string,
  authorId: string,
  viewerId: string,
  watchedMs: number,
  durationMs: number,
) {
  if (!durationMs || viewerId === authorId) return;
  const pct = watchedMs / durationMs;
  if (pct < 0.1) return;
  // Full watch = +3pts, partial proportional to completion
  const delta = pct >= 0.8 ? 3.0 : pct * 3.0;
  await supabase.rpc('update_rel_strength', {
    p_actor: viewerId,
    p_target: authorId,
    p_delta: delta,
  }).then(() => {}).catch(() => {});
}

// ─── Explore ──────────────────────────────────────────────────────────────────

/**
 * Personalized explore grid. Tries the server-side get_explore_posts RPC
 * first, falls back to a client-side interest+engagement scored query.
 */
export async function getPersonalizedExplorePosts(userId: string, limit = 24, offset = 0) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_explore_posts', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (!rpcError && rpcData?.length) {
    return rpcData.map((row: any) => ({
      ...row,
      profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles,
    }));
  }

  // Client-side fallback
  const [interests, profileResult] = await Promise.all([
    getUserInterests(userId).catch(() => [] as string[]),
    supabase.from('profiles').select('university').eq('id', userId).single(),
  ]);

  const userUniversity = profileResult.data?.university ?? null;
  const interestKeywords = interests
    .map(id => INTERESTS.find(i => i.id === id)?.label?.toLowerCase())
    .filter(Boolean) as string[];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id, user_id, caption, type, media_url, media_urls,
      likes_count, comments_count, saves_count, location, created_at,
      profiles!posts_user_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type, university)
    `)
    .neq('user_id', userId)
    .not('media_url', 'is', null)
    .gte('created_at', sevenDaysAgo)
    .order('saves_count', { ascending: false })
    .range(offset, offset + limit * 3 - 1);

  if (!posts?.length) return [];

  const scored = posts.map((post: any) => {
    const caption = (post.caption ?? '').toLowerCase();
    const interestBonus = interestKeywords.some(kw => caption.includes(kw)) ? 50 : 0;
    const uniBonus = userUniversity && post.profiles?.university === userUniversity ? 25 : 0;
    const engagementScore =
      (post.likes_count ?? 0) * 0.3 +
      (post.comments_count ?? 0) * 1.5 +
      (post.saves_count ?? 0) * 4.0;
    return { ...post, _score: engagementScore + interestBonus + uniBonus };
  });

  return scored.sort((a: any, b: any) => b._score - a._score).slice(0, limit);
}

// ─── Follow suggestions ───────────────────────────────────────────────────────

/**
 * Multi-factor follow suggestions. Tries get_suggested_users RPC first
 * (returns mutual_friends, common_interests, follows_me signals), then
 * falls back to a client-side friends-of-friends + same-university blend.
 *
 * Each returned profile includes a `reason` string for the UI
 * e.g. "3 mutual follows" · "Goes to your university" · "Follows you back"
 */
export async function getFollowSuggestions(userId: string, limit = 10): Promise<any[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_suggested_users', {
    p_user_id: userId,
    p_limit: limit,
  });
  if (!rpcError && rpcData?.length) {
    return rpcData.map((u: any) => ({
      ...u,
      // Normalise field name: RPC returns mutual_friends, UI uses mutual_follows
      mutual_follows: u.mutual_friends ?? 0,
      same_university: u.university != null,
      reason: _buildReason({
        mutual_follows: u.mutual_friends ?? 0,
        follows_me: u.follows_me ?? false,
        same_university: !!(u.university),
        followers_count: u.followers_count ?? 0,
      }),
    }));
  }

  // Client-side fallback
  const [profileResult, followingResult] = await Promise.all([
    supabase.from('profiles').select('university').eq('id', userId).single(),
    supabase.from('follows').select('following_id').eq('follower_id', userId),
  ]);

  const userUniversity = profileResult.data?.university ?? null;
  const followingSet = new Set<string>(
    (followingResult.data ?? []).map((f: any) => f.following_id),
  );
  followingSet.add(userId);

  // Friends-of-friends
  const myFollowIds = [...followingSet].filter(id => id !== userId).slice(0, 30);
  const fofMap = new Map<string, number>();

  if (myFollowIds.length > 0) {
    const { data: fofRows } = await supabase
      .from('follows')
      .select('following_id')
      .in('follower_id', myFollowIds);

    (fofRows ?? []).forEach((r: any) => {
      if (!followingSet.has(r.following_id)) {
        fofMap.set(r.following_id, (fofMap.get(r.following_id) ?? 0) + 1);
      }
    });
  }

  // Candidate pool: same-university + popular
  const pools = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified, verification_type, university, followers_count')
      .order('followers_count', { ascending: false })
      .limit(50)
      .then(r => r.data ?? []),
    userUniversity
      ? supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, verification_type, university, followers_count')
          .eq('university', userUniversity)
          .order('followers_count', { ascending: false })
          .limit(30)
          .then(r => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const candidates: any[] = [];

  for (const pool of pools) {
    for (const u of pool) {
      if (!seen.has(u.id) && !followingSet.has(u.id)) {
        seen.add(u.id);
        const mutualFollows = fofMap.get(u.id) ?? 0;
        const sameUniversity = !!(userUniversity && u.university === userUniversity);
        candidates.push({
          ...u,
          mutual_follows: mutualFollows,
          same_university: sameUniversity,
          follows_me: false,
          _score:
            mutualFollows * 20 +
            (sameUniversity ? 15 : 0) +
            Math.log1p(u.followers_count ?? 0),
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(u => ({ ...u, reason: _buildReason(u) }));
}

function _buildReason(u: {
  mutual_follows: number;
  follows_me: boolean;
  same_university: boolean;
  followers_count: number;
}): string {
  if (u.follows_me) return 'Follows you';
  if (u.mutual_follows > 0) {
    return u.mutual_follows === 1 ? '1 mutual follow' : `${u.mutual_follows} mutual follows`;
  }
  if (u.same_university) return 'Goes to your university';
  if (u.followers_count > 500) return 'Popular on UniGram';
  return 'Suggested for you';
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export async function getTrendingHashtags(limit = 10) {
  const { data, error } = await supabase.rpc('get_trending_hashtags', { p_limit: limit });
  if (error) return [];
  return data ?? [];
}
