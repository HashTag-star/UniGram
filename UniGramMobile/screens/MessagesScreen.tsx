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
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  PanResponder,
  Keyboard,
  Dimensions,
  StatusBar,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAudioPlayer, useAudioRecorder, RecordingPresets, AudioModule } from 'expo-audio';
import { useHaptics } from '../hooks/useHaptics';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { EmojiKeyboard, type EmojiType } from 'rn-emoji-keyboard';

import { supabase } from '../lib/supabase';
import { ConvSkeleton } from '../components/Skeleton';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
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
  sendVoiceMessage,
  unsendMessage,
  sendSharedContent,
  forwardMessage,
  toggleArchive,
  toggleMute,
  pinMessage,
  markMessageViewed,
  deleteMessageForMe,
} from '../services/messages';
import { updateActiveStatus, blockUser } from '../services/profiles';
import { getUserStories, getViewedStoryIds, markStoryViewed, getActiveStories } from '../services/stories';
import { ProfileScreen } from './ProfileScreen';
import { ProfilePicViewer } from '../components/ProfilePicViewer';
import { initiateCall, CallRecord, CallType } from '../services/calls';
import { CallScreen } from './CallScreen';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

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

function getOtherParticipant(conv: any, currentUserId: string): any | null {
  const participants = conv.conversations?.conversation_participants ?? [];
  return participants.find((p: any) => p.user_id !== currentUserId)?.profiles ?? null;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

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
    const a1 = pulse(dot1, 0); const a2 = pulse(dot2, 200); const a3 = pulse(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(150,150,150,0.5)', marginHorizontal: 2,
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

const StoryRingAvatar: React.FC<{
  uri?: string | null;
  size: number;
  hasStory: boolean;
  viewed: boolean;
  onPress?: () => void;
  isGroup?: boolean;
  isOnline?: boolean;
}> = ({ uri, size, hasStory, viewed, onPress, isGroup, isOnline }) => {
  const { colors } = useTheme();
  const ringColor = hasStory ? (viewed ? '#888' : '#6366f1') : 'transparent';
  const outerSize = hasStory ? size + 6 : size;

  const inner = (
    <View style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: ringColor }}>
      <View style={{ position: 'relative' }}>
        {uri ? (
          <CachedImage uri={uri} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: hasStory ? 2 : 0, borderColor: colors.bg }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: hasStory ? 2 : 0, borderColor: colors.bg }}>
            <Ionicons name={isGroup ? 'people' : 'person'} size={size * 0.44} color={colors.textMuted} />
          </View>
        )}
        {isOnline && !isGroup && (
          <View style={[styles.onlineDot, { width: size * 0.25, height: size * 0.25, borderRadius: size * 0.125, bottom: 2, right: 2, borderColor: colors.bg }]} />
        )}
      </View>
    </View>
  );

  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>{inner}</TouchableOpacity> : inner;
};

const VoiceWaveform: React.FC<{ uri: string; duration: number; isMe: boolean }> = ({ uri, duration, isMe }) => {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useMemo(() => Array.from({ length: 25 }, () => 3 + Math.random() * 15), []);
  const player = useAudioPlayer(uri);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        setPlaying(false);
        setProgress(0);
        player.seekTo(0);
      } else {
        setProgress(status.currentTime / (status.duration || duration || 1));
      }
    });
    return () => sub.remove();
  }, [player, duration]);

  const togglePlayback = async () => {
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        player.play();
        setPlaying(true);
      }
    } catch (e) {
      console.error(e);
      setPlaying(false);
    }
  };

  return (
    <View style={[styles.voiceBubble, isMe ? styles.voiceBubbleMe : [styles.voiceBubble, { backgroundColor: colors.bg2, borderBottomLeftRadius: 4 }]]}>
      <TouchableOpacity onPress={togglePlayback} style={styles.voicePlayBtn} activeOpacity={0.8}>
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color={isMe ? '#fff' : colors.text} />
      </TouchableOpacity>
      <View style={styles.waveformContainer}>
        {bars.map((h, i) => (
          <View key={i} style={[styles.waveformBar, { height: h, backgroundColor: i / bars.length <= progress ? (isMe ? '#fff' : colors.accent) : (isMe ? 'rgba(255,255,255,0.3)' : colors.textMuted + '40') }]} />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: isMe ? '#fff' : colors.textSub }]}>{Math.floor(duration / 1000)}s</Text>
    </View>
  );
};

