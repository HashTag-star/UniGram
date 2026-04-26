import { supabase } from '../lib/supabase';
import { getUserInterests } from './onboarding';
import { INTERESTS } from '../data/interests';
import { Cache, TTL } from '../lib/cache';

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
  // 1. Get blocked users to hide their content
  let blockedIds: string[] = [];
  try {
    const { getBlockedUserIds } = require('./profiles');
    blockedIds = await getBlockedUserIds(userId);
  } catch (err) {
    console.warn('Failed to fetch blocked IDs for feed filtering', err);
  }

  const { data, error } = await supabase.rpc('get_hybrid_campus_feed', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  let results = data ?? [];

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
    results = fallback ?? [];
  }

  if (results.length === 0) return [];

  // 2. Batch check for moderated content to avoid N+1 queries
  const postIds = results.map((p: any) => p.id);
  const { data: reportsData } = await supabase
    .from('reports')
    .select('target_id')
    .in('target_id', postIds)
    .eq('status', 'pending');
  
  const reportCounts: Record<string, number> = {};
  (reportsData || []).forEach(r => {
    reportCounts[r.target_id] = (reportCounts[r.target_id] || 0) + 1;
  });

  // 3. Client-side filtering + soft-hide annotation (Final safety layer)
  const HARD_HIDE_THRESHOLD = 10;  // full removal
  const SOFT_HIDE_THRESHOLD = 5;   // blurred with warning, user can reveal

  const filtered = results
    .filter((post: any) => {
      if (blockedIds.includes(post.user_id)) return false;
      if ((reportCounts[post.id] || 0) >= HARD_HIDE_THRESHOLD) return false;
      return true;
    })
    .map((post: any) => ({
      ...post,
      profiles: typeof post.profiles === 'string' ? JSON.parse(post.profiles) : post.profiles,
      // Flag posts between soft and hard threshold — UI shows blurred overlay
      is_flagged: (reportCounts[post.id] || 0) >= SOFT_HIDE_THRESHOLD,
      report_count: reportCounts[post.id] || 0,
    }));

  return filtered;
}


export async function recordImpression(postId: string, userId: string) {
  try {
    await supabase
      .from('post_impressions')
      .upsert({ post_id: postId, user_id: userId });
  } catch (err) {
    // Ignore engagement tracking failure
    console.warn('Impression log failed', err);
  }
}

export async function recordProfileView(actorId: string, targetId: string) {
  if (actorId === targetId) return;
  try {
    await supabase.rpc('update_rel_strength', {
      p_actor: actorId,
      p_target: targetId,
      p_delta: 1.0,
    });
  } catch (err) {
    // Ignore engagement tracking failure
  }
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
  // Full watch = +2pts (per hybrid algorithm design), partial proportional
  const delta = pct >= 0.8 ? 2.0 : pct * 2.0;

  try {
    await supabase.rpc('update_rel_strength', {
      p_actor: viewerId,
      p_target: authorId,
      p_delta: delta,
    });
  } catch (err) {
    // Ignore engagement tracking failure
  }
}

// ─── Explore ──────────────────────────────────────────────────────────────────

/**
 * Personalized explore grid. Tries the server-side get_explore_posts RPC
 * first, falls back to a client-side interest+engagement scored query.
 */
export async function getPersonalizedExplorePosts(userId: string, limit = 24, offset = 0) {
  const cacheKey = `explore_posts:${userId}:${limit}:${offset}`;

  // Return memory-cached data immediately (0ms) if still fresh
  const memHit = Cache.getSync<any[]>(cacheKey, TTL.explore);
  if (memHit) return memHit;

  // Check AsyncStorage (~5ms) for data persisted from the last session
  const asyncHit = await Cache.get<any[]>(cacheKey, TTL.explore);
  if (asyncHit) return asyncHit;

  // 1. Fetch user interests required for AI Search
  const interests = await getUserInterests(userId).catch(() => [] as string[]);
  const interestKeywords = interests
    .map(id => INTERESTS.find(i => i.id === id)?.label?.toLowerCase())
    .filter(Boolean) as string[];

  // 2. Call the new Edge Function for pgvector Semantic Search
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-explore-feed', {
      body: { 
        userId, 
        keywords: interestKeywords.join(' '),
        limit,
        match_threshold: 0.1 // lenient threshold to ensure we get results
      }
    });

    if (!edgeError && edgeData?.posts?.length > 0) {
      const result = edgeData.posts.map((row: any) => ({
        ...row,
        profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles,
      }));
      Cache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Vector Edge Function failed, falling back to legacy explore:', err);
  }

  // 3. Fallback to existing server/client hybrid approach
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_explore_posts', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (!rpcError && rpcData?.length) {
    const result = rpcData.map((row: any) => ({
      ...row,
      profiles: typeof row.profiles === 'string' ? JSON.parse(row.profiles) : row.profiles,
    }));
    Cache.set(cacheKey, result);
    return result;
  }

  // Client-side final fallback
  const legacyResult = await _legacyGetExplorePosts(userId, limit, offset, interestKeywords);
  if (legacyResult.length) Cache.set(cacheKey, legacyResult);
  return legacyResult;
}

