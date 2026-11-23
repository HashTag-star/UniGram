import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule,
} from 'expo-audio';
import { EmojiKeyboard } from 'rn-emoji-keyboard';

import { supabase } from '../lib/supabase';
import { ConvSkeleton } from '../components/Skeleton';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import {
  getConversations, getMessages, sendMessage, sendImageMessage, createDirectConversation,
  markMessagesRead, subscribeToMessages, subscribeToConversationList, searchUsersForDM,
  getFollowConnections, addReaction, removeReaction, sendVoiceMessage, unsendMessage,
  deleteMessageForMe, pinMessage,
} from '../services/messages';
import { blockUser } from '../services/profiles';
import { getActiveStories } from '../services/stories';
import { initiateCall, CallRecord, CallType } from '../services/calls';
import { CallScreen } from './CallScreen';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { fx } from '../lib/feedback';
import { brand, radius, status } from '../constants/design';

import { friendlyError } from '../lib/friendlyError';
import { ReportSheet } from '../components/ReportSheet';
// ─── Helpers ──────────────────────────────────────────────────────────────────
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const GROUP_MS = 5 * 60 * 1000;

function shortAgo(ts?: string | null): string {
  if (!ts) return '';
  const secs = (Date.now() - new Date(ts).getTime()) / 1000;
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
const fmtTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function dayLabel(ts: string): string {
  const d = new Date(ts); const now = new Date();
  const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Flatten the RPC row into what the UI needs. */
function normalizeConversation(row: any, myId: string) {
  const conv = row.conversations ?? row;
  const parts: any[] = conv.conversation_participants ?? [];
  const other = conv.is_group ? null : parts.find(p => p.user_id !== myId)?.profiles ?? null;
  return {
    id: conv.id as string,
    is_group: !!conv.is_group,
    name: conv.is_group ? (conv.group_name ?? 'Group') : (other?.full_name || other?.username || 'User'),
    username: other?.username as string | undefined,
    other_profile: conv.is_group ? { is_group: true, id: conv.id, username: conv.group_name, full_name: conv.group_name } : other,
    last_message: (conv.last_message as string | null) ?? null,
    last_message_at: (conv.last_message_at as string | null) ?? null,
    unread_count: (row.unread_count ?? conv.unread_count ?? 0) as number,
    is_muted: !!(row.is_muted ?? conv.is_muted),
  };
}
type ConvItem = ReturnType<typeof normalizeConversation>;

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar: React.FC<{
  uri?: string | null; size?: number; hasStory?: boolean; viewed?: boolean; online?: boolean; group?: boolean; onPress?: () => void;
}> = memo(({ uri, size = 52, hasStory, viewed, online, group, onPress }) => {
  const { colors } = useTheme();
  const ring = hasStory ? 3 : 0;
  const outer = size + (hasStory ? 10 : 0);
  const img = uri
    ? <CachedImage uri={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={group ? 'people' : 'person'} size={size * 0.5} color={colors.textMuted} />
      </View>
    );
  const inner = (
    <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>{img}</View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {hasStory ? (
        viewed
          ? <View style={{ width: outer, height: outer, borderRadius: outer / 2, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>{inner}</View>
          : <LinearGradient colors={brand.story as any} start={{ x: 0.1, y: 1 }} end={{ x: 0.9, y: 0 }} style={{ width: outer, height: outer, borderRadius: outer / 2, alignItems: 'center', justifyContent: 'center' }}>{inner}</LinearGradient>
      ) : img}
      {online ? (
        <View style={{
          position: 'absolute', right: ring ? 4 : 0, bottom: ring ? 4 : 0, width: Math.max(12, size * 0.27), height: Math.max(12, size * 0.27),
          borderRadius: 8, backgroundColor: status.success, borderWidth: 2.5, borderColor: colors.bg,
        }} />
      ) : null}
    </Pressable>
  );
});

// ─── Voice message ────────────────────────────────────────────────────────────
const VoiceBubble: React.FC<{ uri: string; duration?: number; mine: boolean }> = ({ uri, duration, mine }) => {
  const player = useAudioPlayer(uri);
  const st = useAudioPlayerStatus(player);
  const total = st.duration > 0 ? st.duration : (duration ?? 0);
  const progress = total > 0 ? Math.min(1, st.currentTime / total) : 0;
  const fg = mine ? '#fff' : brand.violet;
  const bars = useMemo(() => Array.from({ length: 26 }, (_, i) => 6 + Math.abs(Math.sin(i * 1.7 + uri.length)) * 16), [uri]);

  const toggle = () => {
    if (st.playing) { player.pause(); return; }
    if (st.didJustFinish || (total > 0 && st.currentTime >= total - 0.1)) player.seekTo(0);
    player.play();
  };
  return (
    <View style={vs.row}>
      <TouchableOpacity onPress={toggle} style={[vs.play, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : brand.violet + '22' }]} accessibilityRole="button" accessibilityLabel={st.playing ? 'Pause voice message' : 'Play voice message'}>
        <Ionicons name={st.playing ? 'pause' : 'play'} size={18} color={fg} style={!st.playing && { marginLeft: 2 }} />
      </TouchableOpacity>
      <View style={vs.wave}>
        {bars.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: fg, opacity: i / bars.length <= progress ? 1 : 0.35 }} />
        ))}
      </View>
      <Text style={[vs.time, { color: mine ? 'rgba(255,255,255,0.85)' : fg }]}>{fmtDuration(st.playing ? st.currentTime : total)}</Text>
    </View>
  );
};
const vs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 24 },
  time: { fontSize: 12, fontWeight: '600', width: 34, textAlign: 'right' },
});