const VoiceRecorder: React.FC<{ onRecordComplete: (uri: string, duration: number) => void; onRecordingChange?: (recording: boolean) => void }> = ({ onRecordComplete, onRecordingChange }) => {
  const { colors } = useTheme();
  const { medium: hapticMedium, success: hapticSuccess, light: hapticLight } = useHaptics();
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef = useRef<any>(null);
  const { showPopup } = usePopup();

  const micScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const lockOpacity = useSharedValue(0);
  const trashOpacity = useSharedValue(0);
  const trashTranslateY = useSharedValue(20);

  const SLIDE_CANCEL_THRESHOLD = -80;
  const SLIDE_LOCK_THRESHOLD = -60;

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const start = async () => {
    if (isRecording || isPreparing) return;
    setIsPreparing(true); setIsCanceled(false); setIsLocked(false); translateX.value = 0; translateY.value = 0;
    try {
      const { status } = await AudioModule.requestPermissionsAsync();
      if (status !== 'granted') {
        showPopup({ title: 'Permission Denied', message: 'UniGram needs microphone access.', buttons: [{ text: 'OK', onPress: () => {} }] });
        setIsPreparing(false); return;
      }
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true); onRecordingChange?.(true); setDuration(0);
      micScale.value = withSpring(1.4); lockOpacity.value = withTiming(1);
      timerRef.current = setInterval(() => setDuration(d => d + 100), 100);
      hapticMedium();
    } catch (err) { console.error(err); } finally { setIsPreparing(false); }
  };

  const stop = async (cancel = false) => {
    if (!recorder || isPreparing) return;
    clearInterval(timerRef.current); setIsRecording(false); onRecordingChange?.(false); setIsLocked(false);
    micScale.value = withSpring(1); lockOpacity.value = withTiming(0); translateX.value = withSpring(0); translateY.value = withSpring(0);
    try {
      await recorder.stop();
      await AudioModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri; const finalDuration = duration;
      if (!cancel && !isCanceled && finalDuration > 800 && uri) { onRecordComplete(uri, finalDuration); hapticSuccess(); }
    } catch (err) { console.error(err); }
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { if (!isLocked) start(); },
    onPanResponderMove: (_, gesture) => {
      if (!isRecording || isLocked) return;
      if (gesture.dx < 0) {
        translateX.value = Math.max(gesture.dx, SLIDE_CANCEL_THRESHOLD - 20);
        if (gesture.dx < SLIDE_CANCEL_THRESHOLD) { setIsCanceled(true); trashOpacity.value = withTiming(1); trashTranslateY.value = withTiming(0); }
        else { setIsCanceled(false); trashOpacity.value = withTiming(0); trashTranslateY.value = withTiming(20); }
      }
      if (gesture.dy < 0 && gesture.dx > -30) {
        translateY.value = Math.max(gesture.dy, SLIDE_LOCK_THRESHOLD - 10);
        if (gesture.dy < SLIDE_LOCK_THRESHOLD) { setIsLocked(true); hapticLight(); micScale.value = withSpring(1); lockOpacity.value = withTiming(0); }
      }
    },
    onPanResponderRelease: () => { if (isLocked) return; if (isCanceled) { hapticMedium(); stop(true); trashOpacity.value = withTiming(0); } else stop(false); },
  })).current;

  const micAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }, { translateX: translateX.value }, { translateY: translateY.value }] }));
  const lockAnimatedStyle = useAnimatedStyle(() => ({ opacity: lockOpacity.value, transform: [{ translateY: interpolate(translateY.value, [0, SLIDE_LOCK_THRESHOLD], [0, -10]) }] }));
  const slideToCancelStyle = useAnimatedStyle(() => ({ opacity: interpolate(translateX.value, [0, SLIDE_CANCEL_THRESHOLD / 2], [1, 0]), transform: [{ translateX: translateX.value * 0.5 }] }));
  const trashAnimatedStyle = useAnimatedStyle(() => ({ opacity: trashOpacity.value, transform: [{ translateY: trashTranslateY.value }] }));

  return (
    <View style={styles.whatsappVoiceContainer}>
      {isRecording && !isLocked && (
        <View style={styles.recordingOverlay}>
          <Reanimated.View style={[styles.slideToCancel, slideToCancelStyle]}>
            <Ionicons name="chevron-back" size={14} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Slide to cancel</Text>
          </Reanimated.View>
          <Reanimated.View style={[styles.lockIconContainer, lockAnimatedStyle]}><Ionicons name="lock-closed" size={18} color={colors.textMuted} /></Reanimated.View>
          <View style={styles.recordingTimerContainer}><View style={styles.redDot} /><Text style={[styles.recordingTime, { color: colors.text }]}>{Math.floor(duration / 1000)}:{(Math.floor(duration / 100) % 10)}</Text></View>
        </View>
      )}
      {isLocked && (
        <View style={[styles.lockedContainer, { backgroundColor: colors.bg2 }]}>
          <TouchableOpacity onPress={() => stop(true)} style={styles.lockedDiscard}><Ionicons name="trash-outline" size={22} color="#ef4444" /></TouchableOpacity>
          <View style={styles.lockedTimer}><View style={styles.redDot} /><Text style={[styles.recordingTime, { color: colors.text }]}>{Math.floor(duration / 1000)}:{(Math.floor(duration / 100) % 10)}</Text></View>
          <TouchableOpacity onPress={() => stop(false)} style={styles.lockedSend}><Ionicons name="send" size={20} color="#fff" /></TouchableOpacity>
        </View>
      )}
      {!isLocked && <Reanimated.View {...panResponder.panHandlers} style={[styles.micWrapper, micAnimatedStyle]}><View style={[styles.micIcon, isRecording && { backgroundColor: '#ef4444' }]}><Ionicons name="mic" size={24} color={isRecording ? '#fff' : colors.textMuted} /></View></Reanimated.View>}
      {isCanceled && <Reanimated.View style={[styles.trashContainer, trashAnimatedStyle]}><Ionicons name="trash" size={24} color="#ef4444" /></Reanimated.View>}
    </View>
  );
};

