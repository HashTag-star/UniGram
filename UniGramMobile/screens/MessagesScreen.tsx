import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { ConvSkeleton } from '../components/Skeleton';
import { VerifiedBadge } from '../components/VerifiedBadge';
import {
  getConversations,
  getMessages,
  sendMessage,
  sendImageMessage,
  createDirectConversation,
  createGroupConversation,
  markMessagesRead,
  subscribeToMessages,
  subscribeToConversationList,
  searchConversations,
  searchUsersForDM,
  getFollowConnections,
  addReaction,
  removeReaction,
} from '../services/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const secs = (Date.now() - new Date(ts).getTime()) / 1000;
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function sameGroup(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a.sender_id !== b.sender_id) return false;
  return Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_THRESHOLD_MS;
}

// ─── Typing dots animation ────────────────────────────────────────────────────

const TypingDots: React.FC = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 200);
    const a3 = pulse(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginHorizontal: 2,
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={styles.typingBubble}>
      <Animated.View style={dotStyle(dot1)} />
      <Animated.View style={dotStyle(dot2)} />
      <Animated.View style={dotStyle(dot3)} />
    </View>
  );
};

// ─── Reaction Picker ──────────────────────────────────────────────────────────

interface ReactionPickerProps {
  visible: boolean;
  position: { x: number; y: number };
  onPick: (emoji: string) => void;
  onClose: () => void;
}

