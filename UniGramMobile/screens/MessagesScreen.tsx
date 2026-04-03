import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConvSkeleton } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import {
  getConversations, getMessages, sendMessage,
  markMessagesRead, subscribeToMessages,
} from '../services/messages';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

// ─── Conversation List ──────────────────────────────────────────────────────
const ConversationList: React.FC<{
  currentUserId: string;
  currentUsername: string;
  onPress: (conv: any) => void;
}> = ({ currentUserId, currentUsername, onPress }) => {
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConversations(currentUserId)
      .then(setConvs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUserId]);

  const getOtherParticipants = (conv: any) => {
    const participants = conv.conversations?.conversation_participants ?? [];
    return participants.filter((p: any) => p.user_id !== currentUserId);
  };

  const totalUnread = convs.reduce((sum: number, c: any) => sum + (c.unread_count ?? 0), 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading ? (
        <ConvSkeleton />
      ) : convs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chatbubbles-outline" size={52} color="#333" />
          <Text style={{ color: '#555', marginTop: 14, fontSize: 15 }}>No messages yet</Text>
          <Text style={{ color: '#444', marginTop: 6, fontSize: 13 }}>Start a conversation from someone's profile</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
          {/* Active bar */}
          <View style={styles.activeFriends}>
            <Text style={styles.sectionLabel}>ACTIVE NOW</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 8 }}>
              {convs.map(c => {
                const others = getOtherParticipants(c);
                const other = others[0]?.profiles;
                if (!other) return null;
                return (
                  <TouchableOpacity key={c.conversations?.id} style={styles.activeItem} onPress={() => onPress(c)}>
                    <View style={styles.activeAvatarWrap}>
                      {other.avatar_url
                        ? <Image source={{ uri: other.avatar_url }} style={styles.activeAvatar} />
                        : <View style={[styles.activeAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="person" size={18} color="#555" />
                          </View>
                      }
                      <View style={styles.onlineDot} />
                    </View>
                    <Text style={styles.activeUsername} numberOfLines={1}>{other.username}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <Text style={[styles.sectionLabel, { paddingHorizontal: 14, marginBottom: 4 }]}>
            MESSAGES{totalUnread > 0 && <Text style={{ color: '#818cf8' }}> ({totalUnread} new)</Text>}
          </Text>

          {convs.map(c => {
            const conv = c.conversations;
            const others = getOtherParticipants(c);
            const other = others[0]?.profiles;
            if (!conv || !other) return null;
            return (
              <TouchableOpacity key={conv.id} style={styles.convItem} onPress={() => onPress(c)}>
                <View style={styles.convAvatarWrap}>
                  {other.avatar_url
                    ? <Image source={{ uri: other.avatar_url }} style={styles.convAvatar} />
                    : <View style={[styles.convAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={20} color="#555" />
                      </View>
                  }
                  {c.unread_count > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{c.unread_count}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.convHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.convName, c.unread_count > 0 && { fontWeight: 'bold' }]}>
                        {conv.is_group ? conv.group_name : other.full_name}
                      </Text>
                      {other.is_verified && <VerifiedBadge type={other.verification_type} size="sm" />}
                    </View>
                    {conv.last_message_at && <Text style={styles.convTime}>{timeAgo(conv.last_message_at)}</Text>}
                  </View>
                  <Text style={[styles.convPreview, c.unread_count > 0 && { color: '#fff' }]} numberOfLines={1}>
                    {conv.last_message ?? 'Start a conversation'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

// ─── Chat View ───────────────────────────────────────────────────────────────
const ChatView: React.FC<{
  convData: any;
  currentUserId: string;
  onBack: () => void;
}> = ({ convData, currentUserId, onBack }) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const conv = convData.conversations;
  const participants = conv?.conversation_participants ?? [];
  const other = participants.find((p: any) => p.user_id !== currentUserId)?.profiles;

  useEffect(() => {
    if (!conv?.id) return;
    getMessages(conv.id)
      .then(msgs => { setMessages(msgs); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100); })
      .catch(console.error)
      .finally(() => setLoading(false));
    markMessagesRead(conv.id, currentUserId).catch(() => {});

    channelRef.current = subscribeToMessages(conv.id, (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => { channelRef.current?.unsubscribe(); };
  }, [conv?.id, currentUserId]);

  const send = async () => {
    if (!text.trim() || !conv?.id) return;
    const t = text.trim();
    setText('');
    try {
      await sendMessage(conv.id, currentUserId, t);
    } catch (e) {
      setText(t);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.chatHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={onBack} style={styles.chatBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.chatHeaderUser}>
          <View style={{ position: 'relative' }}>
            {other?.avatar_url
              ? <Image source={{ uri: other.avatar_url }} style={styles.chatAvatar} />
              : <View style={[styles.chatAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={16} color="#555" />
                </View>
            }
            <View style={styles.chatOnlineDot} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.chatName}>{other?.full_name ?? other?.username ?? 'Chat'}</Text>
              {other?.is_verified && <VerifiedBadge type={other.verification_type} size="sm" />}
            </View>
            <Text style={styles.chatStatus}>Active now</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={styles.chatAction}><Ionicons name="call-outline" size={20} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
          <TouchableOpacity style={styles.chatAction}><Ionicons name="videocam-outline" size={20} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#4f46e5" />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            {other?.avatar_url
              ? <Image source={{ uri: other.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
              : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={28} color="#555" />
                </View>
            }
            <Text style={styles.chatIntroName}>{other?.full_name ?? other?.username}</Text>
            {other?.is_verified && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <VerifiedBadge type={other.verification_type} size="sm" />
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Verified</Text>
              </View>
            )}
            {other?.university && (
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{other.university}</Text>
            )}
          </View>

          {messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <View key={msg.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                {!isMe && (
                  msg.profiles?.avatar_url
                    ? <Image source={{ uri: msg.profiles.avatar_url }} style={styles.msgAvatar} />
                    : <View style={[styles.msgAvatar, { backgroundColor: '#222' }]} />
                )}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{msg.text}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.inputIcon}><Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <TouchableOpacity><Ionicons name="happy-outline" size={18} color="rgba(255,255,255,0.3)" /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={send} style={[styles.sendBtn, text.trim() && styles.sendBtnActive]}>
          <Ionicons name="send" size={18} color={text.trim() ? '#fff' : 'rgba(255,255,255,0.2)'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── Messages Screen ─────────────────────────────────────────────────────────
export const MessagesScreen: React.FC<{ onChatStateChange?: (inChat: boolean) => void }> = ({ onChatStateChange }) => {
  const insets = useSafeAreaInsets();
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const openChat = (conv: any) => {
    setActiveConv(conv);
    onChatStateChange?.(true);
  };

  const closeChat = () => {
    setActiveConv(null);
    onChatStateChange?.(false);
  };

  if (!currentUserId) return <View style={styles.container}><ConvSkeleton /></View>;
  if (activeConv) return <ChatView convData={activeConv} currentUserId={currentUserId} onBack={closeChat} />;
  return <ConversationList currentUserId={currentUserId} currentUsername="" onPress={openChat} />;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  composeBtn: { padding: 4 },
  sectionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 8 },
  activeFriends: { paddingLeft: 14, marginBottom: 16 },
  activeItem: { alignItems: 'center', gap: 4, width: 56 },
  activeAvatarWrap: { position: 'relative' },
  activeAvatar: { width: 52, height: 52, borderRadius: 26 },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  activeUsername: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  convAvatarWrap: { position: 'relative' },
  convAvatar: { width: 52, height: 52, borderRadius: 26 },
  unreadBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  unreadText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  convHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  convName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  convTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  convPreview: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  chatBack: { padding: 4, marginRight: 6 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18 },
  chatOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  chatName: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  chatStatus: { fontSize: 11, color: '#22c55e' },
  chatAction: { padding: 8 },
  chatIntroName: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 4, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowThem: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 8 },
  msgAvatar: { width: 24, height: 24, borderRadius: 12 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 280 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  inputIcon: { padding: 4 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, color: '#fff', fontSize: 14 },
  sendBtn: { padding: 8 },
  sendBtnActive: { backgroundColor: '#4f46e5', borderRadius: 20 },
});
