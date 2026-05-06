import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
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

// ─── StoryRingAvatar ──────────────────────────────────────────────────────────

const StoryRingAvatar: React.FC<{
  uri?: string;
  size?: number;
  hasStory?: boolean;
  viewed?: boolean;
  isOnline?: boolean;
  onPress?: () => void;
}> = ({ uri, size = 52, hasStory, viewed, isOnline, onPress }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.8} style={{ position: 'relative' }}>
      <View style={{
        width: size + 8, height: size + 8, borderRadius: (size + 8) / 2,
        padding: 3,
        borderWidth: hasStory ? 2.5 : 0,
        borderColor: viewed ? 'rgba(255,255,255,0.1)' : '#818cf8',
        justifyContent: 'center', alignItems: 'center'
      }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={size * 0.6} color={colors.textMuted} />
          </View>
        )}
      </View>
      {isOnline && (
        <View style={{
          position: 'absolute', bottom: 4, right: 4,
          width: size * 0.25, height: size * 0.25, borderRadius: size * 0.125,
          backgroundColor: '#22c55e', borderWidth: 2.5, borderColor: colors.bg
        }} />
      )}
    </TouchableOpacity>
  );
};

// ─── Voice Recorder Component ─────────────────────────────────────────────────

const VoiceRecorder: React.FC<{
  onRecordComplete: (uri: string, duration: number) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}> = ({ onRecordComplete, onRecordingChange }) => {
  const { colors } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const start = async () => {
    try {
      const { status } = await AudioModule.requestRecordingPermissionsAsync();
      if (status !== 'granted') return;
      setIsRecording(true);
      onRecordingChange?.(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) { console.error('Voice record start failed', e); }
  };

  const stop = async () => {
    try {
      await recorder.stop();
      setIsRecording(false);
      onRecordingChange?.(false);
      const uri = recorder.uri;
      const duration = 0; // Simplified duration tracking
      if (uri) onRecordComplete(uri, duration);
    } catch (e) { console.error('Voice record stop failed', e); }
  };

  return (
    <TouchableOpacity
      onPressIn={start}
      onPressOut={stop}
      style={{ padding: 10, backgroundColor: isRecording ? '#ef4444' : 'transparent', borderRadius: 25 }}
    >
      <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={24} color={isRecording ? '#fff' : colors.textMuted} />
    </TouchableOpacity>
  );
};

// ─── Voice Player Component ───────────────────────────────────────────────────

const VoicePlayer: React.FC<{ uri: string; duration?: number }> = ({ uri, duration }) => {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const player = useAudioPlayer(uri);

  const toggle = () => {
    if (playing) player.pause();
    else player.play();
    setPlaying(!playing);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <TouchableOpacity onPress={toggle}>
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 }}>
        <View style={{ width: '40%', height: 2, backgroundColor: '#fff', borderRadius: 1 }} />
      </View>
      <Text style={{ color: '#fff', fontSize: 11 }}>{duration ? `${Math.floor(duration)}s` : '0:00'}</Text>
    </View>
  );
};

