import { supabase, getPublicMediaUrl } from '../lib/supabase';
import { SocialSync } from './social_sync';
import { Cache, TTL } from '../lib/cache';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { createNotification } from './notifications';
import { sendPushToUser } from './pushNotifications';
import { AccountService } from './accounts';
import { matchContactEmails } from './onboarding';

/** Compact profile embed used by every joined query (never profiles(*)). */
export const PROFILE_MINI_COLUMNS =
  'id, username, full_name, avatar_url, is_verified, verification_type, university, major, is_pro, pro_disabled, pro_expires_at';

/** Strip characters that have meaning inside PostgREST `or()` / `ilike` filter strings. */
export function sanitizeFilterTerm(q: string, max = 50): string {
  return String(q ?? '').replace(/[,()%_\\*"'`;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function getProfile(userId: string) {
  // Profile is read on every avatar render, explore card, DM header — cached for TTL.profile
  // (5 min) and de-duplicated in flight so N simultaneous callers cost ONE request.
  // A single row, so select('*') is kept (screens read many profile columns).
  const key = `profile:${userId}`;
  const hit = Cache.getSync<any>(key, TTL.profile);
  if (hit) return hit;
  const data = await Cache.getOrFetch<any>(key, TTL.profile, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  });
  return data;
}

export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getProfile(user.id);
}

export async function updateProfile(userId: string, updates: {
  full_name?: string;
  username?: string;
  bio?: string;
  university?: string;
  major?: string;
  year?: string;
  pronouns?: string;
  website?: string;
  avatar_url?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  // [Ama Mensah - Lead Dev] Bust stale profile entry so the updated name/avatar shows immediately
  Cache.invalidate(`profile:${userId}`);
  if (data) Cache.set(`profile:${userId}`, data);
  return data;
}

export async function uploadAvatar(userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('Photo library access is required to change your avatar.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images' as any,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  // Strip query strings before extracting extension (RN URIs can have ?v=... suffixes)
  const uriWithoutQuery = asset.uri.split('?')[0];
  const rawExt = uriWithoutQuery.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt) ? rawExt : 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, decode(asset.base64!), {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // The object path is constant per extension, so CDNs / expo-image would keep serving the OLD
  // picture. Append a cache-busting version to the stored URL.
  const avatarUrl = `${getPublicMediaUrl('avatars', path)}?v=${Date.now()}`;
  const { error: updErr } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updErr) throw updErr;

  // Remove a previous avatar stored under a DIFFERENT extension (otherwise it lingers forever).
  try {
    const all = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].filter(e => e !== ext).map(e => `${userId}/avatar.${e}`);
    supabase.storage.from('avatars').remove(all).catch(() => {});
  } catch {}

  Cache.invalidate(`profile:${userId}`);
  return avatarUrl;
}

export async function searchUsers(query: string) {
  const safe = sanitizeFilterTerm(query, 50);
  if (!safe) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, verification_type, university')
    .or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .limit(20);
  if (error) throw error;
  return data;
}

/**
 * Mention autocomplete search.
 * - Empty query → returns up to 8 users the current user follows (instant, no network rank needed)
 * - Non-empty query → prefix-searches all users, followed users floated to the top
 * @param query        Text after the @ (may be empty)
 * @param followingIds Set of user IDs the current user follows (used for priority sorting)
 * @param limit        Max results to return (default 8)
 */
export async function searchMentions(
  query: string,
  followingIds: Set<string>,
  limit = 8,
): Promise<{ id: string; username: string; full_name: string | null; avatar_url: string | null; is_verified?: boolean; verification_type?: string | null; isFollowing: boolean }[]> {
  const safe = sanitizeFilterTerm(query, 30);

  let qb = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, verification_type');

  if (safe.length > 0) {
    // Prefix match on username is fastest (indexed); also match full_name
    qb = qb.or(`username.ilike.${safe}%,full_name.ilike.%${safe}%`);
  } else {
    // No query yet — only return people the user follows (avoids a huge table scan)
    if (followingIds.size === 0) return [];
    qb = qb.in('id', [...followingIds].slice(0, 200));
  }

  const { data, error } = await qb.limit(limit * 2); // fetch extra so we can re-sort
  if (error) throw error;

  const results = (data ?? []) as any[];

  // Float followed users to the top, then sort alphabetically within each tier
  results.sort((a, b) => {
    const aF = followingIds.has(a.id) ? 0 : 1;
    const bF = followingIds.has(b.id) ? 0 : 1;
    if (aF !== bF) return aF - bF;
    return a.username.localeCompare(b.username);
  });

  return results.slice(0, limit).map(r => ({
    ...r,
    isFollowing: followingIds.has(r.id),
  }));
}

export const FOLLOW_LIST_PAGE = 200;

