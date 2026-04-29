import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { createNotification } from './notifications';
import { sendPushToUser } from './pushNotifications';
import { AccountService } from './accounts';

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
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
  const ext = asset.uri.split('.').pop() ?? 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, decode(asset.base64!), {
      contentType: `image/${ext}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId);
  return data.publicUrl;
}

export async function searchUsers(query: string) {
  const safe = query.replace(/[%_\\]/g, '\\$&').slice(0, 50);
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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
  const safe = query.replace(/[%_\\]/g, '\\$&').slice(0, 30);

  let qb = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, verification_type');

  if (safe.length > 0) {
    // Prefix match on username is fastest (indexed); also match full_name
    qb = qb.or(`username.ilike.${safe}%,full_name.ilike.%${safe}%`);
  } else {
    // No query yet — only return people the user follows (avoids a huge table scan)
    if (followingIds.size === 0) return [];
    qb = qb.in('id', [...followingIds]);
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

export async function getFollowers(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId);
  if (error) throw error;
  return data?.map((f: any) => f.profiles) ?? [];
}

export async function getFollowing(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id, profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId);
  if (error) throw error;
  return data?.map((f: any) => f.profiles) ?? [];
}

export async function isFollowing(followerId: string, followingId: string) {
  const { data } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();
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

  // Notify target user
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
      follower?.username || 'Someone',
      text,
      { type: 'follow', userId: followerId, channelId: 'follows' },
      undefined,
      follower?.avatar_url ?? undefined,
      'follow',
    ).catch(() => {});
  } catch (e) {}

  // After a follow, send fresh suggestions so the user discovers more people while engaged
  try {
    const { getFollowSuggestions } = require('./algorithm');
    const { sendFollowSuggestionNotif } = require('./notifications');
    // Small limit, bypass cache with a unique key via a direct call
    const suggestions = await getFollowSuggestions(followerId, 5);
    if (suggestions.length >= 2) {
      sendFollowSuggestionNotif(followerId, suggestions.map((s: any) => ({ id: s.id, username: s.username, avatar_url: s.avatar_url }))).catch(() => {});
    }
  } catch (_) {}
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
    .update({ last_seen_at: new Date().toISOString() })
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

  // Fully sign out and flush the local auth session
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) throw signOutError;
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
  
  if (error) throw error;
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
}

/**
 * Gets the list of blocked user IDs for the current user.
 */
export async function getBlockedUserIds() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id);
  
  if (error) return [];
  return data.map(b => b.blocked_id);
}
/**
 * Finds platform users that match a list of emails from phone contacts.
 */
export async function matchContactsByEmail(emails: string[]) {
  const { data, error } = await supabase.rpc('match_contacts', { p_emails: emails });
  if (error) {
    console.error('Error matching contacts', error);
    return [];
  }
  return data;
}
