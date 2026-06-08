/**
 * Two-tier cache: in-memory (0ms) + AsyncStorage (~5ms persistent).
 * Pattern: stale-while-revalidate — return stale data instantly, refresh in bg.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> { data: T; ts: number }

// Tier 1 — memory (lost on app kill, instant reads). Map prevents __proto__ prototype pollution.
const mem = new Map<string, Entry<any>>();

const PREFIX = 'ugcache:';

export const Cache = {
  /** Synchronous read from memory. Returns null if not in memory or expired. */
  getSync<T>(key: string, ttlMs: number): T | null {
    const e = mem.get(key);
    if (e && Date.now() - e.ts < ttlMs) return e.data as T;
    return null;
  },

  /** Async read: memory first, then AsyncStorage. */
  async get<T>(key: string, ttlMs: number): Promise<T | null> {
    const mem_hit = this.getSync<T>(key, ttlMs);
    if (mem_hit !== null) return mem_hit;
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const e: Entry<T> = JSON.parse(raw);
      if (Date.now() - e.ts > ttlMs) return null;
      mem.set(key, e);
      return e.data;
    } catch { return null; }
  },

  /** Write to memory immediately and AsyncStorage in background. */
  set<T>(key: string, data: T): void {
    const e: Entry<T> = { data, ts: Date.now() };
    mem.set(key, e);
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(e)).catch(() => {});
  },

  /** Check if a key is stale (older than ttlMs) without reading the full value. */
  isStale(key: string, ttlMs: number): boolean {
    const e = mem.get(key);
    return !e || Date.now() - e.ts >= ttlMs;
  },

  invalidate(key: string): void {
    mem.delete(key);
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  },

  /**
   * Removes every in-memory entry whose key starts with `prefix`.
   * AsyncStorage entries for those keys are evicted lazily on next stale read.
   * Use to bust whole families of keys (e.g. `invalidatePattern('feed:')`)
   */
  invalidatePattern(prefix: string): void {
    for (const key of mem.keys()) {
      if (key.startsWith(prefix)) {
        mem.delete(key);
        AsyncStorage.removeItem(PREFIX + key).catch(() => {});
      }
    }
  },

  /**
   * Get cached value or run `fetcher` to refresh. Implements in-flight
   * deduplication and stale-while-revalidate: returns fresh memory value
   * if available, otherwise returns AsyncStorage value if fresh, and
   * ensures only one fetcher runs per key at a time. If a stale value is
   * returned, the fetcher runs in background to refresh the cache.
   */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T | null> {
    const memHit = this.getSync<T>(key, ttlMs);
    if (memHit !== null) return memHit;

    // Check AsyncStorage quickly
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (raw) {
        const e: Entry<T> = JSON.parse(raw);
        if (Date.now() - e.ts < ttlMs) {
          // Fresh persisted hit — return and let background refresh happen
          // (but only if not already refreshing)
          mem.set(key, e);
          if (!inflight.has(key)) triggerFetch(key, fetcher);
          return e.data;
        }
      }
    } catch { /* ignore */ }

    // No fresh cached value — run fetcher (deduplicated)
    return await fetcherWithDedup<T>(key, fetcher).catch(() => null);
  },
};
// In-flight fetch dedupe map
const inflight = new Map<string, Promise<any>>();

function triggerFetch<T>(key: string, fetcher: () => Promise<T>) {
  // fire-and-forget but deduped
  fetcherWithDedup(key, fetcher).catch(() => {});
}

async function fetcherWithDedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      const data = await fetcher();
      Cache.set(key, data);
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ─── TTLs (tune per data type) ───────────────────────────────────────────────
export const TTL = {
  feed:      2 * 60 * 1000,   // 2 min  — posts age quickly
  stories:   1 * 60 * 1000,   // 1 min  — stories are time-sensitive
  profile:   5 * 60 * 1000,   // 5 min
  market:    3 * 60 * 1000,   // 3 min
  reels:     5 * 60 * 1000,   // 5 min
  messages:  30 * 1000,        // 30s   — chats need to feel live
  explore:   5 * 60 * 1000,   // 5 min — explore grid posts
  discover: 10 * 60 * 1000,   // 10 min — follow suggestions
  trending:  5 * 60 * 1000,   // 5 min — trending hashtags
  moments:   2 * 60 * 1000,   // 2 min — community pulse moments
};
