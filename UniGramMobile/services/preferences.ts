import { supabase } from '../lib/supabase';
import { Cache } from '../lib/cache';
import { INTERESTS } from '../data/interests';

type InteractionType = 'like' | 'comment' | 'save' | 'share' | 'dwell' | 'skip';

export interface SessionInteraction {
  post_id: string;
  type: InteractionType;
  duration_ms?: number;
}

/** Affinity half-life: taste fades by half every two weeks without reinforcement. */
const HALF_LIFE_DAYS = 14;
/** Keep the largest affinity bounded so one binge can't permanently dominate. */
const MAX_AFFINITY = 60;
/** One post can contribute at most this much per processing run. */
const MAX_POST_WEIGHT = 8;
const MIN_POST_WEIGHT = -1;
const MIN_KEEP = 0.05;

export function getInteractionWeight(type: InteractionType, duration_ms?: number): number {
  switch (type) {
    case 'like':    return 1;
    case 'comment': return 3;
    case 'save':    return 4;
    case 'share':   return 5;
    case 'skip':    return -0.6;
    case 'dwell': {
      // Ramp instead of a cliff: <2.5s is a glance (0), 2.5s -> 8.5s climbs to +2.
      const d = duration_ms ?? 0;
      if (d < 2_500) return 0;
      return Math.min(2, ((d - 2_500) / 6_000) * 2);
    }
    default:        return 0;
  }
}

