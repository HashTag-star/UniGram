import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl, Modal, ScrollView,
  Animated, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConvSkeleton } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import * as ImagePicker from 'expo-image-picker';
import {
  getConversations, getMessages, sendMessage, sendImageMessage,
  markMessagesRead, subscribeToMessages, createDirectConversation,
  searchUsersForDM, getFollowConnections, addReaction, removeReaction,
} from '../services/messages';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── New Conversation Modal ───────────────────────────────────────────────────
const NewConvModal: React.FC<{
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onOpen: (convId: string, otherProfile: any) => void;
}> = ({ visible, currentUserId, onClose, onOpen }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    if (visible && currentUserId) {
      getFollowConnections(currentUserId).then(setSuggestions).catch(console.error);
    }
  }, [visible, currentUserId]);

  useEffect(() => {
    if (!query.trim()) { setResults(suggestions); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const data = await searchUsersForDM(query, currentUserId);
      setResults(data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const startConv = async (user: any) => {
    setCreating(user.id);
    try {
      const convId = await createDirectConversation(currentUserId, user.id);
      onOpen(convId, user);
      setQuery('');
      setResults([]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCreating(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.newConvModal}>
        <View style={styles.newConvHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.newConvTitle}>New Message</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.newConvSearch}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.newConvInput}
            placeholder="Search people…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          )}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#6366f1" />
        ) : results.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            {query.trim() ? (
              <>
                <Ionicons name="person-outline" size={44} color="#333" />
                <Text style={{ color: '#555', marginTop: 12 }}>No users found</Text>
              </>
            ) : (
              <>
                <Ionicons name="people-outline" size={44} color="#333" />
                <Text style={{ color: '#555', marginTop: 12, textAlign: 'center', marginHorizontal: 30 }}>
                  Search for a user to start a conversation with.
                </Text>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={u => u.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.userResultRow} onPress={() => startConv(item)} disabled={!!creating}>
                <View style={{ position: 'relative' }}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={styles.userResultAvatar} />
                    : <View style={[styles.userResultAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={20} color="#555" />
                      </View>}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.userResultName}>{item.full_name ?? item.username}</Text>
                    {item.is_verified && <VerifiedBadge type={item.verification_type} size="sm" />}
                  </View>
                  <Text style={styles.userResultUsername}>@{item.username}</Text>
                </View>
                {creating === item.id
                  ? <ActivityIndicator size="small" color="#6366f1" />
                  : <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                }
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

// ─── Reaction Picker ──────────────────────────────────────────────────────────
const ReactionPicker: React.FC<{
  visible: boolean;
  position: { x: number; y: number };
  onPick: (emoji: string) => void;
  onClose: () => void;
}> = ({ visible, position, onPick, onClose }) => {
  if (!visible) return null;
  return (
    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
      <View style={[styles.reactionPicker, { top: Math.max(position.y - 60, 80), left: Math.min(position.x - 10, 260) }]}>
        {EMOJI_REACTIONS.map(e => (
          <TouchableOpacity key={e} style={styles.reactionEmoji} onPress={() => onPick(e)}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble: React.FC<{
  msg: any;
  isMe: boolean;
  prevMsg: any;
  currentUserId: string;
  onLongPress: (msg: any, x: number, y: number) => void;
}> = ({ msg, isMe, prevMsg, currentUserId, onLongPress }) => {
  const isImage = msg.message_type === 'image';
  const showAvatar = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
  const showDay = !prevMsg || fmtDay(prevMsg.created_at) !== fmtDay(msg.created_at);

  // Group reactions
  const grouped: Record<string, number> = {};
  (msg.message_reactions ?? []).forEach((r: any) => {
    grouped[r.emoji] = (grouped[r.emoji] ?? 0) + 1;
  });

  return (
    <>
      {showDay && (
        <View style={styles.dayDivider}>
          <Text style={styles.dayLabel}>{fmtDay(msg.created_at)}</Text>
        </View>
      )}
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe && (
          <View style={{ width: 28, alignSelf: 'flex-end', marginRight: 6 }}>
            {showAvatar && (
              msg.profiles?.avatar_url
                ? <Image source={{ uri: msg.profiles.avatar_url }} style={styles.msgAvatar} />
                : <View style={[styles.msgAvatar, { backgroundColor: '#222' }]} />
            )}
          </View>
        )}
        <View style={{ maxWidth: '75%' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={(e) => onLongPress(msg, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            delayLongPress={350}
          >
            {isImage ? (
              <Image
                source={{ uri: msg.media_url }}
                style={[styles.imageBubble, isMe && { borderBottomRightRadius: 4 }, !isMe && { borderBottomLeftRadius: 4 }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{msg.text}</Text>
              </View>
            )}
          </TouchableOpacity>
          {Object.keys(grouped).length > 0 && (
            <View style={[styles.reactionsRow, isMe && { alignSelf: 'flex-end' }]}>
              {Object.entries(grouped).map(([emoji, count]) => (
                <View key={emoji} style={styles.reactionBadge}>
                  <Text style={{ fontSize: 12 }}>{emoji}</Text>
                  {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.msgTime, isMe && { textAlign: 'right' }]}>{fmtTime(msg.created_at)}</Text>
        </View>
      </View>
    </>
  );
};

// ─── Chat View ────────────────────────────────────────────────────────────────
const ChatView: React.FC<{
  convData: { convId: string; otherProfile: any };
  currentUserId: string;
  onBack: () => void;
}> = ({ convData, currentUserId, onBack }) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false); // other person typing
  const [reactionTarget, setReactionTarget] = useState<{ msg: any; x: number; y: number } | null>(null);
  const flatRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { convId, otherProfile } = convData;

  useEffect(() => {
    if (!convId) return;
    getMessages(convId)
      .then(msgs => {
        setMessages(msgs);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    markMessagesRead(convId, currentUserId).catch(() => {});

    channelRef.current = subscribeToMessages(convId, (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => { channelRef.current?.unsubscribe(); };
  }, [convId, currentUserId]);

  const send = async () => {
    if (!text.trim() || !convId || sending) return;
    const t = text.trim();
    setText('');
    setSending(true);
    try {
      await sendMessage(convId, currentUserId, t);
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setSending(true);
      try {
        await sendImageMessage(convId, currentUserId, result.assets[0].uri);
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Failed to send image');
      } finally {
        setSending(false);
      }
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!reactionTarget) return;
    const msg = reactionTarget.msg;
    const existing = msg.message_reactions?.find(
      (r: any) => r.user_id === currentUserId && r.emoji === emoji
    );
    setReactionTarget(null);
    try {
      if (existing) {
        await removeReaction(msg.id, currentUserId, emoji);
        setMessages(prev => prev.map(m => m.id === msg.id
          ? { ...m, message_reactions: m.message_reactions.filter((r: any) => !(r.user_id === currentUserId && r.emoji === emoji)) }
          : m
        ));
      } else {
        await addReaction(msg.id, currentUserId, emoji);
        setMessages(prev => prev.map(m => m.id === msg.id
          ? { ...m, message_reactions: [...(m.message_reactions ?? []), { id: Date.now(), emoji, user_id: currentUserId }] }
          : m
        ));
      }
    } catch { }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={onBack} style={styles.chatBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.chatHeaderUser}>
          <View style={{ position: 'relative' }}>
            {otherProfile?.avatar_url
              ? <Image source={{ uri: otherProfile.avatar_url }} style={styles.chatAvatar} />
              : <View style={[styles.chatAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={16} color="#555" />
                </View>}
            <View style={styles.chatOnlineDot} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.chatName}>{otherProfile?.full_name ?? otherProfile?.username ?? 'Chat'}</Text>
              {otherProfile?.is_verified && <VerifiedBadge type={otherProfile.verification_type} size="sm" />}
            </View>
            <Text style={styles.chatStatus}>
              {isTyping ? 'typing…' : 'Active now'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={styles.chatAction}>
            <Ionicons name="call-outline" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chatAction}>
            <Ionicons name="videocam-outline" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              {otherProfile?.avatar_url
                ? <Image source={{ uri: otherProfile.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
                : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={28} color="#555" />
                  </View>}
              <Text style={styles.chatIntroName}>{otherProfile?.full_name ?? otherProfile?.username}</Text>
              {otherProfile?.is_verified && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <VerifiedBadge type={otherProfile.verification_type} size="sm" />
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Verified</Text>
                </View>
              )}
              {otherProfile?.university && (
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{otherProfile.university}</Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <MessageBubble
              msg={item}
              isMe={item.sender_id === currentUserId}
              prevMsg={messages[index - 1]}
              currentUserId={currentUserId}
              onLongPress={(msg, x, y) => setReactionTarget({ msg, x, y })}
            />
          )}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Typing indicator */}
      {isTyping && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>typing…</Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={styles.inputIcon} onPress={sendImage} disabled={sending}>
          <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.45)" />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="send"
            onSubmitEditing={send}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity>
            <Ionicons name="happy-outline" size={18} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, text.trim() && !sending && styles.sendBtnActive]}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color={text.trim() ? '#fff' : 'rgba(255,255,255,0.2)'} />}
        </TouchableOpacity>
      </View>

      {/* Reaction picker overlay */}
      <ReactionPicker
        visible={!!reactionTarget}
        position={reactionTarget ? { x: reactionTarget.x, y: reactionTarget.y } : { x: 0, y: 0 }}
        onPick={handleReaction}
        onClose={() => setReactionTarget(null)}
      />
    </KeyboardAvoidingView>
  );
};

// ─── Conversation List ────────────────────────────────────────────────────────
const ConversationList: React.FC<{
  currentUserId: string;
  currentUsername: string;
  onPress: (convId: string, otherProfile: any) => void;
  onCompose: () => void;
}> = ({ currentUserId, currentUsername, onPress, onCompose }) => {
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getConversations(currentUserId);
      setConvs(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  const getOtherParticipant = (conv: any) => {
    const participants = conv.conversations?.conversation_participants ?? [];
    return participants.find((p: any) => p.user_id !== currentUserId)?.profiles;
  };

  const totalUnread = convs.reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0);

  const filtered = search.trim()
    ? convs.filter(c => {
        const other = getOtherParticipant(c);
        const name = (other?.full_name ?? '') + (other?.username ?? '');
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : convs;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {currentUsername || 'Messages'}
          {totalUnread > 0 && <Text style={{ color: '#818cf8', fontSize: 14 }}> ·{totalUnread}</Text>}
        </Text>
        <TouchableOpacity style={styles.composeBtn} onPress={onCompose}>
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={15} color="rgba(255,255,255,0.35)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ConvSkeleton />
      ) : convs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -80 }}>
          <Ionicons name="chatbubbles-outline" size={52} color="#333" />
          <Text style={{ color: '#555', marginTop: 14, fontSize: 15 }}>No messages yet</Text>
          <Text style={{ color: '#444', marginTop: 6, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
            Tap the compose icon above to start a conversation
          </Text>
          <TouchableOpacity style={styles.newMsgBtn} onPress={onCompose}>
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.newMsgBtnText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.conversations?.id ?? Math.random().toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6366f1" />}
          ListHeaderComponent={
            <View style={styles.activeFriends}>
              <Text style={styles.sectionLabel}>ACTIVE NOW</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 8 }}>
                {convs.slice(0, 8).map(c => {
                  const other = getOtherParticipant(c);
                  if (!other) return null;
                  return (
                    <TouchableOpacity
                      key={c.conversations?.id}
                      style={styles.activeItem}
                      onPress={() => onPress(c.conversations?.id, other)}
                    >
                      <View style={styles.activeAvatarWrap}>
                        {other.avatar_url
                          ? <Image source={{ uri: other.avatar_url }} style={styles.activeAvatar} />
                          : <View style={[styles.activeAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                              <Ionicons name="person" size={18} color="#555" />
                            </View>}
                        <View style={styles.onlineDot} />
                      </View>
                      <Text style={styles.activeUsername} numberOfLines={1}>{other.username}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          }
          renderItem={({ item: c }) => {
            const conv = c.conversations;
            const other = getOtherParticipant(c);
            if (!conv || !other) return null;
            const hasUnread = c.unread_count > 0;
            return (
              <TouchableOpacity
                style={styles.convItem}
                onPress={() => onPress(conv.id, other)}
                activeOpacity={0.75}
              >
                <View style={styles.convAvatarWrap}>
                  {other.avatar_url
                    ? <Image source={{ uri: other.avatar_url }} style={styles.convAvatar} />
                    : <View style={[styles.convAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={20} color="#555" />
                      </View>}
                  {hasUnread && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{c.unread_count > 9 ? '9+' : c.unread_count}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.convHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                      <Text style={[styles.convName, hasUnread && { fontWeight: 'bold', color: '#fff' }]} numberOfLines={1}>
                        {conv.is_group ? conv.group_name : (other.full_name || other.username)}
                      </Text>
                      {other.is_verified && <VerifiedBadge type={other.verification_type} size="sm" />}
                    </View>
                    {conv.last_message_at && <Text style={styles.convTime}>{timeAgo(conv.last_message_at)}</Text>}
                  </View>
                  <Text style={[styles.convPreview, hasUnread && { color: 'rgba(255,255,255,0.7)', fontWeight: '500' }]} numberOfLines={1}>
                    {conv.last_message ?? 'Start a conversation'}
                  </Text>
                </View>
                {hasUnread && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
};

// ─── Messages Screen ──────────────────────────────────────────────────────────
export const MessagesScreen: React.FC<{ onChatStateChange?: (inChat: boolean) => void }> = ({ onChatStateChange }) => {
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUsername, setCurrentUsername] = useState('Messages');
  const [activeConv, setActiveConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setCurrentUserId(data.user.id);
      const { data: prof } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single();
      if (prof?.username) setCurrentUsername(prof.username);
    });
  }, []);

  const openChat = (convId: string, otherProfile: any) => {
    setActiveConv({ convId, otherProfile });
    setShowCompose(false);
    onChatStateChange?.(true);
  };

  const closeChat = () => {
    setActiveConv(null);
    onChatStateChange?.(false);
  };

  if (!currentUserId) return <View style={styles.container}><ConvSkeleton /></View>;

  if (activeConv) {
    return (
      <ChatView
        convData={activeConv}
        currentUserId={currentUserId}
        onBack={closeChat}
      />
    );
  }

  return (
    <>
      <ConversationList
        currentUserId={currentUserId}
        currentUsername={currentUsername}
        onPress={openChat}
        onCompose={() => setShowCompose(true)}
      />
      <NewConvModal
        visible={showCompose}
        currentUserId={currentUserId}
        onClose={() => setShowCompose(false)}
        onOpen={openChat}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Conversation list
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  composeBtn: { padding: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginHorizontal: 14, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  sectionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 6 },
  activeFriends: { paddingLeft: 14, marginBottom: 12 },
  activeItem: { alignItems: 'center', gap: 4, width: 58 },
  activeAvatarWrap: { position: 'relative' },
  activeAvatar: { width: 52, height: 52, borderRadius: 26 },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  activeUsername: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  convAvatarWrap: { position: 'relative' },
  convAvatar: { width: 52, height: 52, borderRadius: 26 },
  unreadBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: '#000' },
  unreadText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4f46e5' },
  convHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  convName: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  convTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 6 },
  convPreview: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  newMsgBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, backgroundColor: '#4f46e5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  newMsgBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Chat view
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', backgroundColor: '#000' },
  chatBack: { padding: 4, marginRight: 6 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18 },
  chatOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  chatName: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  chatStatus: { fontSize: 11, color: '#22c55e' },
  chatAction: { padding: 8 },
  chatIntroName: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 8 },

  // Messages
  dayDivider: { alignItems: 'center', marginVertical: 14 },
  dayLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: 0.5 },
  msgRow: { flexDirection: 'row', marginBottom: 3, alignItems: 'flex-end' },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgRowThem: { alignSelf: 'flex-start' },
  msgAvatar: { width: 26, height: 26, borderRadius: 13 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  imageBubble: { width: 220, height: 260, borderRadius: 18 },
  msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2, marginHorizontal: 4 },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, gap: 2 },
  reactionCount: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  typingRow: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontStyle: 'italic' },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#000' },
  inputIcon: { padding: 4 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, color: '#fff', fontSize: 14, maxHeight: 120 },
  sendBtn: { padding: 8, borderRadius: 20 },
  sendBtnActive: { backgroundColor: '#4f46e5' },

  // Reaction picker
  reactionPicker: { position: 'absolute', flexDirection: 'row', backgroundColor: 'rgba(30,30,30,0.96)', borderRadius: 30, paddingHorizontal: 8, paddingVertical: 6, gap: 4, zIndex: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 12 },
  reactionEmoji: { padding: 4 },

  // New conv
  newConvModal: { flex: 1, backgroundColor: '#0a0a0a' },
  newConvHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  newConvTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  newConvSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 13, margin: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  newConvInput: { flex: 1, color: '#fff', fontSize: 15 },
  userResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  userResultAvatar: { width: 46, height: 46, borderRadius: 23 },
  userResultName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  userResultUsername: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
});