const MessageBubble: React.FC<{
  msg: any; isMe: boolean; prevMsg: any | null; nextMsg: any | null; currentUserId: string;
  onLongPress: (msg: any, x: number, y: number) => void; onReactionTap: (msg: any, emoji: string) => void;
  onSwipeReply: (msg: any) => void; isLastSent?: boolean; isGroup?: boolean;
}> = ({ msg, isMe, prevMsg, nextMsg, currentUserId, onLongPress, onReactionTap, onSwipeReply, isLastSent = false, isGroup = false }) => {
  const { colors } = useTheme(); const { light: hapticLight, medium: hapticMedium } = useHaptics();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [readByCount, setReadByCount] = useState(0);
  const swipeX = useSharedValue(0);

  useEffect(() => {
    if (isGroup && isMe && msg.id && !msg.id.startsWith('temp-')) {
      supabase.from('message_reads').select('user_id', { count: 'exact', head: true }).eq('message_id', msg.id).neq('user_id', currentUserId)
        .then(({ count }) => setReadByCount(count || 0));
    }
  }, [isGroup, isMe, msg.id, currentUserId]);

  const isImage = msg.type === 'image'; const isViewOnce = msg.view_once === true; const isViewed = !!msg.viewed_at;
  const isRead = msg.is_read === true; const isDeleted = msg.is_deleted === true; const isForwarded = msg.is_forwarded === true;

  const grouped = useMemo(() => {
    const acc: Record<string, { count: number; iMine: boolean }> = {};
    (msg.message_reactions ?? []).forEach((r: any) => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, iMine: false };
      acc[r.emoji].count += 1; if (r.user_id === currentUserId) acc[r.emoji].iMine = true;
    });
    return acc;
  }, [msg.message_reactions, currentUserId]);

  const receiptIcon = msg._sending ? 'time-outline' : !msg.id || msg.id.startsWith('temp-') ? 'checkmark' : isGroup ? (readByCount > 0 ? 'checkmark-done' : 'checkmark') : isRead ? 'checkmark-done' : 'checkmark';
  const receiptColor = msg._sending ? colors.textMuted : (isGroup ? (readByCount > 0 ? '#60a5fa' : colors.textMuted) : (isRead ? '#60a5fa' : colors.textMuted));

  if (isDeleted) return <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}><View style={[styles.bubble, styles.bubbleDeleted]}><Text style={[styles.bubbleTextDeleted, { color: colors.textMuted }]}>{isMe ? 'You unsent a message' : 'Message unsent'}</Text></View></View>;

  return (
    <>
      {(!prevMsg || fmtDay(prevMsg.created_at) !== fmtDay(msg.created_at)) && <View style={styles.dayDivider}><Text style={[styles.dayLabel, { color: colors.textMuted }]}>{fmtDay(msg.created_at)}</Text></View>}
      {msg.reply && (
        <View style={[styles.replyQuote, isMe ? { alignSelf: 'flex-end', borderRightWidth: 2, borderRightColor: '#6366f1' } : { alignSelf: 'flex-start', borderLeftWidth: 2, borderLeftColor: '#6366f1' }]}>
          <Text style={[styles.replyQuoteName, { color: '#6366f1' }]} numberOfLines={1}>{msg.reply.sender_id === currentUserId ? 'You' : (msg.reply.profiles?.full_name || msg.reply.profiles?.username || 'Someone')}</Text>
          <Text style={styles.replyQuoteText} numberOfLines={1}>{msg.reply.type === 'image' ? '📷 Photo' : msg.reply.type === 'audio' ? '🎤 Voice message' : (msg.reply.text || '…')}</Text>
        </View>
      )}
      {isForwarded && <View style={[styles.forwardedLabel, isMe && { alignSelf: 'flex-end' }]}><Ionicons name="arrow-redo-outline" size={11} color={colors.textMuted} /><Text style={[styles.forwardedText, { color: colors.textMuted }]}>Forwarded</Text></View>}
      {lightboxUri && <Modal visible transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}><TouchableOpacity style={styles.lightboxBg} activeOpacity={1} onPress={() => setLightboxUri(null)}><Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" /></TouchableOpacity></Modal>}
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, sameGroup(prevMsg, msg) && { marginBottom: 1 }]}>
        {!isMe && <View style={{ width: 30, marginRight: 6, alignSelf: 'flex-end' }}>{!sameGroup(msg, nextMsg) && (msg.profiles?.avatar_url ? <CachedImage uri={msg.profiles.avatar_url} style={styles.msgAvatar} /> : <View style={[styles.msgAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={14} color={colors.textMuted} /></View>)}</View>}
        <View style={{ maxWidth: '75%' }}>
          <TouchableOpacity activeOpacity={0.85} onLongPress={(e: any) => onLongPress(msg, e.nativeEvent.pageX, e.nativeEvent.pageY)} delayLongPress={350}>
            {isImage ? (isViewOnce ? (
              <TouchableOpacity onPress={() => { if (isViewed) return; setLightboxUri(msg.media_url); if (!isMe) markMessageViewed(msg.id).catch(console.error); }} style={[styles.viewOnceBubble, { backgroundColor: colors.bg2, borderColor: colors.border }]}><Ionicons name={isViewed ? "eye-off-outline" : "camera"} size={18} color={isViewed ? colors.textMuted : colors.accent} /><Text style={[styles.viewOnceText, { color: isViewed ? colors.textMuted : colors.text }]}>{isViewed ? 'Opened' : 'View Photo'}</Text></TouchableOpacity>
            ) : (<TouchableOpacity onPress={() => setLightboxUri(msg.media_url)} activeOpacity={0.9}><CachedImage uri={msg.media_url} style={[styles.imageBubble, isMe ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }]} resizeMode="cover" /></TouchableOpacity>))
            : msg.type === 'audio' ? <VoiceWaveform uri={msg.media_url} duration={msg.duration || 0} isMe={isMe} />
            : msg.type === 'document' ? (<TouchableOpacity style={[styles.documentBubble, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => { if (msg.media_url) Linking.openURL(msg.media_url); }}><View style={[styles.documentIcon, { backgroundColor: colors.accent }]}><Ionicons name="document-text" size={20} color="#fff" /></View><View style={{ flex: 1 }}><Text style={[styles.documentName, { color: colors.text }]} numberOfLines={1}>{msg.text}</Text><Text style={[styles.documentSize, { color: colors.textMuted }]}>Document</Text></View><Ionicons name="download-outline" size={18} color={colors.textMuted} /></TouchableOpacity>)
            : <View style={[styles.bubble, isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: colors.bg2 }]]}><Text style={[styles.bubbleText, !isMe && { color: colors.text }]}>{msg.text}</Text></View>}
          </TouchableOpacity>
          {Object.keys(grouped).length > 0 && <View style={[styles.reactionsRow, isMe && { alignSelf: 'flex-end' }]}>{Object.entries(grouped).map(([emoji, { count, iMine }]) => (<TouchableOpacity key={emoji} style={[styles.reactionBadge, { backgroundColor: colors.bg2 }, iMine && styles.reactionBadgeMine]} onPress={() => onReactionTap(msg, emoji)}><Text style={{ fontSize: 13 }}>{emoji}</Text>{count > 1 && <Text style={[styles.reactionCount, { color: colors.textSub }]}>{count}</Text>}</TouchableOpacity>))}</View>}
          {(!sameGroup(msg, nextMsg) || msg._sending) && <View style={[styles.msgMeta, isMe && { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3 }]}><Text style={[styles.msgTime, { color: colors.textMuted }]}>{fmtTime(msg.created_at)}</Text>{isMe && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{isGroup && readByCount > 0 && <Text style={{ fontSize: 10, color: '#60a5fa', fontWeight: 'bold' }}>{readByCount}</Text>}<Ionicons name={receiptIcon as any} size={12} color={receiptColor} /></View>}</View>}
        </View>
      </View>
    </>
  );
};

