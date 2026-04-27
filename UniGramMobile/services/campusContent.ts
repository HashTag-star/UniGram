import { supabase } from '../lib/supabase';
import { Cache, TTL } from '../lib/cache';

export interface CampusEvent {
  id: string;
  university: string;
  title: string;
  body?: string | null;
  event_date?: string | null;
  created_at: string;
}

export async function getCampusEvents(university: string, limit = 5): Promise<CampusEvent[]> {
  const cacheKey = `campus_events:${university}`;
  const memHit = Cache.getSync<CampusEvent[]>(cacheKey, TTL.explore);
  if (memHit) return memHit;
  const asyncHit = await Cache.get<CampusEvent[]>(cacheKey, TTL.explore);
  if (asyncHit) return asyncHit;

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('campus_events')
    .select('id, university, title, body, event_date, created_at')
    .eq('university', university)
    .eq('is_active', true)
    .or(`event_date.gte.${today},event_date.is.null`)
    .order('event_date', { ascending: true, nullsFirst: false })
    .limit(limit);

  const result = data ?? [];
  Cache.set(cacheKey, result);
  return result;
}

export async function getUserFollowCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);
  return count ?? 0;
}
