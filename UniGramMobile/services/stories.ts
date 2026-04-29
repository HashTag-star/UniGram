import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';
import { sendPushToUser } from './pushNotifications';

export async function getActiveStories() {
  const { data, error } = await supabase
    .from('stories')
    .select(`*, profiles!stories_user_id_fkey(*)`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Group by user
  const grouped: Record<string, { profile: any; stories: any[] }> = {};
  for (const story of data ?? []) {
    const uid = story.user_id;
    if (!grouped[uid]) grouped[uid] = { profile: story.profiles, stories: [] };
    grouped[uid].stories.push(story);
  }
  return Object.values(grouped);
}

export async function getUserStories(userId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select(`*`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createStory(userId: string, mediaUri: string, caption?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const ext = mediaUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const media_url = await uploadFile('post-media', path, mediaUri);

  const { data, error } = await supabase
    .from('stories')
    .insert({ user_id: userId, media_url, caption })
    .select(`*, profiles!stories_user_id_fkey(*)`)
    .single();
  if (error) throw error;

  // Notify followers that someone they follow posted a story (fire-and-forget, capped at 500)
  (async () => {
    try {
      const { data: followers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId)
        .limit(500);

      if (!followers?.length) return;

      const actor = data.profiles;
      const username = actor?.username || 'Someone';
      const pushBody = '✨ added a new story';

      const notifRows = followers.map((f: any) => ({
        user_id: f.follower_id,
        actor_id: userId,
        type: 'new_story',
        text: pushBody,
        is_read: false,
      }));

      for (let i = 0; i < notifRows.length; i += 500) {
        await supabase.from('notifications').insert(notifRows.slice(i, i + 500));
      }

      followers.forEach((f: any) => {
        sendPushToUser(
          f.follower_id,
          username,
          pushBody,
          { type: 'new_story', storyId: data.id, userId, channelId: 'stories' },
          media_url,
          actor?.avatar_url ?? undefined,
        ).catch(() => {});
      });
    } catch (_) {}
  })();

  return data;
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
    .select(`*, profiles!stories_user_id_fkey(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function markStoryViewed(storyId: string, userId: string) {
  await supabase.from('story_views').upsert({ story_id: storyId, user_id: userId });
}

export async function getViewedStoryIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('story_views').select('story_id').eq('user_id', userId);
  return data?.map((r: any) => r.story_id) ?? [];
}

export async function getStoryStats(storyId: string) {
  const [views, likes] = await Promise.all([
    supabase.from('story_views').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
    supabase.from('story_likes').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId)
  ]);
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: isLiked } = await supabase
    .from('story_likes')
    .select('user_id')
    .eq('story_id', storyId)
    .eq('user_id', user?.id)
    .single();

  return {
    views: views.count ?? 0,
    likes: likes.count ?? 0,
    isLiked: !!isLiked
  };
}

export async function getStoryViewers(storyId: string) {
  const { data, error } = await supabase
    .from('story_views')
    .select(`
      *, 
      profiles!story_views_user_id_fkey(*),
      story_likes:story_likes!inner(reaction)
    `)
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false });
    
  // If no likes, story_likes join might return empty or null.
  // We should actually use a left join (default) but select it properly.
  // Re-fetching with a better join approach:
  const { data: views } = await supabase
    .from('story_views')
    .select(`*, profiles:profiles!story_views_user_id_fkey(*)`)
    .eq('story_id', storyId);
  
  const { data: likes } = await supabase
    .from('story_likes')
    .select(`user_id, reaction`)
    .eq('story_id', storyId);

  const likesMap = new Map((likes ?? []).map(l => [l.user_id, l.reaction]));

  return (views ?? []).map(v => ({ 
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
}
