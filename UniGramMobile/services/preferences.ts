import { supabase } from '../lib/supabase';
import { Cache } from '../lib/cache';
import { INTERESTS } from '../data/interests';

type InteractionType = 'like' | 'comment' | 'save' | 'share' | 'dwell';

export interface SessionInteraction {
  post_id: string;
  type: InteractionType;
  duration_ms?: number;
}

export function getInteractionWeight(type: InteractionType, duration_ms?: number): number {
  switch (type) {
    case 'like':    return 1;
    case 'comment': return 3;
    case 'save':    return 4;
    case 'share':   return 5;
    case 'dwell':   return (duration_ms ?? 0) > 10_000 ? 2 : 0;
    default:        return 0;
  }
}

/**
 * Derives an interest category for a post caption by matching its first
 * hashtag against the INTERESTS catalogue. Returns null if no match.
 */
function categoryFromCaption(caption: string): string | null {
  const tags = caption.match(/#\w+/g) ?? [];
  for (const tag of tags) {
    const match = INTERESTS.find(
      i => i.hashtag.toLowerCase() === tag.toLowerCase(),
    );
    if (match) return match.category;
  }
  return null;
}

/**
 * Updates user_preferences.affinities after a session.
 * Called from the feed screen when the user backgrounds the app
 * or navigates away (use React Native AppState for the trigger).
 *
 * Also invalidates the feed cache so the next session uses fresh weights.
 */
export async function updateUserPreferences(
  userId: string,
  sessionInteractions: SessionInteraction[],
): Promise<void> {
  if (!sessionInteractions.length) return;

  // Load current preferences (or start with empty objects)
  const { data: existing } = await supabase
    .from('user_preferences')
    .select('affinities, university_affinities')
    .eq('user_id', userId)
    .single();

  const affinities: Record<string, number> =
    (existing?.affinities as Record<string, number>) ?? {};
  const universityAffinities: Record<string, number> =
    (existing?.university_affinities as Record<string, number>) ?? {};

  // Fetch captions for the interacted posts (to derive categories)
  const postIds = [...new Set(sessionInteractions.map(i => i.post_id))];
  const [postsResult, profileResult] = await Promise.all([
    supabase
      .from('posts')
      .select('id, caption, profiles!posts_user_id_fkey(university)')
      .in('id', postIds),
    supabase
      .from('profiles')
      .select('university')
      .eq('id', userId)
      .single(),
  ]);

  const myUniversity = profileResult.data?.university ?? null;

  const postMeta: Record<string, { category: string | null; university: string | null }> = {};
  (postsResult.data ?? []).forEach((p: any) => {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    postMeta[p.id] = {
      category: categoryFromCaption(p.caption ?? ''),
      university: profile?.university ?? null,
    };
  });

  // Accumulate weights into affinities
  for (const interaction of sessionInteractions) {
    const weight = getInteractionWeight(interaction.type, interaction.duration_ms);
    if (weight === 0) continue;

    const meta = postMeta[interaction.post_id];
    if (!meta) continue;

    if (meta.category) {
      affinities[meta.category] = (affinities[meta.category] ?? 0) + weight;
    }

    if (meta.university && meta.university !== myUniversity) {
      universityAffinities[meta.university] =
        (universityAffinities[meta.university] ?? 0) + weight;
    }
  }

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      affinities,
      university_affinities: universityAffinities,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // Mark processed + invalidate cached feed
  await supabase.rpc('mark_interactions_processed', { p_user_id: userId }).catch(() => {});
  Cache.invalidate(`feed:${userId}`);
}

/**
 * Reads unprocessed interactions from the DB and runs updateUserPreferences.
 * Call this on app foreground or after flushInteractions() completes.
 */
export async function processUnprocessedInteractions(userId: string): Promise<void> {
  const { data: rows } = await supabase
    .from('interactions')
    .select('post_id, type, duration_ms')
    .eq('user_id', userId)
    .eq('processed', false);

  if (!rows?.length) return;

  await updateUserPreferences(
    userId,
    rows.map((r: any) => ({
      post_id: r.post_id,
      type: r.type as SessionInteraction['type'],
      duration_ms: r.duration_ms ?? undefined,
    })),
  );
}

/**
 * Returns the user's top interest categories sorted by affinity score.
 * Useful for debugging or showing the user their "taste profile".
 */
export async function getTopAffinities(
  userId: string,
  limit = 5,
): Promise<Array<{ category: string; score: number }>> {
  const { data } = await supabase
    .from('user_preferences')
    .select('affinities')
    .eq('user_id', userId)
    .single();

  if (!data?.affinities) return [];

  return Object.entries(data.affinities as Record<string, number>)
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
