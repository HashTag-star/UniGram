import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { DeviceEventEmitter } from 'react-native';

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
    await SecureStore.setItemAsync(`${key}_chunks`, total.toString());
    for (let i = 0; i < total; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
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

  async switchAccount(userId: string) {
    const tokens = await this.getSession(userId);
    if (!tokens) throw new Error(`Auth session missing for UID: ${userId}`);

    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      if (error.message.includes('expired')) {
         await this.removeAccount(userId);
         throw new Error('Session expired. Please log in again.');
      }
      throw error;
    }

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