const MediaPreviewModal: React.FC<{ uri: string; onCancel: () => void; onSend: (caption: string, viewOnce: boolean) => void; uploading: boolean }> = ({ uri, onCancel, onSend, uploading }) => {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState(''); const [viewOnce, setViewOnce] = useState(false); const inputRef = useRef<TextInput>(null);
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}><TouchableOpacity onPress={onCancel} style={{ padding: 6 }}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity><Text style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Send Photo</Text><View style={{ width: 38 }} /></View>
        <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />
        <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingBottom: insets.bottom + 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 12 }}><TouchableOpacity onPress={() => setViewOnce(!viewOnce)} style={[styles.viewOnceToggle, viewOnce && styles.viewOnceToggleActive]}><Ionicons name={viewOnce ? "eye-outline" : "infinite"} size={16} color="#fff" /><Text style={styles.viewOnceToggleText}>{viewOnce ? 'View Once' : 'Allow Replay'}</Text></TouchableOpacity></View>
          <View style={{ paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}><TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40 }} activeOpacity={1} onPress={() => inputRef.current?.focus()}><TextInput ref={inputRef} style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 }} placeholder="Add a caption…" placeholderTextColor="rgba(255,255,255,0.45)" value={caption} onChangeText={setCaption} multiline maxLength={500} /></TouchableOpacity><TouchableOpacity onPress={() => { if (!uploading) onSend(caption, viewOnce); }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' }} disabled={uploading}>{uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={20} color="#fff" />}</TouchableOpacity></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Main Views ───────────────────────────────────────────────────────────────

interface ConversationListProps {
  currentUserId: string; currentUsername: string; onPress: (convId: string, otherProfile: any) => void; onCompose: () => void;
  storyUserIds: Set<string>; viewedUserIds: Set<string>; onAvatarPress: (userId: string, hasStory: boolean, profile: any) => void;
  onlineUserIds: Set<string>; archived?: boolean; onBack?: () => void; onViewArchived?: () => void;
}

const ConversationList: React.FC<ConversationListProps> = ({ currentUserId, currentUsername, onPress, onCompose, storyUserIds, viewedUserIds, onAvatarPress, onlineUserIds = new Set(), archived = false, onBack, onViewArchived }) => {
  const { colors } = useTheme(); const insets = useSafeAreaInsets(); const { showToast } = useToast(); const { showPopup } = usePopup(); const { medium: hapticMedium } = useHaptics();
  const [convs, setConvs] = useState<any[]>([]); const [filteredConvs, setFilteredConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false); const [refreshing, setRefreshing] = useState(false); const [search, setSearch] = useState('');
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null); const searchTimerRef = useRef<any>(null);

  const load = useCallback(async () => {
    try { setLoadError(false); const data = await getConversations(currentUserId, archived); setConvs(data); setFilteredConvs(data); }
    catch (e: any) { showToast(e?.message || 'Failed to load.', 'error'); setLoadError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, [currentUserId, archived]);

  useEffect(() => {
    load(); realtimeChannelRef.current = subscribeToConversationList(currentUserId, () => load());
    return () => { realtimeChannelRef.current?.unsubscribe(); };
  }, [load, currentUserId]);

  const handleLongPress = (item: any) => {
    hapticMedium(); const conv = item.conversations; const isMuted = item.is_muted; const isArchived = item.is_archived;
    showPopup({ title: 'Chat Options', message: 'Choose action.', buttons: [
      { text: isMuted ? 'Unmute' : 'Mute', onPress: async () => { try { await toggleMute(conv.id, currentUserId, !isMuted); load(); } catch (e: any) { showToast(e.message, 'error'); } } },
      { text: isArchived ? 'Unarchive' : 'Archive', onPress: async () => { try { await toggleArchive(conv.id, currentUserId, !isArchived); load(); } catch (e: any) { showToast(e.message, 'error'); } } },
      { text: 'Cancel', style: 'cancel', onPress: () => {} }
    ]});
  };

  const activeNowData = useMemo(() => convs.filter((c) => { const o = getOtherParticipant(c, currentUserId); return o && onlineUserIds?.has?.(o.id); }).slice(0, 15), [convs, onlineUserIds, currentUserId]);
  const totalUnread = useMemo(() => convs.reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0), [convs]);

  const renderConvItem = useCallback(({ item: c }: { item: any }) => {
    const conv = c.conversations; const other = getOtherParticipant(c, currentUserId); if (!conv) return null;
    const isGroup = conv.is_group; const displayName = isGroup ? conv.group_name : (other?.full_name || other?.username);
    const hasUnread = (c.unread_count ?? 0) > 0; const otherUserId = other?.id;
    return (
      <TouchableOpacity style={styles.convItem} onPress={() => onPress(conv.id, other ?? { full_name: conv.group_name, is_group: true })} onLongPress={() => handleLongPress(c)} activeOpacity={0.75}>
        <View style={styles.convAvatarWrap}><StoryRingAvatar uri={other?.avatar_url} size={52} hasStory={!isGroup && !!otherUserId && storyUserIds.has(otherUserId)} viewed={!isGroup && !!otherUserId && viewedUserIds.has(otherUserId)} isGroup={isGroup} isOnline={!isGroup && !!otherUserId && onlineUserIds?.has?.(otherUserId)} onPress={(!isGroup && otherUserId) ? () => onAvatarPress(otherUserId, storyUserIds.has(otherUserId), other) : undefined} /></View>
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}><Text style={[styles.convName, { color: colors.text, flexShrink: 1 }, hasUnread && { fontWeight: 'bold' }]} numberOfLines={1}>{displayName}</Text>{!isGroup && other?.is_verified && <VerifiedBadge type={other.verification_type} size="sm" />}{c.is_muted && <Ionicons name="notifications-off-outline" size={12} color={colors.textMuted} style={{ marginLeft: 2 }} />}</View>
          {(() => {
            const lastMsg = conv.last_message ?? ''; const pColor = hasUnread ? colors.text : colors.textSub; const pWeight = hasUnread ? '500' : 'normal';
            if (lastMsg.startsWith('📷')) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="image-outline" size={13} color={pColor} /><Text style={[styles.convPreview, { color: pColor, fontWeight: pWeight, flex: 1 }]} numberOfLines={1}>{lastMsg.slice(3).trim() || 'Photo'}</Text></View>;
            if (lastMsg.startsWith('🎤')) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="mic-outline" size={13} color={pColor} /><Text style={[styles.convPreview, { color: pColor, fontWeight: pWeight }]}>Voice message</Text></View>;
            return <Text style={[styles.convPreview, { color: pColor, fontWeight: pWeight }]} numberOfLines={1}>{lastMsg || 'Start a conversation'}</Text>;
          })()}
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 5, marginLeft: 8, minWidth: 40 }}>{conv.last_message_at && <Text style={[styles.convTime, { color: hasUnread ? colors.accent : colors.textMuted }]}>{timeAgo(conv.last_message_at)}</Text>}{hasUnread ? <View style={styles.convUnreadPill}><Text style={styles.convUnreadPillText}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text></View> : <View style={{ height: 18 }} />}</View>
      </TouchableOpacity>
    );
  }, [currentUserId, onPress, storyUserIds, viewedUserIds, onAvatarPress, onlineUserIds, colors]);

  const ListHeader = useMemo(() => (
    <View>
      {!archived && <TouchableOpacity style={[styles.archivedRow, { borderBottomColor: colors.border }]} onPress={onViewArchived}><View style={styles.archivedIconWrap}><Ionicons name="archive-outline" size={20} color={colors.text} /></View><Text style={[styles.archivedLabel, { color: colors.text }]}>Archived Chats</Text>{totalUnread > 0 && <View style={styles.archivedBadge}><Text style={styles.archivedBadgeText}>{totalUnread}</Text></View>}<Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></TouchableOpacity>}
      {activeNowData.length > 0 && (
        <View style={styles.activeFriends}><Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACTIVE NOW</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 8 }}>
          {activeNowData.map((c) => {
            const o = getOtherParticipant(c, currentUserId); if (!o) return null;
            return <TouchableOpacity key={c.conversations?.id} style={styles.activeItem} onPress={() => onPress(c.conversations?.id, o)}><View style={styles.activeAvatarWrap}><StoryRingAvatar uri={o.avatar_url} size={52} hasStory={storyUserIds.has(o.id)} viewed={viewedUserIds.has(o.id)} isOnline={true} onPress={() => onPress(c.conversations?.id, o)} /></View><Text style={[styles.activeUsername, { color: colors.textSub, marginTop: 4 }]} numberOfLines={1}>{o.username}</Text></TouchableOpacity>;
          })}
        </ScrollView></View>
      )}
    </View>
  ), [activeNowData, currentUserId, onPress, archived, onViewArchived, totalUnread, colors, storyUserIds, viewedUserIds]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <View style={styles.listHeader}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{archived && <TouchableOpacity onPress={onBack} style={{ padding: 4 }}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>}<Text style={[styles.listTitle, { color: colors.text }]}>{archived ? 'Archived' : (currentUsername || 'Messages')}{!archived && totalUnread > 0 && <Text style={{ color: '#818cf8', fontSize: 14 }}> ·{totalUnread}</Text>}</Text></View>{!archived && <TouchableOpacity style={styles.composeBtn} onPress={onCompose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="create-outline" size={24} color={colors.text} /></TouchableOpacity>}</View>
      <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1 }]}><Ionicons name="search" size={15} color={colors.textMuted} /><TextInput style={[styles.searchInput, { color: colors.text }]} placeholder="Search messages" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} autoCapitalize="none" />{search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>}</View>
      {loading ? <ConvSkeleton /> : loadError ? <View style={styles.emptyState}><Ionicons name="cloud-offline-outline" size={52} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.textSub }]}>Couldn't load messages</Text><TouchableOpacity style={styles.newMsgBtn} onPress={load}><Ionicons name="refresh-outline" size={18} color="#fff" /><Text style={styles.newMsgBtnText}>Try Again</Text></TouchableOpacity></View> : convs.length === 0 ? <View style={styles.emptyState}><Ionicons name="chatbubbles-outline" size={56} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.textSub }]}>No messages yet</Text><TouchableOpacity style={styles.newMsgBtn} onPress={onCompose}><Ionicons name="create-outline" size={18} color="#fff" /><Text style={styles.newMsgBtnText}>New Message</Text></TouchableOpacity></View> : <FlatList data={convs} keyExtractor={(c) => c.conversations?.id} renderItem={renderConvItem} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#6366f1" />} ListHeaderComponent={ListHeader} />}
    </View>
  );
};