const ReactionPicker: React.FC<ReactionPickerProps> = ({ visible, position, onPick, onClose }) => {
  if (!visible) return null;
  const top = Math.max(position.y - 70, 90);
  const left = Math.min(Math.max(position.x - 130, 8), 260);
  return (
    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
      <View style={[styles.reactionPicker, { top, left }]}>
        {EMOJI_REACTIONS.map((e) => (
          <TouchableOpacity
            key={e}
            style={styles.reactionEmoji}
            onPress={() => onPick(e)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={{ fontSize: 26 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
};

// ─── Image Lightbox ───────────────────────────────────────────────────────────

const ImageLightbox: React.FC<{ uri: string; visible: boolean; onClose: () => void }> = ({
  uri,
  visible,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={styles.lightboxBg} activeOpacity={1} onPress={onClose}>
      <Image source={{ uri }} style={styles.lightboxImage} resizeMode="contain" />
    </TouchableOpacity>
  </Modal>
);

// ─── Message Bubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: any;
  isMe: boolean;
  prevMsg: any | null;
  nextMsg: any | null;
  currentUserId: string;
  onLongPress: (msg: any, x: number, y: number) => void;
  onReactionTap: (msg: any, emoji: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  isMe,
  prevMsg,
  nextMsg,
  currentUserId,
  onLongPress,
  onReactionTap,
}) => {
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const isImage = msg.type === 'image';
  const isGrouped = sameGroup(prevMsg, msg);
  const isLastInGroup = !sameGroup(msg, nextMsg);
  const showAvatar = !isMe && isLastInGroup;
  const showDay = !prevMsg || fmtDay(prevMsg.created_at) !== fmtDay(msg.created_at);
  const showTimestamp = isLastInGroup;

  // Group reactions by emoji
  const grouped = useMemo<Record<string, { count: number; iMine: boolean }>>(() => {
    const acc: Record<string, { count: number; iMine: boolean }> = {};
    (msg.message_reactions ?? []).forEach((r: any) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, iMine: false };
      acc[r.emoji].count += 1;
      if (r.user_id === currentUserId) acc[r.emoji].iMine = true;
    });
    return acc;
  }, [msg.message_reactions, currentUserId]);

  const isRead = msg.is_read === true;

  return (
    <>
      {showDay && (
        <View style={styles.dayDivider}>
          <Text style={styles.dayLabel}>{fmtDay(msg.created_at)}</Text>
        </View>
      )}

      {lightboxUri !== null && (
        <ImageLightbox
          uri={lightboxUri}
          visible={true}
          onClose={() => setLightboxUri(null)}
        />
      )}

      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, isGrouped && { marginBottom: 1 }]}>
        {/* Avatar placeholder (keeps layout symmetric) */}
        {!isMe && (
          <View style={{ width: 30, marginRight: 6, alignSelf: 'flex-end' }}>
            {showAvatar ? (
              msg.profiles?.avatar_url ? (
                <Image source={{ uri: msg.profiles.avatar_url }} style={styles.msgAvatar} />
              ) : (
                <View style={[styles.msgAvatar, { backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={14} color="#555" />
                </View>
              )
            ) : null}
          </View>
        )}

        <View style={{ maxWidth: '75%' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={(e) => onLongPress(msg, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            delayLongPress={350}
          >
            {isImage ? (
              <TouchableOpacity onPress={() => setLightboxUri(msg.media_url)} activeOpacity={0.9}>
                <Image
                  source={{ uri: msg.media_url }}
                  style={[
                    styles.imageBubble,
                    isMe ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 },
                  ]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={styles.bubbleText}>{msg.text}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Reactions row */}
          {Object.keys(grouped).length > 0 && (
            <View style={[styles.reactionsRow, isMe && { alignSelf: 'flex-end' }]}>
              {Object.entries(grouped).map(([emoji, { count, iMine }]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionBadge, iMine && styles.reactionBadgeMine]}
                  onPress={() => onReactionTap(msg, emoji)}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Timestamp + read receipt */}
          {showTimestamp && (
            <View style={[styles.msgMeta, isMe && { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <Text style={styles.msgTime}>{fmtTime(msg.created_at)}</Text>
              {isMe && (
                <Ionicons
                  name={isRead ? 'checkmark-done' : 'checkmark'}
                  size={12}
                  color={isRead ? '#818cf8' : 'rgba(255,255,255,0.35)'}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </>
  );
};

// ─── New Conversation Modal ───────────────────────────────────────────────────

interface NewConvModalProps {
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onOpen: (convId: string, otherProfile: any) => void;
}

type NewConvMode = 'dm' | 'group-pick' | 'group-name';

const NewConvModal: React.FC<NewConvModalProps> = ({ visible, currentUserId, onClose, onOpen }) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<NewConvMode>('dm');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  // Group creation state
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    if (visible && currentUserId) {
      getFollowConnections(currentUserId).then(setSuggestions).catch(console.error);
    }
  }, [visible, currentUserId]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(suggestions);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const data = await searchUsersForDM(query, currentUserId);
      setResults(data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, suggestions, currentUserId]);

  const reset = useCallback(() => {
    setMode('dm');
    setQuery('');
    setResults([]);
    setSelectedUsers([]);
    setGroupName('');
    setCreating(null);
    setCreatingGroup(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const startDM = useCallback(async (user: any) => {
    setCreating(user.id);
    try {
      const convId = await createDirectConversation(currentUserId, user.id);
      reset();
      onOpen(convId, user);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to start conversation');
      setCreating(null);
    }
  }, [currentUserId, onOpen, reset]);

  const toggleGroupUser = useCallback((user: any) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id);
      if (exists) return prev.filter((u) => u.id !== user.id);
      return [...prev, user];
    });
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || selectedUsers.length < 1) return;
    setCreatingGroup(true);
    try {
      const memberIds = selectedUsers.map((u) => u.id);
      const convId = await createGroupConversation(currentUserId, memberIds, groupName.trim());
      const fakeGroupProfile = {
        id: convId,
        full_name: groupName.trim(),
        username: groupName.trim(),
        avatar_url: null,
        is_verified: false,
        is_group: true,
      };
      reset();
      onOpen(convId, fakeGroupProfile);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  }, [groupName, selectedUsers, currentUserId, onOpen, reset]);

  const renderUserRow = useCallback(({ item }: { item: any }) => {
    const isSelected = !!selectedUsers.find((u) => u.id === item.id);
    const isPickingGroup = mode === 'group-pick';
    return (
      <TouchableOpacity
        style={styles.userResultRow}
        onPress={() => (isPickingGroup ? toggleGroupUser(item) : startDM(item))}
        disabled={!!creating && !isPickingGroup}
        activeOpacity={0.75}
      >
        <View style={{ position: 'relative' }}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.userResultAvatar} />
          ) : (
            <View style={[styles.userResultAvatar, { backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color="#555" />
            </View>
          )}
          {isPickingGroup && isSelected && (
            <View style={styles.selectedCheck}>
              <Ionicons name="checkmark" size={13} color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.userResultName}>{item.full_name ?? item.username}</Text>
            {item.is_verified && <VerifiedBadge type={item.verification_type} size="sm" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.userResultUsername}>@{item.username}</Text>
            {item.relationship && (
              <View style={[
                styles.relBadge,
                item.relationship === 'mutual' && styles.relBadgeMutual,
                item.relationship === 'following' && styles.relBadgeFollowing,
              ]}>
                <Text style={styles.relBadgeText}>
                  {item.relationship === 'mutual' ? 'Mutual' : item.relationship === 'following' ? 'Following' : 'Follower'}
                </Text>
              </View>
            )}
          </View>
        </View>
        {!isPickingGroup && (
          creating === item.id ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
          )
        )}
      </TouchableOpacity>
    );
  }, [creating, mode, selectedUsers, startDM, toggleGroupUser]);

  const listData = useMemo(
    () => (query.trim() ? results : (results.length ? results : suggestions)),
    [query, results, suggestions],
  );

  const isEmpty = !loading && listData.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.newConvModal, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.newConvHeader}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.newConvTitle}>
            {mode === 'dm' ? 'New Message' : mode === 'group-pick' ? 'Add People' : 'Group Name'}
          </Text>
          {mode === 'group-pick' && selectedUsers.length > 0 ? (
            <TouchableOpacity onPress={() => setMode('group-name')}>
              <Text style={{ color: '#6366f1', fontWeight: '600', fontSize: 15 }}>Next</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Group name screen */}
        {mode === 'group-name' ? (
          <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8, letterSpacing: 1 }}>
              GROUP NAME
            </Text>
            <TextInput
              style={styles.groupNameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter a group name…"
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={40}
              autoFocus
            />
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 6 }}>
              {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {selectedUsers.map((u) => (
                <View key={u.id} style={{ alignItems: 'center', width: 56 }}>
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={20} color="#555" />
                    </View>
                  )}
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }} numberOfLines={1}>{u.username}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.createGroupBtn,
                (!groupName.trim() || creatingGroup) && { opacity: 0.4 },
              ]}
              onPress={createGroup}
              disabled={!groupName.trim() || creatingGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createGroupBtnText}>Create Group</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Group chat button (only in DM mode) */}
            {mode === 'dm' && (
              <TouchableOpacity style={styles.newGroupRow} onPress={() => setMode('group-pick')}>
                <View style={styles.newGroupIcon}>
                  <Ionicons name="people" size={20} color="#fff" />
                </View>
                <Text style={styles.newGroupLabel}>New Group Chat</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}

            {/* Search bar */}
            <View style={styles.newConvSearch}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.newConvInput}
                placeholder={mode === 'group-pick' ? 'Add people…' : 'Search people…'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={query}
                onChangeText={setQuery}
                autoFocus={mode === 'group-pick'}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Selected users chips (group mode) */}
            {mode === 'group-pick' && selectedUsers.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ maxHeight: 44 }}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 6 }}
              >
                {selectedUsers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.selectedChip}
                    onPress={() => toggleGroupUser(u)}
                  >
                    <Text style={styles.selectedChipText}>{u.username}</Text>
                    <Ionicons name="close" size={12} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Results */}
            {loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#6366f1" />
            ) : isEmpty ? (
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
                      Search for someone or start a group chat.
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <FlatList
                data={listData}
                keyExtractor={(u) => u.id}
                renderItem={renderUserRow}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
};

// ─── Chat View ────────────────────────────────────────────────────────────────

interface ChatViewProps {
  convData: { convId: string; otherProfile: any };
  currentUserId: string;
  onBack: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ convData, currentUserId, onBack }) => {
  const insets = useSafeAreaInsets();
  const { convId, otherProfile } = convData;

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<{ msg: any; x: number; y: number } | null>(null);

  const flatRef = useRef<FlatList>(null);
  const msgChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSentRef = useRef(false);

  // Load messages and set up realtime
  useEffect(() => {
    if (!convId) return;
    setLoading(true);

    getMessages(convId)
      .then((msgs) => setMessages(msgs))
      .catch(console.error)
      .finally(() => setLoading(false));

    markMessagesRead(convId, currentUserId).catch(() => {});

    msgChannelRef.current = subscribeToMessages(convId, (msg) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.sender_id !== currentUserId) {
        markMessagesRead(convId, currentUserId).catch(() => {});
      }
    });

    // Typing presence (optional — try/catch if presence not available)
    try {
      typingChannelRef.current = supabase
        .channel(`typing:${convId}`)
        .on('presence', { event: 'sync' }, function (this: RealtimeChannel) {
          const state = (this as any).presenceState?.() ?? {};
          const typingUsers: string[] = Object.values(state)
            .flat()
            .map((u: any) => u.user_id)
            .filter((uid: string) => uid !== currentUserId);
          setIsOtherTyping(typingUsers.length > 0);
        })
        .subscribe();
    } catch (_) {
      // Presence not supported in this environment
    }

    return () => {
      msgChannelRef.current?.unsubscribe();
      typingChannelRef.current?.unsubscribe();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [convId, currentUserId]);

  // Scroll to end when messages update
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [loading]);

  const handleTyping = useCallback(
    (val: string) => {
      setText(val);
      if (!typingChannelRef.current) return;
      try {
        if (!isTypingSentRef.current) {
          isTypingSentRef.current = true;
          typingChannelRef.current.track({ user_id: currentUserId });
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          typingChannelRef.current?.untrack();
          isTypingSentRef.current = false;
        }, 2500);
      } catch (_) {}
    },
    [currentUserId],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || uploading) return;
    setText('');
    // Stop typing indicator
    try {
      typingChannelRef.current?.untrack();
      isTypingSentRef.current = false;
    } catch (_) {}
    try {
      await sendMessage(convId, currentUserId, t, 'text');
    } catch (e: any) {
      setText(t);
      Alert.alert('Failed to send', e.message ?? 'Please try again.');
    }
  }, [text, uploading, convId, currentUserId]);

  const pickAndSendImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      await sendImageMessage(convId, currentUserId, result.assets[0].uri);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not send image.');
    } finally {
      setUploading(false);
    }
  }, [convId, currentUserId]);

  const handleReaction = useCallback(
    async (emoji: string) => {
      if (!reactionTarget) return;
      const msg = reactionTarget.msg;
      const existing = (msg.message_reactions ?? []).find(
        (r: any) => r.user_id === currentUserId && r.emoji === emoji,
      );
      setReactionTarget(null);
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const reactions = m.message_reactions ?? [];
          if (existing) {
            return {
              ...m,
              message_reactions: reactions.filter(
                (r: any) => !(r.user_id === currentUserId && r.emoji === emoji),
              ),
            };
          }
          return {
            ...m,
            message_reactions: [...reactions, { id: `opt-${Date.now()}`, emoji, user_id: currentUserId }],
          };
        }),
      );
      try {
        if (existing) {
          await removeReaction(msg.id, currentUserId, emoji);
        } else {
          await addReaction(msg.id, currentUserId, emoji);
        }
      } catch { /* rollback omitted — minor UI glitch acceptable */ }
    },
    [reactionTarget, currentUserId],
  );

  const handleReactionTap = useCallback(
    (msg: any, emoji: string) => {
      const existing = (msg.message_reactions ?? []).find(
        (r: any) => r.user_id === currentUserId && r.emoji === emoji,
      );
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const reactions = m.message_reactions ?? [];
          if (existing) {
            return {
              ...m,
              message_reactions: reactions.filter(
                (r: any) => !(r.user_id === currentUserId && r.emoji === emoji),
              ),
            };
          }
          return {
            ...m,
            message_reactions: [...reactions, { id: `opt-${Date.now()}`, emoji, user_id: currentUserId }],
          };
        }),
      );
      try {
        if (existing) {
          removeReaction(msg.id, currentUserId, emoji).catch(() => {});
        } else {
          addReaction(msg.id, currentUserId, emoji).catch(() => {});
        }
      } catch { }
    },
    [currentUserId],
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <MessageBubble
        msg={item}
        isMe={item.sender_id === currentUserId}
        prevMsg={messages[index - 1] ?? null}
        nextMsg={messages[index + 1] ?? null}
        currentUserId={currentUserId}
        onLongPress={(msg, x, y) => setReactionTarget({ msg, x, y })}
        onReactionTap={handleReactionTap}
      />
    ),
    [messages, currentUserId, handleReactionTap],
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  const isGroup = otherProfile?.is_group === true;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onBack} style={styles.chatBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.chatHeaderUser} activeOpacity={0.8}>
          <View style={{ position: 'relative' }}>
            {otherProfile?.avatar_url ? (
              <Image source={{ uri: otherProfile.avatar_url }} style={styles.chatAvatar} />
            ) : (
              <View style={[styles.chatAvatar, { backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name={isGroup ? 'people' : 'person'} size={16} color="#555" />
              </View>
            )}
            {!isGroup && <View style={styles.chatOnlineDot} />}
          </View>
          <View style={{ marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.chatName} numberOfLines={1}>
                {otherProfile?.full_name ?? otherProfile?.username ?? 'Chat'}
              </Text>
              {otherProfile?.is_verified && (
                <VerifiedBadge type={otherProfile.verification_type} size="sm" />
              )}
            </View>
            <Text style={styles.chatStatus}>
              {isOtherTyping ? 'typing…' : isGroup ? 'Group chat' : 'Active now'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 0 }}>
          <TouchableOpacity style={styles.chatAction}>
            <Ionicons name="call-outline" size={21} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chatAction}>
            <Ionicons name="videocam-outline" size={21} color="rgba(255,255,255,0.5)" />
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
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 8 }}>
              {otherProfile?.avatar_url ? (
                <Image
                  source={{ uri: otherProfile.avatar_url }}
                  style={{ width: 72, height: 72, borderRadius: 36 }}
                />
              ) : (
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={isGroup ? 'people' : 'person'} size={32} color="#555" />
                </View>
              )}
              <Text style={styles.chatIntroName}>
                {otherProfile?.full_name ?? otherProfile?.username}
              </Text>
              {otherProfile?.is_verified && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <VerifiedBadge type={otherProfile.verification_type} size="sm" />
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Verified</Text>
                </View>
              )}
              {otherProfile?.university ? (
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 3 }}>
                  {otherProfile.university}
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            isOtherTyping ? (
              <View style={styles.typingRow}>
                <View style={{ width: 30, marginRight: 6 }}>
                  {otherProfile?.avatar_url ? (
                    <Image source={{ uri: otherProfile.avatar_url }} style={styles.msgAvatar} />
                  ) : (
                    <View style={[styles.msgAvatar, { backgroundColor: '#1e1e1e' }]} />
                  )}
                </View>
                <TypingDots />
              </View>
            ) : null
          }
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={styles.inputIcon} onPress={pickAndSendImage} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Ionicons name="image-outline" size={23} color="rgba(255,255,255,0.45)" />
          )}
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleTyping}
            placeholder="Message…"
            placeholderTextColor="rgba(255,255,255,0.28)"
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={send}
            multiline
            maxLength={2000}
            numberOfLines={1}
          />
          <TouchableOpacity style={{ paddingLeft: 4 }}>
            <Ionicons name="camera-outline" size={19} color="rgba(255,255,255,0.28)" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={send}
          disabled={!text.trim() || uploading}
          style={[styles.sendBtn, text.trim() && !uploading && styles.sendBtnActive]}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Ionicons
            name="send"
            size={17}
            color={text.trim() && !uploading ? '#fff' : 'rgba(255,255,255,0.2)'}
          />
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

