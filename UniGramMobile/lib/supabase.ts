import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { DeviceEventEmitter } from 'react-native';
import { GlobalRateLimiter } from './rateLimiter';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in the values.');
}

// expo-secure-store has a ~2KB per-item limit on iOS, so we chunk large values.
// Falls back to AsyncStorage if SecureStore is unavailable (e.g. web, some emulators).
const CHUNK_SIZE = 1500;

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const chunkCount = await SecureStore.getItemAsync(`${key}_chunks`);
      if (!chunkCount) return await SecureStore.getItemAsync(key);
      // Parallelize chunk reads but preserve order
      const total = parseInt(chunkCount, 10);
      const promises = Array.from({ length: total }, (_, i) => SecureStore.getItemAsync(`${key}_${i}`));
      const parts = await Promise.all(promises);
      if (parts.some(p => p === null)) return null;
      return parts.join('');
    } catch {
      // SecureStore unavailable — fall back to AsyncStorage
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
        return;
      }
      const total = Math.ceil(value.length / CHUNK_SIZE);
      // Write every chunk before publishing its count. Publishing first meant a
      // single failed chunk could make the next app launch read a partial token.
      // Let the outer catch fall back to AsyncStorage instead of accepting a
      // corrupted SecureStore session.
      const writes = Array.from({ length: total }, (_, i) =>
        SecureStore.setItemAsync(
          `${key}_${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        )
      );
      await Promise.all(writes);
      await SecureStore.setItemAsync(`${key}_chunks`, total.toString());
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const chunkCount = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunkCount) {
        for (let i = 0; i < parseInt(chunkCount, 10); i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {}
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

// Prevent fetch from hanging indefinitely. 20s is generous for data queries
// while still allowing most operations to complete on slow connections.
// If the caller already supplies a signal (e.g., realtime), we leave it alone.
// [Ama Mensah - Lead Dev] Replace bare "AbortError: Aborted" with a descriptive
// SupabaseTimeoutError so LogBox shows the real cause + URL. The most common
// trigger in the wild is a paused Supabase project (free tier cold-boot can
// take 60s+); without context the bare AbortError told the operator nothing.
const FETCH_TIMEOUT_MS = 20_000;
let _wasOffline = false;
let _offlineTimer: any = null;
let _onlineTimer: any = null;

export class SupabaseTimeoutError extends Error {
  url: string;
  timeoutMs: number;
  userMessage: string;
  constructor(url: string, timeoutMs: number) {
    // A timeout means the SERVER was slow (or we were rate-limited) — it does not
    // mean the phone is offline, so it must never raise the "no internet" toast.
    super('The server took too long to respond.');
    this.name = 'Network timeout';
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.userMessage = 'The server took too long to respond. Please try again.';
  }
}

// ─── Connectivity ──────────────────────────────────────────────────────────────
// "Offline" is only declared after a real network-level failure (fetch rejected
// with a TypeError) AND an independent reachability probe also fails. This avoids
// the false "no internet" toasts caused by slow queries, aborted requests or
// rate-limiter waits while the connection is actually fine.
const PROBE_URLS = [
  `${SUPABASE_URL}/auth/v1/health`,
  'https://www.gstatic.com/generate_204',
];
let _probing = false;

async function probeOnline(): Promise<boolean> {
  for (const url of PROBE_URLS) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      // Raw fetch on purpose: bypasses our wrapper (and its rate limiter).
      await fetch(url, { method: 'GET', signal: ctl.signal, headers: { apikey: SUPABASE_ANON_KEY } });
      clearTimeout(t);
      return true; // any HTTP response — even 401 — proves we have a network path
    } catch {
      clearTimeout(t);
    }
  }
  return false;
}

function reportNetworkFailure() {
  if (_wasOffline || _probing || _offlineTimer) return;
  // Debounce a beat so a single dropped request doesn't trigger a probe.
  _offlineTimer = setTimeout(async () => {
    _offlineTimer = null;
    _probing = true;
    try {
      const online = await probeOnline();
      if (!online && !_wasOffline) {
        _wasOffline = true;
        DeviceEventEmitter.emit('app_offline', { message: "You're offline. Check your connection." });
      }
    } finally {
      _probing = false;
    }
  }, 2500);
}

const fetchWithTimeout = (url: any, options: RequestInit = {}): Promise<Response> => {
  if (options.signal) return fetch(url, options);
  const controller = new AbortController();
  const targetUrl = typeof url === 'string' ? url : (url?.url ?? String(url));
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Acquire global rate limiter token before issuing network request
  const allowedP = GlobalRateLimiter.acquire(10000);
  return allowedP.then((allowed) => {
    if (!allowed) {
      // Rate limiter timed out — fail fast with a descriptive error
      clearTimeout(id);
      throw new SupabaseTimeoutError(targetUrl, FETCH_TIMEOUT_MS);
    }
    return fetch(url, { ...options, signal: controller.signal })
    .then((res) => {
      // A response — of any status — proves the network works.
      if (_offlineTimer) { clearTimeout(_offlineTimer); _offlineTimer = null; }
      if (_wasOffline && !_onlineTimer) {
        _onlineTimer = setTimeout(() => {
          _wasOffline = false;
          _onlineTimer = null;
          DeviceEventEmitter.emit('app_online');
        }, 1500);
      }
      return res;
    })
    .catch((err: any) => {
      if (err?.name === 'AbortError') {
        throw new SupabaseTimeoutError(targetUrl, FETCH_TIMEOUT_MS);
      }
      // fetch() rejects with a TypeError when the request never reached a server.
      if (err instanceof TypeError) reportNetworkFailure();
      throw err;
    })
    .finally(() => clearTimeout(id));
  });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout as unknown as typeof fetch,
  },
});

// ─── Fast local getUser() ──────────────────────────────────────────────────────
// supabase.auth.getUser() validates the JWT with a network round-trip on EVERY
// call, and the app calls it ~60 times (every screen load, every service call).
// That put a full server RTT in front of nearly every request. For the no-argument
// form we now read the locally stored (auto-refreshed) session instead; server-side
// RLS still authorises every actual query. Passing an explicit JWT, or having no
// local session, still takes the real network path.
{
  const auth = supabase.auth as any;
  const networkGetUser = auth.getUser.bind(auth);
  auth.getUser = async (jwt?: string) => {
    if (jwt) return networkGetUser(jwt);
    try {
      const { data } = await auth.getSession();
      if (data?.session?.user) return { data: { user: data.session.user }, error: null };
    } catch {}
    return networkGetUser();
  };
}

/**
 * Resolves a media file path in a Supabase bucket to its Cloudflare CDN proxy URL
 * to avoid expensive Supabase storage egress fees.
 */
export function getPublicMediaUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const cdnUrl = process.env.EXPO_PUBLIC_CDN_URL;
  if (cdnUrl && SUPABASE_URL) {
    return data.publicUrl.replace(SUPABASE_URL, cdnUrl);
  }
  return data.publicUrl;
}

