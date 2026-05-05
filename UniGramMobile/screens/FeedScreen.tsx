import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert, Share,
  TouchableWithoutFeedback, ActivityIndicator, DeviceEventEmitter,
  TextInput, InteractionManager, AppState,
  Platform, KeyboardAvoidingView, Linking,
} from 'react-native';
import { 
  Gesture, 
  GestureDetector, 
  GestureHandlerRootView 
} from 'react-native-gesture-handler';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS 
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { ShareSheet } from '../components/ShareSheet';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds, getRepostedPostIds, repostPost, unrepostPost, quotePost, enrichWithOriginalPosts, deletePost, reportContent, getPostLikers } from '../services/posts';
import { UsersListSheet } from '../components/UsersListSheet';
import { PostDetailModal } from '../components/PostDetailModal';
import { PostOptionsSheet } from '../components/PostOptionsSheet';
import { QuotePostCard } from '../components/QuotePostCard';
import { RepostSheet } from '../components/RepostSheet';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory, createStoryFromPost, getStoryStats, likeStory, unlikeStory, getStoryViewers, deleteStory } from '../services/stories';
import { createDirectConversation, sendMessage as sendDM } from '../services/messages';
import { sendPushToUser } from '../services/pushNotifications';
import { getPersonalizedFeed, recordImpression, recordShare, getFollowSuggestions, getPersonalizedReels, recordContentFeedback } from '../services/algorithm';
import { sendFollowSuggestionNotif } from '../services/notifications';
import { getReels } from '../services/reels';
import { followUser, unfollowUser, blockUser } from '../services/profiles';
import { createReport } from '../services/reports';
import { AIContextCard, type AIContextResult } from '../components/AIContextCard';
import { getPostAIContext } from '../services/aiEngine';
import { CampusPulse } from '../components/CampusPulse';
import { CommunityPulse } from '../components/CommunityPulse';
import { DiscoveryBanner } from '../components/DiscoveryBanner';
import { CampusEventCard } from '../components/CampusEventCard';
import { getCampusEvents, getUserFollowCount, type CampusEvent } from '../services/campusContent';
import { enqueueInteraction, flushInteractions } from '../hooks/usePostTracker';
import { processUnprocessedInteractions } from '../services/preferences';
import { supabase } from '../lib/supabase';
import { isProActive } from '../services/pro';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { useTheme } from '../context/ThemeContext';
import { LiveScreen } from './LiveScreen';
import { TrendingScreen } from './TrendingScreen';
import { PopupButton } from '../components/PremiumPopup';
import { FeedPost, ReelPreview, timeAgo, fmtCount, type PostProfile, type Post, type FeedPostProps } from '../components/FeedPost';

const { width, height: screenHeight } = Dimensions.get('window');

let cachedFeedPosts: any[] = [];
let cachedStoryGroups: any[] = [];
let cachedLikedIds: Set<string> | null = null;
let cachedSavedIds: Set<string> | null = null;
let cachedRepostedIds: Set<string> | null = null;
let cachedCurrentProfile: any = null;

function clearFeedCache() {
  cachedFeedPosts = [];
  cachedStoryGroups = [];
  cachedLikedIds = null;
  cachedSavedIds = null;
  cachedRepostedIds = null;
  cachedCurrentProfile = null;
}

