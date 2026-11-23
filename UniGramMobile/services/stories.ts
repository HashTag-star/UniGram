import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import { Cache, TTL } from '../lib/cache';
import { notifyFollowers } from './posts';
import { PROFILE_MINI_COLUMNS } from './profiles';

const STORY_WITH_PROFILE = `*, profiles!stories_user_id_fkey(${PROFILE_MINI_COLUMNS})`;
const STORIES_FOLLOWED_LIMIT = 150;
const STORIES_CAMPUS_LIMIT = 100;

export async function getActiveStories() {
  // Per-user key: story visibility (followed users / own campus / blocks) differs per account.
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? 'anon';
  const key = `stories:active:${uid}`;
  const rows = await Cache.getOrFetch<any[]>(key, TTL.stories, async () => {
    const nowISO = new Date().toISOString();

    // 1. Followed users + me first (what the tray is really for)…
    let followedIds: string[] = [];
    let university: string | null = null;
    if (user) {
      const [f, prof] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).limit(500),
        require('./profiles').getProfile(user.id).catch(() => null),
      ]);
      followedIds = (f.data ?? []).map((r: any) => r.following_id);
      followedIds.push(user.id);
      university = prof?.university ?? null;
    }

    const followedQ = followedIds.length
      ? supabase.from('stories').select(STORY_WITH_PROFILE)
          .in('user_id', followedIds)
          .gt('expires_at', nowISO)
          .order('created_at', { ascending: false })
          .limit(STORIES_FOLLOWED_LIMIT)
      : Promise.resolve({ data: [] as any[], error: null as any });

    // 2. …topped up with stories from my campus (server-side filtered, capped).
    const campusQ = university
      ? supabase.from('stories')
          .select(`*, profiles!stories_user_id_fkey!inner(${PROFILE_MINI_COLUMNS})`)
          .eq('profiles.university', university)
          .gt('expires_at', nowISO)
          .order('created_at', { ascending: false })
          .limit(STORIES_CAMPUS_LIMIT)
      : supabase.from('stories').select(STORY_WITH_PROFILE)
          .gt('expires_at', nowISO)
          .order('created_at', { ascending: false })
          .limit(60);

    const [followedRes, campusRes] = await Promise.all([followedQ, campusQ]);
    if (followedRes.error && campusRes.error) throw followedRes.error;

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const s of [...(followedRes.data ?? []), ...(campusRes.data ?? [])]) {
      if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
    }
    merged.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

    // Group by user
    const grouped: Record<string, { profile: any; stories: any[] }> = {};
    for (const story of merged) {
      const uid2 = story.user_id;
      if (!story.profiles?.id) continue; // skip orphaned stories from deleted users
      if (!grouped[uid2]) grouped[uid2] = { profile: story.profiles, stories: [] };
      grouped[uid2].stories.push(story);
    }
    return Object.values(grouped);
  });
  return rows ?? [];
}

export async function getUserStories(userId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select(`*`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function createStory(userId: string, mediaUri: string, caption?: string, linkUrl?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const ext = mediaUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const media_url = await uploadFile('post-media', path, mediaUri);

  const { data, error } = await supabase
    .from('stories')
    .insert({ user_id: userId, media_url, caption, link_url: linkUrl ?? null })
    .select(STORY_WITH_PROFILE)
    .single();
  if (error) throw error;

  // Followers fan-out happens server-side (RPC) or as a small batched fallback — never awaited.
  notifyFollowers({
    actorId: userId,
    type: 'new_story',
    storyId: data.id,
    title: 'New story',
    body: '✨ added a new story',
    imageUrl: media_url,
    avatarUrl: data.profiles?.avatar_url ?? undefined,
  }).catch(() => {});

  // Bust active stories cache so followers see the new story quickly
  try { Cache.invalidatePattern(`stories:active`); } catch (e) {}

  return data;
}

// Bust stories cache when stories are created elsewhere
export function invalidateStoriesCache() {
  Cache.invalidatePattern(`stories:active`);
}

export async function createStoryFromPost(userId: string, post: any): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const mediaUrl = post.media_urls?.[0] || post.media_url;
  if (!mediaUrl) throw new Error('no_media');

  const originalUsername = post.profiles?.username || 'user';
  const attribution = `Shared from @${originalUsername}`;
  const caption = post.caption
    ? `${attribution} · ${post.caption.substring(0, 120)}`
    : attribution;

  const { data, error } = await supabase
    .from('stories')
    .insert({ user_id: userId, media_url: mediaUrl, caption })
    .select(STORY_WITH_PROFILE)
    .single();
  if (error) throw error;
  try { Cache.invalidatePattern(`stories:active`); } catch (e) {}
  return data;
}

export async function markStoryViewed(storyId: string, userId: string) {
  const { error } = await supabase.from('story_views').upsert({ story_id: storyId, user_id: userId });
  if (error) throw error;
}

export async function getViewedStoryIds(userId: string): Promise<string[]> {
  // Only the most recent views matter: stories expire after 24h.
  const { data } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(500);
  return data?.map((r: any) => r.story_id) ?? [];
}

export async function getStoryStats(storyId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const [views, likes, likedRes] = await Promise.all([
    supabase.from('story_views').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
    supabase.from('story_likes').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
    user
      ? supabase.from('story_likes').select('user_id').eq('story_id', storyId).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  return {
    views: views.count ?? 0,
    likes: likes.count ?? 0,
    isLiked: !!likedRes.data
  };
}

export async function getStoryViewers(storyId: string) {
  const [viewsRes, likesRes] = await Promise.all([
    supabase
      .from('story_views')
      .select(`*, profiles:profiles!story_views_user_id_fkey(${PROFILE_MINI_COLUMNS})`)
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false })
      .limit(200),
    supabase
      .from('story_likes')
      .select(`user_id, reaction`)
      .eq('story_id', storyId)
      .limit(500),
  ]);
  if (viewsRes.error) throw viewsRes.error;

  const likesMap = new Map((likesRes.data ?? []).map((l: any) => [l.user_id, l.reaction]));

  return (viewsRes.data ?? []).map((v: any) => ({
    ...v.profiles,
    viewed_at: v.viewed_at,
    reaction: likesMap.get(v.user_id) || null
  }));
}

export async function likeStory(storyId: string, userId: string, reaction: string = '❤️') {
  const { error } = await supabase.from('story_likes').upsert({ 
    story_id: storyId, 
    user_id: userId,
    reaction 
  }, { onConflict: 'story_id,user_id' });
  if (error) throw error;
}

export async function unlikeStory(storyId: string, userId: string) {
  const { error } = await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteStory(storyId: string, userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // 1. Get story data
  const { data: story } = await supabase
    .from('stories')
    .select('media_url')
    .eq('id', storyId)
    .eq('user_id', userId)
    .single();

  // 2. Cleanup storage
  if (story?.media_url) {
    try {
      const pathParts = story.media_url.split('/');
      const path = pathParts.slice(-2).join('/');
      await supabase.storage.from('post-media').remove([path]);
    } catch (err) {
      console.warn('Failed to cleanup story media:', err);
    }
  }

  // 3. Delete from DB
  const { error } = await supabase.from('stories').delete().eq('id', storyId).eq('user_id', userId);
  if (error) throw error;
  try { Cache.invalidatePattern(`stories:active`); } catch (e) {}
}
