/**
 * Dwell-time tracking hook for React Native feed posts.
 *
 * Usage — in each PostCard component:
 *   usePostTracker(post.id, userId, isVisible);
 *
 * The `isVisible` boolean comes from the parent FlatList via
 * onViewableItemsChanged. Example FlatList setup:
 *
 *   const [visibleIds, setVisibleIds] = useState(new Set<string>());
 *   const onViewableItemsChanged = useCallback(({ changed }) => {
 *     setVisibleIds(prev => {
 *       const next = new Set(prev);
 *       changed.forEach(({ item, isViewable }) =>
 *         isViewable ? next.add(item.id) : next.delete(item.id)
 *       );
 *       return next;
 *     });
 *   }, []);
 *
 *   // In each PostCard:
 *   <PostCard isVisible={visibleIds.has(post.id)} ... />
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface InteractionPayload {
  user_id: string;
  post_id: string;
  type: 'like' | 'comment' | 'share' | 'save' | 'dwell' | 'skip';
  duration_ms?: number;
}

// ── Singleton batch queue (shared across all post trackers) ──────────────────
const queue: InteractionPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let skipSupported = true;

const BATCH_SIZE      = 10;
const FLUSH_INTERVAL  = 30_000; // 30 seconds
const MIN_DWELL_MS    = 1_000;  // ignore sub-1s glances

async function flushBatch() {
  if (flushInFlight) return flushInFlight;
  if (!queue.length) return;
  const payload = queue.splice(0, queue.length);
  flushInFlight = (async () => {
    try {
      const { error } = await supabase.from('interactions').insert(payload);
      if (error) throw error;
    } catch (err: any) {
      // 23514 = CHECK violation: the DB predates the 'skip' type (migration 059).
      // Drop the soft-negative rows instead of letting them poison every retry.
      const rejectedByCheck = err?.code === '23514';
      const keep = rejectedByCheck ? payload.filter(p => p.type !== 'skip') : payload;
      if (rejectedByCheck) skipSupported = false;
      // Keep preference signals when the device is offline. The next enqueue or
      // foreground flush will retry this small batch instead of losing it.
      queue.unshift(...keep);
    } finally {
      flushInFlight = null;
    }
  })();
  return flushInFlight;
}

function enqueue(item: InteractionPayload) {
  if (item.type === 'skip' && !skipSupported) return;
  queue.push(item);

  if (queue.length >= BATCH_SIZE) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushBatch();
    return;
  }

  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBatch();
    }, FLUSH_INTERVAL);
  }
}

// ── Per-post hook ────────────────────────────────────────────────────────────

export function usePostTracker(
  postId: string,
  userId: string,
  isVisible: boolean,
) {
  const entryTimeRef = useRef<number | null>(null);

  // Track enter / exit viewport
  useEffect(() => {
    if (isVisible) {
      entryTimeRef.current = Date.now();
    } else if (entryTimeRef.current !== null) {
      const duration_ms = Date.now() - entryTimeRef.current;
      entryTimeRef.current = null;
      if (duration_ms >= MIN_DWELL_MS) {
        enqueue({ user_id: userId, post_id: postId, type: 'dwell', duration_ms });
      }
    }
  }, [isVisible, postId, userId]);

  // Flush on unmount (user navigated away mid-view)
  useEffect(() => {
    return () => {
      if (entryTimeRef.current !== null) {
        const duration_ms = Date.now() - entryTimeRef.current;
        entryTimeRef.current = null;
        if (duration_ms >= MIN_DWELL_MS) {
          enqueue({ user_id: userId, post_id: postId, type: 'dwell', duration_ms });
        }
      }
    };
  }, [postId, userId]);
}

// ── Shared utilities ─────────────────────────────────────────────────────────

/** Manually enqueue an interaction (e.g. share — not captured by DB triggers). */
export function enqueueInteraction(payload: InteractionPayload) {
  enqueue(payload);
}

/** Force-flush remaining interactions (call on app background / screen unmount). */
export function flushInteractions(): Promise<void> {
  return flushBatch();
}