// ─── Message Bubble Component ─────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: any;
  isMe: boolean;
  prevMsg?: any;
  nextMsg?: any;
  currentUserId: string;
  onLongPress: (msg: any, x: number, y: number) => void;
  onReactionTap: (msg: any, emoji: string) => void;
  onSwipeReply: (msg: any) => void;
  isGroup?: boolean;
}> = ({ msg, isMe, prevMsg, nextMsg, currentUserId, onLongPress, onReactionTap, onSwipeReply, isGroup }) => {
  const { colors } = useTheme();
  const isContinuous = prevMsg && prevMsg.sender_id === msg.sender_id && (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < GROUP_THRESHOLD_MS);
  const showTime = !nextMsg || nextMsg.sender_id !== msg.sender_id || (new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime() > GROUP_THRESHOLD_MS);

  if (msg.is_deleted) return <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}><Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>Message unsent</Text></View>;

  return (
    <View style={[styles.bubbleContainer, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }, isContinuous && { marginTop: 2 }]}>
      {!isMe && isGroup && !isContinuous && <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 12, marginBottom: 2 }}>{msg.sender_profile?.username}</Text>}
      <TouchableOpacity onLongPress={(e) => onLongPress(msg, e.nativeEvent.pageX, e.nativeEvent.pageY)} activeOpacity={0.9} style={[styles.bubble, isMe ? [styles.bubbleMe, { backgroundColor: colors.accent }] : [styles.bubbleThem, { backgroundColor: colors.bg2 }] ]}>
        {msg.reply_to_msg && <View style={{ borderLeftWidth: 2, borderLeftColor: isMe ? 'rgba(255,255,255,0.4)' : colors.accent, paddingLeft: 8, marginBottom: 6, opacity: 0.8 }}><Text style={{ fontSize: 11, color: isMe ? '#fff' : colors.textMuted }} numberOfLines={1}>{msg.reply_to_msg.text || 'Photo'}</Text></View>}
        {msg.type === 'image' && <CachedImage uri={msg.media_url} style={styles.bubbleImg} resizeMode="cover" />}
        {msg.type === 'voice' && <VoicePlayer uri={msg.media_url} duration={msg.metadata?.duration} />}
        {msg.text && <Text style={[styles.bubbleText, { color: isMe ? '#fff' : colors.text }]}>{msg.text}</Text>}
        {msg.reactions && msg.reactions.length > 0 && (
          <View style={styles.reactionRow}>
            {msg.reactions.map((r: any) => (
              <TouchableOpacity key={`${msg.id}-${r.emoji}`} onPress={() => onReactionTap(msg, r.emoji)} style={styles.reactionBadge}>
                <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
      {showTime && <Text style={styles.bubbleTime}>{fmtTime(msg.created_at)}</Text>}
    </View>
  );
};

// ─── Chat View Component ──────────────────────────────────────────────────────

const ChatView: React.FC<{
  convId: string;
  otherProfile: any;
  currentUserId: string;
  onBack: () => void;
  onAvatarPress?: (uid: string, hasStory: boolean, profile: any) => void;
  storyUserIds?: Set<string>;
  viewedUserIds?: Set<string>;
  onlineUserIds?: Set<string>;
}> = ({ convId, otherProfile, currentUserId, onBack, onAvatarPress, storyUserIds, viewedUserIds, onlineUserIds }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isOtherRecording, setIsOtherRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [reactionTarget, setReactionTarget] = useState<{ msg: any, x: number, y: number } | null>(null);
  const [pinnedMsg, setPinnedMsg] = useState<any>(null);
  const [callVisible, setCallVisible] = useState(false);
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const flatRef = useRef<FlatList>(null);
  const profile = otherProfile?.is_group ? null : otherProfile;

  useEffect(() => {
    setLoading(true);
    getMessages(convId, 60).then(data => { setMessages(data.reverse()); setLoading(false); markMessagesRead(convId, currentUserId); });
    const sub = subscribeToMessages(
      convId,
      (nm) => {
        if (nm.sender_id !== currentUserId) {
          setMessages(p => [nm, ...p]);
          markMessagesRead(convId, currentUserId);
        }
      },
      (um) => {
        setMessages(p => p.map(m => m.id === um.id ? um : m));
      }
    );
    const typingChannel = supabase.channel(`typing-${convId}`).on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.userId !== currentUserId) setIsOtherTyping(payload.typing); }).on('broadcast', { event: 'recording' }, ({ payload }) => { if (payload.userId !== currentUserId) setIsOtherRecording(payload.recording); }).subscribe();
    return () => { sub.unsubscribe(); supabase.removeChannel(typingChannel); };
  }, [convId]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const t = text.trim(); setText(''); setReplyingTo(null);
    const tempId = 'temp-' + Date.now();
    const nm = { id: tempId, text: t, sender_id: currentUserId, created_at: new Date().toISOString(), type: 'text', reply_to: replyingTo?.id, reply_to_msg: replyingTo };
    setMessages(p => [nm, ...p]);
    try { await sendMessage(convId, currentUserId, t, replyingTo?.id); } catch { setMessages(p => p.filter(m => m.id !== tempId)); }
  };

  const handleAttachment = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled) {
      const uri = res.assets[0].uri;
      const nm = { id: 'temp-'+Date.now(), type: 'image', media_url: uri, sender_id: currentUserId, created_at: new Date().toISOString() };
      setMessages(p => [nm, ...p]);
      await sendImageMessage(convId, currentUserId, uri);
    }
  };

  const handleRecordingStatus = (recording: boolean) => {
    supabase.channel(`typing-${convId}`).send({ type: 'broadcast', event: 'recording', payload: { userId: currentUserId, recording } });
  };

  const startCall = async (type: CallType) => {
    if (otherProfile.is_group) return;
    try { 
      const offer = { type: 'offer', sdp: '' } as RTCSessionDescriptionInit;
      const call = await initiateCall(currentUserId, otherProfile.id, convId, type, offer); 
      setActiveCall(call); 
      setCallVisible(true); 
    } catch (e: any) { Alert.alert('Call Failed', e.message); }
  };

  const onHeaderPress = () => { if (!otherProfile.is_group) showPopup({ title: otherProfile.username, message: 'View profile or manage chat', buttons: [{ text: 'View Profile', onPress: () => onAvatarPress?.(otherProfile.id, false, otherProfile) }, { text: 'Block User', style: 'destructive', onPress: () => blockUser(otherProfile.id) }, { text: 'Close', style: 'cancel', onPress: () => {} }] }); };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <View style={[styles.chatHeader, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}><TouchableOpacity onPress={onBack} style={styles.chatBack}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity><View style={styles.chatHeaderUser}><StoryRingAvatar uri={profile?.avatar_url} size={36} hasStory={!!profile?.id && !!storyUserIds?.has?.(profile.id)} viewed={!!profile?.id && !!viewedUserIds?.has?.(profile.id)} isOnline={!!profile?.id && !!onlineUserIds?.has?.(profile.id)} onPress={(!otherProfile?.is_group && profile?.id) ? () => onAvatarPress?.(profile.id, !!storyUserIds?.has?.(profile.id), profile) : undefined} /><TouchableOpacity style={{ marginLeft: 10, flex: 1 }} onPress={onHeaderPress}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>{profile?.full_name || profile?.username || 'Chat'}</Text>{profile?.is_verified && <VerifiedBadge type={profile.verification_type} size="sm" />}</View><Text style={[styles.chatStatus, { color: (isOtherTyping || isOtherRecording || onlineUserIds?.has?.(profile?.id)) ? colors.accent : colors.textMuted }]}>{isOtherRecording ? 'recording…' : isOtherTyping ? 'typing…' : onlineUserIds?.has?.(profile?.id) ? 'Active now' : 'Active status unknown'}</Text></TouchableOpacity></View><View style={{ flexDirection: 'row' }}><TouchableOpacity style={styles.chatAction} onPress={() => startCall('audio')}><Ionicons name="call-outline" size={21} color={colors.textMuted} /></TouchableOpacity><TouchableOpacity style={styles.chatAction} onPress={() => startCall('video')}><Ionicons name="videocam-outline" size={21} color={colors.textMuted} /></TouchableOpacity></View></View>
      {pinnedMsg && <TouchableOpacity style={[styles.pinnedBanner, { backgroundColor: colors.bg2, borderBottomColor: colors.border }]} onPress={() => { const idx = messages.findIndex(m => m.id === pinnedMsg.id); if (idx !== -1) flatRef.current?.scrollToIndex({ index: idx, animated: true }); }}><Ionicons name="pin" size={14} color={colors.accent} /><View style={{ flex: 1 }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>PINNED</Text><Text style={[styles.pinnedText, { color: colors.text }]} numberOfLines={1}>{pinnedMsg.text || 'Photo'}</Text></View><TouchableOpacity onPress={() => pinMessage(convId, null).then(() => setPinnedMsg(null))}><Ionicons name="close" size={18} color={colors.textMuted} /></TouchableOpacity></TouchableOpacity>}
      {loading ? <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View> : <FlatList ref={flatRef} data={messages} keyExtractor={m => m.id} renderItem={({ item, index }) => <MessageBubble msg={item} isMe={item.sender_id === currentUserId} prevMsg={messages[index-1]} nextMsg={messages[index+1]} currentUserId={currentUserId} onLongPress={(m, x, y) => setReactionTarget({ msg: m, x, y })} onReactionTap={(m, e) => addReaction(m.id, currentUserId, e)} onSwipeReply={setReplyingTo} isGroup={otherProfile?.is_group} />} onContentSizeChange={() => flatRef.current?.scrollToEnd()} contentContainerStyle={{ padding: 12 }} />}
      <View style={[styles.inputRowContainer, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.bg }]}><View style={styles.inputRow}><TouchableOpacity onPress={() => setShowEmojiPicker(!showEmojiPicker)}><Ionicons name="happy-outline" size={24} color={colors.textMuted} /></TouchableOpacity><View style={[styles.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.border }]}><TextInput style={[styles.input, { color: colors.text }]} value={text} onChangeText={(v) => { setText(v); supabase.channel(`typing-${convId}`).send({ type: 'broadcast', event: 'typing', payload: { userId: currentUserId, typing: v.length > 0 } }); }} placeholder="Message…" multiline /><TouchableOpacity onPress={handleAttachment}><Ionicons name="attach-outline" size={22} color={colors.textMuted} /></TouchableOpacity></View>{text.trim() ? <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, styles.sendBtnActive]}><Ionicons name="send" size={17} color="#fff" /></TouchableOpacity> : <VoiceRecorder onRecordComplete={(u, d) => sendVoiceMessage(convId, currentUserId, u, d)} onRecordingChange={handleRecordingStatus} />}</View></View>
      {showEmojiPicker && <View style={{ height: 300 }}><EmojiKeyboard onEmojiSelected={e => { setText(p => p + e.emoji); }} theme={{ container: colors.bg, header: colors.text }} /></View>}
      {reactionTarget && <View style={StyleSheet.absoluteFill} pointerEvents="box-none"><TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setReactionTarget(null)} /><View style={[styles.msgActionBar, { top: reactionTarget.y + 40, [reactionTarget.msg.sender_id === currentUserId ? 'right' : 'left']: 20 }]}><TouchableOpacity style={styles.msgActionBtn} onPress={() => { setReplyingTo(reactionTarget.msg); setReactionTarget(null); }}><Ionicons name="return-down-back" size={16} color="#fff" /><Text style={styles.msgActionText}>Reply</Text></TouchableOpacity>{reactionTarget.msg.sender_id === currentUserId && <TouchableOpacity style={styles.msgActionBtn} onPress={() => { unsendMessage(reactionTarget.msg.id, currentUserId); setMessages(p => p.map(m => m.id === reactionTarget.msg.id ? { ...m, is_deleted: true } : m)); setReactionTarget(null); }}><Ionicons name="arrow-undo" size={16} color="#fff" /><Text style={styles.msgActionText}>Unsend</Text></TouchableOpacity>}<TouchableOpacity style={[styles.msgActionBtn, styles.msgActionDanger]} onPress={() => { deleteMessageForMe(reactionTarget.msg.id, currentUserId); setMessages(p => p.filter(m => m.id !== reactionTarget.msg.id)); setReactionTarget(null); }}><Ionicons name="trash" size={16} color="#ef4444" /><Text style={[styles.msgActionText, { color: '#ef4444' }]}>Delete</Text></TouchableOpacity></View></View>}
    </KeyboardAvoidingView>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ScreenState = 'list' | 'chat' | 'new' | 'info' | 'archived';
