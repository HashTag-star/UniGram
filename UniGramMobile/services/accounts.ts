import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { DeviceEventEmitter } from 'react-native';
import { resetSessionState } from '../lib/sessionCleanup';

const REGISTRY_INDEX_KEY = 'unigram_accounts_index_v3';
const SESSION_KEY_PREFIX = 'unigram_session_v3_';
const CHUNK_SIZE = 1500; // Well below 2048 limit

export interface AccountRegistryEntry {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
  lastActive: number;
}

// Internal safe storage helpers with chunking
const safeStore = {
  async setItem(key: string, value: string) {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
      return;
    }
    const total = Math.ceil(value.length / CHUNK_SIZE);
    // Write every chunk BEFORE publishing the count (see lib/supabase.ts): a failed
    // chunk must never leave a count that points at a partial token.
    for (let i = 0; i < total; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}_chunks`, total.toString());
    // The plain (unchunked) slot would otherwise hold a stale smaller value.
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
  async getItem(key: string): Promise<string | null> {
    const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!chunkCountStr) return await SecureStore.getItemAsync(key);
    const count = parseInt(chunkCountStr, 10);
    const chunks = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },
  async deleteItem(key: string) {
    const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (chunkCountStr) {
      const count = parseInt(chunkCountStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
    }
    await SecureStore.deleteItemAsync(key).catch(() => {});
  }
};

export const AccountService = {
  async getAccounts(): Promise<AccountRegistryEntry[]> {
    try {
      const data = await safeStore.getItem(REGISTRY_INDEX_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[AccountService] Failed to load index', e);
      return [];
    }
  },

  async getSession(userId: string): Promise<{ access_token: string, refresh_token: string } | null> {
    try {
      const data = await safeStore.getItem(`${SESSION_KEY_PREFIX}${userId}`);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed.access_token && parsed.refresh_token) {
        return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
      }
      return null;
    } catch {
      return null;
    }
  },

  async registerAccount(profile: any, session: any) {
    if (!profile || !session?.access_token || !session?.refresh_token) return;
    
    const accounts = await this.getAccounts();
    const index = accounts.findIndex(a => a.userId === profile.id);

    const entry: AccountRegistryEntry = {
      userId: profile.id,
      fullName: profile.full_name || profile.fullName,
      username: profile.username,
      avatarUrl: profile.avatar_url,
      lastActive: Date.now(),
    };

    if (index > -1) {
      accounts[index] = entry;
    } else {
      accounts.push(entry);
    }

    try {
      await safeStore.setItem(REGISTRY_INDEX_KEY, JSON.stringify(accounts));
      const tokens = { access_token: session.access_token, refresh_token: session.refresh_token };
      await safeStore.setItem(`${SESSION_KEY_PREFIX}${profile.id}`, JSON.stringify(tokens));
      console.log(`[AccountService] Registered session for ${profile.username}`);
    } catch (e) {
      console.error('[AccountService] Failed to register account', e);
    }
  },

  /**
   * Refreshes only the stored tokens of an already-registered account (no profile
   * needed). Supabase rotates refresh tokens, so stored copies go stale quickly
   * unless they are rewritten on every TOKEN_REFRESHED / SIGNED_IN.
   */
  async updateTokens(session: any) {
    const uid = session?.user?.id;
    if (!uid || !session?.access_token || !session?.refresh_token) return;
    try {
      const accounts = await this.getAccounts();
      if (!accounts.some(a => a.userId === uid)) return;
      await safeStore.setItem(
        `${SESSION_KEY_PREFIX}${uid}`,
        JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
      );
    } catch (e) {
      console.error('[AccountService] Failed to update tokens', e);
    }
  },

  async switchAccount(userId: string) {
    const tokens = await this.getSession(userId);
    if (!tokens) throw new Error('Please sign in again to switch to this account.');

    // Persist the CURRENT account's latest (rotated) tokens before we replace the
    // live session, otherwise switching back later would use a stale refresh token.
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session && data.session.user.id !== userId) await this.updateTokens(data.session);
    } catch {}

    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      const any = error as any;
      const msg = String(any.message ?? '');
      const code = String(any.code ?? '');
      const status = Number(any.status ?? 0);
      const isNetwork = /fetch|network|timed? ?out|retryable/i.test(msg) || any.name === 'AuthRetryableFetchError' || status >= 500;
      const isDead =
        /refresh_token_not_found|refresh_token_already_used|invalid_grant|session_not_found/i.test(code) ||
        /invalid refresh token|refresh token (not found|is not valid|already used)|session.*(expired|not found)/i.test(msg) ||
        (status === 400 || status === 401) && /refresh|expired|invalid/i.test(msg);
      if (isNetwork) throw new Error("Can't reach UniGram right now. Check your connection and try again.");
      if (isDead) {
        await this.removeAccount(userId);
        throw new Error('Session expired. Please log in again.');
      }
      // Unknown failure: keep the saved account and ask the user to sign in.
      throw new Error('Please sign in again to switch to this account.');
    }

    // New user is live: wipe everything cached for the previous one.
    await resetSessionState();

    const accounts = await this.getAccounts();
    const idx = accounts.findIndex(a => a.userId === userId);
    if (idx > -1) {
      accounts[idx].lastActive = Date.now();
      await safeStore.setItem(REGISTRY_INDEX_KEY, JSON.stringify(accounts));
    }
    DeviceEventEmitter.emit('ACCOUNT_SWITCHED', userId);
  },

  async removeAccount(userId: string) {
    const accounts = await this.getAccounts();
    const filtered = accounts.filter(a => a.userId !== userId);
    await safeStore.setItem(REGISTRY_INDEX_KEY, JSON.stringify(filtered));
    await safeStore.deleteItem(`${SESSION_KEY_PREFIX}${userId}`);
  },

  async clearAll() {
    const accounts = await this.getAccounts();
    for (const acc of accounts) {
      await safeStore.deleteItem(`${SESSION_KEY_PREFIX}${acc.userId}`);
    }
    await safeStore.deleteItem(REGISTRY_INDEX_KEY);
  }
};