const ChatView: React.FC<{ convData: { convId: string; otherProfile: any }; currentUserId: string; onBack: () => void; storyUserIds?: Set<string>; viewedUserIds?: Set<string>; onlineUserIds?: Set<string>; onAvatarPress?: (userId: string, hasStory: boolean, profile: any) => void; onHeaderPress?: () => void; }> = ({ convData, currentUserId, onBack, storyUserIds, viewedUserIds, onlineUserIds = new Set(), onAvatarPress, onHeaderPress }) => {
  const { colors } = useTheme(); const { showPopup } = usePopup(); const { showToast } = useToast(); const insets = useSafeAreaInsets();
  const { convId, otherProfile } = convData; const [messages, setMessages] = useState<any[]>([]); const [text, setText] = useState('');
  const [loading, setLoading] = useState(true); const [uploading, setUploading] = useState(false); const [profile, setProfile] = useState<any>(otherProfile);
  const [isOtherTyping, setIsOtherTyping] = useState(false); const [isOtherRecording, setIsOtherRecording] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<{ msg: any; x: number; y: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<any | null>(null); const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null); const [forwardTarget, setForwardTarget] = useState<any | null>(null);
  const [pinnedMsg, setPinnedMsg] = useState<any | null>(null); const [activeCall, setActiveCall] = useState<{ call: CallRecord; isIncoming: boolean } | null>(null);
  const flatRef = useRef<FlatList>(null); const msgChannelRef = useRef<RealtimeChannel | null>(null); const typingChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const fetchPinned = async (id: string) => { try { const { data } = await supabase.from('messages').select('*, profiles(*)').eq('id', id).single(); if (data) setPinnedMsg(data); } catch {} };
    if (!profile?.full_name) {
      supabase.from('conversation_participants').select('profiles(*), conversations(pinned_message_id)').eq('conversation_id', convId).neq('user_id', currentUserId).maybeSingle().then(({ data }) => {
        if (data?.profiles) setProfile(data.profiles);
        if (data?.conversations && (data.conversations as any).pinned_message_id) fetchPinned((data.conversations as any).pinned_message_id);
      });
    } else if (otherProfile?.pinned_message_id) fetchPinned(otherProfile.pinned_message_id);
  }, [convId]);

  useEffect(() => {
    getMessages(convId, 60).then((msgs) => { setMessages(msgs); setLoading(false); }).catch(() => setLoading(false));
    markMessagesRead(convId, currentUserId).catch(() => {});
    msgChannelRef.current = subscribeToMessages(convId, (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      if (msg.sender_id !== currentUserId) markMessagesRead(convId, currentUserId).catch(() => {});
    }, (u) => setMessages(prev => prev.map(m => m.id === u.id ? u : m)));
    typingChannelRef.current = supabase.channel(`typing:${convId}`).on('presence', { event: 'sync' }, () => {
      const state = typingChannelRef.current?.presenceState();
      if (state) {
        const others = (Object.values(state) as any[][]).flat().filter(u => u.user_id !== currentUserId);
        setIsOtherTyping(others.some(u => u.isTyping)); setIsOtherRecording(others.some(u => u.isRecording));
      }
    }).subscribe();
    return () => { msgChannelRef.current?.unsubscribe(); typingChannelRef.current?.unsubscribe(); };
  }, [convId, currentUserId]);

  const pickAndSendImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showPopup({ title: 'Permission required', message: 'Photo library access is needed.', icon: 'images-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images' as any, quality: 0.85, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]) setPendingImage(result.assets[0].uri);
  }, []);

  const sendPendingImage = useCallback(async (caption: string, viewOnce = false) => {
    if (!pendingImage) return;
    const uri = pendingImage; setPendingImage(null); setUploading(true);
    try {
      await sendImageMessage(convId, currentUserId, uri, replyingTo?.id, caption || undefined, viewOnce);
      setReplyingTo(null);
    } catch (e: any) {
      showPopup({ title: 'Upload failed', message: e.message ?? 'Could not send image.', icon: 'cloud-offline-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    } finally { setUploading(false); }
  }, [pendingImage, convId, currentUserId, replyingTo]);

  const sendDocument = useCallback(async (doc: DocumentPicker.DocumentPickerAsset) => {
    setUploading(true);
    try {
      const { uploadFile } = require('../services/upload');
      const path = `${currentUserId}/docs/${Date.now()}_${doc.name}`;
      const url = await uploadFile('message-media', path, doc.uri, doc.mimeType || 'application/octet-stream');
      await sendMessage(convId, currentUserId, doc.name, 'document', url, replyingTo?.id);
      setReplyingTo(null);
      showToast('Document sent', 'success');
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setUploading(false); }
  }, [convId, currentUserId, replyingTo]);

  const handleAttachment = useCallback(() => {
    showPopup({
      title: 'Send Attachment',
      message: 'Choose a file to send.',
      buttons: [
        { text: 'Photo / Video', onPress: pickAndSendImage },
        { text: 'Document', onPress: async () => {
             try {
               const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
               if (!result.canceled && result.assets?.[0]) sendDocument(result.assets[0]);
             } catch (e) { console.error('Document picker error:', e); }
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: () => {} }
      ]
    });
  }, [pickAndSendImage, sendDocument]);

  const lastTypingRef = useRef(0);

  const handleTyping = (val: string) => {
    setText(val);
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      typingChannelRef.current?.track({ user_id: currentUserId, isTyping: val.length > 0, online_at: new Date().toISOString() });
    }
  };

  const handleRecordingStatus = (isRecording: boolean) => {
    typingChannelRef.current?.track({ user_id: currentUserId, isRecording, online_at: new Date().toISOString() });
  };

  const handleSend = useCallback(async () => {
    const t = text.trim(); if (!t || uploading) return; setText('');
    try { const sent = await sendMessage(convId, currentUserId, t); setMessages(p => [...p, sent]); } catch (e: any) { showToast(e.message, 'error'); }
  }, [text, convId, currentUserId]);

  const startCall = useCallback(async (type: CallType) => {
    try {
      const { RTCPeerConnection } = require('react-native-webrtc');
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(offer); pc.close();
      const call = await initiateCall(currentUserId, profile.id, convId, type, offer); setActiveCall({ call, isIncoming: false });
    } catch (e: any) { showToast(e.message, 'error'); }
  }, [currentUserId, profile, convId]);

  if (activeCall) return <CallScreen call={activeCall.call} currentUserId={currentUserId} isIncoming={activeCall.isIncoming} onCallEnd={() => setActiveCall(null)} />;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <View style={[styles.chatHeader, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}><TouchableOpacity onPress={onBack} style={styles.chatBack}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity><View style={styles.chatHeaderUser}><StoryRingAvatar uri={profile?.avatar_url} size={36} hasStory={!!profile?.id && !!storyUserIds?.has?.(profile.id)} viewed={!!profile?.id && !!viewedUserIds?.has?.(profile.id)} isOnline={!!profile?.id && !!onlineUserIds?.has?.(profile.id)} onPress={(!otherProfile?.is_group && profile?.id) ? () => onAvatarPress?.(profile.id, !!storyUserIds?.has?.(profile.id), profile) : undefined} /><TouchableOpacity style={{ marginLeft: 10, flex: 1 }} onPress={onHeaderPress}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>{profile?.full_name || profile?.username || 'Chat'}</Text>{profile?.is_verified && <VerifiedBadge type={profile.verification_type} size="sm" />}</View><Text style={[styles.chatStatus, { color: (isOtherTyping || isOtherRecording || onlineUserIds?.has?.(profile?.id)) ? colors.accent : colors.textMuted }]}>{isOtherRecording ? 'recording…' : isOtherTyping ? 'typing…' : onlineUserIds?.has?.(profile?.id) ? 'Active now' : 'Active status unknown'}</Text></TouchableOpacity></View><View style={{ flexDirection: 'row' }}><TouchableOpacity style={styles.chatAction} onPress={() => startCall('audio')}><Ionicons name="call-outline" size={21} color={colors.textMuted} /></TouchableOpacity><TouchableOpacity style={styles.chatAction} onPress={() => startCall('video')}><Ionicons name="videocam-outline" size={21} color={colors.textMuted} /></TouchableOpacity></View></View>
      {pinnedMsg && <TouchableOpacity style={[styles.pinnedBanner, { backgroundColor: colors.bg2, borderBottomColor: colors.border }]} onPress={() => { const idx = messages.findIndex(m => m.id === pinnedMsg.id); if (idx !== -1) flatRef.current?.scrollToIndex({ index: idx, animated: true }); }}><Ionicons name="pin" size={14} color={colors.accent} /><View style={{ flex: 1 }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>PINNED</Text><Text style={[styles.pinnedText, { color: colors.text }]} numberOfLines={1}>{pinnedMsg.text || 'Photo'}</Text></View><TouchableOpacity onPress={() => pinMessage(convId, null).then(() => setPinnedMsg(null))}><Ionicons name="close" size={18} color={colors.textMuted} /></TouchableOpacity></TouchableOpacity>}
      {loading ? <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View> : <FlatList ref={flatRef} data={messages} keyExtractor={m => m.id} renderItem={({ item, index }) => <MessageBubble msg={item} isMe={item.sender_id === currentUserId} prevMsg={messages[index-1]} nextMsg={messages[index+1]} currentUserId={currentUserId} onLongPress={(m, x, y) => setReactionTarget({ msg: m, x, y })} onReactionTap={(m, e) => addReaction(m.id, currentUserId, e)} onSwipeReply={setReplyingTo} isGroup={otherProfile?.is_group} />} onContentSizeChange={() => flatRef.current?.scrollToEnd()} contentContainerStyle={{ padding: 12 }} />}
      <View style={[styles.inputRowContainer, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.bg }]}><View style={styles.inputRow}><TouchableOpacity onPress={() => setShowEmojiPicker(!showEmojiPicker)}><Ionicons name="happy-outline" size={24} color={colors.textMuted} /></TouchableOpacity><View style={[styles.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.border }]}><TextInput style={[styles.input, { color: colors.text }]} value={text} onChangeText={setText} placeholder="Message…" multiline /><TouchableOpacity onPress={handleAttachment}><Ionicons name="attach-outline" size={22} color={colors.textMuted} /></TouchableOpacity></View>{text.trim() ? <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, styles.sendBtnActive]}><Ionicons name="send" size={17} color="#fff" /></TouchableOpacity> : <VoiceRecorder onRecordComplete={(u, d) => sendVoiceMessage(convId, currentUserId, u, d)} onRecordingChange={handleRecordingStatus} />}</View></View>
      {showEmojiPicker && <View style={{ height: 300 }}><EmojiKeyboard onEmojiSelected={e => { setText(p => p + e.emoji); }} theme={{ container: colors.bg, header: colors.text }} /></View>}
      {reactionTarget && <View style={StyleSheet.absoluteFill} pointerEvents="box-none"><TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setReactionTarget(null)} /><View style={[styles.msgActionBar, { top: reactionTarget.y + 40, [reactionTarget.msg.sender_id === currentUserId ? 'right' : 'left']: 20 }]}><TouchableOpacity style={styles.msgActionBtn} onPress={() => { setReplyingTo(reactionTarget.msg); setReactionTarget(null); }}><Ionicons name="return-down-back" size={16} color="#fff" /><Text style={styles.msgActionText}>Reply</Text></TouchableOpacity><TouchableOpacity style={[styles.msgActionBtn, styles.msgActionDanger]} onPress={() => { deleteMessageForMe(reactionTarget.msg.id, currentUserId); setMessages(p => p.filter(m => m.id !== reactionTarget.msg.id)); setReactionTarget(null); }}><Ionicons name="trash" size={16} color="#ef4444" /><Text style={[styles.msgActionText, { color: '#ef4444' }]}>Delete</Text></TouchableOpacity></View></View>}
    </KeyboardAvoidingView>
  );
};