interface MessagesScreenProps { onChatStateChange?: (inChat: boolean) => void; initialConv?: { convId: string; otherProfile: any } | null; isVisible?: boolean; }

export const MessagesScreen = memo<MessagesScreenProps>(({ onChatStateChange, initialConv, isVisible }) => {
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
        const ids = new Set<string>(); for (const key in state) ids.add(key); setOnlineUserIds(ids);
      }).subscribe(async (status) => { if (status === 'SUBSCRIBED') await presenceChannelRef.current?.track({ online_at: new Date().toISOString() }); });
      getActiveStories().then(groups => { const has = new Set<string>(); const viewed = new Set<string>(); groups.forEach(g => { has.add(g.profile.id); if (g.stories.every((s: any) => s.viewed)) viewed.add(g.profile.id); }); setStoryUserIds(has); setViewedUserIds(viewed); });
    });
    return () => { presenceChannelRef.current?.unsubscribe(); };
  }, []);

  useEffect(() => { if (initialConv) { setActiveConv(initialConv); setScreenState('chat'); onChatStateChange?.(true); } }, [initialConv]);
  const [conversations, setConversations] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const loadConversations = useCallback(async () => { if (!currentUserId) return; setLoading(true); const data = await getConversations(currentUserId); setConversations(data); setLoading(false); }, [currentUserId]);
  useEffect(() => { loadConversations(); const sub = subscribeToConversationList(currentUserId, loadConversations); return () => { sub.unsubscribe(); }; }, [currentUserId, loadConversations]);

  const onConvPress = (conv: any) => { setActiveConv({ convId: conv.id, otherProfile: conv.other_profile }); setScreenState('chat'); onChatStateChange?.(true); };
  const onBack = () => { if (screenState === 'chat') { setScreenState('list'); onChatStateChange?.(false); setActiveConv(null); } else { setScreenState('list'); } };

  if (screenState === 'chat' && activeConv) return <ChatView convId={activeConv.convId} otherProfile={activeConv.otherProfile} currentUserId={currentUserId} onBack={onBack} onlineUserIds={onlineUserIds} storyUserIds={storyUserIds} viewedUserIds={viewedUserIds} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: useSafeAreaInsets().top + 10 }]}><Text style={[styles.headerTitle, { color: colors.text }]}>{currentUsername}</Text><TouchableOpacity onPress={() => setScreenState('new')}><Ionicons name="create-outline" size={26} color={colors.text} /></TouchableOpacity></View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={loadConversations} tintColor={colors.accent} />} contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? <ConvSkeleton /> : conversations.length === 0 ? <View style={{ alignItems: 'center', marginTop: 100 }}><Ionicons name="chatbubbles-outline" size={60} color={colors.textMuted} /><Text style={{ color: colors.textMuted, marginTop: 10 }}>No messages yet</Text></View> : conversations.map(c => (
          <TouchableOpacity key={c.id} onPress={() => onConvPress(c)} style={styles.convItem}>
            <StoryRingAvatar uri={c.other_profile?.avatar_url} hasStory={storyUserIds.has(c.other_profile?.id)} viewed={viewedUserIds.has(c.other_profile?.id)} isOnline={onlineUserIds.has(c.other_profile?.id)} size={52} />
            <View style={styles.convInfo}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[styles.convName, { color: colors.text }]}>{c.other_profile?.username || 'User'}</Text><Text style={styles.convTime}>{timeAgo(c.last_message_at)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[styles.convPreview, { color: c.unread_count > 0 ? colors.text : colors.textMuted }]} numberOfLines={1}>{c.last_message_text || 'Sent an attachment'}</Text>{c.unread_count > 0 && <View style={[styles.badge, { backgroundColor: colors.accent }]}><Text style={styles.badgeText}>{c.unread_count}</Text></View>}</View></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  convItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  convAvatarWrap: { position: 'relative' },
  convInfo: { flex: 1, marginLeft: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 12 },
  convName: { fontSize: 15, fontWeight: '700' },
  convTime: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  convPreview: { fontSize: 13, marginTop: 2 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 0.5 },
  chatBack: { padding: 8 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatName: { fontSize: 15, fontWeight: '700' },
  chatStatus: { fontSize: 11, marginTop: 1 },
  chatAction: { padding: 10 },
  bubbleContainer: { marginBottom: 4, maxWidth: '85%' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, marginHorizontal: 4 },
  bubbleImg: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  inputRowContainer: { borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, minHeight: 40 },
  input: { flex: 1, fontSize: 15, paddingVertical: 8, maxHeight: 100 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: '#818cf8' },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10, borderBottomWidth: 0.5 },
  pinnedText: { fontSize: 13, fontWeight: '500' },
  reactionRow: { flexDirection: 'row', marginTop: 4, gap: 4 },
  reactionBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  msgActionBar: { position: 'absolute', backgroundColor: '#222', borderRadius: 12, padding: 6, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 },
  msgActionBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  msgActionText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  msgActionDanger: { opacity: 0.8 },
  onlineDot: { position: 'absolute', backgroundColor: '#22c55e', borderWidth: 2 },
});
