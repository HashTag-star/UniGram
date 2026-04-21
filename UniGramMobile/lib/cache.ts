/**
 * Two-tier cache: in-memory (0ms) + AsyncStorage (~5ms persistent).
 * Pattern: stale-while-revalidate — return stale data instantly, refresh in bg.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> { data: T; ts: number }

// Tier 1 — memory (lost on app kill, instant reads)
const mem: Record<string, Entry<any>> = {};

const PREFIX = 'ugcache:';

export const Cache = {
  /** Synchronous read from memory. Returns null if not in memory or expired. */
  getSync<T>(key: string, ttlMs: number): T | null {
    const e = mem[key];
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
      mem[key] = e; // promote to memory
      return e.data;
    } catch { return null; }
  },

  /** Write to memory immediately and AsyncStorage in background. */
  set<T>(key: string, data: T): void {
    const e: Entry<T> = { data, ts: Date.now() };
    mem[key] = e;
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(e)).catch(() => {});
  },

  /** Check if a key is stale (older than ttlMs) without reading the full value. */
  isStale(key: string, ttlMs: number): boolean {
    const e = mem[key];
    return !e || Date.now() - e.ts >= ttlMs;
  },

  invalidate(key: string): void {
    delete mem[key];
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  },
};

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
};
