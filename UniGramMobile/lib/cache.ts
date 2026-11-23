/**
 * Two-tier cache: in-memory (0ms) + AsyncStorage (~5ms persistent).
 * Pattern: stale-while-revalidate — return stale data instantly, refresh in bg.
 *
 * Guarantees:
 *  - A failed fetch is NEVER cached (fetchers must throw on failure).
 *  - getOrFetch serves STALE data (memory or persisted, any age) when the fetch
 *    fails, and only throws when there is nothing at all to serve.
 *  - Persisted entries are size-capped and pruned (LRU by timestamp) so the
 *    AsyncStorage 6MB Android cap is never approached.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Entry<T> { data: T; ts: number }

// Tier 1 — memory (lost on app kill, instant reads). Map prevents __proto__ prototype pollution.
const mem = new Map<string, Entry<any>>();

const PREFIX = 'ugcache:';
/** Entries bigger than this (serialized chars) are kept in memory only. */
const MAX_PERSIST_CHARS = 150_000;
/** Total persisted budget (serialized chars) enforced by prune(). */
const MAX_TOTAL_PERSIST_CHARS = 2_500_000;
/** Persisted entries older than this are dropped by prune(), whatever their TTL. */
const MAX_PERSIST_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_MEM_ENTRIES = 300;

let _pruned = false;
let _pruning = false;

/** Marker a fetcher may return/throw to say "this result must not be cached". */
export class NoCacheError extends Error {
  constructor(message = 'fetch failed — not cached') { super(message); this.name = 'NoCacheError'; }
}

function memSet(key: string, e: Entry<any>) {
  mem.delete(key);
  mem.set(key, e);
  if (mem.size > MAX_MEM_ENTRIES) {
    const first = mem.keys().next().value;
    if (first !== undefined) mem.delete(first);
  }
}

export const Cache = {
  /** Synchronous read from memory. Returns null if not in memory or expired. */
  getSync<T>(key: string, ttlMs: number): T | null {
    const e = mem.get(key);
    if (e && Date.now() - e.ts < ttlMs) return e.data as T;
    return null;
  },

  /** Synchronous read ignoring TTL (stale-ok). */
  getStaleSync<T>(key: string): T | null {
    const e = mem.get(key);
    return e ? (e.data as T) : null;
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
      memSet(key, e);
      return e.data;
    } catch { return null; }
  },

  /** Async read ignoring TTL — used as the offline / error fallback. */
  async getStale<T>(key: string): Promise<T | null> {
    const m = mem.get(key);
    if (m) return m.data as T;
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const e: Entry<T> = JSON.parse(raw);
      return e.data;
    } catch { return null; }
  },

  /**
   * Write to memory immediately and AsyncStorage in background.
   * Pass `{ persist: false }` for big/volatile data.
   */
  set<T>(key: string, data: T, opts?: { persist?: boolean }): void {
    const e: Entry<T> = { data, ts: Date.now() };
    memSet(key, e);
    if (opts?.persist === false) return;
    try {
      const json = JSON.stringify(e);
      if (json.length > MAX_PERSIST_CHARS) return;
      AsyncStorage.setItem(PREFIX + key, json).catch(() => {});
      if (!_pruned) { _pruned = true; setTimeout(() => { Cache.prune().catch(() => {}); }, 8000); }
    } catch { /* circular / too big — memory only */ }
  },

  /** Check if a key is stale (older than ttlMs) without reading the full value. */
  isStale(key: string, ttlMs: number): boolean {
    const e = mem.get(key);
    return !e || Date.now() - e.ts >= ttlMs;
  },

  /** Wipe everything (memory + persisted). Call on sign-out so accounts never share cached data. */
  async clearAll(): Promise<void> {
    mem.clear();
    inflight.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const mine = keys.filter(k => k.startsWith(PREFIX));
      if (mine.length) await AsyncStorage.multiRemove(mine);
    } catch {}
  },

  invalidate(key: string): void {
    mem.delete(key);
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
    // Legacy un-scoped key: stories are now cached per user (stories:active:<uid>).
    if (key === 'stories:active') Cache.invalidatePattern('stories:active:');
  },

  /**
   * Removes every in-memory AND persisted entry whose key starts with `prefix`.
   * Use to bust whole families of keys (e.g. `invalidatePattern('feed:')`).
   */
  invalidatePattern(prefix: string): void {
    for (const key of Array.from(mem.keys())) {
      if (key.startsWith(prefix)) mem.delete(key);
    }
    for (const key of Array.from(inflight.keys())) {
      if (key.startsWith(prefix)) inflight.delete(key);
    }
    AsyncStorage.getAllKeys()
      .then(keys => {
        const full = PREFIX + prefix;
        const hit = keys.filter(k => k.startsWith(full));
        if (hit.length) return AsyncStorage.multiRemove(hit);
      })
      .catch(() => {});
  },

  /** Drop expired persisted entries and trim the oldest until under budget. */
  async prune(): Promise<void> {
    if (_pruning) return;
    _pruning = true;
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
      if (!keys.length) return;
      const pairs = await AsyncStorage.multiGet(keys);
      const now = Date.now();
      const rows: { k: string; ts: number; size: number }[] = [];
      const drop: string[] = [];
      for (const [k, v] of pairs) {
        if (!v) { drop.push(k); continue; }
        let ts = 0;
        try { ts = JSON.parse(v)?.ts ?? 0; } catch { drop.push(k); continue; }
        if (now - ts > MAX_PERSIST_AGE_MS) { drop.push(k); continue; }
        rows.push({ k, ts, size: v.length });
      }
      let total = rows.reduce((s, r) => s + r.size, 0);
      rows.sort((a, b) => a.ts - b.ts);
      for (const r of rows) {
        if (total <= MAX_TOTAL_PERSIST_CHARS) break;
        drop.push(r.k);
        total -= r.size;
      }
      if (drop.length) await AsyncStorage.multiRemove(drop);
    } catch {} finally { _pruning = false; }
  },

  /**
   * Get cached value or run `fetcher` to refresh (stale-while-revalidate with
   * in-flight dedupe).
   *  - fresh memory / persisted hit → returned immediately, NO refetch.
   *  - expired persisted/mem data + fetch error → stale data is returned.
   *  - nothing to serve + fetch error → the error is thrown to the caller.
   * Fetchers must THROW on failure; whatever they return is cached.
   */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T | null> {
    const memHit = this.getSync<T>(key, ttlMs);
    if (memHit !== null) return memHit;

    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (raw) {
        const e: Entry<T> = JSON.parse(raw);
        if (Date.now() - e.ts < ttlMs) {
          memSet(key, e);
          return e.data;
        }
      }
    } catch { /* ignore */ }

    try {
      return await fetcherWithDedup<T>(key, fetcher);
    } catch (err) {
      const stale = await Cache.getStale<T>(key);
      if (stale !== null) return stale;
      throw err;
    }
  },
};

// In-flight fetch dedupe map
const inflight = new Map<string, Promise<any>>();

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
