import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { uploadFile } from './upload';
import { sendPushToUser } from './pushNotifications';

// ─── Conversations ────────────────────────────────────────────────────────────

export async function getConversations(userId: string) {
  const { data, error } = await supabase.rpc('get_user_conversations', { p_user_id: userId });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : JSON.parse(data as string)) as any[];
  return rows.map((conv: any) => ({
    unread_count: conv.unread_count ?? 0,
    conversations: conv,
  }));
}

export async function createDirectConversation(userId1: string, userId2: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_dm', { user1: userId1, user2: userId2 });
  if (error) throw error;
  return data as string;
}

export async function createGroupConversation(
  creatorId: string,
  memberIds: string[],
  groupName: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_v2', {
    owner_id: creatorId,
    member_ids: memberIds,
    group_name: groupName,
  });
  if (error) throw error;
  return data as string;
}

export async function searchConversations(userId: string, query: string) {
  if (!query.trim()) return [];
  const safe = query.replace(/[%_\\]/g, '\\$&').slice(0, 50);
  // Fetch user's conversation_participants with nested profiles of all participants
  const { data, error } = await supabase
    .from('conversation_participants')
    .select(`
      unread_count,
      conversations(
        id, is_group, group_name, last_message, last_message_at,
        conversation_participants(user_id, profiles(*))
      )
    `)
    .eq('user_id', userId);
  if (error) throw error;
  if (!data) return [];

  const lower = safe.toLowerCase();
  return data.filter((row: any) => {
    const conv = row.conversations;
    if (!conv) return false;
    if (conv.is_group) {
      return (conv.group_name ?? '').toLowerCase().includes(lower);
    }
    const other = (conv.conversation_participants ?? []).find(
      (p: any) => p.user_id !== userId,
    )?.profiles;
    if (!other) return false;
    return (
      (other.full_name ?? '').toLowerCase().includes(lower) ||
      (other.username ?? '').toLowerCase().includes(lower)
    );
  });
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(conversationId: string, limit = 60, before?: string) {
  let query = supabase
    .from('messages')
    .select(`
      *,
      profiles(*),
      message_reactions(id, emoji, user_id, profiles(*)),
      reply:reply_to_message_id(id, text, type, sender_id, media_url, profiles(id, username, full_name))
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  type: 'text' | 'image' | 'gif' | 'audio' | 'share' = 'text',
  mediaUrl?: string,
  replyToId?: string,
  duration?: number,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== senderId) throw new Error('Unauthorized');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text,
      type,
      media_url: mediaUrl ?? null,
      reply_to_message_id: replyToId ?? null,
      duration: duration ?? null,
    })
    .select(`*, profiles(*), message_reactions(id, emoji, user_id, profiles(*)), reply:reply_to_message_id(id, text, type, sender_id, media_url, profiles(id, username, full_name))`)
    .single();
  if (error) throw error;

  // Push notification to other participants
  try {
    const sender = data.profiles;
    const pushBody =
      type === 'image' ? 'Sent a photo 📷' :
      type === 'audio' ? 'Sent a voice message 🎤' :
      type === 'gif'   ? 'Sent a GIF 🎞️' :
      text.length > 80 ? text.slice(0, 77) + '…' : text;

    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId);

    participants?.forEach((p: any) => {
      sendPushToUser(
        p.user_id,
        sender?.username || 'Someone',
        pushBody,
        { type: 'message', conversationId },
        type === 'image' ? (mediaUrl ?? undefined) : undefined,
        sender?.avatar_url ?? undefined,
      ).catch(() => {});
    });
  } catch { /* non-fatal */ }

  return data;
}

export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  imageUri: string,
  replyToId?: string,
) {
  const ext = imageUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${senderId}/${Date.now()}.${ext}`;
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const publicUrl = await uploadFile('message-media', path, imageUri, mimeType);
  return sendMessage(conversationId, senderId, '', 'image', publicUrl, replyToId);
}

export async function sendVoiceMessage(
  conversationId: string,
  senderId: string,
  audioUri: string,
  duration: number,
  replyToId?: string,
) {
  const path = `${senderId}/${Date.now()}.m4a`;
  const publicUrl = await uploadFile('message-media', path, audioUri, 'audio/m4a');
  return sendMessage(conversationId, senderId, '', 'audio', publicUrl, replyToId, duration);
}

export async function unsendMessage(messageId: string, userId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ is_deleted: true, text: 'Message unsent', media_url: null })
    .eq('id', messageId)
    .eq('sender_id', userId);
  if (error) throw error;
}