// ─── Message bubble ───────────────────────────────────────────────────────────
interface BubbleProps {
  msg: any; mine: boolean; older?: any; newer?: any; isGroup: boolean;
  onLongPress: (msg: any) => void; onReactionTap: (msg: any, emoji: string) => void; onImagePress: (uri: string) => void;
  showSeen: boolean;
}
const MessageBubble: React.FC<BubbleProps> = memo(({ msg, mine, older, newer, isGroup, onLongPress, onReactionTap, onImagePress, showSeen }) => {
  const { colors } = useTheme();
  const t = new Date(msg.created_at).getTime();
  const joinsOlder = !!older && older.sender_id === msg.sender_id && t - new Date(older.created_at).getTime() < GROUP_MS && !older.is_deleted;
  const joinsNewer = !!newer && newer.sender_id === msg.sender_id && new Date(newer.created_at).getTime() - t < GROUP_MS && !newer.is_deleted;
  const showDay = !older || dayLabel(older.created_at) !== dayLabel(msg.created_at);

  const R = 20, r = 6;
  const corner = mine
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: joinsOlder ? r : R, borderBottomRightRadius: joinsNewer ? r : R }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: joinsOlder ? r : R, borderBottomLeftRadius: joinsNewer ? r : R };

  const isImage = msg.type === 'image' && !!msg.media_url;
  const isVoice = (msg.type === 'audio' || msg.type === 'voice') && !!msg.media_url;
  const showText = !!msg.text && !(isImage && /^📷 Photo$/.test(msg.text)) && !isVoice;
  const reactions: any[] = msg.reactions ?? [];
  const grouped = Object.values(reactions.reduce((acc: Record<string, { emoji: string; n: number }>, r2: any) => {
    acc[r2.emoji] = acc[r2.emoji] ?? { emoji: r2.emoji, n: 0 }; acc[r2.emoji].n++; return acc;
  }, {}));

  const body = (
    <>
      {msg.reply ? (
        <View style={[bs.reply, { borderLeftColor: mine ? 'rgba(255,255,255,0.55)' : brand.violet }]}>
          <Text style={[bs.replyName, { color: mine ? 'rgba(255,255,255,0.9)' : brand.violet }]} numberOfLines={1}>
            {msg.reply.profiles?.username ?? 'Reply'}
          </Text>
          <Text style={{ fontSize: 12.5, color: mine ? 'rgba(255,255,255,0.8)' : colors.textSub }} numberOfLines={1}>
            {msg.reply.type === 'image' ? '📷 Photo' : msg.reply.type === 'audio' ? '🎤 Voice message' : msg.reply.text}
          </Text>
        </View>
      ) : null}
      {isImage ? (
        <Pressable onPress={() => onImagePress(msg.media_url)}>
          <CachedImage uri={msg.media_url} style={[bs.img, showText && { marginBottom: 6 }]} resizeMode="cover" />
        </Pressable>
      ) : null}
      {isVoice ? <VoiceBubble uri={msg.media_url} duration={msg.duration} mine={mine} /> : null}
      {showText ? <Text style={[bs.text, { color: mine ? '#fff' : colors.text }]}>{msg.text}</Text> : null}
    </>
  );

  if (msg.is_deleted) {
    return (
      <View style={[bs.wrap, { alignItems: mine ? 'flex-end' : 'flex-start', marginTop: joinsOlder ? 2 : 10 }]}>
        <View style={[bs.bubble, corner, { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' }]}>
          <Text style={{ color: colors.textMuted, fontSize: 13.5, fontStyle: 'italic' }}>Message unsent</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {showDay ? <Text style={[bs.day, { color: colors.textMuted }]}>{dayLabel(msg.created_at)}</Text> : null}
      <View style={[bs.wrap, { alignItems: mine ? 'flex-end' : 'flex-start', marginTop: joinsOlder ? 2 : 10 }]}>
        {!mine && isGroup && !joinsOlder ? (
          <Text style={[bs.sender, { color: colors.textMuted }]}>{msg.profiles?.username}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' }}>
          {!mine && isGroup ? (
            <View style={{ width: 26 }}>
              {!joinsNewer ? <Avatar uri={msg.profiles?.avatar_url} size={26} /> : null}
            </View>
          ) : null}
          <Pressable onLongPress={() => onLongPress(msg)} delayLongPress={260} style={{ maxWidth: '82%' }}>
            {mine ? (
              <LinearGradient colors={['#6366f1', '#8b5cf6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[bs.bubble, corner, isImage && !showText && !msg.reply && bs.bubbleMedia]}>
                {body}
              </LinearGradient>
            ) : (
              <View style={[bs.bubble, corner, { backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, isImage && !showText && !msg.reply && bs.bubbleMedia]}>
                {body}
              </View>
            )}
            {grouped.length > 0 ? (
              <View style={[bs.reactions, mine ? { right: 8 } : { left: 8 }]}>
                {grouped.map((g: any) => (
                  <TouchableOpacity key={g.emoji} onPress={() => onReactionTap(msg, g.emoji)} style={[bs.chip, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                    <Text style={{ fontSize: 13 }}>{g.emoji}{g.n > 1 ? <Text style={{ fontSize: 11, color: colors.textSub }}> {g.n}</Text> : null}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Pressable>
        </View>
        {grouped.length > 0 ? <View style={{ height: 12 }} /> : null}
        {!joinsNewer || showSeen ? (
          <Text style={[bs.meta, { color: colors.textMuted }]}>
            {fmtTime(msg.created_at)}{mine && showSeen ? (msg.is_read ? '  ·  Seen' : '  ·  Sent') : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
});
const bs = StyleSheet.create({
  wrap: { paddingHorizontal: 12 },
  day: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: 18, marginBottom: 6 },
  sender: { fontSize: 11.5, marginLeft: 34, marginBottom: 3, fontWeight: '600' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  bubbleMedia: { padding: 3 },
  text: { fontSize: 15.5, lineHeight: 21, letterSpacing: -0.1 },
  img: { width: 230, height: 230, borderRadius: 16 },
  reply: { borderLeftWidth: 3, paddingLeft: 9, marginBottom: 7, borderRadius: 2 },
  replyName: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  reactions: { position: 'absolute', bottom: -14, flexDirection: 'row', gap: 4 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  meta: { fontSize: 11, marginTop: 3, marginHorizontal: 6 },
});

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingDots: React.FC<{ label?: string }> = ({ label }) => {
  const { colors } = useTheme();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 150),
      Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.delay(450 - i * 150),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);
  return (
    <View style={{ paddingHorizontal: 12, marginTop: 10, alignItems: 'flex-start' }}>
      <View style={[bs.bubble, { backgroundColor: colors.bg2, borderRadius: 20, flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
        {label ? <Text style={{ color: colors.textMuted, fontSize: 12.5, marginRight: 2 }}>{label}</Text> : null}
        {dots.map((d, i) => (
          <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted, opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }} />
        ))}
      </View>
    </View>
  );
};

// ─── Voice recorder bar ───────────────────────────────────────────────────────
const RecorderBar: React.FC<{ onCancel: () => void; onSend: (uri: string, seconds: number) => void }> = ({ onCancel, onSend }) => {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const pulse = useRef(new Animated.Value(1)).current;
  const startedRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) { onCancel(); return; }
        await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        startedRef.current = true;
      } catch { onCancel(); }
    })();
    return () => {
      loop.stop();
      AudioModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []);

  const secs = Math.floor((state.durationMillis ?? 0) / 1000);

  const finish = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri && secs >= 1) onSend(uri, secs); else onCancel();
    } catch { onCancel(); }
  };
  const cancel = async () => { try { if (startedRef.current) await recorder.stop(); } catch {} onCancel(); };

  return (
    <View style={[rs.bar, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
      <TouchableOpacity onPress={cancel} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel recording">
        <Ionicons name="trash-outline" size={22} color={status.danger} />
      </TouchableOpacity>
      <Animated.View style={[rs.dot, { opacity: pulse }]} />
      <Text style={[rs.timer, { color: colors.text }]}>{fmtDuration(secs)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>Recording…</Text>
      <TouchableOpacity onPress={finish} style={rs.send} accessibilityRole="button" accessibilityLabel="Send voice message">
        <Ionicons name="arrow-up" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};
const rs = StyleSheet.create({
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 16, paddingRight: 5, height: 46 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: status.danger },
  timer: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' },
});

// ─── Chat ─────────────────────────────────────────────────────────────────────
interface ChatProps {
  convId: string; otherProfile: any; currentUserId: string; onBack: () => void;
  storyUserIds: Set<string>; viewedUserIds: Set<string>; onlineUserIds: Set<string>;
}

const ChatView: React.FC<ChatProps> = ({ convId, otherProfile, currentUserId, onBack, storyUserIds, viewedUserIds, onlineUserIds }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const { selection, medium } = useHaptics();
  const insets = useSafeAreaInsets();
  const isGroup = !!otherProfile?.is_group;
  const profile = isGroup ? null : otherProfile;

  const [messages, setMessages] = useState<any[]>([]); // newest first (list is inverted)
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [recordingOther, setRecordingOther] = useState(false);
  const [recording, setRecording] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState<any>(null);
  const [pinned, setPinned] = useState<any>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMessages(convId, 60)
      .then(rows => { if (alive) { setMessages([...rows].reverse()); setLoading(false); markMessagesRead(convId, currentUserId); } })
      .catch(() => { if (alive) { setLoading(false); showToast('Could not load messages.', 'error'); } });

    const sub = subscribeToMessages(
      convId,
      (nm) => {
        if (nm.sender_id === currentUserId) return; // own messages are added optimistically
        setMessages(p => (p.some(m => m.id === nm.id) ? p : [nm, ...p]));
        markMessagesRead(convId, currentUserId);
        fx.receive();
      },
      (um) => setMessages(p => p.map(m => (m.id === um.id ? { ...m, ...um } : m))),
    );
    const ch = supabase.channel(`typing-${convId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.userId !== currentUserId) setTyping(!!payload.typing); })
      .on('broadcast', { event: 'recording' }, ({ payload }) => { if (payload.userId !== currentUserId) setRecordingOther(!!payload.recording); })
      .subscribe();
    channelRef.current = ch;
    return () => { alive = false; sub.unsubscribe(); supabase.removeChannel(ch); channelRef.current = null; };
  }, [convId, currentUserId]);

  const broadcast = (event: 'typing' | 'recording', value: boolean) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: event === 'typing' ? { userId: currentUserId, typing: value } : { userId: currentUserId, recording: value } });
  };

  const onChangeText = (v: string) => {
    setText(v);
    broadcast('typing', v.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => broadcast('typing', false), 3000);
  };

  /** Optimistic send: show immediately, swap in the real row when the server answers. */
  const optimistic = async (tmp: any, send: () => Promise<any>, failMsg: string) => {
    setMessages(p => [tmp, ...p]);
    try {
      const real = await send();
      if (real?.id) setMessages(p => p.map(m => (m.id === tmp.id ? { ...real } : m)));
    } catch {
      setMessages(p => p.filter(m => m.id !== tmp.id));
      showToast(failMsg, 'error');
    }
  };

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    const reply = replyTo;
    setText(''); setReplyTo(null); broadcast('typing', false);
    fx.send();
    const tmp = { id: `tmp-${Date.now()}`, text: t, type: 'text', sender_id: currentUserId, created_at: new Date().toISOString(), reply: reply ? { id: reply.id, text: reply.text, type: reply.type, profiles: reply.profiles } : null, is_read: false };
    optimistic(tmp, () => sendMessage(convId, currentUserId, t, 'text', undefined, reply?.id), 'Message failed to send.');
  };

  const handlePhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    const reply = replyTo; setReplyTo(null);
    fx.send();
    const tmp = { id: `tmp-${Date.now()}`, type: 'image', text: '📷 Photo', media_url: uri, sender_id: currentUserId, created_at: new Date().toISOString(), is_read: false };
    optimistic(tmp, () => sendImageMessage(convId, currentUserId, uri, reply?.id), 'Photo failed to send.');
  };

  const handleVoice = (uri: string, seconds: number) => {
    setRecording(false); broadcast('recording', false);
    fx.send();
    const tmp = { id: `tmp-${Date.now()}`, type: 'audio', text: '🎤 Voice message', media_url: uri, duration: seconds, sender_id: currentUserId, created_at: new Date().toISOString(), is_read: false };
    optimistic(tmp, () => sendVoiceMessage(convId, currentUserId, uri, seconds), 'Voice message failed to send.');
  };

  const handleReaction = async (msg: any, emoji: string) => {
    const reactions: any[] = msg.reactions ?? [];
    const mineIdx = reactions.findIndex(r => r.emoji === emoji && r.user_id === currentUserId);
    const removing = mineIdx !== -1;
    if (removing) fx.tick(); else fx.like();
    setActionMsg(null);
    setMessages(p => p.map(m => m.id !== msg.id ? m : {
      ...m, reactions: removing ? reactions.filter((_, i) => i !== mineIdx) : [...reactions, { id: `tmp-${Date.now()}`, emoji, user_id: currentUserId }],
    }));
    try {
      if (removing) await removeReaction(msg.id, currentUserId, emoji); else await addReaction(msg.id, currentUserId, emoji);
    } catch {
      setMessages(p => p.map(m => (m.id === msg.id ? { ...m, reactions } : m)));
    }
  };

  const startCall = async (type: CallType) => {
    if (isGroup || !profile) return;
    try {
      const offer = { type: 'offer', sdp: '' } as RTCSessionDescriptionInit;
      setCall(await initiateCall(currentUserId, profile.id, convId, type, offer));
    } catch (e: any) { showToast(friendlyError(e, 'Could not start the call.'), 'error'); }
  };

  const [showReportUser, setShowReportUser] = useState(false);

  const openProfileMenu = () => {
    if (isGroup || !profile) return;
    showPopup({
      title: profile.username, message: 'Manage this chat', icon: 'person-circle-outline',
      buttons: [
        { text: 'Report user', style: 'destructive', onPress: () => setShowReportUser(true) },
        { text: 'Block user', style: 'destructive', onPress: () => { blockUser(profile.id).then(() => { showToast('User blocked.', 'success'); onBack(); }).catch(() => showToast('Could not block user.', 'error')); } },
        { text: 'Close', style: 'cancel', onPress: () => {} },
      ],
    });
  };

  const lastMineIdx = useMemo(() => messages.findIndex(m => m.sender_id === currentUserId && !m.is_deleted), [messages, currentUserId]);
  const online = !!profile?.id && onlineUserIds.has(profile.id);
  const statusText = recordingOther ? 'recording a voice message…' : typing ? 'typing…' : isGroup ? 'Group chat' : online ? 'Active now' : '';
  const statusActive = recordingOther || typing || online;

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <MessageBubble
      msg={item} mine={item.sender_id === currentUserId}
      older={messages[index + 1]} newer={messages[index - 1]} isGroup={isGroup}
      onLongPress={(m) => { medium(); setActionMsg(m); }} onReactionTap={handleReaction} onImagePress={setViewer}
      showSeen={index === lastMineIdx}
    />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [messages, currentUserId, isGroup, lastMineIdx]);

  const actionMine = actionMsg?.sender_id === currentUserId;

  return (
    <KeyboardAvoidingView style={[ms.container, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ReportSheet visible={showReportUser} onClose={() => setShowReportUser(false)} targetType="user" targetId={profile?.id} label="user" showToast={showToast} />
      {/* Header */}
      <View style={[ms.chatHeader, { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <TouchableOpacity onPress={onBack} style={ms.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Avatar uri={profile?.avatar_url} size={38} group={isGroup} hasStory={!!profile?.id && storyUserIds.has(profile.id)} viewed={!!profile?.id && viewedUserIds.has(profile.id)} />
        <TouchableOpacity style={{ flex: 1, marginLeft: 10 }} onPress={openProfileMenu} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Chat options">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[ms.chatName, { color: colors.text }]} numberOfLines={1}>{profile?.full_name || profile?.username || otherProfile?.full_name || 'Chat'}</Text>
            {profile?.is_verified ? <VerifiedBadge type={profile.verification_type} size="sm" /> : null}
          </View>
          {statusText ? <Text style={[ms.chatStatus, { color: statusActive ? status.success : colors.textMuted }]}>{statusText}</Text> : null}
        </TouchableOpacity>
        {!isGroup ? (
          <>
            <TouchableOpacity style={ms.iconBtn} onPress={() => startCall('audio')} accessibilityRole="button" accessibilityLabel="Voice call"><Ionicons name="call-outline" size={23} color={colors.text} /></TouchableOpacity>
            <TouchableOpacity style={ms.iconBtn} onPress={() => startCall('video')} accessibilityRole="button" accessibilityLabel="Video call"><Ionicons name="videocam-outline" size={26} color={colors.text} /></TouchableOpacity>
          </>
        ) : null}
      </View>

      {pinned ? (
        <View style={[ms.pinned, { backgroundColor: colors.bg2, borderBottomColor: colors.border }]}>
          <Ionicons name="pin" size={14} color={brand.violet} />
          <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{pinned.text || 'Photo'}</Text>
          <TouchableOpacity onPress={() => pinMessage(convId, null).then(() => setPinned(null)).catch(() => {})} hitSlop={8}><Ionicons name="close" size={18} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ) : null}

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.violet} /></View>
      ) : (
        <FlatList
          data={messages}
          inverted
          keyExtractor={m => m.id}
          renderItem={renderItem}
          ListHeaderComponent={(typing || recordingOther) ? <TypingDots label={recordingOther ? 'recording' : undefined} /> : <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={[ms.emptyChat, { transform: [{ scaleY: -1 }] }]}>
              <Avatar uri={profile?.avatar_url} size={84} group={isGroup} />
              <Text style={[ms.emptyName, { color: colors.text }]}>{profile?.full_name || profile?.username || otherProfile?.full_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4 }}>Say hi 👋 — your messages show up here.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 10, paddingTop: 4 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Reply banner */}
      {replyTo ? (
        <View style={[ms.replyBanner, { backgroundColor: colors.bg2, borderTopColor: colors.border }]}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: brand.violet }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: brand.violet, fontSize: 12, fontWeight: '700' }}>Replying to {replyTo.sender_id === currentUserId ? 'yourself' : (replyTo.profiles?.username ?? 'message')}</Text>
            <Text style={{ color: colors.textSub, fontSize: 13 }} numberOfLines={1}>{replyTo.type === 'image' ? '📷 Photo' : replyTo.type === 'audio' ? '🎤 Voice message' : replyTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></TouchableOpacity>
        </View>
      ) : null}

      {/* Composer */}
      <View style={[ms.composer, { paddingBottom: emojiOpen ? 8 : Math.max(insets.bottom, 8), backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        {recording ? (
          <RecorderBar onCancel={() => { setRecording(false); broadcast('recording', false); }} onSend={handleVoice} />
        ) : (
          <>
            <TouchableOpacity onPress={handlePhoto} style={[ms.roundBtn, { backgroundColor: brand.violet }]} accessibilityRole="button" accessibilityLabel="Send a photo">
              <Ionicons name="camera" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={[ms.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
              <TextInput
                style={[ms.input, { color: colors.text }]}
                value={text}
                onChangeText={onChangeText}
                placeholder="Message…"
                placeholderTextColor={colors.textMuted}
                multiline
                onFocus={() => setEmojiOpen(false)}
                selectionColor={brand.violet}
              />
              <TouchableOpacity onPress={() => { setEmojiOpen(v => !v); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Emoji">
                <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={23} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {text.trim() ? (
              <TouchableOpacity onPress={handleSend} style={[ms.roundBtn, { backgroundColor: brand.violet }]} accessibilityRole="button" accessibilityLabel="Send message">
                <Ionicons name="arrow-up" size={21} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { selection(); setRecording(true); broadcast('recording', true); }} style={ms.roundBtn} accessibilityRole="button" accessibilityLabel="Record voice message">
                <Ionicons name="mic-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {emojiOpen ? (
        <View style={{ height: 290 }}>
          <EmojiKeyboard onEmojiSelected={e => setText(p => p + e.emoji)} theme={{ container: colors.bg, header: colors.text }} />
        </View>
      ) : null}

      {/* Message actions */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)} statusBarTranslucent>
        <Pressable style={ms.scrim} onPress={() => setActionMsg(null)}>
          <Pressable style={[ms.actionCard, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => {}}>
            <View style={ms.reactRow}>
              {QUICK_REACTIONS.map(e => (
                <TouchableOpacity key={e} onPress={() => actionMsg && handleReaction(actionMsg, e)} style={ms.reactBtn}><Text style={{ fontSize: 28 }}>{e}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={[ms.sep, { backgroundColor: colors.border }]} />
            <ActionRow icon="arrow-undo-outline" label="Reply" onPress={() => { setReplyTo(actionMsg); setActionMsg(null); }} />
            {actionMsg?.text && actionMsg.type === 'text' ? (
              <ActionRow icon="share-outline" label="Share text" onPress={() => { const t = actionMsg.text; setActionMsg(null); Share.share({ message: t }).catch(() => {}); }} />
            ) : null}
            <ActionRow icon="pin-outline" label="Pin message" onPress={() => { const m = actionMsg; setActionMsg(null); pinMessage(convId, m.id).then(() => setPinned(m)).catch(() => showToast('Could not pin.', 'error')); }} />
            {actionMine ? (
              <ActionRow icon="arrow-undo-circle-outline" label="Unsend" danger onPress={() => {
                const m = actionMsg; setActionMsg(null);
                setMessages(p => p.map(x => (x.id === m.id ? { ...x, is_deleted: true } : x)));
                unsendMessage(m.id, currentUserId).catch(() => showToast('Could not unsend.', 'error'));
              }} />
            ) : null}
            <ActionRow icon="trash-outline" label="Delete for me" danger onPress={() => {
              const m = actionMsg; setActionMsg(null);
              setMessages(p => p.filter(x => x.id !== m.id));
              deleteMessageForMe(m.id).catch(() => showToast('Could not delete.', 'error'));
            }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={[ms.scrim, { backgroundColor: '#000' }]} onPress={() => setViewer(null)}>
          {viewer ? <CachedImage uri={viewer} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
          <TouchableOpacity style={[ms.viewerClose, { top: insets.top + 12 }]} onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
        </Pressable>
      </Modal>

      {call ? (
        <Modal animationType="slide" visible onRequestClose={() => setCall(null)}>
          <CallScreen call={call} currentUserId={currentUserId} isIncoming={false} onCallEnd={() => setCall(null)} />
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
};

const ActionRow: React.FC<{ icon: string; label: string; onPress: () => void; danger?: boolean }> = ({ icon, label, onPress, danger }) => {
  const { colors } = useTheme();
  const c = danger ? status.danger : colors.text;
  return (
    <TouchableOpacity onPress={onPress} style={ms.actionRow} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon as any} size={21} color={c} />
      <Text style={{ color: c, fontSize: 16, fontWeight: '500' }}>{label}</Text>
    </TouchableOpacity>
  );
};

// ─── New message sheet ────────────────────────────────────────────────────────
const NewChatSheet: React.FC<{ visible: boolean; currentUserId: string; onClose: () => void; onPick: (convId: string, profile: any) => void }> = ({ visible, currentUserId, onClose, onPick }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !currentUserId) return;
    getFollowConnections(currentUserId).then(setSuggested).catch(() => {});
  }, [visible, currentUserId]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try { setResults(await searchUsersForDM(query, currentUserId)); } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, currentUserId]);

  const pick = async (p: any) => {
    setCreating(p.id);
    try { onPick(await createDirectConversation(currentUserId, p.id), p); setQuery(''); }
    catch { showToast('Could not start the chat.', 'error'); }
    finally { setCreating(null); }
  };

  const list = query.trim().length >= 2 ? results : suggested;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[ms.container, { backgroundColor: colors.bg, paddingTop: insets.top + 6 }]}>
        <View style={ms.sheetHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.text} /></TouchableOpacity>
          <Text style={[ms.sheetTitle, { color: colors.text }]}>New message</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={[ms.search, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.textMuted} style={[ms.searchInput, { color: colors.text }]} autoFocus autoCapitalize="none" autoCorrect={false} selectionColor={brand.violet} />
          {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
        <Text style={[ms.sectionLabel, { color: colors.textMuted }]}>{query.trim().length >= 2 ? 'Results' : 'Suggested'}</Text>
        <FlatList
          data={list}
          keyExtractor={u => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>{query.trim().length >= 2 && !busy ? 'No people found.' : 'Follow people to see suggestions.'}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={ms.userRow} onPress={() => pick(item)} disabled={!!creating} activeOpacity={0.7}>
              <Avatar uri={item.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{item.username}</Text>
                  {item.is_verified ? <VerifiedBadge type={item.verification_type} size="sm" /> : null}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>{item.full_name}</Text>
              </View>
              {creating === item.id ? <ActivityIndicator size="small" color={brand.violet} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
};

// ─── Inbox ────────────────────────────────────────────────────────────────────
type ScreenState = 'list' | 'chat';
interface MessagesScreenProps {
  onChatStateChange?: (inChat: boolean) => void;
  initialConv?: { convId: string; otherProfile: any } | null;
  isVisible?: boolean;
}

export const MessagesScreen = memo<MessagesScreenProps>(({ onChatStateChange, initialConv }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [screenState, setScreenState] = useState<ScreenState>('list');
  const [currentUserId, setCurrentUserId] = useState('');
  const [username, setUsername] = useState('Messages');
  const [activeConv, setActiveConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [viewedUserIds, setViewedUserIds] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const presenceRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !alive) return;
      const uid = data.user.id;
      setCurrentUserId(uid);
      supabase.from('profiles').select('username').eq('id', uid).single().then(({ data: p }) => { if (alive && p?.username) setUsername(p.username); });
      const ch = supabase.channel('global-presence', { config: { presence: { key: uid } } });
      presenceRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => setOnlineUserIds(new Set(Object.keys(ch.presenceState()))))
        .subscribe(async (st) => { if (st === 'SUBSCRIBED') await ch.track({ online_at: new Date().toISOString() }); });
      getActiveStories().then(groups => {
        const has = new Set<string>(); const viewed = new Set<string>();
        groups.forEach((g: any) => { has.add(g.profile.id); if (g.stories.every((s: any) => s.viewed)) viewed.add(g.profile.id); });
        if (alive) { setStoryUserIds(has); setViewedUserIds(viewed); }
      }).catch(() => {});
    });
    return () => { alive = false; presenceRef.current?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (initialConv) { setActiveConv(initialConv); setScreenState('chat'); onChatStateChange?.(true); }
  }, [initialConv]);

  const load = useCallback(async (silent = false) => {
    if (!currentUserId) return;
    if (!silent) setLoading(true);
    try {
      const rows = await getConversations(currentUserId);
      setConversations(rows.map((r: any) => normalizeConversation(r, currentUserId)).filter((c: ConvItem) => !!c.id));
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    load();
    const sub = subscribeToConversationList(currentUserId, () => load(true));
    return () => { sub.unsubscribe(); };
  }, [currentUserId, load]);

  const openConv = (convId: string, otherProfile: any) => {
    setActiveConv({ convId, otherProfile });
    setScreenState('chat');
    onChatStateChange?.(true);
  };
  const closeChat = () => { setScreenState('list'); setActiveConv(null); onChatStateChange?.(false); load(true); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c => c.name.toLowerCase().includes(q) || (c.username ?? '').toLowerCase().includes(q));
  }, [conversations, query]);

  const onlineNow = useMemo(
    () => conversations.filter(c => !c.is_group && c.other_profile?.id && onlineUserIds.has(c.other_profile.id)),
    [conversations, onlineUserIds],
  );

  if (screenState === 'chat' && activeConv) {
    return (
      <ChatView
        convId={activeConv.convId} otherProfile={activeConv.otherProfile} currentUserId={currentUserId} onBack={closeChat}
        onlineUserIds={onlineUserIds} storyUserIds={storyUserIds} viewedUserIds={viewedUserIds}
      />
    );
  }

  const header = (
    <View>
      <View style={[ms.search, { backgroundColor: colors.bg2, borderColor: colors.border, marginHorizontal: 16, marginBottom: 10 }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textMuted} style={[ms.searchInput, { color: colors.text }]} autoCapitalize="none" autoCorrect={false} selectionColor={brand.violet} />
        {query ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>
      {!query && onlineNow.length > 0 ? (
        <View style={{ marginBottom: 6 }}>
          <Text style={[ms.sectionLabel, { color: colors.textMuted }]}>Active now</Text>
          <FlatList
            horizontal showsHorizontalScrollIndicator={false} data={onlineNow} keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}
            renderItem={({ item: c }) => (
              <TouchableOpacity onPress={() => openConv(c.id, c.other_profile)} style={{ alignItems: 'center', width: 64 }} activeOpacity={0.8}>
                <Avatar uri={c.other_profile?.avatar_url} size={54} online />
                <Text style={{ color: colors.textSub, fontSize: 11.5, marginTop: 5 }} numberOfLines={1}>{c.username ?? c.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}
      <Text style={[ms.sectionLabel, { color: colors.textMuted }]}>Messages</Text>
    </View>
  );

  return (
    <View style={[ms.container, { backgroundColor: colors.bg }]}>
      <View style={[ms.header, { paddingTop: insets.top + 10 }]}>
        <Text style={[ms.headerTitle, { color: colors.text }]} numberOfLines={1}>{username}</Text>
        <TouchableOpacity onPress={() => setNewOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="New message">
          <Ionicons name="create-outline" size={27} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ConvSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.textSub} />}
          contentContainerStyle={{ paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 70, paddingHorizontal: 40 }}>
              <LinearGradient colors={brand.gradient as any} style={ms.emptyIcon}><Ionicons name="paper-plane" size={34} color="#fff" /></LinearGradient>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 18 }}>{query ? 'No matches' : 'Your messages'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                {query ? 'Try a different name.' : 'Send a private message to a friend on campus.'}
              </Text>
              {!query ? (
                <TouchableOpacity onPress={() => setNewOpen(true)} style={[ms.emptyBtn, { backgroundColor: brand.violet }]} activeOpacity={0.85}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send message</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item: c }) => {
            const unread = c.unread_count > 0;
            const pid = c.other_profile?.id;
            return (
              <TouchableOpacity onPress={() => openConv(c.id, c.other_profile)} style={ms.convItem} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Chat with ${c.name}${unread ? `, ${c.unread_count} unread` : ''}`}>
                <Avatar uri={c.other_profile?.avatar_url} size={54} group={c.is_group} hasStory={!!pid && storyUserIds.has(pid)} viewed={!!pid && viewedUserIds.has(pid)} online={!!pid && onlineUserIds.has(pid)} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[ms.convName, { color: colors.text, fontWeight: unread ? '800' : '600' }]} numberOfLines={1}>{c.name}</Text>
                    {c.other_profile?.is_verified ? <VerifiedBadge type={c.other_profile.verification_type} size="sm" /> : null}
                    {c.is_muted ? <Ionicons name="notifications-off-outline" size={13} color={colors.textMuted} /> : null}
                  </View>
                  <Text style={[ms.convPreview, { color: unread ? colors.text : colors.textMuted, fontWeight: unread ? '600' : '400' }]} numberOfLines={1}>
                    {c.last_message || 'Say hi 👋'}{c.last_message_at ? `  ·  ${shortAgo(c.last_message_at)}` : ''}
                  </Text>
                </View>
                {unread ? <View style={[ms.badge, { backgroundColor: brand.violet }]}><Text style={ms.badgeText}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text></View> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <NewChatSheet visible={newOpen} currentUserId={currentUserId} onClose={() => setNewOpen(false)} onPick={(convId, p) => { setNewOpen(false); setTimeout(() => openConv(convId, p), 250); }} />
    </View>
  );
});

const ms = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7, flex: 1, marginRight: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13 },
  searchInput: { flex: 1, fontSize: 15.5, padding: 0 },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginHorizontal: 16, marginTop: 8, marginBottom: 8, letterSpacing: 0.2 },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  convName: { fontSize: 15.5, flexShrink: 1 },
  convPreview: { fontSize: 14, marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyBtn: { marginTop: 22, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 13 },

  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { padding: 8 },
  chatName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  chatStatus: { fontSize: 12, marginTop: 1, fontWeight: '500' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyName: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 9 : 4, minHeight: 44, gap: 8 },
  input: { flex: 1, fontSize: 15.5, maxHeight: 110, paddingTop: 0, paddingBottom: 0, minHeight: 24, textAlignVertical: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  actionCard: { width: '100%', maxWidth: 360, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 8, overflow: 'hidden' },
  reactRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  reactBtn: { padding: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  viewerClose: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
});