// ─── Live Story Bubble (animated) ─────────────────────────────────────────────
const LiveStoryBubble: React.FC<{ ls: any; onPress: () => void }> = ({ ls, onPress }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 850, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 850, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 850, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <TouchableOpacity style={styles.storyItem} onPress={onPress} activeOpacity={0.8}>
      <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulsing outer ring */}
        <Animated.View style={{
          position: 'absolute', width: 72, height: 72, borderRadius: 36,
          borderWidth: 2.5, borderColor: '#ff3b30',
          transform: [{ scale: pulseAnim }], opacity: pulseOpacity,
        }} />
        {/* Static inner ring */}
        <View style={{ width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: '#ff3b30', alignItems: 'center', justifyContent: 'center' }}>
          <View style={styles.storyAvatarClip}>
            {ls.profiles?.avatar_url
              ? <Image source={{ uri: ls.profiles.avatar_url }} style={styles.storyAvatar} />
              : <View style={[styles.storyAvatar, { backgroundColor: '#2a0a0a', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={22} color="#ff3b30" />
                </View>
            }
          </View>
        </View>
        {/* LIVE badge */}
        <View style={{
          position: 'absolute', bottom: 1, alignSelf: 'center',
          backgroundColor: '#ff3b30', borderRadius: 4,
          paddingHorizontal: 5, paddingVertical: 1.5,
          borderWidth: 1.5, borderColor: '#000',
        }}>
          <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 }}>LIVE</Text>
        </View>
      </View>
      <Text style={[styles.storyUsername, { color: '#ff453a', fontWeight: '700' }]} numberOfLines={1}>
        {ls.profiles?.username ?? 'user'}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Story Bar ────────────────────────────────────────────────────────────────
const StoryBarInternal: React.FC<{
  storyGroups: any[];
  liveSessions: any[];
  currentProfile: any;
  viewedIds: string[];
  onStoryPress: (idx: number) => void;
  onLivePress: (sessionId: string) => void;
  onYourStoryPress: () => void;
  hasOwnStories: boolean;
  ownGroupIdx: number;
}> = ({ storyGroups, liveSessions, currentProfile, viewedIds, onStoryPress, onLivePress, onYourStoryPress, hasOwnStories, ownGroupIdx }) => {
  const { colors } = useTheme();
  const ownGroup = ownGroupIdx !== -1 ? storyGroups[ownGroupIdx] : null;
  const filteredGroups = storyGroups.filter((_, idx) => idx !== ownGroupIdx);
  const thumbUri = hasOwnStories ? ownGroup.stories[0].media_url : currentProfile?.avatar_url;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      onScrollBeginDrag={() => DeviceEventEmitter.emit('setPagerScroll', false)}
      onScrollEndDrag={() => DeviceEventEmitter.emit('setPagerScroll', true)}
      onMomentumScrollEnd={() => DeviceEventEmitter.emit('setPagerScroll', true)}
    >
      {/* Live Sessions — animated bubbles, appear before "Your Story" */}
      {liveSessions.map((ls) => (
        <LiveStoryBubble key={ls.id} ls={ls} onPress={() => onLivePress(ls.id)} />
      ))}
      
      <TouchableOpacity 
        style={styles.storyItem} 
        onPress={() => hasOwnStories ? onStoryPress(ownGroupIdx) : onYourStoryPress()}
      >
        <View style={[styles.storyRing, hasOwnStories && styles.storyRingOwnActive]}>
          <View style={styles.storyAvatarClip}>
            {thumbUri
              ? <Image source={{ uri: thumbUri }} style={styles.storyAvatar} />
              : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={22} color="#555" />
                </View>}
          </View>
          <TouchableOpacity 
            style={styles.storyPlusOverlay} 
            onPress={(e) => { e.stopPropagation(); onYourStoryPress(); }}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.storyUsername, { color: colors.textSub }]} numberOfLines={1}>Your Story</Text>
      </TouchableOpacity>

      {filteredGroups.map((group, i) => {
        const globalIdx = storyGroups.indexOf(group);
        const allViewed = group.stories.every((s: any) => viewedIds.includes(s.id));
        return (
          <TouchableOpacity key={group.profile.id} style={styles.storyItem} onPress={() => onStoryPress(globalIdx)}>
            <View style={[styles.storyRing, allViewed && styles.storyRingViewed]}>
              <View style={styles.storyAvatarClip}>
                {group.profile.avatar_url
                  ? <CachedImage uri={group.profile.avatar_url} style={styles.storyAvatar} />
                  : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={22} color="#555" />
                    </View>}
              </View>
            </View>
            <Text style={[styles.storyUsername, { color: allViewed ? colors.textMuted : colors.textSub }]} numberOfLines={1}>
              {group.profile.username}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const StoryBar = React.memo(StoryBarInternal);

// ─── Viewers Sheet ────────────────────────────────────────────────────────────
const ViewersSheet: React.FC<{
  visible: boolean;
  storyId: string;
  onClose: () => void;
}> = ({ visible, storyId, onClose }) => {
  const [viewers, setViewers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && storyId) {
      setLoading(true);
      getStoryViewers(storyId).then(data => {
        setViewers(data);
        setLoading(false);
      }).catch(err => {
        console.error('Error fetching viewers', err);
        setLoading(false);
      });
    }
  }, [visible, storyId]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
       <TouchableWithoutFeedback onPress={onClose}>
        <View style={vv.overlay} />
      </TouchableWithoutFeedback>
      <View style={vv.container}>
        <View style={vv.header}>
          <View style={vv.handle} />
          <Text style={vv.title}>Viewers</Text>
        </View>
        <ScrollView style={vv.scroll}>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
          ) : viewers.length === 0 ? (
            <View style={vv.empty}>
              <Text style={vv.emptyText}>No views yet</Text>
            </View>
          ) : (
            viewers.map((v, i) => (
              <View key={i} style={vv.item}>
                {v.avatar_url ? (
                  <Image source={{ uri: v.avatar_url }} style={vv.avatar} />
                ) : (
                  <View style={[vv.avatar, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={20} color="#555" />
                  </View>
                )}
                <View style={vv.info}>
                  <Text style={vv.username}>{v.username}</Text>
                  <Text style={vv.time}>{timeAgo(v.viewed_at)}</Text>
                </View>
                {v.reaction && (
                  <View style={vv.reactionBadge}>
                    <Text style={vv.reactionEmoji}>{v.reaction}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const STORY_DURATION = 5000;

const StoryViewer: React.FC<{
  visible: boolean;
  groupIndex: number;
  storyGroups: any[];
  currentUserId: string;
  onClose: () => void;
  onViewed: (id: string) => void;
  onDeleted?: (id: string) => void;
  onUserPress?: (profile: any) => void;
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed, onDeleted, onUserPress }) => {
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [stats, setStats] = useState({ views: 0, likes: 0, isLiked: false });
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) { setGi(groupIndex); setSi(0); } }, [groupIndex, visible]);

  const { showPopup } = usePopup();
  const group = storyGroups[gi];
  const story = group?.stories[si];

  const fetchStats = async () => {
    if (!story) return;
    const s = await getStoryStats(story.id);
    setStats(s);
  };

  const toggleLike = async (emoji?: string) => {
    if (!story || !currentUserId) return;
    const reaction = emoji || '❤️';
    const isLiking = !emoji && stats.isLiked;

    // Optimistic Update
    if (!emoji) {
      setStats(ps => ({ ...ps, isLiked: !ps.isLiked, likes: Math.max(0, ps.isLiked ? ps.likes - 1 : ps.likes + 1) }));
    } else {
      showPopup({
        title: 'Sent!',
        message: `${emoji} sent to ${group.profile.username}`,
        icon: 'heart-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      setPaused(false);
      setIsTyping(false);
    }

    try {
      if (isLiking) {
        await unlikeStory(story.id, currentUserId);
      } else {
        await likeStory(story.id, currentUserId, reaction);
      }
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      // Revert if not schema error
      if (!emoji) {
        setStats(ps => ({ ...ps, isLiked: !ps.isLiked, likes: ps.isLiked ? ps.likes + 1 : Math.max(0, ps.likes - 1) }));
      }
    }
  };

  const submitReply = async () => {
    if (!reply.trim() || !story) return;
    const text = reply.trim();
    setReply('');
    setIsTyping(false);
    setPaused(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const conversationId = await createDirectConversation(user.id, group.profile.id);
      await sendDM(conversationId, user.id, text, 'text');
      const { data: me } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .single();
      await sendPushToUser(
        group.profile.id,
        me?.username ?? 'Someone',
        `Replied to your story: "${text.length > 60 ? text.slice(0, 57) + '…' : text}"`,
        { type: 'story_reply', conversationId, storyId: story.id },
        story.media_url,
        me?.avatar_url ?? undefined,
      );
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Could not send reply.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  };

  const startProgress = useCallback(() => {
    progress.setValue(0);
    progressAnim.current?.stop();
    progressAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    progressAnim.current.start(({ finished }) => {
      if (finished) advance();
    });
  }, [gi, si]);

  useEffect(() => {
    if (!visible || !story) return;
    markStoryViewed(story.id, currentUserId).catch(() => {});
    onViewed(story.id);
    fetchStats();
    startProgress();
    return () => { progressAnim.current?.stop(); };
  }, [story?.id, visible]);

  useEffect(() => {
    if (paused || showViewers || isTyping) progressAnim.current?.stop();
    else if (story) startProgress();
  }, [paused, showViewers, isTyping]);

  const advance = () => {
    if (!group) return;
    if (si < group.stories.length - 1) { setSi(s => s + 1); return; }
    if (gi < storyGroups.length - 1) { setGi(g => g + 1); setSi(0); return; }
    onClose();
  };

  const retreat = () => {
    if (si > 0) { setSi(s => s - 1); return; }
    if (gi > 0) { setGi(g => g - 1); setSi(0); return; }
  };

  const showStoryOptions = () => {
    setPaused(true);
    if (isOwner) {
      showPopup({
        title: 'Story Options',
        buttons: [
          {
            text: 'Delete story',
            style: 'destructive',
            onPress: () => {
              showPopup({
                title: 'Delete story?',
                message: 'This will permanently remove this story.',
                buttons: [
                  { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteStory(story.id, currentUserId);
                        onDeleted?.(story.id);
                      } catch {
                        showPopup({
                          title: 'Error',
                          message: 'Could not delete story.',
                          icon: 'alert-circle-outline',
                          buttons: [{ text: 'OK', onPress: () => {} }]
                        });
                        setPaused(false);
                      }
                    }
                  },
                ]
              });
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
        ]
      });
    } else {
      showPopup({
        title: 'Story Options',
        buttons: [
          { text: 'Report', onPress: () => { setPaused(false); } },
          { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
        ]
      });
    }
  };

  if (!visible || !group || !story) return null;

  const isOwner = group.profile.id === currentUserId;
  const isReshared = story.caption?.startsWith('Shared from @') ?? false;
  const originalUsername = story.caption?.match(/^Shared from @([\w.]+)/)?.[1] ?? null;
  const isVideoStory = !!(story.media_url?.match(/\.(mp4|mov|m3u8)/i));

  const { medium } = useHaptics();

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={[sv.bg, isReshared && { backgroundColor: '#0f0f0f' }]}>
        <StatusBar hidden />
        {!isReshared && (
          <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        {isReshared && (
          <View style={sv.reshareCardWrap} pointerEvents="none">
            <View style={sv.reshareCard}>
              <Image source={{ uri: story.media_url }} style={sv.reshareCardMedia} resizeMode="cover" />
              <View style={sv.reshareCreatorBar}>
                <Ionicons name="person-circle-outline" size={20} color="rgba(255,255,255,0.55)" />
                <Text style={sv.reshareCreatorText} numberOfLines={1}>@{originalUsername ?? 'user'}</Text>
                <View style={sv.reshareTypeBadge}>
                  <Text style={sv.reshareTypeText}>{isVideoStory ? 'REEL' : 'POST'}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        <View style={sv.topGrad} />
        <View style={sv.bottomGrad} />

        <View style={[sv.progressRow, { top: insets.top + 8 }]}>
          {group.stories.map((_: any, idx: number) => (
            <View key={idx} style={sv.progressTrack}>
              <Animated.View
                style={[
                  sv.progressFill,
                  {
                    width: idx < si ? '100%'
                      : idx === si
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={[sv.header, { top: insets.top + 20 }]}>
          <View style={sv.headerLeft}>
            <TouchableOpacity onPress={() => { setPaused(true); onUserPress?.(group.profile); }}>
              {group.profile.avatar_url
                ? <Image source={{ uri: group.profile.avatar_url }} style={sv.avatar} />
                : <View style={[sv.avatar, { backgroundColor: '#333' }]} />}
            </TouchableOpacity>
            <View style={{ marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={sv.username}>{isOwner ? 'Your story' : group.profile.username}</Text>
                <Text style={sv.time}>{timeAgo(story.created_at)}</Text>
              </View>
              {isReshared && (
                <Text style={sv.reshareSubtitle}>Watch full {isVideoStory ? 'reel' : 'post'}</Text>
              )}
              {!isReshared && story.song && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <Ionicons name="musical-note" size={10} color="#fff" />
                  <Text style={sv.songText} numberOfLines={1}>{story.song}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={showStoryOptions} style={sv.iconBtn} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={sv.iconBtn} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {story.caption && !isReshared ? (
          <View style={sv.captionBox}>
            <Text style={sv.captionText}>{story.caption}</Text>
          </View>
        ) : null}

        <View style={sv.tapRow} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={retreat} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={advance} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 2 }} />
          </TouchableWithoutFeedback>
        </View>

        {isTyping && (
          <View style={[sv.reactionOverlay, { bottom: insets.bottom + 84 }]}>
            {['😂', '😮', '😍', '😢', '🔥', '👏'].map(emoji => (
              <TouchableOpacity key={emoji} style={sv.reactionItem} onPress={() => { medium(); toggleLike(emoji); }}>
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {story.link_url ? (
          <TouchableOpacity
            style={[sv.visitLinkBtn, { bottom: insets.bottom + 88 }]}
            onPress={() => Linking.openURL(story.link_url)}
            activeOpacity={0.85}
          >
            <Ionicons name="link-outline" size={15} color="#fff" />
            <Text style={sv.visitLinkText} numberOfLines={1}>{story.link_url.replace(/^https?:\/\//, '')}</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        ) : null}

        <View style={[sv.replyRow, { paddingBottom: insets.bottom + 16 }]}>
          {!isOwner ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <BlurView intensity={25} tint="dark" style={sv.replyBlurPill}>
                <TextInput
                  style={sv.replyTextInput}
                  placeholder="Send message"
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  value={reply}
                  onChangeText={setReply}
                  onFocus={() => { setIsTyping(true); setPaused(true); }}
                  onBlur={() => { if (!reply) { setIsTyping(false); setPaused(false); } }}
                  onSubmitEditing={submitReply}
                  returnKeyType="send"
                />
              </BlurView>
              
              {!isTyping && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity onPress={() => { medium(); toggleLike(); }}>
                    <Ionicons 
                      name={stats.isLiked ? 'heart' : 'heart-outline'} 
                      size={26} 
                      color={stats.isLiked ? '#ff2d55' : '#fff'} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Share.share({ url: story.media_url })}>
                    <Ionicons name="paper-plane-outline" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
              
              {isTyping && reply.trim().length > 0 && (
                <TouchableOpacity onPress={submitReply} style={{ paddingRight: 4 }}>
                  <Text style={sv.sendBtnText}>Send</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={sv.viewersPill} onPress={() => setShowViewers(true)}>
                <Ionicons name="eye-outline" size={18} color="#fff" />
                <Text style={sv.viewersCount}>{stats.views}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={sv.shareIconBtn} onPress={() => Share.share({ url: story.media_url })}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ViewersSheet 
          visible={showViewers} 
          storyId={story.id} 
          onClose={() => setShowViewers(false)} 
        />
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Reel Preview ─────────────────────────────────────────────────────────────

const ReelStripRow: React.FC<{ reels: any[]; onSeeAll?: () => void; onReelPress?: (reelId: string) => void; colors: any }> = React.memo(({ reels, onSeeAll, onReelPress, colors }) => (
  <View style={[feedInjStyles.section, { backgroundColor: colors.bg, borderTopColor: colors.border, borderBottomColor: colors.border }]}>
    <View style={feedInjStyles.sectionHeader}>
      <Text style={[feedInjStyles.sectionTitle, { color: colors.text }]}>Reels for you</Text>
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={feedInjStyles.seeAll}>See all</Text>
      </TouchableOpacity>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      onScrollBeginDrag={() => DeviceEventEmitter.emit('setPagerScroll', false)}
      onScrollEndDrag={() => DeviceEventEmitter.emit('setPagerScroll', true)}
      onMomentumScrollEnd={() => DeviceEventEmitter.emit('setPagerScroll', true)}
    >
      {reels.map((reel) => (
        <TouchableOpacity key={reel.id} style={feedInjStyles.reelThumb} onPress={() => onReelPress?.(reel.id)} activeOpacity={0.85}>
          <ReelPreview reel={reel} />
          <View style={feedInjStyles.reelPlayOverlay}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
          {reel.profiles?.username && (
            <View style={feedInjStyles.reelUsernameWrap}>
              <Text style={feedInjStyles.reelUsername} numberOfLines={1}>@{reel.profiles.username}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
));

// ─── Suggestion Row ───────────────────────────────────────────────────────────

const SuggestionCard: React.FC<{ user: any; currentUserId: string; onPress?: (u: any) => void; colors: any }> = React.memo(({ user, currentUserId, onPress, colors }) => {
  const [following, setFollowing] = useSocialFollow(user.id, false);

  const handleFollow = async () => {
    const next = !following;
    setFollowing(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: next });
    try {
      if (next) await followUser(currentUserId, user.id);
      else await unfollowUser(currentUserId, user.id);
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: !next });
    }
  };

  return (
    <TouchableOpacity
      style={[feedInjStyles.suggCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress?.(user)}
      activeOpacity={0.85}
    >
      {user.avatar_url
        ? <CachedImage uri={user.avatar_url} style={feedInjStyles.suggAvatar} />
        : <View style={[feedInjStyles.suggAvatar, feedInjStyles.suggAvatarPlaceholder, { backgroundColor: colors.bg2 }]}>
            <Ionicons name="person" size={24} color={colors.textMuted} />
          </View>
      }
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
        <Text style={[feedInjStyles.suggUsername, { color: colors.text }]} numberOfLines={1}>@{user.username}</Text>
        {user.is_verified && <VerifiedBadge type={user.verification_type} size="sm" />}
      </View>
      {user.full_name ? (
        <Text style={[feedInjStyles.suggFullName, { color: colors.textMuted }]} numberOfLines={1}>{user.full_name}</Text>
      ) : null}
      <View style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
        {user.follows_me && !following ? (
          <Text style={[feedInjStyles.suggMiniText, { color: '#818cf8', fontWeight: '700' }]}>Follows you</Text>
        ) : user.mutual_friends > 0 ? (
          <Text style={[feedInjStyles.suggMiniText, { color: colors.textSub }]}>{user.mutual_friends} mutual friends</Text>
        ) : user.major ? (
          <Text style={[feedInjStyles.suggMiniText, { color: colors.textSub }]}>{user.major}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[feedInjStyles.suggFollowBtn, following && { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
        onPress={handleFollow}
        activeOpacity={0.8}
      >
        <Text style={[feedInjStyles.suggFollowText, following && { color: colors.text }]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const SuggestionRow: React.FC<{ users: any[]; currentUserId: string; onUserPress?: (u: any) => void; colors: any }> = React.memo(({ users, currentUserId, onUserPress, colors }) => (
  <View style={[feedInjStyles.section, { backgroundColor: colors.bg, borderTopColor: colors.border, borderBottomColor: colors.border }]}>
    <View style={feedInjStyles.sectionHeader}>
      <Text style={[feedInjStyles.sectionTitle, { color: colors.text }]}>Suggested for you</Text>
      <TouchableOpacity onPress={() => {}}>
        <Text style={feedInjStyles.seeAll}>See all</Text>
      </TouchableOpacity>
    </View>
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: 12 }}
      onScrollBeginDrag={() => DeviceEventEmitter.emit('setPagerScroll', false)}
      onScrollEndDrag={() => DeviceEventEmitter.emit('setPagerScroll', true)}
      onMomentumScrollEnd={() => DeviceEventEmitter.emit('setPagerScroll', true)}
    >
      {users.map(user => (
        <SuggestionCard key={user.id} user={user} currentUserId={currentUserId} onPress={onUserPress} colors={colors} />
      ))}
    </ScrollView>
  </View>
));

const feedInjStyles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  seeAll: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  reelThumb: { width: 110, height: 170, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  reelPlayOverlay: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 4 },
  reelUsernameWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  reelUsername: { color: '#fff', fontSize: 11, fontWeight: '600' },
  suggCard: { width: 140, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, alignItems: 'center', paddingBottom: 10 },
  suggAvatar: { width: 64, height: 64, borderRadius: 32 },
  suggAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  suggUsername: { fontSize: 13, fontWeight: '700' },
  suggFullName: { fontSize: 12, marginTop: 2 },
  suggMiniText: { fontSize: 10, textAlign: 'center' },
  suggFollowBtn: { marginTop: 4, backgroundColor: '#6366f1', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 6, width: '100%', alignItems: 'center' },
  suggFollowText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  liveBadgeMini: { position: 'absolute', bottom: -4, backgroundColor: '#ff3b30', paddingHorizontal: 4, borderRadius: 4 },
  liveBadgeMiniText: { color: '#fff', fontSize: 8, fontWeight: '800' },
});


// ─── Feed Screen ──────────────────────────────────────────────────────────────
const FEED_PAGE = 12; // posts per page
const FEED_TTL = 2 * 60 * 1000; // 2 minutes before a background refresh
const SUGGESTION_NOTIF_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours between follow suggestion notifications
let lastSuggestionNotifAt = 0; // module-level — resets on app restart, persists across screen mounts

interface FeedScreenProps {
  refreshKey?: number;
  isVisible?: boolean;
  onCreateStory?: () => void;
  onCameraPress?: () => void; // New prop for manual camera access
  onNotifPress?: () => void;
  onMessagePress?: () => void;
  messageBadge?: number;
  notifBadge?: number;
  onReelPress?: (reelId?: string, previewReels?: any[]) => void;
  onUserPress?: (user: any) => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ 
  refreshKey = 0, 
  isVisible = true, 
  onCreateStory, 
  onCameraPress,
  onNotifPress, 
  onMessagePress,
  messageBadge = 0,
  notifBadge = 0,
  onReelPress, 
  onUserPress, 
  isMuted, 
  setIsMuted 
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(cachedFeedPosts.length === 0);
  const [posts, setPosts] = useState<any[]>(cachedFeedPosts);
  const [storyGroups, setStoryGroups] = useState<any[]>(cachedStoryGroups);
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [showTrending, setShowTrending] = useState(false);
  const [pulsePost, setPulsePost] = useState<any | null>(null);
  const [liveToast, setLiveToast] = useState<{ id: string, username: string, sessionId: string } | null>(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;
  const [likedIds, setLikedIds] = useState<Set<string>>(cachedLikedIds ?? new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(cachedSavedIds ?? new Set());
  const [repostedIds, setRepostedIds] = useState<Set<string>>(cachedRepostedIds ?? new Set());
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const currentUserIdRef = useRef('');
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  const [currentProfile, setCurrentProfile] = useState<any>(cachedCurrentProfile);
  const [pendingStoryUri, setPendingStoryUri] = useState<string | null>(null);
  const [showStoryLinkModal, setShowStoryLinkModal] = useState(false);
  const [storyLinkInput, setStoryLinkInput] = useState('');
  const [showCommentsId, setShowCommentsId] = useState<string | null>(null);
  const [showCommentsType, setShowCommentsType] = useState<'post' | 'reel'>('post');
  const [showCommentsAuthorId, setShowCommentsAuthorId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [previewReels, setPreviewReels] = useState<any[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [followCount, setFollowCount] = useState(999);
  const [campusEvents, setCampusEvents] = useState<CampusEvent[]>([]);
  const pageRef = useRef(0);
  const lastLoadedRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const recordedImpressions = useRef(new Set<string>());
  const dwellStartTimes = useRef(new Map<string, number>());

  const onViewableItemsChanged = useRef(({ viewableItems, changed }: any) => {
    if (viewableItems.length > 0) {
      const topId = viewableItems[0].key;
      // Emit event instead of setting state — this avoids invalidating the
      // renderItem useCallback on every scroll and cascading cell reconciliation.
      DeviceEventEmitter.emit('feedActivePost', topId);

      // Record impressions for all visible items if not already done this session.
      // Use the ref so this closure always sees the current userId (not the stale
      // empty string captured at initialization).
      viewableItems.forEach((info: any) => {
        const id = info.key;
        if (id && !id.startsWith('__') && !recordedImpressions.current.has(id)) {
          recordedImpressions.current.add(id);
          const uid = currentUserIdRef.current;
          if (uid) recordImpression(id, uid);
        }
      });
    }

    // Dwell tracking — record time each post spends in viewport
    const uid = currentUserIdRef.current;
    if (uid && changed) {
      changed.forEach((info: any) => {
        const id: string = info.item?.id ?? info.key;
        if (!id || id.startsWith('__')) return;
        if (info.isViewable) {
          dwellStartTimes.current.set(id, Date.now());
        } else {
          const start = dwellStartTimes.current.get(id);
          if (start !== undefined) {
            dwellStartTimes.current.delete(id);
            const duration_ms = Date.now() - start;
            if (duration_ms >= 1_000) {
              enqueueInteraction({ user_id: uid, post_id: id, type: 'dwell', duration_ms });
            }
          }
        }
      });
    }
  }).current;

  const lastScrollY = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerVisible = useRef(new Animated.Value(1)).current;
  const HEADER_HEIGHT = insets.top + 48;

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    if (diff > 8 && y > HEADER_HEIGHT) {
      Animated.timing(headerVisible, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else if (diff < -5) {
      Animated.timing(headerVisible, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    lastScrollY.current = y;
  };

  const headerTranslateY = headerVisible.interpolate({ inputRange: [0, 1], outputRange: [-HEADER_HEIGHT, 0] });
  const borderOpacity = scrollY.interpolate({
    inputRange: [0, 15],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  const load = useCallback(async (isManualRefresh = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Fetch first page + supporting data in parallel
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      
      const [postsData, storiesData, lRes, likedData, savedData, repostedData, viewedData, prof, reelsData, usersData, fc] = await Promise.all([
        getPersonalizedFeed(user.id, FEED_PAGE, 0),
        getActiveStories(),
        supabase.from('live_sessions')
          .select('*, profiles(username, avatar_url)')
          .eq('status', 'live')
          .gt('created_at', twelveHoursAgo),
        getLikedPostIds(user.id),
        getSavedPostIds(user.id),
        getRepostedPostIds(user.id).catch(() => [] as string[]),
        getViewedStoryIds(user.id),
        supabase.from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, verification_type, university')
          .eq('id', user.id).single().then(r => r.data),
        getPersonalizedReels(user.id, 6, 0).catch(() => []),
        getFollowSuggestions(user.id, 8).catch(() => []),
        getUserFollowCount(user.id).catch(() => 999),
      ]);

      // Enrich posts that are reposts/quotes with their original post data
      const enrichedPosts = await enrichWithOriginalPosts(postsData).catch(() => postsData);

      setCurrentProfile(prof);
      setLiveSessions(lRes.data ?? []);
      setPreviewReels(reelsData ?? []);
      setSuggestedUsers(usersData ?? []);
      setFollowCount(fc ?? 999);

      // Fetch campus events for discovery mode if user has few follows
      if ((fc ?? 999) < 5 && prof?.university) {
        getCampusEvents(prof.university, 4).then(setCampusEvents).catch(() => {});
      }
      setStoryGroups(storiesData);
      setLikedIds(new Set(likedData));
      setSavedIds(new Set(savedData));
      setRepostedIds(new Set(repostedData));
      setViewedIds(viewedData);
      setHasMore(enrichedPosts.length === FEED_PAGE);
      pageRef.current = 0;
      lastLoadedRef.current = Date.now();

      if (cachedFeedPosts.length > 0 && !isManualRefresh) {
        // Stale-while-revalidate: merge without reordering visible posts
        setPosts(prev => {
          const map = new Map(prev.map((p: any) => [p.id, p]));
          enrichedPosts.forEach((p: any) => {
            if (map.has(p.id)) map.set(p.id, { ...map.get(p.id), ...p });
            else map.set(p.id, p);
          });
          const newOnes = enrichedPosts.filter((p: any) => !prev.find((pp: any) => pp.id === p.id));
          return [...newOnes, ...Array.from(map.values()).filter((p: any) => !newOnes.find((n: any) => n.id === p.id))];
        });
      } else {
        setPosts(enrichedPosts);
      }

      cachedFeedPosts = enrichedPosts;
      cachedStoryGroups = storiesData;
      cachedLikedIds = new Set(likedData);
      cachedSavedIds = new Set(savedData);
      cachedRepostedIds = new Set(repostedData);
      cachedCurrentProfile = prof;
    } catch (e: any) {
      showToast(e?.message || 'Failed to load feed. Pull to refresh.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`user-feed-realtime-${currentUserId}`)
      // Live session notifications → show toast + add to status bar
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUserId}` },
        (payload: any) => {
          if (payload.new.type === 'live_started') {
            const notifText: string = payload.new.text || payload.new.content || '';
            const username = notifText.split(' is ')[0] || 'Someone';
            // target_id holds the live session UUID (set by DB trigger)
            const sessionId = payload.new.target_id;
            setLiveToast({ id: payload.new.id, username, sessionId });

            Animated.spring(toastAnim, {
              toValue: 60,
              useNativeDriver: true,
              tension: 40,
              friction: 7
            }).start();
            setTimeout(() => {
              Animated.timing(toastAnim, { toValue: -100, duration: 300, useNativeDriver: true }).start(() => setLiveToast(null));
            }, 6000);

            // Fetch session and add to status bar immediately
            if (sessionId) {
              supabase.from('live_sessions')
                .select('*, profiles(username, avatar_url)')
                .eq('id', sessionId)
                .single()
                .then(({ data: ls }) => {
                  if (ls) setLiveSessions((prev: any[]) => [ls, ...prev.filter((s: any) => s.id !== ls.id)]);
                });
            }
          }

          // post_id holds the post UUID for new_post notifications
          if (payload.new.type === 'new_post' && payload.new.post_id) {
            supabase.from('posts')
              .select('*, profiles(id, username, avatar_url, is_verified, verification_type, university)')
              .eq('id', payload.new.post_id)
              .single()
              .then(({ data: post }) => {
                if (post) {
                  setPosts((prev: any[]) => {
                    if (prev.find((p: any) => p.id === post.id)) return prev;
                    return [post, ...prev];
                  });
                }
              });
          }

          if (payload.new.type === 'new_story') {
            getActiveStories().then(setStoryGroups).catch(() => {});
          }

          if (payload.new.type === 'live_ended') {
            const sessionId = payload.new.target_id;
            if (sessionId) setLiveSessions(prev => prev.filter(ls => ls.id !== sessionId));
          }
        }
      )
      // Live sessions ending → remove from status bar
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions' },
        (payload: any) => {
          if (payload.new.status !== 'live') {
            setLiveSessions((prev: any[]) => prev.filter((ls: any) => ls.id !== payload.new.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const nextPage = pageRef.current + 1;
      const rawMore = await getPersonalizedFeed(user.id, FEED_PAGE, nextPage * FEED_PAGE);
      if (rawMore.length === 0) { setHasMore(false); return; }
      const morePosts = await enrichWithOriginalPosts(rawMore).catch(() => rawMore);
      pageRef.current = nextPage;
      setHasMore(morePosts.length === FEED_PAGE);
      setPosts(prev => {
        const existing = new Set(prev.map((p: any) => p.id));
        return [...prev, ...morePosts.filter((p: any) => !existing.has(p.id))];
      });
    } catch (e: any) {
      showToast('Could not load more posts.', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    // Defer first load until after tab-switch animations settle
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
  }, [load]);

  // Clear module-level caches on sign-out so stale data never leaks to a different account
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearFeedCache();
    });
    return () => subscription.unsubscribe();
  }, []);

  // Pause all active posts when the tab is backgrounded
  useEffect(() => {
    if (!isVisible) DeviceEventEmitter.emit('feedActivePost', null);
  }, [isVisible]);

  // Background refresh when tab becomes visible and data is stale
  useEffect(() => {
    if (isVisible && lastLoadedRef.current > 0) {
      const age = Date.now() - lastLoadedRef.current;
      if (age > FEED_TTL) {
        load(); // silent background refresh, no spinner
      }
    }
  }, [isVisible]);

  // Refresh when app comes back to foreground (like IG does)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Flush dwell interactions and update preference affinities on background
      if (next.match(/inactive|background/)) {
        const uid = currentUserIdRef.current;
        flushInteractions()
          .then(() => { if (uid) processUnprocessedInteractions(uid).catch(() => {}); })
          .catch(() => {});
      }

      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        const age = Date.now() - lastLoadedRef.current;
        if (age > FEED_TTL) load();

        // Periodically send a "people you may know" notification (at most once per 24 h)
        const uid = currentUserIdRef.current;
        if (uid && Date.now() - lastSuggestionNotifAt > SUGGESTION_NOTIF_INTERVAL) {
          getFollowSuggestions(uid, 5)
            .then((suggestions) => {
              if (suggestions.length > 0) {
                lastSuggestionNotifAt = Date.now();
                return sendFollowSuggestionNotif(uid, suggestions.map((s: any) => ({ id: s.id, username: s.username })));
              }
            })
            .catch(() => {}); // fire-and-forget, never surface errors to the user
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [load]);

  const handleCommentCountChange = useCallback((postId: string, delta: number) => {
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
      : p
    ));
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    cachedFeedPosts = cachedFeedPosts.filter((p: any) => p.id !== postId);
  }, []);

  useEffect(() => {
    const postSub = SocialSync.on('POST_DELETE', ({ targetId }) => {
      if (targetId) handlePostDeleted(targetId);
    });
    const reelSub = SocialSync.on('REEL_DELETE', ({ targetId }) => {
      if (targetId) setPreviewReels(prev => prev.filter(r => r.id !== targetId));
    });
    const liveSub = SocialSync.on('LIVE_ENDED', ({ id }) => {
      if (id) setLiveSessions(prev => prev.filter(s => s.id !== id));
    });
    const liveStartSub = SocialSync.on('LIVE_STARTED', async ({ id }) => {
      if (!id) return;
      // Fetch details and add to list if not already there
      const { data } = await supabase.from('live_sessions').select('*, profiles(username, avatar_url)').eq('id', id).single();
      if (data) {
        setLiveSessions(prev => {
          if (prev.some(s => s.id === id)) return prev;
          return [data, ...prev];
        });
      }
    });
    // Open live session from notification tap (JOIN_LIVE_SESSION emitted by App.tsx)
    const joinLiveSub = DeviceEventEmitter.addListener('JOIN_LIVE_SESSION', (ls: any) => {
      if (ls?.id) setActiveLiveSessionId(ls.id);
    });

    return () => {
      postSub.remove();
      reelSub.remove();
      liveSub.remove();
      liveStartSub.remove();
      joinLiveSub.remove();
    };
  }, [handlePostDeleted]);

  const handleOpenComments = useCallback((id: string, authorId: string) => {
    setShowCommentsId(id);
    setShowCommentsType('post');
    setShowCommentsAuthorId(authorId);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const onRefresh = handleRefresh;

  // Inject reel strip (after 3rd post) and suggestion cards (after 8th post)
  const feedItems = React.useMemo(() => {
    if (!posts.length) return posts;
    const items: any[] = [];
    const eventSlots = followCount < 5 ? [1, 4, 8] : [];
    let eventIdx = 0;
    posts.forEach((p, i) => {
      items.push(p);
      if (i === 2 && previewReels.length > 0) {
        items.push({ id: '__reels_strip__', _type: 'reels_strip', reels: previewReels });
      }
      if (i === 7 && suggestedUsers.length > 0) {
        items.push({ id: '__suggestions__', _type: 'suggestions', users: suggestedUsers });
      }
      if (eventSlots.includes(i) && eventIdx < campusEvents.length) {
        const ev = campusEvents[eventIdx++];
        items.push({ id: `__event_${ev.id}__`, _type: 'campus_event', event: ev });
      }
    });
    return items;
  }, [posts, previewReels, suggestedUsers, campusEvents, followCount]);

  const handleYourStory = async () => {
    if (onCreateStory) { onCreateStory(); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showPopup({
        title: 'Permission needed',
        message: 'Allow photo library access to add a story.',
        icon: 'images-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any, allowsEditing: true, aspect: [9, 16], quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0] && currentUserId) {
      const uri = result.assets[0].uri;
      if (isProActive(currentProfile)) {
        setPendingStoryUri(uri);
        setStoryLinkInput('');
        setShowStoryLinkModal(true);
      } else {
        postStory(uri, undefined);
      }
    }
  };

  const postStory = (uri: string, linkUrl?: string) => {
    const tempId = 'temp-story-' + Date.now();
    setStoryGroups(prev => {
      const existing = prev.find(g => g.profile?.id === currentUserId);
      if (existing) return prev;
      return [{ profile: currentProfile, stories: [{ id: tempId, media_url: uri, _pending: true }] }, ...prev];
    });
    createStory(currentUserId, uri, undefined, linkUrl || undefined)
      .then(() => load())
      .catch((e: any) => {
        setStoryGroups(prev => prev.filter(g => !g.stories?.some((s: any) => s.id === tempId)));
        showPopup({
          title: 'Error',
          message: e.message ?? 'Could not post story.',
          icon: 'alert-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      });
  };

  const ownGroupIdx = storyGroups.findIndex(g => g.profile.id === currentUserId);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />

      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 6, transform: [{ translateY: headerTranslateY }], backgroundColor: colors.bg }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={onCameraPress} style={{ padding: 4 }}>
            <Ionicons name="camera-outline" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarLogo, { color: colors.text }]}>UniGram</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={onMessagePress} style={{ padding: 4, position: 'relative' }}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
            {messageBadge > 0 && (
              <View style={styles.notifHeaderBadge}>
                <Text style={styles.notifHeaderBadgeText}>{messageBadge > 99 ? '99+' : messageBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onNotifPress} style={{ position: 'relative', padding: 4 }}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {notifBadge > 0 && (
              <View style={styles.notifHeaderBadge}>
                <Text style={styles.notifHeaderBadgeText}>{notifBadge > 99 ? '99+' : notifBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Dynamic Border */}
        <Animated.View 
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border,
            opacity: borderOpacity
          }} 
        />
      </Animated.View>


      <Animated.FlatList
        data={loading ? [] : feedItems}
        keyExtractor={p => p.id}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true, listener: handleScroll }
        )}
        scrollEventThrottle={16}
        windowSize={5}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        initialNumToRender={5}
        removeClippedSubviews
        decelerationRate="normal"
        ListHeaderComponent={useMemo(() => (
          <>
            <View style={{ height: HEADER_HEIGHT }} />
            {loading ? <StorySkeleton /> : (
              <StoryBar
                storyGroups={storyGroups}
                liveSessions={liveSessions}
                currentProfile={currentProfile}
                viewedIds={viewedIds}
                onStoryPress={i => setStoryIdx(i)}
                onLivePress={(id) => setActiveLiveSessionId(id)}
                onYourStoryPress={handleYourStory}
                hasOwnStories={ownGroupIdx !== -1}
                ownGroupIdx={ownGroupIdx}
              />
            )}
            {!loading && currentUserId && (
              <CampusPulse
                userId={currentUserId}
                university={currentProfile?.university}
                onPostPress={setPulsePost}
                onSeeAll={() => setShowTrending(true)}
                onLivePress={(id) => setActiveLiveSessionId(id)}
              />
            )}
            {!loading && currentProfile?.university && (
              <CommunityPulse university={currentProfile.university} />
            )}
            {!loading && followCount < 5 && currentProfile?.university && (
              <DiscoveryBanner
                university={currentProfile.university}
                followCount={followCount}
                onFindPeople={() => onUserPress?.({ _openDiscover: true })}
              />
            )}
            {loading && <><FeedPostSkeleton /><FeedPostSkeleton /></>}
          </>
        // eslint-disable-next-line react-hooks/exhaustive-deps
        ), [loading, storyGroups, liveSessions, currentProfile, viewedIds, ownGroupIdx, currentUserId, handleYourStory, HEADER_HEIGHT, followCount])}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 15 }}>Follow people to see their posts!</Text>
          </View>
        )}
        renderItem={useCallback(({ item }: any) => {
          if (item._type === 'reels_strip') {
            return (
              <ReelStripRow
                reels={item.reels}
                onSeeAll={() => onReelPress?.()}
                onReelPress={(reelId) => onReelPress?.(reelId, item.reels)}
                colors={colors}
              />
            );
          }
          if (item._type === 'suggestions') {
            return (
              <SuggestionRow
                users={item.users}
                currentUserId={currentUserId}
                onUserPress={onUserPress}
                colors={colors}
              />
            );
          }
          if (item._type === 'campus_event') {
            return <CampusEventCard event={item.event} />;
          }
          return (
            <FeedPost
              post={item}
              currentUserId={currentUserId}
              isLiked={likedIds.has(item.id)}
              isSaved={savedIds.has(item.id)}
              isReposted={repostedIds.has(item.id)}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              onCommentCountChange={handleCommentCountChange}
              onOpenComments={handleOpenComments}
              onDeleted={handlePostDeleted}
              onUserPress={onUserPress}
              onVideoPress={(post, isLiked) => {
                const postAsReel = {
                  id: post.id,
                  video_url: (post.media_urls && post.media_urls.length > 0)
                    ? post.media_urls[0]
                    : post.media_url,
                  thumbnail_url: null,
                  caption: post.caption,
                  user_id: post.user_id,
                  profiles: post.profiles,
                  likes_count: post.likes_count ?? 0,
                  comments_count: post.comments_count ?? 0,
                  views_count: 0,
                  created_at: post.created_at,
                  song: post.song,
                  _isPost: true,
                  _initiallyLiked: isLiked,
                };
                onReelPress?.(post.id, [postAsReel]);
              }}
              onPostPress={setPulsePost}
            />
          );
        }, [likedIds, savedIds, repostedIds, isMuted, setIsMuted, handleCommentCountChange, handleOpenComments, handlePostDeleted, onUserPress, currentUserId, colors, onReelPress, setPulsePost])}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        ) : null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" progressViewOffset={HEADER_HEIGHT} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Centralized Comment System */}
      <CommentSheet
        visible={!!showCommentsId}
        targetId={showCommentsId ?? ''}
        targetType={showCommentsType}
        currentUserId={currentUserId}
        authorId={showCommentsAuthorId ?? ''}
        onClose={() => setShowCommentsId(null)}
        onCountChange={(delta) => {
          if (showCommentsId) handleCommentCountChange(showCommentsId, delta);
        }}
        onCountSync={(count) => {
          if (showCommentsId) {
            setPosts(prev => prev.map(p =>
              p.id === showCommentsId ? { ...p, comments_count: count } : p
            ));
          }
        }}
      />

      {storyIdx !== null && (
        <StoryViewer
          visible
          groupIndex={storyIdx}
          storyGroups={storyGroups}
          currentUserId={currentUserId}
          onClose={() => setStoryIdx(null)}
          onViewed={id => setViewedIds(prev => {
            if (!prev.includes(id)) return [...prev, id];
            return prev;
          })}
          onDeleted={id => {
            setStoryGroups(prev => prev.map(g => ({
              ...g,
              stories: g.stories.filter((s: any) => s.id !== id)
            })).filter(g => g.stories.length > 0));
          }}
        />
      )}
      {activeLiveSessionId && (
        <Modal animationType="slide" visible={true} onRequestClose={() => setActiveLiveSessionId(null)}>
          <LiveScreen
            onClose={() => setActiveLiveSessionId(null)}
            viewerSessionId={activeLiveSessionId}
          />
        </Modal>
      )}

      {showTrending && (
        <Modal animationType="slide" visible={true} onRequestClose={() => setShowTrending(false)}>
          <TrendingScreen
            userId={currentUserId}
            university={currentProfile?.university ?? ''}
            onBack={() => setShowTrending(false)}
            onUserPress={(profile) => { setShowTrending(false); onUserPress?.(profile); }}
          />
        </Modal>
      )}

      {pulsePost && (
        <Modal animationType="slide" visible={true} presentationStyle="pageSheet" onRequestClose={() => setPulsePost(null)}>
          <PostDetailModal
            post={pulsePost}
            currentUserId={currentUserId}
            isLiked={likedIds.has(pulsePost.id)}
            isSaved={savedIds.has(pulsePost.id)}
            onClose={() => setPulsePost(null)}
            onUserPress={(profile) => { setPulsePost(null); onUserPress?.(profile); }}
          />
        </Modal>
      )}

      {/* Pro Story Link Modal */}
      <Modal visible={showStoryLinkModal} transparent animationType="slide" onRequestClose={() => setShowStoryLinkModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: '#161618', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>Add a Link</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 16 }}>
              Your story will show a "Visit Link" button. Leave empty to skip.
            </Text>
            <TextInput
              style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              placeholder="https://..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={storyLinkInput}
              onChangeText={setStoryLinkInput}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }}
                onPress={() => { setShowStoryLinkModal(false); if (pendingStoryUri) postStory(pendingStoryUri, undefined); }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 15 }}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 2, paddingVertical: 15, borderRadius: 14, backgroundColor: '#6366f1', alignItems: 'center' }}
                onPress={() => { setShowStoryLinkModal(false); if (pendingStoryUri) postStory(pendingStoryUri, storyLinkInput.trim()); }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Post Story</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Real-time Live Toast */}
      {liveToast && (
        <Animated.View style={[styles.toastContainer, { transform: [{ translateY: toastAnim }] }]}>
          <TouchableOpacity 
            style={styles.toastInner} 
            onPress={() => {
              setActiveLiveSessionId(liveToast.sessionId);
              setLiveToast(null);
            }}
          >
            <View style={styles.toastLiveBadge}>
              <Text style={styles.toastLiveText}>LIVE</Text>
            </View>
            <Text style={styles.toastContent} numberOfLines={1}>
              <Text style={{ fontWeight: 'bold' }}>{liveToast.username}</Text> started a live video!
            </Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  topBarLogo: { 
    fontWeight: '900', 
    fontSize: 26, 
    letterSpacing: -1,
  },
  notifHeaderBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#000',
  },
  notifHeaderBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  storyScroll: { paddingVertical: 10 },
  storyItem: { alignItems: 'center', width: 72 },
  storyRing: { width: 68, height: 68, borderRadius: 34, padding: 2.5, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  storyRingOwnActive: { 
    borderWidth: 2, 
    borderColor: '#ff6b35', 
    padding: 2
  },
  storyRingViewed: { opacity: 0.5 },
  storyAvatarClip: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: '#333' },
  storyAvatar: { width: '100%', height: '100%' },
  storyPlusOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0095f6',
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  storyUsername: { fontSize: 10, color: 'rgba(255,255,255,0.7)', maxWidth: 64, textAlign: 'center', marginTop: 4 },

  postCard: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 8, overflow: 'hidden' },
  postHeader: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 12, height: 56, backgroundColor: 'transparent' 
  },
  postUserRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarRing: { width: 42, height: 42, borderRadius: 21, padding: 2, backgroundColor: '#ff6b35', overflow: 'hidden' },
  postAvatar: { width: 38, height: 38, borderRadius: 19 },
  postUsername: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  postMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  postMedia: { height: 360, backgroundColor: '#111' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  songBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(244,63,94,0.08)' },
  songBannerText: { fontSize: 12, color: '#f43f5e', flex: 1 },
  songBannerHint: { fontSize: 10, color: 'rgba(244,63,94,0.5)' },
  threadBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6 },
  threadLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  threadCard: {
    marginHorizontal: 14, marginVertical: 6,
    borderRadius: 16, padding: 20, paddingTop: 14, overflow: 'hidden',
  },
  threadQuoteMark: {
    fontSize: 56, lineHeight: 56, color: 'rgba(99,102,241,0.3)',
    fontWeight: '900', marginBottom: -10,
  },
  threadCardText: { fontSize: 17, lineHeight: 26, fontWeight: '500', letterSpacing: -0.2 },
  threadCardMore: { fontSize: 14, color: '#6366f1', fontWeight: '600', marginTop: 4 },
  repostBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 2, borderTopWidth: StyleSheet.hairlineWidth },
  repostBannerText: { fontSize: 12, fontWeight: '500' },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  actionBtn: { padding: 6 },
  postInfo: { paddingHorizontal: 14, paddingBottom: 14 },
  likesText: { fontSize: 13, fontWeight: 'bold' },
  captionText: { fontSize: 13, lineHeight: 18, marginBottom: 4, marginTop: 2 },
  taggedText: { fontSize: 11, color: '#818cf8', marginBottom: 3 },
  timeText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  carouselIndicator: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  indicatorText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dotContainer: {
    position: 'absolute', bottom: 12, width: '100%',
    flexDirection: 'row', justifyContent: 'center', gap: 4,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 12 },
  muteOverlayBtn: {
    position: 'absolute', bottom: 40, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', width: 28, height: 28,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  sendBtn: { paddingHorizontal: 4 },
  sendBtnText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
  toastContainer: {
    position: 'absolute', top: 0, left: 20, right: 20, zIndex: 1000,
  },
  toastInner: {
    backgroundColor: 'rgba(28,28,30,0.95)',
    borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10,
  },
  toastLiveBadge: { backgroundColor: '#ff3b30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  toastLiveText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  toastContent: { color: '#fff', fontSize: 13, flex: 1 },
});

const sv = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },
  progressRow: { flexDirection: 'row', paddingHorizontal: 6, gap: 4, position: 'absolute', left: 0, right: 0, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  username: { color: '#fff', fontWeight: '700', fontSize: 13.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginLeft: 4 },
  songText: { color: '#fff', fontSize: 11.5, fontWeight: '500', maxWidth: width * 0.5 },
  iconBtn: { padding: 8 },
  replyRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, zIndex: 10,
  },
  replyBlurPill: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  replyTextInput: {
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  captionBox: {
    position: 'absolute', bottom: 130, left: 24, right: 24,
    alignItems: 'center',
  },
  captionText: {
    color: '#fff', fontSize: 16, lineHeight: 23,
    textAlign: 'center', fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  visitLinkBtn: {
    position: 'absolute', left: 24, right: 24,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(20,20,20,0.82)',
    borderRadius: 30, paddingHorizontal: 20, paddingVertical: 12,
    zIndex: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  visitLinkText: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  reactionOverlay: {
    position: 'absolute', left: 20, right: 20, zIndex: 1000,
    backgroundColor: 'rgba(20,20,20,0.9)', borderRadius: 30,
    flexDirection: 'row', padding: 10, justifyContent: 'space-between'
  },
  reactionItem: { padding: 4 },
  sendBtnText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
  // Own status bottom
  viewersPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(30,30,30,0.85)', borderRadius: 30,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  viewersCount: { color: '#fff', fontSize: 14, fontWeight: '600' },
  shareIconBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(30,30,30,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Reshared story card
  reshareCardWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  reshareCard: {
    width: width - 48,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  reshareCardMedia: {
    width: '100%',
    aspectRatio: 1,
  },
  reshareCreatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reshareCreatorText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  reshareTypeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reshareTypeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  reshareSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
});

const vv = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
    backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12,
  },
  header: { alignItems: 'center', marginBottom: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 8 },
  title: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  info: { flex: 1 },
  username: { color: '#fff', fontSize: 14, fontWeight: '600' },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  reactionBadge: { 
    width: 28, height: 28, borderRadius: 14, 
    backgroundColor: 'rgba(255,255,255,0.05)', 
    alignItems: 'center', justifyContent: 'center' 
  },
  reactionEmoji: { fontSize: 14 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});

