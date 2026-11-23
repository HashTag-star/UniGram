import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { uploadFile } from './upload';
import { sendPushToUser } from './pushNotifications';
import { cleanUserText } from '../lib/contentSafety';
import { sanitizeFilterTerm } from './profiles';

const MAX_DM_CHARS = 2000;
const MSG_PROFILE = 'id, username, full_name, avatar_url, is_verified, verification_type';
const MESSAGE_SELECT = `*, profiles(${MSG_PROFILE}), reactions:message_reactions(id, emoji, user_id, profiles(${MSG_PROFILE})), reply:reply_to_message_id(id, text, type, sender_id, media_url, profiles(id, username, full_name))`;

// ─── Conversations ────────────────────────────────────────────────────────────

export async function getConversations(userId: string, archived = false) {
  const { data, error } = await supabase.rpc('get_user_conversations_v2', { 
    p_user_id: userId,
    p_archived: archived
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : JSON.parse(data as string)) as any[];
  return rows.map((conv: any) => ({
    unread_count: conv.unread_count ?? 0,
    is_archived: conv.is_archived ?? false,
    is_muted: conv.is_muted ?? false,
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
  const safe = query.trim().slice(0, 50);
  // Fetch user's conversation_participants with nested profiles of all participants
  const { data, error } = await supabase
    .from('conversation_participants')
    .select(`
      unread_count,
      is_archived,
      is_muted,
      conversations(
        id, is_group, group_name, last_message, last_message_at, pinned_message_id,
        conversation_participants(user_id, profiles(id, username, full_name, avatar_url, is_verified, verification_type))
      )
    `)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .limit(150);
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

export async function toggleArchive(conversationId: string, userId: string, archived: boolean) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_archived: archived })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function toggleMute(conversationId: string, userId: string, muted: boolean) {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: muted })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(conversationId: string, limit = 60, before?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  
  let query = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (user) {
    // Exclude messages deleted for me
    query = query.not('deleted_by', 'cs', `{${user.id}}`);
  }

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  type: 'text' | 'image' | 'gif' | 'audio' | 'share' | 'video' | 'document' = 'text',
  mediaUrl?: string,
  replyToId?: string,
  duration?: number,
  isForwarded = false,
  viewOnce = false,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== senderId) throw new Error('Unauthorized');

  // DMs may be longer than a comment (600) — allow up to MAX_DM_CHARS.
  const sanitizedText = type === 'text' ? cleanUserText(text, 'postCaption').slice(0, MAX_DM_CHARS) : text;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text: sanitizedText,
      type,
      media_url: mediaUrl ?? null,
      reply_to_message_id: replyToId ?? null,
      duration: duration ?? null,
      is_forwarded: isForwarded,
      view_once: viewOnce,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw error;

  // Push notification to other participants — fire-and-forget, never delays the send.
  (async () => {
    try {
      const sender = data.profiles;
      const pushBody =
        type === 'image' ? (viewOnce ? 'Sent a view-once photo 📷' : 'Sent a photo 📷') :
        type === 'audio' ? 'Sent a voice message 🎤' :
        type === 'gif'   ? 'Sent a GIF 🎞️' :
        type === 'video' ? 'Sent a video 📹' :
        type === 'document' ? 'Sent a document 📄' :
        sanitizedText.length > 80 ? sanitizedText.slice(0, 77) + '…' : sanitizedText;

      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id, is_muted')
        .eq('conversation_id', conversationId)
        .neq('user_id', senderId);

      participants?.forEach((p: any) => {
        if (p.is_muted) return; // Skip push for muted users
        sendPushToUser(
          p.user_id,
          'New message',
          pushBody,
          { type: 'message', conversationId, channelId: 'messages' },
          (type === 'image' && !viewOnce) ? (mediaUrl ?? undefined) : undefined,
          sender?.avatar_url ?? undefined,
          'chat_message',
        ).catch(() => {});
      });
    } catch { /* non-fatal */ }
  })();

  return data;
}

export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  imageUri: string,
  replyToId?: string,
  caption?: string,
  viewOnce = false,
) {
  const ext = imageUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${senderId}/${Date.now()}.${ext}`;
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const publicUrl = await uploadFile('message-media', path, imageUri, mimeType);
  return sendMessage(conversationId, senderId, caption || '📷 Photo', 'image', publicUrl, replyToId, undefined, false, viewOnce);
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
  return sendMessage(conversationId, senderId, '🎤 Voice message', 'audio', publicUrl, replyToId, duration);
}

export async function unsendMessage(messageId: string, userId: string) {
  // This is "Delete for Everyone"
  const { error } = await supabase
    .from('messages')
    .update({ is_deleted: true, text: 'Message unsent', media_url: null })
    .eq('id', messageId)
    .eq('sender_id', userId);
  if (error) throw error;
}

export async function deleteMessageForMe(messageId: string) {
  const { error } = await supabase.rpc('delete_message_for_me', {
    p_message_id: messageId,
  });
  if (error) throw error;
}

export async function markMessageViewed(messageId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function pinMessage(conversationId: string, messageId: string | null) {
  const { error } = await supabase
    .from('conversations')
    .update({ pinned_message_id: messageId })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function forwardMessage(
  toConversationId: string,
  senderId: string,
  originalMsg: { text: string; type: string; media_url?: string | null },
) {
  return sendMessage(
    toConversationId,
    senderId,
    originalMsg.text,
    originalMsg.type as any,
    originalMsg.media_url ?? undefined,
    undefined, // no reply
    undefined, // no duration
    true,      // is_forwarded
  );
}


export async function sendSharedContent(
  conversationId: string,
  senderId: string,
  content: { type: 'post' | 'reel' | 'profile'; id: string; previewUrl?: string; title?: string },
) {
  const text = JSON.stringify(content);
  return sendMessage(conversationId, senderId, text, 'share', content.previewUrl);
}

const _readTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; promise: Promise<boolean>; resolve: (v: boolean) => void }>();

async function doMarkRead(conversationId: string, userId: string): Promise<boolean> {
  // One round trip when the RPC exists…
  try {
    const { error } = await supabase.rpc('mark_messages_read', { p_conversation_id: conversationId });
    if (!error) return true;
  } catch { /* RPC missing → fall back */ }
  // …otherwise the two-statement fallback (errors are checked, not swallowed).
  const a = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false);
  const b = await supabase
    .from('conversation_participants')
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return !a.error && !b.error;
}

/**
 * Debounced (600ms, per conversation): a burst of incoming messages produces ONE read-receipt
 * write instead of one per message. Resolves to whether the write succeeded.
 */
export function markMessagesRead(conversationId: string, userId: string): Promise<boolean> {
  const key = `${conversationId}:${userId}`;
  const existing = _readTimers.get(key);
  if (existing) return existing.promise;
  let resolve!: (v: boolean) => void;
  const promise = new Promise<boolean>(r => { resolve = r; });
  const timer = setTimeout(async () => {
    _readTimers.delete(key);
    try { resolve(await doMarkRead(conversationId, userId)); } catch { resolve(false); }
  }, 600);
  _readTimers.set(key, { timer, promise, resolve });
  return promise;
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
    .select(`id, message_id, emoji, user_id, profiles(${MSG_PROFILE})`)
    .in('message_id', messageIds.slice(0, 200));
  if (error) throw error;
  return data ?? [];
}

// ─── Realtime ────────────────────────────────────────────────────────────────

// Sender profiles seen in realtime payloads (so most INSERTs need no refetch at all).
const _senderProfiles = new Map<string, any>();

export function subscribeToMessages(
  conversationId: string,
  onMessage: (msg: any) => void,
  onUpdate: (msg: any) => void,
): RealtimeChannel {
  const enrich = async (id: string) => {
    try {
      const { data } = await supabase.from('messages').select(MESSAGE_SELECT).eq('id', id).maybeSingle();
      if (data) {
        if (data.profiles?.id) _senderProfiles.set(data.profiles.id, data.profiles);
        onUpdate(data);
      }
    } catch { /* the raw row was already delivered */ }
  };

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
      (payload) => {
        const row = payload.new as any;
        if (payload.eventType === 'DELETE') return; // deletes are soft (is_deleted) → arrive as UPDATE
        if (!row?.id) return;
        if (payload.eventType === 'INSERT') {
          // Deliver the payload IMMEDIATELY (never drop a message because a refetch failed)…
          const cachedProfile = _senderProfiles.get(row.sender_id);
          onMessage({ ...row, profiles: cachedProfile ?? null, reactions: [], reply: null });
          // …and only refetch the joins when something is actually missing.
          if (!cachedProfile || row.reply_to_message_id) enrich(row.id);
        } else {
          // UPDATE (read receipts, unsend, view-once): the row itself is enough — callers merge it.
          onUpdate(row);
        }
      },
    )
    .subscribe();
}

export function subscribeToConversationList(
  userId: string,
  onChange: () => void,
): RealtimeChannel {
  // Debounced: a burst of messages causes ONE list reload.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 1200);
  };

  // The user's conversation ids, so unrelated INSERTs on the (unfilterable-by-join) messages
  // table are ignored locally without an extra query each.
  let convIds: Set<string> | null = null;
  let loadingIds: Promise<void> | null = null;
  const loadIds = () => {
    if (!loadingIds) {
      loadingIds = (async () => {
        try {
          const { data } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId).limit(1000);
          convIds = new Set((data ?? []).map((r: any) => r.conversation_id));
        } catch { /* keep null → fall back to a per-message check */ }
        setTimeout(() => { loadingIds = null; }, 30_000); // allow a refresh after 30s (new conversations)
      })();
    }
    return loadingIds;
  };
  loadIds();

  return supabase
    .channel(`conv-list:${userId}`)
    // Precisely filtered: the user's own participant rows (unread_count / last_read changes)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
      () => fire(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        const convId = (payload.new as any)?.conversation_id;
        if (!convId) return;
        if (convIds?.has(convId)) { fire(); return; }
        // Unknown conversation: refresh the id set once, then re-check.
        await loadIds();
        if (convIds?.has(convId)) { fire(); return; }
        if (!convIds) {
          const { data } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', convId)
            .eq('user_id', userId)
            .maybeSingle();
          if (data) fire();
        }
      },
    )
    .subscribe();
}

// ─── User search (keep local — used by NewConvModal) ────────────────────────

export async function searchUsersForDM(query: string, currentUserId: string) {
  const safe = sanitizeFilterTerm(query, 50);
  if (!safe) return [];
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
      .eq('follower_id', userId)
      .limit(500),
    supabase
      .from('follows')
      .select(
        `follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, is_verified, verification_type)`,
      )
      .eq('following_id', userId)
      .limit(500),
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