export async function sendSharedContent(
  conversationId: string,
  senderId: string,
  content: { type: 'post' | 'reel' | 'profile'; id: string; previewUrl?: string; title?: string },
) {
  const text = JSON.stringify(content);
  return sendMessage(conversationId, senderId, text, 'share', content.previewUrl);
}

export async function markMessagesRead(conversationId: string, userId: string) {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false);
  await supabase
    .from('conversation_participants')
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export async function addReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji });
  if (error && error.code !== '23505') throw error;
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) throw error;
}

export async function getReactions(messageIds: string[]) {
  if (!messageIds.length) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('id, message_id, emoji, user_id, profiles(*)')
    .in('message_id', messageIds);
  if (error) throw error;
  return data ?? [];
}

// ─── Realtime ────────────────────────────────────────────────────────────────

export function subscribeToMessages(
  conversationId: string,
  onMessage: (msg: any) => void,
  onUpdate: (msg: any) => void,
): RealtimeChannel {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        const messageId = (payload.new as any)?.id || (payload.old as any)?.id;
        if (!messageId) return;
        const { data } = await supabase
          .from('messages')
          .select(`*, profiles(*), message_reactions(id, emoji, user_id, profiles(*)), reply:reply_to_message_id(id, text, type, sender_id, media_url, profiles(id, username, full_name))`)
          .eq('id', messageId)
          .single();
        if (!data) return;
        if (payload.eventType === 'INSERT') {
          onMessage(data);
        } else {
          onUpdate(data);
        }
      },
    )
    .subscribe();
}

export function subscribeToConversationList(
  userId: string,
  onChange: () => void,
): RealtimeChannel {
  // We listen to all message inserts and check server-side if userId is a participant.
  // Since Supabase filters can't do joins, we listen broadly and let the caller reload.
  return supabase
    .channel(`conv-list:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        // Only trigger if the current user is a participant in this conversation
        const convId = payload.new.conversation_id;
        if (!convId) return;
        const { data } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', convId)
          .eq('user_id', userId)
          .maybeSingle();
        if (data) onChange();
      },
    )
    .subscribe();
}

// ─── User search (keep local — used by NewConvModal) ────────────────────────

export async function searchUsersForDM(query: string, currentUserId: string) {
  if (!query.trim()) return [];
  const safe = query.replace(/[%_\\]/g, '\\$&').slice(0, 50);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, verification_type')
    .neq('id', currentUserId)
    .or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .limit(15);
  if (error) return [];
  return data ?? [];
}

export async function getFollowConnections(userId: string) {
  const [followingRes, followersRes] = await Promise.all([
    supabase
      .from('follows')
      .select(
        `following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`,
      )
      .eq('follower_id', userId),
    supabase
      .from('follows')
      .select(
        `follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`,
      )
      .eq('following_id', userId),
  ]);

  const uniqueUsers = new Map<string, any>();
  
  // Tag following
  followingRes.data?.forEach((row: any) => {
    if (row.profiles) {
      uniqueUsers.set(row.profiles.id, { ...row.profiles, relationship: 'following' });
    }
  });

  // Tag followers (mutuals will be updated to 'mutual')
  followersRes.data?.forEach((row: any) => {
    if (row.profiles) {
      if (uniqueUsers.has(row.profiles.id)) {
        uniqueUsers.set(row.profiles.id, { ...row.profiles, relationship: 'mutual' });
      } else {
        uniqueUsers.set(row.profiles.id, { ...row.profiles, relationship: 'follower' });
      }
    }
  });

  return Array.from(uniqueUsers.values());
}
