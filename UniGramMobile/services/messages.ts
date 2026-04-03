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
    .select(`*, profiles(*)`)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(conversationId: string, senderId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== senderId) throw new Error('Unauthorized');
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, text })
    .select(`*, profiles(*)`)
    .single();
  if (error) throw error;
  return data;
}

export async function createDirectConversation(userId1: string, userId2: string) {
  // Check if DM already exists between these two users
  const { data: existing } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId1);

  if (existing && existing.length > 0) {
    const ids = existing.map((r: any) => r.conversation_id);
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId2)
      .in('conversation_id', ids);
    if (shared && shared.length > 0) return shared[0].conversation_id;
  }

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({ is_group: false })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('conversation_participants').insert([
    { conversation_id: conv.id, user_id: userId1 },
    { conversation_id: conv.id, user_id: userId2 },
  ]);
  return conv.id;
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

export function subscribeToMessages(conversationId: string, onMessage: (msg: any) => void): RealtimeChannel {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select(`*, profiles(*)`)
          .eq('id', payload.new.id)
          .single();
        if (data) onMessage(data);
      }
    )
    .subscribe();
}
