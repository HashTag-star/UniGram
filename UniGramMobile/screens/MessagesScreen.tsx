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
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Audio } from 'expo-av';
import { useHaptics } from '../hooks/useHaptics';
import { Keyboard } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
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
} from '../services/messages';
import { updateActiveStatus, blockUser } from '../services/profiles';
import { getUserStories, getViewedStoryIds, markStoryViewed } from '../services/stories';
import { ProfileScreen } from './ProfileScreen';
import { ProfilePicViewer } from '../components/ProfilePicViewer';
import { initiateCall, CallRecord, CallType } from '../services/calls';
import { CallScreen } from './CallScreen';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';

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
    backgroundColor: 'rgba(150,150,150,0.5)',
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

// ─── Story Ring Avatar ────────────────────────────────────────────────────────

const StoryRingAvatar: React.FC<{
  uri?: string | null;
  size: number;
  hasStory: boolean;
  viewed: boolean;
  onPress?: () => void;
  isGroup?: boolean;
}> = ({ uri, size, hasStory, viewed, onPress, isGroup }) => {
  const { colors } = useTheme();
  const ringColor = hasStory ? (viewed ? '#888' : '#6366f1') : 'transparent';
  const outerSize = hasStory ? size + 6 : size;

  const inner = (
    <View style={{
      width: outerSize,
      height: outerSize,
      borderRadius: outerSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ringColor,
    }}>
      {uri ? (
        <CachedImage
          uri={uri}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: hasStory ? 2 : 0,
            borderColor: colors.bg,
          }}
        />
      ) : (
        <View style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bg2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: hasStory ? 2 : 0,
          borderColor: colors.bg,
        }}>
          <Ionicons name={isGroup ? 'people' : 'person'} size={size * 0.44} color={colors.textMuted} />
        </View>
      )}
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      {inner}
    </TouchableOpacity>
  );
};

// ─── Voice Waveform ───────────────────────────────────────────────────────────

const VoiceWaveform: React.FC<{
  uri: string;
  duration: number;
  isMe: boolean;
}> = ({ uri, duration, isMe }) => {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const bars = useMemo(() => {
    return Array.from({ length: 25 }, () => 3 + Math.random() * 15);
  }, []);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      if (status.didJustFinish) {
        setPlaying(false);
        setProgress(0);
        soundRef.current?.setPositionAsync(0);
      } else {
        const p = status.positionMillis / (status.durationMillis || duration || 1);
        setProgress(p);
      }
    }
  };

  const togglePlayback = async () => {
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
        setPlaying(true);
      } else {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (playing) {
            await soundRef.current.pauseAsync();
            setPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setPlaying(true);
          }
        }
      }
    } catch (e) {
      console.error('Playback error:', e);
      setPlaying(false);
    }
  };

  return (
    <View style={[styles.voiceBubble, isMe ? styles.voiceBubbleMe : [styles.voiceBubbleThem, { backgroundColor: colors.bg2 }]]}>
      <TouchableOpacity onPress={togglePlayback} style={styles.voicePlayBtn} activeOpacity={0.8}>
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color={isMe ? '#fff' : colors.text} />
      </TouchableOpacity>
      <View style={styles.waveformContainer}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveformBar,
              {
                height: h,
                backgroundColor: i / bars.length <= progress
                  ? (isMe ? '#fff' : colors.accent)
                  : (isMe ? 'rgba(255,255,255,0.3)' : colors.textMuted + '40')
              }
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: isMe ? '#fff' : colors.textSub }]}>
        {Math.floor(duration / 1000)}s
      </Text>
    </View>
  );
};

// ─── Replying To Header ───────────────────────────────────────────────────────

const ReplyingToHeader: React.FC<{
  msg: any;
  onCancel: () => void;
}> = ({ msg, onCancel }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.replyHeader, { borderBottomColor: colors.border }]}>
      <View style={styles.replyHeaderBar} />
      <View style={{ flex: 1, paddingLeft: 12 }}>
        <Text style={styles.replyHeaderTitle}>
          Replying to {msg.profiles?.full_name || msg.profiles?.username}
        </Text>
        <Text style={[styles.replyHeaderText, { color: colors.textSub }]} numberOfLines={1}>
          {msg.type === 'image' ? '📷 Photo' : msg.type === 'audio' ? '🎤 Voice message' : msg.text}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

// ─── Voice Recorder ───────────────────────────────────────────────────────────