/** Lower-cased hashtag words in a caption, without the '#'. */
function tagsFromCaption(caption: string, limit = 5): string[] {
  const tags = (caption.match(/#\w+/g) ?? []).map(t => t.slice(1).toLowerCase());
  return [...new Set(tags)].slice(0, limit);
}

/** Maps a hashtag word to its INTERESTS category, if the catalogue knows it. */
function categoryForTag(tag: string): string | null {
  const match = INTERESTS.find(i => i.hashtag.slice(1).toLowerCase() === tag);
  return match?.category ?? null;
}

function decayAndPrune(map: Record<string, number>, factor: number) {
  for (const key of Object.keys(map)) {
    const v = (Number(map[key]) || 0) * factor;
    if (v < MIN_KEEP) delete map[key];
    else map[key] = v;
  }
}

function capMax(map: Record<string, number>) {
  const max = Math.max(0, ...Object.values(map));
  if (max <= MAX_AFFINITY) return;
  const k = MAX_AFFINITY / max;
  for (const key of Object.keys(map)) map[key] *= k;
}

function round2(map: Record<string, number>) {
  for (const key of Object.keys(map)) map[key] = Math.round(map[key] * 100) / 100;
  return map;
}

/**
 * Updates user_preferences after a session. Learns, per post interacted with:
 *   - topic (hashtag) affinity — every tag, not just the first
 *   - category affinity (the coarse INTERESTS buckets from onboarding)
 *   - format affinity (image / video / thread ...)
 *   - cross-campus affinity
 * Signals are time-decayed (14-day half-life, based on when the profile was last
 * updated, NOT on how often this runs) and can go negative via quick skips.
 */
export async function updateUserPreferences(
  userId: string,
  sessionInteractions: SessionInteraction[],
): Promise<void> {
  if (!sessionInteractions.length) return;

  // Load current preferences. Try the v2 columns first; fall back if migration
  // 059 hasn't been applied so learning keeps working either way.
  let hasV2 = true;
  let existing: any = null;
  const v2 = await supabase
    .from('user_preferences')
    .select('affinities, university_affinities, tag_affinities, type_affinities, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (v2.error) {
    hasV2 = false;
    const v1 = await supabase
      .from('user_preferences')
      .select('affinities, university_affinities, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    existing = v1.data;
  } else {
    existing = v2.data;
  }

  const affinities: Record<string, number> = { ...(existing?.affinities ?? {}) };
  const universityAffinities: Record<string, number> = { ...(existing?.university_affinities ?? {}) };
  const tagAffinities: Record<string, number> = { ...(existing?.tag_affinities ?? {}) };
  const typeAffinities: Record<string, number> = { ...(existing?.type_affinities ?? {}) };

  // Time-based decay: a run 10 minutes after the last one barely decays anything.
  const lastUpdated = existing?.updated_at ? new Date(existing.updated_at).getTime() : Date.now();
  const days = Math.max(0, (Date.now() - lastUpdated) / 86_400_000);
  const factor = Math.pow(0.5, days / HALF_LIFE_DAYS);
  if (factor < 0.999) {
    decayAndPrune(affinities, factor);
    decayAndPrune(universityAffinities, factor);
    decayAndPrune(tagAffinities, factor);
    decayAndPrune(typeAffinities, factor);
  }

  // Net weight per post (a like + 12s dwell + save on one post is ONE strong
  // signal, but clamped so it can't swamp the profile).
  const perPost = new Map<string, number>();
  for (const i of sessionInteractions) {
    perPost.set(i.post_id, (perPost.get(i.post_id) ?? 0) + getInteractionWeight(i.type, i.duration_ms));
  }

  const postIds = [...perPost.keys()];
  const [postsResult, profileResult] = await Promise.all([
    supabase
      .from('posts')
      .select('id, caption, type, profiles!posts_user_id_fkey(university)')
      .in('id', postIds),
    supabase
      .from('profiles')
      .select('university')
      .eq('id', userId)
      .single(),
  ]);

  const myUniversity = profileResult.data?.university ?? null;

  for (const p of (postsResult.data ?? []) as any[]) {
    const raw = perPost.get(p.id) ?? 0;
    if (raw === 0) continue;
    const weight = Math.max(MIN_POST_WEIGHT, Math.min(MAX_POST_WEIGHT, raw));
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;

    const tags = tagsFromCaption(p.caption ?? '');
    // Spread the signal over the tags (sqrt keeps multi-tag posts from being
    // either dominant or ignored).
    const perTag = tags.length ? weight / Math.sqrt(tags.length) : 0;
    const seenCategories = new Set<string>();
    for (const tag of tags) {
      tagAffinities[tag] = Math.max(0, (tagAffinities[tag] ?? 0) + perTag);
      const cat = categoryForTag(tag);
      if (cat && !seenCategories.has(cat)) {
        seenCategories.add(cat);
        affinities[cat] = Math.max(0, (affinities[cat] ?? 0) + weight);
      }
    }

    if (p.type) {
      typeAffinities[p.type] = Math.max(0, (typeAffinities[p.type] ?? 0) + weight * 0.5);
    }

    if (profile?.university && profile.university !== myUniversity) {
      universityAffinities[profile.university] = Math.max(0, (universityAffinities[profile.university] ?? 0) + weight);
    }
  }

  capMax(affinities); capMax(universityAffinities); capMax(tagAffinities); capMax(typeAffinities);

  const base = {
    user_id: userId,
    affinities: round2(affinities),
    university_affinities: round2(universityAffinities),
    updated_at: new Date().toISOString(),
  };
  let { error: upsertErr } = await supabase.from('user_preferences').upsert(
    hasV2 ? { ...base, tag_affinities: round2(tagAffinities), type_affinities: round2(typeAffinities) } : base,
    { onConflict: 'user_id' },
  );
  if (upsertErr && hasV2) {
    ({ error: upsertErr } = await supabase.from('user_preferences').upsert(base, { onConflict: 'user_id' }));
  }
  if (upsertErr) {
    // Don't mark rows processed — they'll be retried next time.
    console.warn('[preferences] upsert failed:', upsertErr.message);
    return;
  }

  // Mark processed + invalidate cached feed so the next load uses fresh weights
  try { await supabase.rpc('mark_interactions_processed', { p_user_id: userId }); } catch {}
  Cache.invalidatePattern(`feed:${userId}:`);
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
