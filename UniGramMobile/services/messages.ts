import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export async function getConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select(`
      unread_count,
      conversations(
        id, is_group, group_name, last_message, last_message_at,
        conversation_participants(user_id, profiles(*))
      )
    `)
    .eq('user_id', userId)
    .order('conversations(last_message_at)', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select(`*, profiles(*), message_reactions(id, emoji, user_id, profiles(*))`)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  mediaUrl?: string,
  messageType: 'text' | 'image' = 'text',
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== senderId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text,
      media_url: mediaUrl,
      message_type: messageType,
    })
    .select(`*, profiles(*), message_reactions(id, emoji, user_id, profiles(*))`)
    .single();
  if (error) throw error;
  return data;
}

export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  imageUri: string,
) {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${senderId}/${Date.now()}.${ext}`;
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const { error: upErr } = await supabase.storage
    .from('chat-images')
    .upload(path, blob, { contentType: `image/${ext}` });
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
  return sendMessage(conversationId, senderId, '', urlData.publicUrl, 'image');
}

export async function addReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji });
  if (error && error.code !== '23505') throw error;
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
}

export async function createDirectConversation(userId1: string, userId2: string) {
  const { data, error } = await supabase.rpc('create_dm', { user1: userId1, user2: userId2 });
  if (error) throw error;
  return data;
}

export async function markMessagesRead(conversationId: string, userId: string) {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId);
  await supabase
    .from('conversation_participants')
    .update({ unread_count: 0 })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}

export async function searchUsersForDM(query: string, currentUserId: string) {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, verification_type')
    .neq('id', currentUserId)
    .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
    .limit(15);
  if (error) return [];
  return data ?? [];
}

export async function getFollowConnections(userId: string) {
  const [followingRes, followersRes] = await Promise.all([
    supabase
      .from('follows')
      .select(`following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`)
      .eq('follower_id', userId),
    supabase
      .from('follows')
      .select(`follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`)
      .eq('following_id', userId),
  ]);

  const uniqueUsers = new Map();
  followingRes.data?.forEach((row: any) => {
    if (row.profiles) uniqueUsers.set(row.profiles.id, row.profiles);
  });
  followersRes.data?.forEach((row: any) => {
    if (row.profiles) uniqueUsers.set(row.profiles.id, row.profiles);
  });
  
  return Array.from(uniqueUsers.values());
}

export function subscribeToMessages(conversationId: string, onMessage: (msg: any) => void): RealtimeChannel {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select(`*, profiles(*), message_reactions(id, emoji, user_id, profiles(*))`)
          .eq('id', payload.new.id)
          .single();
        if (data) onMessage(data);
      }
    )
    .subscribe();
}

export function subscribeToTyping(
  conversationId: string,
  currentUserId: string,
  onTypingChange: (typingUsers: string[]) => void,
): RealtimeChannel {
  return supabase
    .channel(`typing:${conversationId}`)
    .on('presence', { event: 'sync' }, function (this: any) {
      const state = (this as any).presenceState?.() ?? {};
      const users = Object.values(state)
        .flat()
        .map((u: any) => u.userId)
        .filter((uid: string) => uid !== currentUserId);
      onTypingChange(users);
    })
    .subscribe();
}
