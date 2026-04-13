import { supabase } from '../lib/supabase';

// ─── Caption Assistant ─────────────────────────────────────────────────────────

export interface CaptionSuggestion {
  tone: 'casual' | 'inspirational' | 'funny';
  text: string;
}

export interface CaptionResult {
  captions: CaptionSuggestion[];
  hashtags: string[];
}

/**
 * Get Gemini-powered caption suggestions for a post.
 * Returns 3 captions (casual, inspirational, funny) + suggested hashtags.
 */
export async function getCaptionSuggestions(opts: {
  userId: string;
  postType: string;
  university?: string;
  trendingHashtags?: string[];
}): Promise<CaptionResult> {
  const { data, error } = await supabase.functions.invoke('caption-assistant', {
    body: opts,
  });
  if (error) throw error;
  return data as CaptionResult;
}

// ─── Keyword Filter ────────────────────────────────────────────────────────────

export interface KeywordFilterResult {
  flagged: boolean;
  matches: string[];
  severity: 'block' | 'flag' | 'warn' | null;
}

/**
 * Check post text against the dynamic admin keyword blocklist.
 * Fails open on error (never blocks the user due to a network issue).
 */
export async function checkKeywordFilter(text: string): Promise<KeywordFilterResult> {
  try {
    const { data } = await supabase.functions.invoke('keyword-filter-check', {
      body: { text },
    });
    return data as KeywordFilterResult;
  } catch {
    return { flagged: false, matches: [], severity: null };
  }
}

// ─── Interest Signals (re-training loop) ──────────────────────────────────────

/**
 * Record that a user engaged with content tagged with these hashtags.
 * Increments the signal_count for each tag in user_interest_signals.
 * Fire-and-forget — never awaited by the caller.
 */
export async function trackInterestSignal(userId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  const now = new Date().toISOString();
  const rows = tags
    .map(t => t.replace(/^#/, '').toLowerCase().trim())
    .filter(Boolean)
    .map(tag => ({
      user_id: userId,
      interest_tag: tag,
      signal_count: 1,
      last_seen: now,
    }));

  if (!rows.length) return;

  // Use upsert — if row exists, Supabase will overwrite. We rely on a DB trigger
  // or a separate RPC to actually increment (see SQL below). As a client-safe
  // fallback we just insert with ignoreDuplicates so we don't overwrite counts.
  await supabase
    .from('user_interest_signals')
    .upsert(rows, { onConflict: 'user_id,interest_tag', ignoreDuplicates: true })
    .catch(() => {});

  // Best-effort increment via RPC (works if the function exists)
  await supabase
    .rpc('increment_interest_signals', { p_user_id: userId, p_tags: rows.map(r => r.interest_tag) })
    .catch(() => {});
}

/**
 * Returns the user's top learned interest tags (by signal count), sorted desc.
 */
export async function getLearnedInterests(userId: string, limit = 10): Promise<string[]> {
  const { data } = await supabase
    .from('user_interest_signals')
    .select('interest_tag')
    .eq('user_id', userId)
    .order('signal_count', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => r.interest_tag);
}
