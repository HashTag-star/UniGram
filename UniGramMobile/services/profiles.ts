import { supabase } from '../lib/supabase';
import { SocialSync } from './social_sync';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { createNotification } from './notifications';
import { sendPushToUser } from './pushNotifications';

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
    const { data: follower } = await supabase.from('profiles').select('username').eq('id', followerId).single();
    const text = 'started following you';
    await createNotification({
      user_id: followingId,
      actor_id: followerId,
      type: 'follow',
      text
    });
    sendPushToUser(followingId, 'New Follower', `@${follower?.username || 'Someone'} ${text}`, {
      type: 'follow',
      userId: followerId // so they can see who followed them
    }).catch(() => {});
  } catch (e) {}
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
 * Performs a cascading delete of all user-generated content.
 * Direct Supabase Auth deletion requires admin keys, so from the client 
 * we delete all associated rows in order.
 */
export async function deleteUserAccount(userId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error('Unauthorized');

  // Order matters for some FK constraints
  const tables = [
    'notifications',
    'follows', // where follower
    'follows', // where following (if they follow themselves? anyway)
    'reels_likes',
    'post_likes',
    'comment_likes',
    'comments',
    'reels',
    'posts',
    'profiles'
  ];

  for (const table of tables) {
    const column = (table === 'follows' && tables.indexOf(table) === 1) ? 'follower_id' : 
                   (table === 'follows' && tables.indexOf(table) === 2) ? 'following_id' : 'user_id';
    
    // Some tables might not have user_id, but profiles has 'id'
    const targetCol = (table === 'profiles') ? 'id' : column;

    try {
      await supabase.from(table).delete().eq(targetCol, userId);
    } catch (e) {
      console.warn(`[Cleanup] Failed to delete from ${table}:`, e);
    }
  }

  // Finally sign out
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
