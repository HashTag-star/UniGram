import { supabase } from '../lib/supabase';
import { uploadFile } from './upload';

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
    .select()
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