const VoiceRecorder: React.FC<{
  onRecordComplete: (uri: string, duration: number) => void;
  onRecordingChange?: (recording: boolean) => void;
}> = ({ onRecordComplete, onRecordingChange }) => {
  const { colors } = useTheme();
  const { medium: hapticMedium, success: hapticSuccess } = useHaptics();
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<any>(null);
  const { showPopup } = usePopup();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
  
  // Waveform shared values
  const waveValues = [
    useSharedValue(5), useSharedValue(15), useSharedValue(25),
    useSharedValue(10), useSharedValue(20), useSharedValue(15),
    useSharedValue(5)
  ];

  const animateWave = useCallback(() => {
    waveValues.forEach((val) => {
      val.value = withRepeat(
        withSequence(
          withTiming(10 + Math.random() * 30, { duration: 150 + Math.random() * 100 }),
          withTiming(5 + Math.random() * 10, { duration: 150 + Math.random() * 100 })
        ),
        -1,
        true
      );
    });
  }, []);

  const resetWave = useCallback(() => {
    waveValues.forEach((val) => {
      val.value = withSpring(8);
    });
  }, []);

  const start = async () => {
    if (isRecording || isPreparing) return;
    setIsPreparing(true);

    try {
      // Ensure any stale recording is unloaded
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {}
        recordingRef.current = null;
      }

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showPopup({
          title: 'Permission Denied',
          message: 'UniGram needs microphone access to send voice messages.',
          icon: 'mic-off-outline',
          iconColor: '#ef4444',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
        setIsPreparing(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      
      recordingRef.current = recording;
      setIsRecording(true);
      onRecordingChange?.(true);
      setDuration(0);
      animateWave();
      
      timerRef.current = setInterval(() => {
        setDuration(d => d + 100);
      }, 100);
      
      hapticMedium();
    } catch (err) {
      console.error('Failed to start recording', err);
      showPopup({
        title: 'Error',
        message: 'Could not start recording. Please check your settings.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setIsPreparing(false);
    }
  };

  const stop = async (cancel = false) => {
    if (!recordingRef.current || isPreparing) return;
    
    const rec = recordingRef.current;
    recordingRef.current = null; // Prevent concurrent stop calls
    
    clearInterval(timerRef.current);
    setIsRecording(false);
    onRecordingChange?.(false);
    resetWave();
    
    try {
      await rec.stopAndUnloadAsync();

      // Restore audio session to non-recording mode so background music
      // can resume. Recording sets allowsRecordingIOS = true which switches
      // the iOS AVAudioSession to .playAndRecord and interrupts other apps.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        staysActiveInBackground: false,
      }).catch(() => {});

      const uri = rec.getURI();
      const finalDuration = duration;
      setDuration(0);

      if (!cancel && finalDuration > 800 && uri) {
        onRecordComplete(uri, finalDuration);
        hapticSuccess();
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const animatedWaveStyles = waveValues.map(val => useAnimatedStyle(() => ({
    height: val.value,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.accent,
    marginHorizontal: 1,
  })));

  return (
    <View style={styles.voiceRecorderContainer}>
      {isRecording && (
        <View style={[styles.recordingWaveContainer, { backgroundColor: colors.bg2 }]}>
          <View style={styles.waveRows}>
            {animatedWaveStyles.map((style, i) => (
              <Reanimated.View key={i} style={style} />
            ))}
          </View>
          <Text style={[styles.voiceRecordingTime, { color: colors.textSub }]}>
            {Math.floor(duration / 1000)}:{(Math.floor(duration / 100) % 10)}
          </Text>
        </View>
      )}
      <TouchableOpacity
        onPressIn={start}
        onPressOut={() => stop(false)}
        style={[styles.voiceRecordBtn, isRecording && { transform: [{ scale: 1.2 }] }]}
      >
        <View style={[styles.voiceRecordIcon, isRecording && styles.voiceRecordIconActive]}>
          <Ionicons name="mic" size={22} color={isRecording ? '#fff' : colors.textMuted} />
        </View>
      </TouchableOpacity>
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
  onSwipeReply: (msg: any) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  isMe,
  prevMsg,
  nextMsg,
  currentUserId,
  onLongPress,
  onReactionTap,
  onSwipeReply,
}) => {
  const { colors } = useTheme();
  const { light: hapticLight, medium: hapticMedium } = useHaptics();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const swipeX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx > 0) swipeX.value = Math.min(gesture.dx, 50);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 40) {
            onSwipeReply(msg);
            hapticLight();
          }
          swipeX.value = withSpring(0);
        },
      }),
    [msg, onSwipeReply, swipeX]
  );

  const showUnsend = (e: any) => {
    const { pageX, pageY } = e.nativeEvent;
    onLongPress(msg, pageX, pageY);
    hapticMedium();
  };

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
  const isDeleted = msg.is_deleted === true;

  if (isDeleted) {
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        <View style={[styles.bubble, styles.bubbleDeleted]}>
          <Text style={[styles.bubbleTextDeleted, { color: colors.textMuted }]}>
            {isMe ? 'You unsent a message' : 'Message unsent'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {showDay && (
        <View style={styles.dayDivider}>
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{fmtDay(msg.created_at)}</Text>
        </View>
      )}

      {msg.reply && (
        <View style={[styles.replyQuote, isMe ? { alignSelf: 'flex-end', borderRightWidth: 2, borderRightColor: '#6366f1' } : { alignSelf: 'flex-start', borderLeftWidth: 2, borderLeftColor: '#6366f1' }]}>
          <Text style={[styles.replyQuoteName, { color: '#6366f1' }]} numberOfLines={1}>
            {msg.reply.sender_id === currentUserId ? 'You' : (msg.reply.profiles?.full_name || msg.reply.profiles?.username || 'Someone')}
          </Text>
          <Text style={styles.replyQuoteText} numberOfLines={1}>
            {msg.reply.type === 'image' ? '📷 Photo' : msg.reply.type === 'audio' ? '🎤 Voice message' : msg.reply.type === 'share' ? '🔗 Shared content' : (msg.reply.text || '…')}
          </Text>
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
                <CachedImage uri={msg.profiles.avatar_url} style={styles.msgAvatar} />
              ) : (
                <View style={[styles.msgAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                </View>
              )
            ) : null}
          </View>
        )}

        <View style={{ maxWidth: '75%' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={(e: any) => onLongPress(msg, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            delayLongPress={350}
            onPress={() => {
              // Add a swipe-to-reply simulation or gesture here if needed
              // For now, let's just make it call onSwipeReply if tapped twice?
              // Actual swipe will be handled by a PanGestureHandler wrapper if added.
            }}
          >
            {isImage ? (
              <TouchableOpacity onPress={() => setLightboxUri(msg.media_url)} activeOpacity={0.9}>
                <CachedImage
                  uri={msg.media_url}
                  style={[
                    styles.imageBubble,
                    isMe ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 },
                  ]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : msg.type === 'audio' ? (
              <VoiceWaveform uri={msg.media_url} duration={msg.duration || 0} isMe={isMe} />
            ) : msg.type === 'share' ? (
              (() => {
                let shareData: any = {};
                try { shareData = JSON.parse(msg.text); } catch {}
                return (
                  <View style={[styles.shareBubble, { backgroundColor: isMe ? '#4f46e5' : colors.bg2, borderColor: colors.border }]}>
                    {shareData.previewUrl ? (
                      <CachedImage uri={shareData.previewUrl} style={styles.sharePreviewImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.sharePreviewImg, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="link-outline" size={28} color={isMe ? 'rgba(255,255,255,0.5)' : colors.textMuted} />
                      </View>
                    )}
                    <View style={{ padding: 8 }}>
                      <Text style={[styles.shareLabel, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textMuted }]}>
                        {shareData.type === 'reel' ? '🎬 Reel' : shareData.type === 'profile' ? '👤 Profile' : '📸 Post'}
                      </Text>
                      <Text style={[styles.shareCaption, { color: isMe ? '#fff' : colors.text }]} numberOfLines={2}>
                        {shareData.title || (shareData.type === 'post' ? 'Shared a post' : shareData.type === 'reel' ? 'Shared a reel' : 'Shared a profile')}
                      </Text>
                    </View>
                  </View>
                );
              })()
            ) : (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: colors.bg2 }]]}>
                <Text style={[styles.bubbleText, !isMe && { color: colors.text }]}>{msg.text}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Reactions row */}
          {Object.keys(grouped).length > 0 && (
            <View style={[styles.reactionsRow, isMe && { alignSelf: 'flex-end' }]}>
              {Object.entries(grouped).map(([emoji, { count, iMine }]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionBadge, { backgroundColor: colors.bg2 }, iMine && styles.reactionBadgeMine]}
                  onPress={() => onReactionTap(msg, emoji)}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {count > 1 && <Text style={[styles.reactionCount, { color: colors.textSub }]}>{count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Timestamp + read receipt */}
          {(showTimestamp || msg._sending) && (
            <View style={[styles.msgMeta, isMe && { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <Text style={[styles.msgTime, { color: colors.textMuted }]}>{fmtTime(msg.created_at)}</Text>
              {isMe && (
                <Ionicons
                  name={msg._sending ? 'time-outline' : isRead ? 'checkmark-done' : 'checkmark'}
                  size={12}
                  color={msg._sending ? colors.textMuted : isRead ? '#60a5fa' : colors.textMuted}
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
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
      showPopup({
        title: 'Failed to Connect',
        message: e.message ?? 'Could not start a conversation with this user.',
        icon: 'chatbubble-ellipses-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
    if (!groupName.trim() || selectedUsers.length < 2) return;
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
      showPopup({
        title: 'Group Failed',
        message: e.message ?? 'Could not create the group. Please try again.',
        icon: 'people-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
            <CachedImage uri={item.avatar_url} style={styles.userResultAvatar} />
          ) : (
            <View style={[styles.userResultAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color={colors.textMuted} />
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
            <Text style={[styles.userResultName, { color: colors.text }]}>{item.full_name ?? item.username}</Text>
            {item.is_verified && <VerifiedBadge type={item.verification_type} size="sm" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.userResultUsername, { color: colors.textMuted }]}>@{item.username}</Text>
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
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
      <View style={[styles.newConvModal, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.newConvHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.newConvTitle, { color: colors.text }]}>
            {mode === 'dm' ? 'New Message' : mode === 'group-pick' ? 'Add People' : 'Group Name'}
          </Text>
          {mode === 'group-pick' && selectedUsers.length > 0 ? (
            <TouchableOpacity onPress={() => setMode('group-name')}>
              <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 15 }}>Next</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Group name screen */}
        {mode === 'group-name' ? (
          <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, letterSpacing: 1 }}>
              GROUP NAME
            </Text>
            <TextInput
              style={[styles.groupNameInput, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Enter a group name…"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoFocus
            />
            <Text style={{ color: selectedUsers.length < 2 ? '#f59e0b' : colors.textMuted, fontSize: 12, marginTop: 6 }}>
              {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected{selectedUsers.length < 2 ? ' — need at least 2' : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {selectedUsers.map((u) => (
                <View key={u.id} style={{ alignItems: 'center', width: 56 }}>
                  {u.avatar_url ? (
                    <CachedImage uri={u.avatar_url} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }} numberOfLines={1}>{u.username}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.createGroupBtn,
                (!groupName.trim() || selectedUsers.length < 2 || creatingGroup) && { opacity: 0.4 },
              ]}
              onPress={createGroup}
              disabled={!groupName.trim() || selectedUsers.length < 2 || creatingGroup}
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
              <TouchableOpacity style={[styles.newGroupRow, { borderBottomColor: colors.border }]} onPress={() => setMode('group-pick')}>
                <View style={styles.newGroupIcon}>
                  <Ionicons name="people" size={20} color="#fff" />
                </View>
                <Text style={[styles.newGroupLabel, { color: colors.text }]}>New Group Chat</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {/* Search bar */}
            <View style={[styles.newConvSearch, { backgroundColor: colors.bg2 }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.newConvInput, { color: colors.text }]}
                placeholder={mode === 'group-pick' ? 'Add people…' : 'Search people…'}
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus={mode === 'group-pick'}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
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
                    <Ionicons name="close" size={12} color="#fff" />
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
                    <Ionicons name="person-outline" size={44} color={colors.textMuted} />
                    <Text style={{ color: colors.textSub, marginTop: 12 }}>No users found</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="people-outline" size={44} color={colors.textMuted} />
                    <Text style={{ color: colors.textSub, marginTop: 12, textAlign: 'center', marginHorizontal: 30 }}>
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
  storyUserIds?: Set<string>;
  viewedUserIds?: Set<string>;
  onAvatarPress?: (userId: string, hasStory: boolean, profile: any) => void;
  onHeaderPress?: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({ convData, currentUserId, onBack, storyUserIds, viewedUserIds, onAvatarPress, onHeaderPress }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { light: hapticLight } = useHaptics();
  const insets = useSafeAreaInsets();
  const { convId, otherProfile } = convData;

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeCall, setActiveCall] = useState<{ call: CallRecord; isIncoming: boolean } | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<{ msg: any; x: number; y: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [profile, setProfile] = useState<any>(otherProfile);
  const [isOtherRecording, setIsOtherRecording] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  // Recovery effect for erased/missing names
  useEffect(() => {
    if (!profile || !profile.full_name) {
      const fetchProfile = async () => {
        try {
          const { data, error } = await supabase
            .from('conversation_participants')
            .select('profiles(*)')
            .eq('conversation_id', convId)
            .neq('user_id', currentUserId)
            .maybeSingle();
          
          if (data?.profiles) {
            setProfile(data.profiles);
          } else if (otherProfile) {
            // Fallback to initial prop if DB fetch somehow fails
            setProfile(otherProfile);
          }
        } catch (e) {
          console.error('Profile recovery failed:', e);
        }
      };
      fetchProfile();
    } else {
      // Sync local state if prop changes
      setProfile(otherProfile);
    }
  }, [convId, otherProfile, currentUserId]);

  const isTypingSentRef = useRef(false);
  const flatRef = useRef<FlatList>(null);
  const msgChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to bottom when keyboard OR emoji picker opens
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setShowEmojiPicker(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => showSub.remove();
  }, []);

  useEffect(() => {
    if (showEmojiPicker) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [showEmojiPicker]);

  // Load messages and set up realtime
  useEffect(() => {
    if (!convId) return;
    setLoading(true);

    getMessages(convId, 60)
      .then((msgs) => {
        setMessages(msgs);
        setHasMore(msgs.length === 60);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    markMessagesRead(convId, currentUserId).catch(() => { });

    msgChannelRef.current = subscribeToMessages(
      convId,
      (msg) => {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          // Replace any optimistic duplicate (same sender + text + recent)
          const tempIdx = prev.findIndex(m => m._sending && m.sender_id === msg.sender_id && m.text === msg.text);
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = { ...msg, _sending: false };
            return next;
          }
          return [...prev, msg];
        });
        if (msg.sender_id !== currentUserId) {
          markMessagesRead(convId, currentUserId).catch(() => { });
        }
      },
      (updatedMsg) => {
        setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
      }
    );

    // Active status loop
    const statusInterval = setInterval(() => updateActiveStatus(currentUserId), 60000);
    updateActiveStatus(currentUserId);

    // Typing + recording presence
    try {
      typingChannelRef.current = supabase
        .channel(`typing:${convId}`)
        .on('presence', { event: 'sync' }, function (this: RealtimeChannel) {
          const state = (this as any).presenceState?.() ?? {};
          const others = (Object.values(state) as any[][]).flat().filter((u: any) => u.user_id !== currentUserId);
          setIsOtherTyping(others.some((u: any) => u.isTyping && !u.isRecording));
          setIsOtherRecording(others.some((u: any) => u.isRecording));
        })
        .subscribe();
    } catch (_) { }

    return () => {
      msgChannelRef.current?.unsubscribe();
      typingChannelRef.current?.unsubscribe();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      clearInterval(statusInterval);
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
          typingChannelRef.current.track({ user_id: currentUserId, isTyping: true });
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          typingChannelRef.current?.untrack();
          isTypingSentRef.current = false;
        }, 2500);
      } catch (_) { }
    },
    [currentUserId],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || uploading) return;
    setText('');
    try { typingChannelRef.current?.untrack(); isTypingSentRef.current = false; } catch (_) {}

    // Optimistic message — shown immediately
    const tempId = `_tmp_${Date.now()}`;
    const pendingReply = replyingTo;
    const optimistic: any = {
      id: tempId,
      conversation_id: convId,
      sender_id: currentUserId,
      text: t,
      type: 'text',
      created_at: new Date().toISOString(),
      is_read: false,
      is_deleted: false,
      _sending: true,
      profiles: null,
      message_reactions: [],
      reply: pendingReply ?? null,
      reply_to_message_id: pendingReply?.id ?? null,
    };
    setMessages(prev => [...prev, optimistic]);
    setReplyingTo(null);

    try {
      const sent = await sendMessage(convId, currentUserId, t, 'text', undefined, pendingReply?.id);
      setMessages(prev => {
        if (prev.find(m => m.id === sent.id)) return prev.filter(m => m.id !== tempId);
        return prev.map(m => m.id === tempId ? { ...sent, _sending: false } : m);
      });
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setText(t);
      showPopup({
        title: 'Failed to send',
        message: e.message ?? 'Please try again.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    }
  }, [text, uploading, convId, currentUserId, replyingTo]);

  const handleRecordingChange = useCallback((recording: boolean) => {
    if (!typingChannelRef.current) return;
    try {
      if (recording) {
        typingChannelRef.current.track({ user_id: currentUserId, isRecording: true });
      } else {
        typingChannelRef.current.untrack();
      }
    } catch (_) {}
  }, [currentUserId]);

  const onVoiceRecorded = useCallback(async (uri: string, duration: number) => {
    setUploading(true);
    try {
      await sendVoiceMessage(convId, currentUserId, uri, duration, replyingTo?.id);
      setReplyingTo(null);
    } catch (e: any) {
      showPopup({
        title: 'Failed to send',
        message: e.message ?? 'Could not send voice message.',
        icon: 'mic-off-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setUploading(false);
    }
  }, [convId, currentUserId, replyingTo]);

  const handleUnsend = useCallback(async () => {
    if (!reactionTarget) return;
    const msg = reactionTarget.msg;
    setReactionTarget(null);
    try {
      await unsendMessage(msg.id, currentUserId);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: 'Could not unsend message.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  }, [reactionTarget, currentUserId]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0]?.created_at;
      const older = await getMessages(convId, 40, oldest);
      if (older.length === 0) { setHasMore(false); return; }
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === 40);
    } catch (e) {
      console.error('loadOlderMessages failed', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, convId]);

  const pickAndSendImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showPopup({
        title: 'Permission required',
        message: 'Photo library access is needed to send images.',
        icon: 'images-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingImage(result.assets[0].uri);
  }, []);

  const sendPendingImage = useCallback(async (caption: string) => {
    if (!pendingImage) return;
    const uri = pendingImage;
    setPendingImage(null);
    setUploading(true);
    try {
      await sendImageMessage(convId, currentUserId, uri, replyingTo?.id, caption || undefined);
      setReplyingTo(null);
    } catch (e: any) {
      showPopup({
        title: 'Upload failed',
        message: e.message ?? 'Could not send image.',
        icon: 'cloud-offline-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    } finally {
      setUploading(false);
    }
  }, [pendingImage, convId, currentUserId, replyingTo]);

  const handleReaction = useCallback(
    async (emoji: string) => {
      if (!reactionTarget) return;
      const msg = reactionTarget.msg;
      const existing = (msg.message_reactions ?? []).find(
        (r: any) => r.user_id === currentUserId && r.emoji === emoji,
      );
      setReactionTarget(null);
      // Snapshot for rollback
      const snapshot = messages;
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const reactions = m.message_reactions ?? [];
          if (existing) {
            return { ...m, message_reactions: reactions.filter((r: any) => !(r.user_id === currentUserId && r.emoji === emoji)) };
          }
          return { ...m, message_reactions: [...reactions, { id: `opt-${Date.now()}`, emoji, user_id: currentUserId }] };
        }),
      );
      try {
        if (existing) {
          await removeReaction(msg.id, currentUserId, emoji);
        } else {
          await addReaction(msg.id, currentUserId, emoji);
        }
      } catch {
        setMessages(snapshot);
      }
    },
    [reactionTarget, currentUserId, messages],
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
          removeReaction(msg.id, currentUserId, emoji).catch(() => { });
        } else {
          addReaction(msg.id, currentUserId, emoji).catch(() => { });
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
        onSwipeReply={(msg) => setReplyingTo(msg)}
      />
    ),
    [messages, currentUserId, handleReactionTap],
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  const isGroup = otherProfile?.is_group === true;

  const startCall = useCallback(async (type: CallType) => {
    if (isGroup) {
      showPopup({ title: 'Not supported', message: 'Group calls are not available yet.', icon: 'people-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
      return;
    }
    try {
      // Create WebRTC offer first
      const { RTCPeerConnection, RTCSessionDescription } = require('react-native-webrtc');
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(offer);
      pc.close();

      const otherUserId = otherProfile?.id;
      if (!otherUserId) throw new Error('Could not determine recipient');

      const callRecord = await initiateCall(currentUserId, otherUserId, convId, type, offer);
      setActiveCall({ call: callRecord, isIncoming: false });
    } catch (e: any) {
      showPopup({ title: 'Call failed', message: e.message ?? 'Could not start the call.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    }
  }, [isGroup, currentUserId, convId, otherProfile, showPopup]);

  if (activeCall) {
    return (
      <CallScreen
        call={activeCall.call}
        currentUserId={currentUserId}
        isIncoming={activeCall.isIncoming}
        onCallEnd={() => setActiveCall(null)}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      enabled={!showEmojiPicker}
    >
      {/* Header */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 6, backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.chatBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.chatHeaderUser}>
          {/* Avatar with story ring */}
          {(() => {
            const otherUserId = profile?.id;
            const hasStory = !isGroup && !!otherUserId && (storyUserIds?.has(otherUserId) ?? false);
            const storyViewed = !isGroup && !!otherUserId && (viewedUserIds?.has(otherUserId) ?? false);
            return (
              <StoryRingAvatar
                uri={profile?.avatar_url}
                size={36}
                hasStory={hasStory}
                viewed={storyViewed}
                isGroup={isGroup}
                onPress={(!isGroup && otherUserId && onAvatarPress)
                  ? () => onAvatarPress(otherUserId, hasStory, profile)
                  : undefined}
              />
            );
          })()}
          {/* Name + status — tapping navigates to Chat Info */}
          <TouchableOpacity
            style={{ marginLeft: 10, flex: 1 }}
            activeOpacity={onHeaderPress ? 0.7 : 1}
            onPress={onHeaderPress}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
                {profile?.full_name ?? profile?.username ?? 'Chat'}
              </Text>
              {profile?.is_verified && (
                <VerifiedBadge type={profile.verification_type} size="sm" />
              )}
            </View>
            <Text style={[styles.chatStatus, { color: isOtherTyping || isOtherRecording ? colors.accent : colors.textMuted }]}>
              {isOtherRecording ? '🎤 recording…' : isOtherTyping ? 'typing…' : isGroup ? 'Group chat' : 'Active now'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 0 }}>
          <TouchableOpacity style={styles.chatAction} onPress={() => startCall('audio')}>
            <Ionicons name="call-outline" size={21} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chatAction} onPress={() => startCall('video')}>
            <Ionicons name="videocam-outline" size={21} color={colors.textMuted} />
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
            <View>
              {hasMore && (
                <TouchableOpacity
                  onPress={loadOlderMessages}
                  disabled={loadingMore}
                  style={{ alignSelf: 'center', marginBottom: 12, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.bg2, borderRadius: 16 }}
                >
                  {loadingMore
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={{ color: colors.textSub, fontSize: 12 }}>Load older messages</Text>
                  }
                </TouchableOpacity>
              )}
              <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 8 }}>
                {profile?.avatar_url ? (
                  <CachedImage uri={profile.avatar_url} style={{ width: 72, height: 72, borderRadius: 36 }} />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={isGroup ? 'people' : 'person'} size={32} color={colors.textMuted} />
                  </View>
                )}
                <Text style={[styles.chatIntroName, { color: colors.text }]}>
                  {profile?.full_name ?? profile?.username}
                </Text>
                {profile?.is_verified && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <VerifiedBadge type={profile.verification_type} size="sm" />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Verified</Text>
                  </View>
                )}
                {profile?.university ? (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{profile.university}</Text>
                ) : null}
              </View>
            </View>
          }
          ListFooterComponent={
            (isOtherTyping || isOtherRecording) ? (
              <View style={styles.typingRow}>
                <View style={{ width: 30, marginRight: 6 }}>
                  {profile?.avatar_url ? (
                    <CachedImage uri={profile.avatar_url} style={styles.msgAvatar} />
                  ) : (
                    <View style={[styles.msgAvatar, { backgroundColor: colors.bg2 }]} />
                  )}
                </View>
                {isOtherRecording ? (
                  <View style={[styles.typingBubble, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons name="mic" size={13} color={colors.accent} />
                    <Text style={{ color: colors.textSub, fontSize: 12 }}>recording…</Text>
                  </View>
                ) : (
                  <TypingDots />
                )}
              </View>
            ) : null
          }
        />
      )}

      {/* Input bar */}
      <View style={[
        styles.inputRowContainer, 
        { 
          paddingBottom: showEmojiPicker ? 8 : Math.max(insets.bottom, 8), 
          backgroundColor: colors.bg, 
          borderTopColor: colors.border,
          // On Android height behavior, we often don't want the extra inset
          ...(Platform.OS === 'android' && { paddingBottom: showEmojiPicker ? 8 : 12 })
        }
      ]}>
        {replyingTo && (
          <ReplyingToHeader msg={replyingTo} onCancel={() => setReplyingTo(null)} />
        )}
        <View style={styles.inputRow}>
          {/* 1. Emoji Button on the left (replacing Media) */}
          <TouchableOpacity style={styles.inputIcon} onPress={() => {
            if (!showEmojiPicker) Keyboard.dismiss();
            setShowEmojiPicker(p => !p);
          }}>
            <Ionicons 
              name={showEmojiPicker ? "keypad-outline" : "happy-outline"} 
              size={24} 
              color={showEmojiPicker ? colors.accent : colors.textMuted} 
            />
          </TouchableOpacity>
          
          <View style={[styles.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={text}
              onChangeText={handleTyping}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={send}
              multiline
              maxLength={2000}
              numberOfLines={1}
            />
            
            {/* 2. Attachment (Media) and Camera buttons inside the input at the end */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8 }}>
              {!text.trim() && (
                <TouchableOpacity onPress={() => showPopup({
                  title: 'Coming Soon',
                  message: 'Camera integration is in progress.',
                  icon: 'camera-outline',
                  buttons: [{ text: 'OK', onPress: () => {} }]
                })}>
                  <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={pickAndSendImage} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="attach-outline" size={22} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Send or Voice on the right */}
          {text.trim() || uploading ? (
            <TouchableOpacity
              onPress={send}
              disabled={!text.trim() || uploading}
              style={[styles.sendBtn, text.trim() && !uploading && styles.sendBtnActive]}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Ionicons
                name="send"
                size={17}
                color={text.trim() && !uploading ? '#fff' : colors.textMuted}
              />
            </TouchableOpacity>
          ) : (
            <VoiceRecorder onRecordComplete={onVoiceRecorded} onRecordingChange={handleRecordingChange} />
          )}
        </View>
      </View>

      {/* Professional Inline Emoji Keyboard */}
      {showEmojiPicker && (
        <View style={{ height: 300, backgroundColor: colors.bg }}>
          <EmojiKeyboard
            onEmojiSelected={(emoji: EmojiType) => {
              setText(prev => prev + emoji.emoji);
              hapticLight();
            }}
            theme={{
              backdrop: '#00000000',
              container: colors.bg,
              header: colors.text,
              knob: colors.accent,
              category: {
                icon: colors.accent,
                iconActive: colors.accent,
                container: colors.bg2,
                containerActive: colors.accent + '20',
              },
            }}
          />
        </View>
      )}

      {/* Reaction picker overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <ReactionPicker
          visible={!!reactionTarget}
          position={reactionTarget ? { x: reactionTarget.x, y: reactionTarget.y } : { x: 0, y: 0 }}
          onPick={handleReaction}
          onClose={() => setReactionTarget(null)}
        />
        {reactionTarget && reactionTarget.msg.sender_id === currentUserId && (
          <TouchableOpacity
            style={[styles.unsendBtn, { top: reactionTarget.y + 40, left: reactionTarget.x - 30 }]}
            onPress={handleUnsend}
          >
            <Text style={styles.unsendText}>Unsend</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Media preview modal */}
      {pendingImage && (
        <MediaPreviewModal
          uri={pendingImage}
          onCancel={() => setPendingImage(null)}
          onSend={sendPendingImage}
          uploading={uploading}
        />
      )}
    </KeyboardAvoidingView>
  );
};

// ─── Conversation List ────────────────────────────────────────────────────────

// ─── Media Preview Modal ──────────────────────────────────────────────────────

const MediaPreviewModal: React.FC<{
  uri: string;
  onCancel: () => void;
  onSend: (caption: string) => void;
  uploading: boolean;
}> = ({ uri, onCancel, onSend, uploading }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const inputRef = useRef<TextInput>(null);

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#000' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={onCancel} style={{ padding: 6 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>Send Photo</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Image preview */}
        <Image
          source={{ uri }}
          style={{ flex: 1 }}
          resizeMode="contain"
        />

        {/* Caption + Send */}
        <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 12, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40 }}
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
          >
            <TextInput
              ref={inputRef}
              style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 }}
              placeholder="Add a caption…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (!uploading) onSend(caption); }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' }}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── User Story Modal ─────────────────────────────────────────────────────────

const UserStoryModal: React.FC<{
  userId: string;
  profile: any;
  currentUserId: string;
  onClose: () => void;
}> = ({ userId, profile, currentUserId, onClose }) => {
  const { colors } = useTheme();
  const [stories, setStories] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    getUserStories(userId)
      .then((data) => { setStories(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!stories.length) return;
    const story = stories[idx];
    if (story) markStoryViewed(story.id, currentUserId).catch(() => {});
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        if (idx < stories.length - 1) setIdx((i) => i + 1);
        else onClose();
      }
    });
    return () => animRef.current?.stop();
  }, [idx, stories.length]);

  if (loading) {
    return (
      <Modal visible animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
        </View>
      </Modal>
    );
  }

  if (!stories.length) {
    onClose();
    return null;
  }

  const story = stories[idx];

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Progress bars */}
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 52, paddingBottom: 8 }}>
          {stories.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 }}>
              {i < idx && <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 1 }} />}
              {i === idx && (
                <Animated.View style={{ width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), height: 2, backgroundColor: '#fff', borderRadius: 1 }} />
              )}
            </View>
          ))}
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          {profile?.avatar_url ? (
            <CachedImage uri={profile.avatar_url} style={{ width: 36, height: 36, borderRadius: 18 }} />
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={16} color="#fff" />
            </View>
          )}
          <View style={{ marginLeft: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{profile?.full_name || profile?.username}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{timeAgo(story.created_at)}</Text>
          </View>
        </View>

        {/* Media */}
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1 }}
          onPress={(e) => {
            const x = e.nativeEvent.locationX;
            const screenWidth = 400;
            if (x < screenWidth / 3) {
              setIdx((i) => Math.max(0, i - 1));
            } else {
              if (idx < stories.length - 1) setIdx((i) => i + 1);
              else onClose();
            }
          }}
        >
          {story.media_url ? (
            <Image source={{ uri: story.media_url }} style={{ flex: 1 }} resizeMode="contain" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 16 }}>{story.caption ?? ''}</Text>
            </View>
          )}
          {story.caption ? (
            <View style={{ position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 }}>
                {story.caption}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// ─── Chat Info View ───────────────────────────────────────────────────────────

const ChatInfoView: React.FC<{
  convId: string;
  profile: any;
  currentUserId: string;
  onBack: () => void;
  onViewStory?: () => void;
  hasStory?: boolean;
}> = ({ convId, profile, currentUserId, onBack, onViewStory, hasStory }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
  const [sharedMedia, setSharedMedia] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from('messages')
      .select('media_url, created_at')
      .eq('conversation_id', convId)
      .eq('type', 'image')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => setSharedMedia(data ?? []));
  }, [convId]);

  const handleBlock = () => {
    showPopup({
      title: `Block ${profile?.username ?? 'user'}?`,
      message: 'They won\'t be able to message you or see your content.',
      icon: 'ban-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(profile.id);
              onBack();
            } catch {
              showPopup({ title: 'Error', message: 'Could not block user.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
            }
          },
        },
      ],
    });
  };

  const handleClearChat = () => {
    showPopup({
      title: 'Clear Chat?',
      message: 'This only clears messages on your side.',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            // Soft-delete: mark messages as deleted for this user
            await supabase
              .from('conversation_participants')
              .update({ cleared_at: new Date().toISOString() })
              .eq('conversation_id', convId)
              .eq('user_id', currentUserId);
            onBack();
          },
        },
      ],
    });
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={onBack} style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>Chat Info</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile section */}
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          {profile?.avatar_url ? (
            <CachedImage uri={profile.avatar_url} style={{ width: 88, height: 88, borderRadius: 44 }} />
          ) : (
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={38} color={colors.textMuted} />
            </View>
          )}
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold', marginTop: 12 }}>
            {profile?.full_name || profile?.username}
          </Text>
          {profile?.username && (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 3 }}>@{profile.username}</Text>
          )}
          {profile?.bio ? (
            <Text style={{ color: colors.textSub, fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{profile.bio}</Text>
          ) : null}
          {profile?.university ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{profile.university}</Text>
          ) : null}
        </View>

        {/* Story button */}
        {hasStory && onViewStory && (
          <TouchableOpacity
            onPress={onViewStory}
            style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.bg2, borderRadius: 12, padding: 14, gap: 12 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="aperture-outline" size={20} color="#fff" />
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>View Status</Text>
          </TouchableOpacity>
        )}

        {/* Shared media */}
        {sharedMedia.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>SHARED MEDIA</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
              {sharedMedia.map((m, i) => (
                <CachedImage key={i} uri={m.media_url} style={{ width: 80, height: 80, borderRadius: 8 }} />
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={{ marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <TouchableOpacity
            onPress={handleBlock}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
          >
            <Ionicons name="ban-outline" size={20} color="#ef4444" />
            <Text style={{ color: '#ef4444', fontSize: 15 }}>Block {profile?.username ?? 'User'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClearChat}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 }}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={{ color: '#ef4444', fontSize: 15 }}>Clear Chat</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Conversation List ────────────────────────────────────────────────────────

interface ConversationListProps {
  currentUserId: string;
  currentUsername: string;
  onPress: (convId: string, otherProfile: any) => void;
  onCompose: () => void;
  storyUserIds: Set<string>;
  viewedUserIds: Set<string>;
  onAvatarPress: (userId: string, hasStory: boolean, profile: any) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  currentUserId,
  currentUsername,
  onPress,
  onCompose,
  storyUserIds,
  viewedUserIds,
  onAvatarPress,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState<any[]>([]);
  const [filteredConvs, setFilteredConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const data = await getConversations(currentUserId);
      setConvs(data);
      setFilteredConvs(data);
    } catch (e) {
      console.error('getConversations failed:', e);
      setLoadError(true);
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

      const otherUserId = other?.id;
      const hasStory = !isGroup && !!otherUserId && storyUserIds.has(otherUserId);
      const storyViewed = !isGroup && !!otherUserId && viewedUserIds.has(otherUserId);

      const unreadCount = c.unread_count ?? 0;

      return (
        <TouchableOpacity
          style={styles.convItem}
          onPress={() => onPress(conv.id, other ?? { full_name: conv.group_name, is_group: true })}
          activeOpacity={0.75}
        >
          <View style={styles.convAvatarWrap}>
            <StoryRingAvatar
              uri={other?.avatar_url}
              size={52}
              hasStory={hasStory}
              viewed={storyViewed}
              isGroup={isGroup}
              onPress={(!isGroup && otherUserId) ? () => onAvatarPress(otherUserId, hasStory, other) : undefined}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <Text
                style={[styles.convName, { color: colors.text, flex: 1 }, hasUnread && { fontWeight: 'bold' }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {!isGroup && other?.is_verified && (
                <VerifiedBadge type={other.verification_type} size="sm" />
              )}
            </View>
            {/* Last message preview with media type icons */}
            {(() => {
              const lastMsg = conv.last_message ?? '';
              const previewColor = hasUnread ? colors.text : colors.textSub;
              const previewWeight = hasUnread ? '500' : 'normal';
              if (lastMsg.startsWith('📷')) {
                const caption = lastMsg.slice(3).trim(); // remove '📷 '
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="image-outline" size={13} color={previewColor} />
                    <Text style={[styles.convPreview, { color: previewColor, fontWeight: previewWeight, flex: 1 }]} numberOfLines={1}>
                      {caption || 'Photo'}
                    </Text>
                  </View>
                );
              }
              if (lastMsg.startsWith('🎤')) {
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="mic-outline" size={13} color={previewColor} />
                    <Text style={[styles.convPreview, { color: previewColor, fontWeight: previewWeight }]}>Voice message</Text>
                  </View>
                );
              }
              if (lastMsg.startsWith('🎬') || lastMsg.startsWith('📹')) {
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="videocam-outline" size={13} color={previewColor} />
                    <Text style={[styles.convPreview, { color: previewColor, fontWeight: previewWeight }]}>Video</Text>
                  </View>
                );
              }
              return (
                <Text
                  style={[styles.convPreview, { color: previewColor, fontWeight: previewWeight }]}
                  numberOfLines={1}
                >
                  {lastMsg || 'Start a conversation'}
                </Text>
              );
            })()}
          </View>
          {/* Right column: time + unread badge */}
          <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 5, marginLeft: 8, minWidth: 40 }}>
            {conv.last_message_at && (
              <Text style={[styles.convTime, { color: hasUnread ? colors.accent : colors.textMuted }]}>
                {timeAgo(conv.last_message_at)}
              </Text>
            )}
            {hasUnread ? (
              <View style={styles.convUnreadPill}>
                <Text style={styles.convUnreadPillText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : (
              <View style={{ height: 18 }} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [currentUserId, onPress, storyUserIds, viewedUserIds, onAvatarPress],
  );

  const keyExtractor = useCallback((c: any) => c.conversations?.id ?? String(Math.random()), []);

  const activeNowData = useMemo(() => convs.slice(0, 10), [convs]);

  const ListHeader = useMemo(
    () => (
      <View style={styles.activeFriends}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACTIVE NOW</Text>
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
                    <CachedImage uri={other.avatar_url} style={styles.activeAvatar} />
                  ) : (
                    <View style={[styles.activeAvatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={18} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.onlineDot} />
                </View>
                <Text style={[styles.activeUsername, { color: colors.textSub }]} numberOfLines={1}>
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
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.text }]}>
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
          <Ionicons name="create-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1 }]}>
        <Ionicons name="search" size={15} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search messages"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <ConvSkeleton />
      ) : loadError ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textSub }]}>Couldn't load messages</Text>
          <TouchableOpacity style={styles.newMsgBtn} onPress={load}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.newMsgBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : convs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textSub }]}>No messages yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Tap the pencil icon above to start a conversation</Text>
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
                <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                <Text style={{ color: colors.textSub, marginTop: 10 }}>No conversations found</Text>
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

type ScreenState = 'list' | 'chat' | 'new' | 'info';

interface MessagesScreenProps {
  onChatStateChange?: (inChat: boolean) => void;
  initialConv?: { convId: string; otherProfile: any } | null;
  isVisible?: boolean;
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ onChatStateChange, initialConv, isVisible }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const [screenState, setScreenState] = useState<ScreenState>('list');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUsername, setCurrentUsername] = useState('Messages');
  const [activeConv, setActiveConv] = useState<{ convId: string; otherProfile: any } | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const incomingCallChannelRef = useRef<any>(null);

  // Story state
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [viewedUserIds, setViewedUserIds] = useState<Set<string>>(new Set());
  const [viewingStoryUser, setViewingStoryUser] = useState<{ userId: string; profile: any } | null>(null);
  const [viewingProfileUser, setViewingProfileUser] = useState<any | null>(null);
  const [viewingPicUser, setViewingPicUser] = useState<any | null>(null);

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

  // Fetch which users have active stories and which ones the current user has viewed
  useEffect(() => {
    if (!currentUserId) return;
    const { getActiveStories: fetchActive } = require('../services/stories');
    fetchActive().then((groups: any[]) => {
      setStoryUserIds(new Set(groups.map((g: any) => g.profile?.id).filter(Boolean)));
    }).catch(() => {});
    getViewedStoryIds(currentUserId).then((ids: string[]) => {
      // ids are story IDs; we map them to user IDs via separate lookup
      // Actually getViewedStoryIds returns story IDs, not user IDs
      // We need to track which users' stories the current user has viewed
      // Load story→user mapping to compute viewedUserIds
      if (ids.length === 0) return;
      supabase
        .from('stories')
        .select('id, user_id')
        .in('id', ids)
        .then(({ data }) => {
          if (data) {
            setViewedUserIds(new Set(data.map((s: any) => s.user_id)));
          }
        });
    }).catch(() => {});
  }, [currentUserId]);

  // Subscribe to incoming calls globally
  useEffect(() => {
    if (!currentUserId) return;
    const { subscribeToIncomingCalls } = require('../services/calls');
    incomingCallChannelRef.current = subscribeToIncomingCalls(
      currentUserId,
      (call: CallRecord) => setIncomingCall(call),
    );
    return () => incomingCallChannelRef.current?.unsubscribe();
  }, [currentUserId]);

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

  const handleAvatarPress = useCallback((userId: string, hasStory: boolean, profile: any) => {
    setViewingPicUser({ userId, hasStory, profile });
  }, []);

  const openChatInfo = useCallback(() => setScreenState('info'), []);
  const closeChatInfo = useCallback(() => setScreenState('chat'), []);

  if (!currentUserId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ConvSkeleton />
      </View>
    );
  }

  if (incomingCall) {
    return (
      <CallScreen
        call={incomingCall}
        currentUserId={currentUserId}
        isIncoming={true}
        onCallEnd={() => setIncomingCall(null)}
      />
    );
  }

  const inChat = screenState === 'chat' || screenState === 'info';
  const otherProfile = activeConv?.otherProfile;
  const otherUserId = otherProfile?.id;
  const hasStory = !!otherUserId && storyUserIds.has(otherUserId);

  return (
    <>
      {/* ConversationList stays mounted at all times — hidden when in chat to prevent reload */}
      <View style={{ flex: 1, display: inChat ? 'none' : 'flex' }}>
        <ConversationList
          currentUserId={currentUserId}
          currentUsername={currentUsername}
          onPress={openChat}
          onCompose={openCompose}
          storyUserIds={storyUserIds}
          viewedUserIds={viewedUserIds}
          onAvatarPress={handleAvatarPress}
        />
      </View>

      {/* Chat view */}
      {screenState === 'chat' && activeConv && (
        <ChatView
          convData={activeConv}
          currentUserId={currentUserId}
          onBack={closeChat}
          storyUserIds={storyUserIds}
          viewedUserIds={viewedUserIds}
          onAvatarPress={handleAvatarPress}
          onHeaderPress={openChatInfo}
        />
      )}

      {/* Chat info view */}
      {screenState === 'info' && activeConv && (
        <ChatInfoView
          convId={activeConv.convId}
          profile={otherProfile}
          currentUserId={currentUserId}
          onBack={closeChatInfo}
          hasStory={hasStory}
          onViewStory={hasStory ? () => {
            setViewingStoryUser({ userId: otherUserId!, profile: otherProfile });
            closeChatInfo();
          } : undefined}
        />
      )}

      {/* Overlays */}
      <NewConvModal
        visible={screenState === 'new'}
        currentUserId={currentUserId}
        onClose={closeCompose}
        onOpen={(convId, profile) => {
          closeCompose();
          openChat(convId, profile);
        }}
      />
      {viewingStoryUser && (
        <UserStoryModal
          userId={viewingStoryUser.userId}
          profile={viewingStoryUser.profile}
          currentUserId={currentUserId}
          onClose={() => setViewingStoryUser(null)}
        />
      )}

      {/* Profile picture IG-style viewer */}
      <ProfilePicViewer
        visible={!!viewingPicUser}
        uri={viewingPicUser?.profile?.avatar_url}
        username={viewingPicUser?.profile?.username}
        onClose={() => setViewingPicUser(null)}
        onViewProfile={() => {
          const p = viewingPicUser?.profile;
          setViewingPicUser(null);
          if (p) setViewingProfileUser(p);
        }}
        onViewStatus={viewingPicUser?.hasStory ? () => {
          const { userId, profile } = viewingPicUser;
          setViewingPicUser(null);
          setViewingStoryUser({ userId, profile });
        } : undefined}
      />

      {/* Profile overlay — slides in over the current screen */}
      {viewingProfileUser && (
        <Modal visible animationType="slide" onRequestClose={() => setViewingProfileUser(null)}>
          <ProfileScreen
            userId={viewingProfileUser.id}
            isOwn={viewingProfileUser.id === currentUserId}
            isVisible={true}
            onBack={() => setViewingProfileUser(null)}
            onMessagePress={() => setViewingProfileUser(null)}
            onVerifyPress={() => {}}
            onShowPrivacy={() => {}}
            onShowTerms={() => {}}
            onShowGuidelines={() => {}}
          />
        </Modal>
      )}
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Conversation list ─────────────────────────────────────────────────────
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  listTitle: { fontSize: 20, fontWeight: 'bold' },
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
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
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
  convUnreadPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  convUnreadPillText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  convName: { fontSize: 14, fontWeight: '500' },
  convTime: { fontSize: 10, flexShrink: 0, marginLeft: 6 },
  convPreview: { fontSize: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -80 },
  emptyTitle: { marginTop: 14, fontSize: 15, fontWeight: '600' },
  emptySubtitle: {
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
    borderColor: '#000', // Still fine as it's a small dot border, but could use colors.bg
  },
  chatName: { fontSize: 14, fontWeight: 'bold' },
  chatStatus: { fontSize: 11 },
  chatAction: { padding: 8 },
  chatIntroName: { fontSize: 16, fontWeight: 'bold', marginTop: 10 },

  // ── Message bubbles ───────────────────────────────────────────────────────
  dayDivider: { alignItems: 'center', marginVertical: 14 },
  dayLabel: {
    fontSize: 11,
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
    backgroundColor: 'transparent',
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
  input: { flex: 1, fontSize: 14, maxHeight: 100, paddingVertical: 0 },
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
  newConvModal: { flex: 1 },
  newConvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  newConvTitle: { fontSize: 16, fontWeight: 'bold' },
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
  newGroupLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  newConvSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  newConvInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userResultAvatar: { width: 46, height: 46, borderRadius: 23 },
  userResultName: { fontSize: 14, fontWeight: '600' },
  userResultUsername: { fontSize: 12, marginTop: 1 },
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
    textTransform: 'uppercase',
  },
  groupNameInput: {
    borderRadius: 12,
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  createGroupBtn: {
    marginTop: 32,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createGroupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Advanced Messaging Styles ─────────────────────────────────────────────
  bubbleDeleted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed' as any,
  },
  bubbleTextDeleted: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  replyQuote: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 2,
    maxWidth: '80%',
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  replyQuoteName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyQuoteText: {
    fontSize: 11,
    opacity: 0.75,
  },
  shareBubble: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 240,
  },
  sharePreviewImg: {
    width: '100%',
    height: 140,
  },
  shareLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  shareCaption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 20,
    gap: 10,
    minWidth: 180,
  },
  voiceBubbleMe: {
    backgroundColor: '#4f46e5',
  },
  voiceBubbleThem: {
    // backgroundColor handled inline
  },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
  },
  voiceDuration: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.8,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyHeaderBar: {
    width: 2,
    height: '100%',
    backgroundColor: '#4f46e5',
    borderRadius: 1,
  },
  replyHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  replyHeaderText: {
    fontSize: 12,
    marginTop: 1,
  },
  voiceRecordBtn: {
    padding: 6,
  },
  voiceRecordIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordIconActive: {
    backgroundColor: '#ef4444',
  },
  voiceRecordingLabel: {
    position: 'absolute',
    top: -40,
    right: 0,
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  voiceRecordingTime: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inputRowContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  unsendBtn: {
    position: 'absolute',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 1000,
  },
  unsendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  voiceRecorderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingWaveContainer: {
    position: 'absolute',
    left: -180,
    right: 40,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    zIndex: -1,
  },
  waveRows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
  },
  emojiBoard: {
    height: 250,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emojiItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
});