type ScreenState = 'list' | 'chat' | 'new' | 'info' | 'archived';
interface MessagesScreenProps { onChatStateChange?: (inChat: boolean) => void; initialConv?: { convId: string; otherProfile: any } | null; isVisible?: boolean; }

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ onChatStateChange, initialConv, isVisible }) => {
  const { colors } = useTheme(); const [screenState, setScreenState] = useState<ScreenState>('list');
  const [currentUserId, setCurrentUserId] = useState(''); const [currentUsername, setCurrentUsername] = useState('Messages');
  const [activeConv, setActiveConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [viewedUserIds, setViewedUserIds] = useState<Set<string>>(new Set());
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return; const uid = data.user.id; setCurrentUserId(uid);
      const { data: prof } = await supabase.from('profiles').select('username').eq('id', uid).single();
      if (prof?.username) setCurrentUsername(prof.username);
      presenceChannelRef.current = supabase.channel('global-presence', { config: { presence: { key: uid } } });
      presenceChannelRef.current.on('presence', { event: 'sync' }, () => {
        const state = presenceChannelRef.current?.presenceState();
        if (state) setOnlineUserIds(new Set(Object.keys(state)));
      }).subscribe(async (s) => { if (s === 'SUBSCRIBED') await presenceChannelRef.current?.track({ online_at: new Date().toISOString() }); });
    });
    return () => { presenceChannelRef.current?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    getActiveStories().then(gs => setStoryUserIds(new Set(gs.map((g: any) => g.profile?.id).filter(Boolean)))).catch(() => {});
    getViewedStoryIds(currentUserId).then(ids => { if (ids.length) supabase.from('stories').select('id, user_id').in('id', ids).then(({ data }) => { if (data) setViewedUserIds(new Set(data.map((s: any) => s.user_id))); }); }).catch(() => {});
  }, [currentUserId]);

  const openChat = useCallback((convId: string, otherProfile: any) => { setActiveConv({ convId, otherProfile }); setScreenState('chat'); onChatStateChange?.(true); }, [onChatStateChange]);
  const closeChat = useCallback(() => { setActiveConv(null); setScreenState('list'); onChatStateChange?.(false); }, [onChatStateChange]);

  if (!currentUserId) return <View style={[styles.container, { backgroundColor: colors.bg }]}><ConvSkeleton /></View>;

  return (
    <>
      <View style={{ flex: 1, display: (screenState === 'chat' || screenState === 'info') ? 'none' : 'flex' }}>
        <ConversationList currentUserId={currentUserId} currentUsername={currentUsername} onPress={openChat} onCompose={() => setScreenState('new')} storyUserIds={storyUserIds} viewedUserIds={viewedUserIds} onlineUserIds={onlineUserIds} onAvatarPress={(u, h, p) => {}} archived={screenState === 'archived'} onBack={() => setScreenState('list')} onViewArchived={() => setScreenState('archived')} />
      </View>
      {screenState === 'chat' && activeConv && <ChatView convData={activeConv} currentUserId={currentUserId} onBack={closeChat} storyUserIds={storyUserIds} viewedUserIds={viewedUserIds} onlineUserIds={onlineUserIds} onAvatarPress={(u, h, p) => {}} onHeaderPress={() => setScreenState('info')} />}
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  listTitle: { fontSize: 20, fontWeight: 'bold' },
  composeBtn: { padding: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginHorizontal: 14, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  activeFriends: { paddingLeft: 14, marginBottom: 10 },
  activeItem: { alignItems: 'center', gap: 4, width: 58 },
  activeAvatarWrap: { position: 'relative' },
  onlineDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  activeUsername: { fontSize: 10, textAlign: 'center' },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  convAvatarWrap: { position: 'relative' },
  convUnreadPill: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  convUnreadPillText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  convName: { fontSize: 14, fontWeight: '500' },
  convTime: { fontSize: 10, marginLeft: 6 },
  convPreview: { fontSize: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -80 },
  emptyTitle: { marginTop: 14, fontSize: 15, fontWeight: '600' },
  newMsgBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, backgroundColor: '#4f46e5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  newMsgBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  archivedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  archivedIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  archivedLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  archivedBadge: { backgroundColor: '#4f46e5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 4 },
  archivedBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chatBack: { padding: 4, marginRight: 4 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatName: { fontSize: 14, fontWeight: 'bold' },
  chatStatus: { fontSize: 11 },
  chatAction: { padding: 8 },
  dayDivider: { alignItems: 'center', marginVertical: 14 },
  dayLabel: { fontSize: 11, fontWeight: '600' },
  msgRow: { flexDirection: 'row', marginBottom: 3, alignItems: 'flex-end' },
  msgRowMe: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgRowThem: { alignSelf: 'flex-start' },
  msgAvatar: { width: 26, height: 26, borderRadius: 13 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  imageBubble: { width: 220, height: 260, borderRadius: 18 },
  msgMeta: { marginTop: 3, marginHorizontal: 4 },
  msgTime: { fontSize: 10 },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, gap: 2 },
  reactionBadgeMine: { backgroundColor: 'rgba(79,70,229,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: '#6366f1' },
  reactionCount: { fontSize: 11 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 10 },
  inputRowContainer: { borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 7, gap: 6, borderWidth: StyleSheet.hairlineWidth, minHeight: 40 },
  input: { flex: 1, fontSize: 14, maxHeight: 100, paddingVertical: 0 },
  sendBtn: { padding: 8, borderRadius: 20 },
  sendBtnActive: { backgroundColor: '#4f46e5' },
  whatsappVoiceContainer: { flexDirection: 'row', alignItems: 'center' },
  recordingOverlay: { position: 'absolute', left: -240, right: 30, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.05)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, zIndex: -1 },
  recordingTimerContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  recordingTime: { fontSize: 14, fontWeight: '600' },
  slideToCancel: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  lockIconContainer: { position: 'absolute', top: -60, right: 6, width: 40, height: 60, alignItems: 'center', justifyContent: 'flex-start' },
  lockedContainer: { position: 'absolute', left: -260, right: 0, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  lockedDiscard: { padding: 8 },
  lockedTimer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockedSend: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  micWrapper: { zIndex: 10 },
  micIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  trashContainer: { position: 'absolute', left: -220, zIndex: -1 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 20, gap: 10, minWidth: 180 },
  voiceBubbleMe: { backgroundColor: '#4f46e5' },
  voicePlayBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  waveformContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  waveformBar: { width: 2, borderRadius: 1 },
  voiceDuration: { fontSize: 11, color: '#fff', opacity: 0.8 },
  msgActionBar: { position: 'absolute', flexDirection: 'row', gap: 6, backgroundColor: 'rgba(20,20,30,0.95)', borderRadius: 16, padding: 6, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  msgActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)' },
  msgActionDanger: { backgroundColor: 'rgba(239,68,68,0.12)' },
  msgActionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  pinnedText: { flex: 1, fontSize: 13, fontWeight: '500' },
  viewOnceBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, borderWidth: 1, gap: 10, minWidth: 140 },
  viewOnceText: { fontSize: 14, fontWeight: '600' },
  viewOnceToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 6 },
  viewOnceToggleActive: { backgroundColor: '#4f46e5' },
  viewOnceToggleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  documentBubble: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, minWidth: 200 },
  documentIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  documentName: { fontSize: 14, fontWeight: '600' },
  documentSize: { fontSize: 11 },
  bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed' as any },
  bubbleTextDeleted: { fontSize: 12, fontStyle: 'italic' },
  replyQuote: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 2, maxWidth: '80%', backgroundColor: 'rgba(99,102,241,0.08)' },
  replyQuoteName: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyQuoteText: { fontSize: 11, opacity: 0.75 },
  forwardedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2, marginLeft: 4 },
  forwardedText: { fontSize: 11, fontStyle: 'italic' },
  lightboxBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  lightboxImage: { width: '100%', height: '85%' },
});