interface ConversationListProps {
  currentUserId: string;
  currentUsername: string;
  onPress: (convId: string, otherProfile: any) => void;
  onCompose: () => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  currentUserId,
  currentUsername,
  onPress,
  onCompose,
}) => {
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState<any[]>([]);
  const [filteredConvs, setFilteredConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getConversations(currentUserId);
      setConvs(data);
      setFilteredConvs(data);
    } catch (e) {
      console.error('getConversations failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    load();
    realtimeChannelRef.current = subscribeToConversationList(currentUserId, () => {
      load();
    });
    return () => {
      realtimeChannelRef.current?.unsubscribe();
    };
  }, [load, currentUserId]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!search.trim()) {
      setFilteredConvs(convs);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchConversations(currentUserId, search.trim());
        setFilteredConvs(result);
      } catch {
        // Fallback: client-side filter
        const lower = search.toLowerCase();
        setFilteredConvs(
          convs.filter((c: any) => {
            const other = getOtherParticipant(c, currentUserId);
            const name = (other?.full_name ?? '') + (other?.username ?? '');
            const gname = c.conversations?.group_name ?? '';
            return name.toLowerCase().includes(lower) || gname.toLowerCase().includes(lower);
          }),
        );
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, convs, currentUserId]);

  const totalUnread = useMemo(
    () => convs.reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0),
    [convs],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const renderConvItem = useCallback(
    ({ item: c }: { item: any }) => {
      const conv = c.conversations;
      const other = getOtherParticipant(c, currentUserId);
      if (!conv) return null;
      const isGroup = conv.is_group;
      const displayName = isGroup ? conv.group_name : (other?.full_name || other?.username);
      const hasUnread = (c.unread_count ?? 0) > 0;

      return (
        <TouchableOpacity
          style={styles.convItem}
          onPress={() => onPress(conv.id, other ?? { full_name: conv.group_name, is_group: true })}
          activeOpacity={0.75}
        >
          <View style={styles.convAvatarWrap}>
            {other?.avatar_url ? (
              <Image source={{ uri: other.avatar_url }} style={styles.convAvatar} />
            ) : (
              <View style={[styles.convAvatar, { backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name={isGroup ? 'people' : 'person'} size={21} color="#555" />
              </View>
            )}
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {c.unread_count > 9 ? '9+' : c.unread_count}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.convHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.convName, hasUnread && { fontWeight: 'bold', color: '#fff' }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {!isGroup && other?.is_verified && (
                  <VerifiedBadge type={other.verification_type} size="sm" />
                )}
              </View>
              {conv.last_message_at && (
                <Text style={styles.convTime}>{timeAgo(conv.last_message_at)}</Text>
              )}
            </View>
            <Text
              style={[styles.convPreview, hasUnread && { color: 'rgba(255,255,255,0.65)', fontWeight: '500' }]}
              numberOfLines={1}
            >
              {conv.last_message ?? 'Start a conversation'}
            </Text>
          </View>
          {hasUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      );
    },
    [currentUserId, onPress],
  );

  const keyExtractor = useCallback((c: any) => c.conversations?.id ?? String(Math.random()), []);

  const activeNowData = useMemo(() => convs.slice(0, 10), [convs]);

  const ListHeader = useMemo(
    () => (
      <View style={styles.activeFriends}>
        <Text style={styles.sectionLabel}>ACTIVE NOW</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingVertical: 8 }}
        >
          {activeNowData.map((c) => {
            const other = getOtherParticipant(c, currentUserId);
            if (!other) return null;
            return (
              <TouchableOpacity
                key={c.conversations?.id}
                style={styles.activeItem}
                onPress={() => onPress(c.conversations?.id, other)}
              >
                <View style={styles.activeAvatarWrap}>
                  {other.avatar_url ? (
                    <Image source={{ uri: other.avatar_url }} style={styles.activeAvatar} />
                  ) : (
                    <View style={[styles.activeAvatar, { backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={18} color="#555" />
                    </View>
                  )}
                  <View style={styles.onlineDot} />
                </View>
                <Text style={styles.activeUsername} numberOfLines={1}>
                  {other.username}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    ),
    [activeNowData, currentUserId, onPress],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {currentUsername || 'Messages'}
          {totalUnread > 0 && (
            <Text style={{ color: '#818cf8', fontSize: 14 }}> ·{totalUnread}</Text>
          )}
        </Text>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={onCompose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={15} color="rgba(255,255,255,0.35)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor="rgba(255,255,255,0.28)"
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

      {/* Body */}
      {loading ? (
        <ConvSkeleton />
      ) : convs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={56} color="#2a2a2a" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>Tap the pencil icon above to start a conversation</Text>
          <TouchableOpacity style={styles.newMsgBtn} onPress={onCompose}>
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.newMsgBtnText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConvs}
          keyExtractor={keyExtractor}
          renderItem={renderConvItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />
          }
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            search.trim() ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="search-outline" size={40} color="#2a2a2a" />
                <Text style={{ color: '#555', marginTop: 10 }}>No conversations found</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

// ─── Helpers (module-level) ──────────────────────────────────────────────────

function getOtherParticipant(conv: any, currentUserId: string): any | null {
  const participants = conv.conversations?.conversation_participants ?? [];
  return participants.find((p: any) => p.user_id !== currentUserId)?.profiles ?? null;
}

// ─── Messages Screen (root) ───────────────────────────────────────────────────

type ScreenState = 'list' | 'chat' | 'new';

interface MessagesScreenProps {
  onChatStateChange?: (inChat: boolean) => void;
  initialConv?: { convId: string; otherProfile: any } | null;
  isVisible?: boolean;
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ onChatStateChange, initialConv, isVisible }) => {
  const [screenState, setScreenState] = useState<ScreenState>('list');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUsername, setCurrentUsername] = useState('Messages');
  const [activeConv, setActiveConv] = useState<{ convId: string; otherProfile: any } | null>(null);

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

  const openChat = useCallback(
    (convId: string, otherProfile: any) => {
      setActiveConv({ convId, otherProfile });
      setScreenState('chat');
      onChatStateChange?.(true);
    },
    [onChatStateChange],
  );

  const closeChat = useCallback(() => {
    setActiveConv(null);
    setScreenState('list');
    onChatStateChange?.(false);
  }, [onChatStateChange]);

  // Handle initial conversation from props
  useEffect(() => {
    if (initialConv && currentUserId) {
      openChat(initialConv.convId, initialConv.otherProfile);
    }
  }, [initialConv, currentUserId, openChat]);

  const openCompose = useCallback(() => setScreenState('new'), []);
  const closeCompose = useCallback(() => setScreenState('list'), []);

  if (!currentUserId) {
    return (
      <View style={styles.container}>
        <ConvSkeleton />
      </View>
    );
  }

  if (screenState === 'chat' && activeConv) {
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
        onCompose={openCompose}
      />
      <NewConvModal
        visible={screenState === 'new'}
        currentUserId={currentUserId}
        onClose={closeCompose}
        onOpen={(convId, profile) => {
          closeCompose();
          openChat(convId, profile);
        }}
      />
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ── Conversation list ─────────────────────────────────────────────────────
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  composeBtn: { padding: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  activeFriends: { paddingLeft: 14, marginBottom: 10 },
  activeItem: { alignItems: 'center', gap: 4, width: 58 },
  activeAvatarWrap: { position: 'relative' },
  activeAvatar: { width: 52, height: 52, borderRadius: 26 },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#000',
  },
  activeUsername: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  convAvatarWrap: { position: 'relative' },
  convAvatar: { width: 52, height: 52, borderRadius: 26 },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: '#000',
  },
  unreadText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4f46e5', marginLeft: 8 },
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  convName: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  convTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 6 },
  convPreview: { fontSize: 12, color: 'rgba(255,255,255,0.38)' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -80 },
  emptyTitle: { color: '#555', marginTop: 14, fontSize: 15, fontWeight: '600' },
  emptySubtitle: {
    color: '#444',
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  newMsgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  newMsgBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // ── Chat view ─────────────────────────────────────────────────────────────
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000',
  },
  chatBack: { padding: 4, marginRight: 4 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18 },
  chatOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#000',
  },
  chatName: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  chatStatus: { fontSize: 11, color: '#22c55e' },
  chatAction: { padding: 8 },
  chatIntroName: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 10 },

  // ── Message bubbles ───────────────────────────────────────────────────────
  dayDivider: { alignItems: 'center', marginVertical: 14 },
  dayLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-end',
  },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgRowThem: { alignSelf: 'flex-start' },
  msgAvatar: { width: 26, height: 26, borderRadius: 13 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  imageBubble: { width: 220, height: 260, borderRadius: 18 },
  msgMeta: { marginTop: 3, marginHorizontal: 4 },
  msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.25)' },
  reactionsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  reactionBadgeMine: {
    backgroundColor: 'rgba(79,70,229,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6366f1',
  },
  reactionCount: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },

  // Typing indicator
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 6 },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // ── Input bar ─────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000',
  },
  inputIcon: { padding: 4 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    minHeight: 40,
  },
  input: { flex: 1, color: '#fff', fontSize: 14, maxHeight: 100, paddingVertical: 0 },
  sendBtn: { padding: 8, borderRadius: 20 },
  sendBtnActive: { backgroundColor: '#4f46e5' },

  // ── Reaction picker ───────────────────────────────────────────────────────
  reactionPicker: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'rgba(28,28,28,0.97)',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
    zIndex: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 14,
  },
  reactionEmoji: { padding: 5 },

  // ── Lightbox ──────────────────────────────────────────────────────────────
  lightboxBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: { width: '100%', height: '85%' },

  // ── New Conversation Modal ────────────────────────────────────────────────
  newConvModal: { flex: 1, backgroundColor: '#080808' },
  newConvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  newConvTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  newGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  newGroupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newGroupLabel: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  newConvSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 13,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  newConvInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 0 },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userResultAvatar: { width: 46, height: 46, borderRadius: 23 },
  userResultName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  userResultUsername: { fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 1 },
  selectedCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#080808',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79,70,229,0.3)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6366f1',
  },
  selectedChipText: { color: '#a5b4fc', fontSize: 13, fontWeight: '500' },
  relBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  relBadgeMutual: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  relBadgeFollowing: {
    backgroundColor: 'rgba(79,70,229,0.15)',
  },
  relBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  groupNameInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  createGroupBtn: {
    marginTop: 32,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createGroupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