// Extracted legacy function to keep getPersonalizedExplorePosts clean
async function _legacyGetExplorePosts(userId: string, limit: number, offset: number, interestKeywords: string[]) {
  const profileResult = await supabase.from('profiles').select('university').eq('id', userId).single();
  const userUniversity = profileResult.data?.university ?? null;
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
 * Multi-factor follow suggestions. Powered by the get_suggested_users DB RPC 
 * (Mutual Friends & Same University graph mapping).
 */
export async function getFollowSuggestions(userId: string, limit = 10) {
  const cacheKey = `follow_suggestions:${userId}:${limit}`;

  const memHit = Cache.getSync<any[]>(cacheKey, TTL.discover);
  if (memHit) return memHit;

  const asyncHit = await Cache.get<any[]>(cacheKey, TTL.discover);
  if (asyncHit) return asyncHit;

  // 1. Get blocked users to hide them from suggestions
  let blockedIds: string[] = [];
  try {
    const { getBlockedUserIds } = require('./profiles');
    blockedIds = await getBlockedUserIds(userId);
  } catch (err) {
    console.warn('Failed to fetch blocked IDs for suggestion filtering', err);
  }

  // 2. Fetch directly from robust RPC written in advanced algorithm migration
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_suggested_users', {
    p_user_id: userId,
    p_limit: limit,
  });
  
  if (!rpcError && rpcData?.length) {
    return rpcData
      .filter((u: any) => !blockedIds.includes(u.id))
      .map((u: any) => ({
        ...u,
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

  // Friends-of-friends: who the people I follow also follow, AND who follows them.
  // Both directions surface relevant connections from my existing graph.
  const myFollowIds = [...followingSet].filter(id => id !== userId).slice(0, 30);
  const fofMap = new Map<string, number>();

  if (myFollowIds.length > 0) {
    const [fofFollowing, fofFollowers] = await Promise.all([
      // Who the people I follow also follow
      supabase.from('follows').select('following_id').in('follower_id', myFollowIds),
      // Who follows the people I follow
      supabase.from('follows').select('follower_id').in('following_id', myFollowIds),
    ]);

    (fofFollowing.data ?? []).forEach((r: any) => {
      if (!followingSet.has(r.following_id)) {
        fofMap.set(r.following_id, (fofMap.get(r.following_id) ?? 0) + 1);
      }
    });
    (fofFollowers.data ?? []).forEach((r: any) => {
      if (!followingSet.has(r.follower_id)) {
        // Weight slightly lower than mutual follows to keep the ranking sensible
        fofMap.set(r.follower_id, (fofMap.get(r.follower_id) ?? 0) + 0.5);
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
      if (!seen.has(u.id) && !followingSet.has(u.id) && !blockedIds.includes(u.id)) {
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

// ─── Reels ────────────────────────────────────────────────────────────────────

/**
 * Personalized reels feed scored by recency, engagement, following relationship,
 * and user interests. Replaces the raw chronological getReels query.
 */
export async function getPersonalizedReels(userId: string, limit = 20, offset = 0) {
  let blockedIds: string[] = [];
  try {
    const { getBlockedUserIds } = require('./profiles');
    blockedIds = await getBlockedUserIds(userId);
  } catch {}

  const [reelsResult, followingResult, interests, feedbackResult] = await Promise.all([
    supabase
      .from('reels')
      .select('*, profiles!reels_user_id_fkey(*)')
      .order('created_at', { ascending: false })
      .range(0, limit * 3 - 1),
    supabase.from('follows').select('following_id').eq('follower_id', userId),
    getUserInterests(userId).catch(() => [] as string[]),
    supabase
      .from('user_feedback')
      .select('target_id, author_id, feedback_type')
      .eq('user_id', userId)
      .eq('target_type', 'reel'),
  ]);

  const reels = reelsResult.data ?? [];
  if (!reels.length) return [];

  const followingSet = new Set((followingResult.data ?? []).map((f: any) => f.following_id));
  const interestKeywords = interests
    .map((id: string) => INTERESTS.find(i => i.id === id)?.label?.toLowerCase())
    .filter(Boolean) as string[];

  // Build not-interested sets from user feedback
  const notInterestedIds = new Set<string>();
  const authorDislikeCount: Record<string, number> = {};
  (feedbackResult.data ?? []).forEach((f: any) => {
    if (f.feedback_type === 'not_interested') {
      notInterestedIds.add(f.target_id);
      if (f.author_id) authorDislikeCount[f.author_id] = (authorDislikeCount[f.author_id] ?? 0) + 1;
    }
  });

  // Batch report check
  const { data: reportsData } = await supabase
    .from('reports')
    .select('target_id')
    .in('target_id', reels.map(r => r.id))
    .eq('status', 'pending');
  const reportCounts: Record<string, number> = {};
  (reportsData ?? []).forEach((r: any) => {
    reportCounts[r.target_id] = (reportCounts[r.target_id] ?? 0) + 1;
  });

  const now = Date.now();
  const scored = reels
    .filter((r: any) =>
      !blockedIds.includes(r.user_id) &&
      !notInterestedIds.has(r.id) &&
      (reportCounts[r.id] ?? 0) < 5
    )
    .map((r: any) => {
      const hoursOld = (now - new Date(r.created_at).getTime()) / 3_600_000;
      const recency = Math.exp(-hoursOld / 48) * 30;
      const engagement =
        (r.likes_count ?? 0) * 0.4 +
        (r.comments_count ?? 0) * 2.0 +
        (r.views_count ?? 0) * 0.02;
      const followingBonus = followingSet.has(r.user_id) ? 50 : 0;
      const caption = (r.caption ?? '').toLowerCase();
      const interestBonus = interestKeywords.some((kw: string) => caption.includes(kw)) ? 20 : 0;
      const dislikePenalty = (authorDislikeCount[r.user_id] ?? 0) * 15;
      return { ...r, _score: recency + engagement + followingBonus + interestBonus - dislikePenalty };
    });

  return scored
    .sort((a: any, b: any) => b._score - a._score)
    .slice(offset, offset + limit)
    .map(({ _score, ...r }: any) => r);
}

/**
 * Records user feedback on a piece of content.
 * 'not_interested' hides that item and down-ranks the author in future feeds.
 */
export async function recordContentFeedback(
  userId: string,
  targetId: string,
  targetType: 'post' | 'reel',
  feedbackType: 'not_interested' | 'interested',
  authorId?: string,
) {
  await supabase.from('user_feedback').upsert(
    { user_id: userId, target_id: targetId, target_type: targetType, feedback_type: feedbackType, author_id: authorId ?? null },
    { onConflict: 'user_id,target_id,feedback_type' },
  );
}

// ─── Trending ─────────────────────────────────────────────────────────────────

/**
 * Gets trending hashtags by extracting them from recent posts.
 * Prioritizes tags from the user's university if provided.
 */
export async function getTrendingHashtags(limit = 10, userId?: string) {
  try {
    let university: string | null = null;
    if (userId) {
      const { data: prof } = await supabase.from('profiles').select('university').eq('id', userId).single();
      university = prof?.university ?? null;
    }

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    // Fetch recent posts with profile university
    let query = supabase
      .from('posts')
      .select('caption, profiles!posts_user_id_fkey(university)')
      .gte('created_at', threeDaysAgo)
      .not('caption', 'is', null)
      .limit(200);

    const { data: posts, error } = await query;
    if (error || !posts) return [];

    const tagCounts: Record<string, number> = {};
    const uniTagCounts: Record<string, number> = {};

    posts.forEach(p => {
      const tags = p.caption?.match(/#\w+/g) || [];
      const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      const isMyUni = university && profile?.university === university;
      
      tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        if (isMyUni) {
          uniTagCounts[tag] = (uniTagCounts[tag] || 0) + 2; // Weight uni tags higher
        }
      });
    });

    // Merge and sort
    const allTags = Object.keys(tagCounts).map(tag => ({
      tag,
      post_count: tagCounts[tag],
      score: (tagCounts[tag] || 0) + (uniTagCounts[tag] || 0)
    }));

    const sortedTags = allTags.sort((a, b) => b.score - a.score).slice(0, limit);
    
    // If we have tags, return them. Otherwise return empty [] to let UI handle fallback.
    return sortedTags.length > 0 ? sortedTags : [];
  } catch (err) {
    console.warn('Trending tags error:', err);
    return [];
  }
}