/** Paged (default first 200). */
export async function getFollowers(userId: string, limit = FOLLOW_LIST_PAGE, offset = 0) {
  const { data, error } = await supabase
    .from('follows')
    .select(`follower_id, profiles!follows_follower_id_fkey(${PROFILE_MINI_COLUMNS})`)
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data?.map((f: any) => f.profiles).filter(Boolean) ?? [];
}

/** Paged (default first 200). */
export async function getFollowing(userId: string, limit = FOLLOW_LIST_PAGE, offset = 0) {
  const { data, error } = await supabase
    .from('follows')
    .select(`following_id, profiles!follows_following_id_fkey(${PROFILE_MINI_COLUMNS})`)
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data?.map((f: any) => f.profiles).filter(Boolean) ?? [];
}

export async function isFollowing(followerId: string, followingId: string) {
  const { data } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  return !!data;
}

export async function followUser(followerId: string, followingId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== followerId) throw new Error('Unauthorized');
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId });
  if (error) throw error;
  SocialSync.emit('FOLLOW_CHANGE', { targetId: followingId, isActive: true });

  // Side effects never block the follow (fire-and-forget).
  (async () => {
    try {
      const { data: follower } = await supabase.from('profiles').select('username, avatar_url').eq('id', followerId).single();
      const text = 'started following you 👋';
      await createNotification({
        user_id: followingId,
        actor_id: followerId,
        type: 'follow',
        text
      });
      sendPushToUser(
        followingId,
        'New follower',
        text,
        { type: 'follow', userId: followerId, channelId: 'follows' },
        undefined,
        follower?.avatar_url ?? undefined,
        'follow',
      ).catch(() => {});
    } catch (e) {}
    // Warm the suggestions cache (results are Cache.set inside getFollowSuggestions) so the
    // "people you may know" strip is instant. No self-notification any more.
    try {
      const { getFollowSuggestions } = require('./algorithm');
      Cache.invalidate(`follow_suggestions:${followerId}:5`);
      getFollowSuggestions(followerId, 8)?.catch?.(() => {});
    } catch (_) {}
  })();
}

export async function unfollowUser(followerId: string, followingId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== followerId) throw new Error('Unauthorized');
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw error;
  SocialSync.emit('FOLLOW_CHANGE', { targetId: followingId, isActive: false });
}

export async function updateActiveStatus(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error('Error updating active status', error);
}

/**
 * Performs a secure, complete delete of the user from auth.users.
 * This triggers cascading deletions across all user data.
 */
export async function deleteUserAccount(userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // Trigger secure RPC to delete identity from Supabase Auth
  const { error } = await supabase.rpc('delete_current_user');
  if (error) {
    console.error('Account deletion error', error);
    throw new Error('Could not securely delete account.');
  }

  // Remove from local multi-account switcher registry
  try {
    await AccountService.removeAccount(userId);
  } catch (e) {
    console.warn('[Cleanup] Failed to remove account from registry:', e);
  }

  // Use local-only sign-out — the auth.users row is already gone so a
  // server-side revocation request would return "User not found" and throw.
  // scope:'local' clears the stored session and fires SIGNED_OUT without
  // making any network call.
  await supabase.auth.signOut({ scope: 'local' });
}

/** Drops every cache built with the (now changed) block list. */
function afterBlockChange(blockedId: string) {
  try { require('./algorithm').clearBlockedCache?.(); } catch {}
  for (const p of ['feed:', 'reels:', 'stories:', 'explore', 'follow_suggestions:']) {
    try { Cache.invalidatePattern(p); } catch {}
  }
  SocialSync.emit('FOLLOW_CHANGE', { targetId: blockedId, isActive: false });
}

/**
 * Blocks a user.
 */
export async function blockUser(blockedId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: user.id, blocked_id: blockedId });

  if (error && error.code !== '23505') throw error;
  afterBlockChange(blockedId);
}

/**
 * Unblocks a user.
 */
export async function unblockUser(blockedId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) throw error;
  afterBlockChange(blockedId);
}

/**
 * Gets the list of blocked user IDs for the current user.
 * THROWS on a failed lookup (callers must fail closed / not cache a result built without it).
 */
export async function getBlockedUserIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .limit(2000);

  if (error) throw error;
  return (data ?? []).map((b: any) => b.blocked_id);
}
/**
 * Finds platform users that match a list of emails from phone contacts.
 * Emails are hashed (SHA-256) before leaving the device when expo-crypto + the
 * `match_contacts_hashed` RPC exist; capped at 200 either way.
 */
export async function matchContactsByEmail(emails: string[]) {
  const data = await matchContactEmails(emails);
  if (data === null) {
    console.error('Error matching contacts');
    return [];
  }
  return data;
}
