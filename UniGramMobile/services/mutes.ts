import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

/**
 * Mute = hide an account's posts/stories from MY feed without blocking them.
 * Backed by `muted_users(user_id, muted_id, created_at)`; if the table is missing
 * we degrade to a local AsyncStorage list so the UI still works.
 */
const key = (uid: string) => `ug_muted_users:${uid}`;

async function readLocal(uid: string): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(key(uid)); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
async function writeLocal(uid: string, ids: string[]) {
  try { await AsyncStorage.setItem(key(uid), JSON.stringify(Array.from(new Set(ids)))); } catch {}
}
async function me(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

let _mutedMem: { uid: string; ids: string[]; at: number } | null = null;
let _mutedInflight: Promise<string[]> | null = null;
const MUTED_TTL = 60_000;

/** Cached (60s) + de-duplicated: feeds call this on every load, it must never add a round trip. */
export async function getMutedIds(): Promise<string[]> {
  const uid = await me();
  if (!uid) return [];
  if (_mutedMem && _mutedMem.uid === uid && Date.now() - _mutedMem.at < MUTED_TTL) return _mutedMem.ids;
  if (_mutedInflight) return _mutedInflight;
  _mutedInflight = fetchMutedIds().then(ids => { _mutedMem = { uid, ids, at: Date.now() }; return ids; })
    .finally(() => { _mutedInflight = null; });
  return _mutedInflight;
}

async function fetchMutedIds(): Promise<string[]> {
  const uid = await me();
  if (!uid) return [];
  const local = await readLocal(uid);
  try {
    const { data, error } = await supabase.from('muted_users').select('muted_id').eq('user_id', uid);
    if (error) return local;
    const remote = (data ?? []).map((r: any) => r.muted_id as string);
    return Array.from(new Set([...remote, ...local]));
  } catch { return local; }
}

export async function isMuted(mutedId: string): Promise<boolean> {
  return (await getMutedIds()).includes(mutedId);
}

export async function muteUser(mutedId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Unauthorized');
  _mutedMem = null;
  await writeLocal(uid, [...(await readLocal(uid)), mutedId]);
  try {
    await supabase.from('muted_users').upsert({ user_id: uid, muted_id: mutedId }, { onConflict: 'user_id,muted_id' });
  } catch {}
  try { const { Cache } = require('../lib/cache'); ['feed:', 'reels:', 'explore'].forEach((p: string) => Cache.invalidatePattern(p)); } catch {}
}

export async function unmuteUser(mutedId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Unauthorized');
  _mutedMem = null;
  await writeLocal(uid, (await readLocal(uid)).filter(i => i !== mutedId));
  try { await supabase.from('muted_users').delete().eq('user_id', uid).eq('muted_id', mutedId); } catch {}
}
