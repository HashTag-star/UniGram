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
      await SecureStore.setItemAsync(`${key}_chunks`, total.toString());
      // Write chunks in parallel to reduce latency on large values
      const writes = Array.from({ length: total }, (_, i) =>
        SecureStore.setItemAsync(
          `${key}_${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        ).catch(() => {})
      );
      await Promise.allSettled(writes);
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

export class SupabaseTimeoutError extends Error {
  url: string;
  timeoutMs: number;
  userMessage: string;
  constructor(url: string, timeoutMs: number) {
    // [Ama Mensah - Lead Dev] Satisfy the user requirement for friendlier error strings.
    // The super() call sets .message, which is what typically shows in default alerts/logs.
    super("You're offline.");
    this.name = 'Network timeout';
    this.url = url;
    this.timeoutMs = timeoutMs;
    // Friendly message intended for display to end users (no URLs or internals)
    this.userMessage = `You're offline.`;
    
    // Mark global state so we can notify when it comes back
    if (!_wasOffline) {
      _wasOffline = true;
      DeviceEventEmitter.emit('app_offline', { message: this.userMessage });
    }
  }
}

const fetchWithTimeout = (url: any, options: RequestInit = {}): Promise<Response> => {
  if (options.signal) return fetch(url, options);
  const controller = new AbortController();
  const targetUrl = typeof url === 'string' ? url : (url?.url ?? String(url));
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  // Acquire global rate limiter token before issuing network request
  const allowedP = GlobalRateLimiter.acquire(2000);
  return allowedP.then((allowed) => {
    if (!allowed) {
      // Rate limiter timed out — fail fast with a descriptive error
      clearTimeout(id);
      throw new SupabaseTimeoutError(targetUrl, FETCH_TIMEOUT_MS);
    }
    return fetch(url, { ...options, signal: controller.signal })
    .then((res) => {
      // If we were previously offline and this request succeeded, notify the app
      if (_wasOffline) {
        _wasOffline = false;
        DeviceEventEmitter.emit('app_online');
      }
      // Release one token back for long-polling / streaming endpoints? Keep
      // conservative and do not auto-release here — releases can be done by callers.
      return res;
    })
    .catch((err: any) => {
      // Convert the generic abort into a labelled error so callers and LogBox
      // can distinguish a timeout from a caller-initiated cancellation.
      if (err?.name === 'AbortError') {
        throw new SupabaseTimeoutError(targetUrl, FETCH_TIMEOUT_MS);
      }
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

