import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert, Share,
  TouchableWithoutFeedback, ActivityIndicator, DeviceEventEmitter,
  TextInput, InteractionManager, AppState,
  Platform,
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
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { ShareSheet } from '../components/ShareSheet';
import { usePopup } from '../context/PopupContext';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds, deletePost, reportContent, getPostLikers } from '../services/posts';
import { UsersListSheet } from '../components/UsersListSheet';
import { PostOptionsSheet } from '../components/PostOptionsSheet';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory, getStoryStats, likeStory, unlikeStory, getStoryViewers, deleteStory } from '../services/stories';
import { createDirectConversation, sendMessage as sendDM } from '../services/messages';
import { sendPushToUser } from '../services/pushNotifications';
import { getPersonalizedFeed, recordImpression, recordShare, getFollowSuggestions, getPersonalizedReels, recordContentFeedback } from '../services/algorithm';
import { sendFollowSuggestionNotif } from '../services/notifications';
import { getReels } from '../services/reels';
import { followUser, unfollowUser, blockUser } from '../services/profiles';
import { createReport } from '../services/reports';
import { CampusPulse } from '../components/CampusPulse';
import { CommunityPulse } from '../components/CommunityPulse';
import { DiscoveryBanner } from '../components/DiscoveryBanner';
import { CampusEventCard } from '../components/CampusEventCard';
import { getCampusEvents, getUserFollowCount, type CampusEvent } from '../services/campusContent';
import { enqueueInteraction, flushInteractions } from '../hooks/usePostTracker';
import { processUnprocessedInteractions } from '../services/preferences';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { useTheme } from '../context/ThemeContext';
import { LiveScreen } from './LiveScreen';
import { PopupButton } from '../components/PremiumPopup';

const { width, height: screenHeight } = Dimensions.get('window');

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostProfile {
  id: string;
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  verification_type?: string | null;
  major?: string | null;
}

interface Post {
  aspect_ratio: number | undefined;
  id: string;
  user_id: string;
  type: string;
  caption?: string | null;
  media_url?: string | null;
  media_urls?: string[] | null;
  location?: string | null;
  song?: string | null;
  likes_count?: number;
  comments_count?: number;
  created_at: string;
  profiles?: PostProfile | null;
  tagged_users?: string[];
  is_flagged?: boolean | null;
}

interface FeedPostProps {
  post: Post;
  currentUserId: string;
  isLiked?: boolean;
  isSaved?: boolean;
  isMuted?: boolean;
  isActive?: boolean;
  setIsMuted?: (m: boolean) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
  onOpenComments?: (id: string, authorId: string) => void;
  onDeleted?: (id: string) => void;
  onUserPress?: (profile: any) => void;
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

let cachedFeedPosts: any[] = [];
let cachedStoryGroups: any[] = [];
let cachedLikedIds: Set<string> | null = null;
let cachedSavedIds: Set<string> | null = null;
let cachedCurrentProfile: any = null;

function clearFeedCache() {
  cachedFeedPosts = [];
  cachedStoryGroups = [];
  cachedLikedIds = null;
  cachedSavedIds = null;
  cachedCurrentProfile = null;
}

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

  const localStyles = {
    liveBadgeMini: {
      position: 'absolute' as const, bottom: -2, alignSelf: 'center' as const,
      backgroundColor: '#ff3b30', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1,
      borderWidth: 1, borderColor: '#000',
    },
    liveBadgeMiniText: { color: '#fff', fontSize: 8, fontWeight: '900' as const },
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      onScrollBeginDrag={() => DeviceEventEmitter.emit('setPagerScroll', false)}
      onScrollEndDrag={() => DeviceEventEmitter.emit('setPagerScroll', true)}
      onMomentumScrollEnd={() => DeviceEventEmitter.emit('setPagerScroll', true)}
    >
      {/* Live Sessions */}
      {liveSessions.map((ls) => (
        <TouchableOpacity key={ls.id} style={styles.storyItem} onPress={() => onLivePress(ls.id)}>
          <View style={[styles.storyRing, { borderColor: '#ff3b30' }]}>
            <View style={styles.storyAvatarClip}>
              {ls.profiles?.avatar_url
                ? <Image source={{ uri: ls.profiles.avatar_url }} style={styles.storyAvatar} />
                : <View style={[styles.storyAvatar, { backgroundColor: '#222' }]} />}
            </View>
            <View style={localStyles.liveBadgeMini}>
              <Text style={localStyles.liveBadgeMiniText}>LIVE</Text>
            </View>
          </View>
          <Text style={[styles.storyUsername, { color: '#ff3b30', fontWeight: 'bold' }]} numberOfLines={1}>
            {ls.profiles?.username ?? 'user'}
          </Text>
        </TouchableOpacity>
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
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed, onDeleted }) => {
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

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={sv.bg}>
        <StatusBar hidden />
        <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
          <TouchableOpacity onPress={onClose} style={sv.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={sv.headerLeft}>
            {group.profile.avatar_url
              ? <Image source={{ uri: group.profile.avatar_url }} style={sv.avatar} />
              : <View style={[sv.avatar, { backgroundColor: '#333' }]} />}
            <View style={{ marginLeft: 8 }}>
              <Text style={sv.username}>{isOwner ? 'My status' : group.profile.username}</Text>
              <Text style={sv.time}>{timeAgo(story.created_at)}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={showStoryOptions} style={sv.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {story.caption ? (
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
          <View style={[sv.reactionOverlay, { bottom: insets.bottom + 80 }]}>
            {['😂', '😮', '😍', '😢', '🔥', '👏'].map(emoji => (
              <TouchableOpacity 
                key={emoji} 
                style={sv.reactionItem} 
                onPress={() => toggleLike(emoji)}
              >
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[sv.replyRow, { paddingBottom: insets.bottom + 12 }]}>
          {isOwner ? (
            <>
              <TouchableOpacity style={sv.viewersPill} onPress={() => setShowViewers(true)}>
                <Ionicons name="eye-outline" size={18} color="#fff" />
                <Text style={sv.viewersCount}>{stats.views}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={sv.shareIconBtn}>
                <FontAwesome name="facebook" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={sv.shareIconBtn}>
                <FontAwesome name="instagram" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!isTyping ? (
                <TouchableOpacity
                  style={sv.replyInputTouchable}
                  onPress={() => { setIsTyping(true); setPaused(true); }}
                  activeOpacity={0.85}
                >
                  <Text style={sv.replyPlaceholder}>Reply…</Text>
                </TouchableOpacity>
              ) : (
                <View style={[sv.replyInput, sv.replyInputActive]}>
                  <TextInput
                    style={sv.replyTextInput}
                    placeholder="Reply…"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={reply}
                    onChangeText={setReply}
                    onFocus={() => { setIsTyping(true); setPaused(true); }}
                    onBlur={() => { if (!reply) { setIsTyping(false); setPaused(false); } }}
                    onSubmitEditing={submitReply}
                    returnKeyType="send"
                    autoFocus
                  />
                  {reply.trim().length > 0 && (
                    <TouchableOpacity onPress={submitReply} style={{ paddingLeft: 8 }}>
                      <Text style={sv.sendBtnText}>Send</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {!isTyping && (
                <TouchableOpacity style={sv.replyHeart} onPress={() => toggleLike()}>
                  <Ionicons name={stats.isLiked ? 'heart' : 'heart-outline'} size={28} color={stats.isLiked ? '#ff3b30' : '#fff'} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <ViewersSheet 
          visible={showViewers} 
          storyId={story.id} 
          onClose={() => setShowViewers(false)} 
        />
      </View>
    </Modal>
  );
};

// ─── Reel Preview ─────────────────────────────────────────────────────────────
const ReelPreview: React.FC<{ reel: any; isActive?: boolean }> = React.memo(({ reel, isActive }) => {
  const player = useVideoPlayer(reel.video_url, p => {
    p.loop = true;
    p.muted = true;
    // Always muted preview — never steal audio focus from background music
    p.audioMixingMode = 'mixWithOthers';
    if (isActive) p.play();
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) player.play();
    else player.pause();
  }, [player, isActive]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {reel.thumbnail_url ? (
        <CachedImage 
          uri={reel.thumbnail_url} 
          style={StyleSheet.absoluteFill} 
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
           <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      {isActive && player && (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      )}
    </View>
  );
});

const VideoPost: React.FC<{ 
  uri: string; 
  isMuted?: boolean; 
  isActive?: boolean;
  aspectRatio?: number;
}> = React.memo(({ uri, isMuted, isActive, aspectRatio }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = isMuted ?? true; // default muted so we never steal focus on mount
    // Start mixing — won't interrupt background music until user explicitly unmutes
    p.audioMixingMode = 'mixWithOthers';
    if (isActive) p.play();
  });

  useEffect(() => {
    if (!player) return;
    player.muted = isMuted ?? true;
    // When user unmutes: duck (lower) background music instead of killing it.
    // When muted again: go back to silent mixing so background music resumes at full volume.
    player.audioMixingMode = isMuted !== false ? 'mixWithOthers' : 'duckOthers';
  }, [player, isMuted]);

  useEffect(() => {
    if (!player) return;
    if (isActive) player.play();
    else player.pause();
  }, [player, isActive]);

  const containerHeight = aspectRatio ? Math.min(width * 1.25, width / aspectRatio) : width;

  return (
    <View style={{ width, height: containerHeight, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      {/* Dark gradient background — keeps the frame filled behind letterbox bars */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      {!isActive && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="play" size={48} color="rgba(255,255,255,0.2)" />
        </View>
      )}
      {isActive && (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      )}
    </View>
  );
});

// ─── Post Meta Cycler ─────────────────────────────────────────────────────────
const PostMetaCycler: React.FC<{ location?: string; song?: string; onSongPress?: () => void; onLocationPress?: () => void }> = React.memo(({ location, song, onSongPress, onLocationPress }) => {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // Stable items ref — avoids new array reference on every render
  const itemsRef = useRef<string[]>([]);
  itemsRef.current = [location, song].filter(Boolean) as string[];
  const itemCount = itemsRef.current.length;

  useEffect(() => {
    if (itemCount < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setIndex(prev => (prev + 1) % itemsRef.current.length);
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [itemCount, fadeAnim]);

  if (itemsRef.current.length === 0) return null;
  const currentItem = itemsRef.current[index] ?? '';

  return (
    <TouchableOpacity 
      activeOpacity={0.8}
      onPress={() => {
        if (currentItem === song) onSongPress?.();
        else if (currentItem === location) onLocationPress?.();
      }}
    >
      <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons
          name={currentItem === song ? 'musical-note' : 'location-outline'}
          size={10} color={colors.textMuted}
        />
        <Text style={[styles.postMeta, { color: colors.textSub }]} numberOfLines={1}>{currentItem}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ─── Media Carousel ───────────────────────────────────────────────────────────
const MediaCarousel: React.FC<{
  mediaUrls: string[];
  type: string;
  onDoubleTap: () => void;
  onSingleTap: (index: number) => void;
  isMuted?: boolean;
  isActive?: boolean;
  aspectRatio?: number;
}> = React.memo(({ mediaUrls, type, onDoubleTap, onSingleTap, isMuted, isActive, aspectRatio }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentIdxRef = useRef(0);
  // Adaptive height: respect aspect ratio, cap portrait at 4:5 (Instagram standard)
  const containerHeight = aspectRatio ? Math.min(width * 1.25, width / aspectRatio) : width;

  // Gesture State
  const isSwiping = useSharedValue(false);
  const translateX = useSharedValue(0);

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (!isSwiping.value) {
        runOnJS(onSingleTap)(currentIdxRef.current);
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onDoubleTap)();
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, tapGesture);

  return (
    <View style={{ height: containerHeight }}>
      <FlatList
        data={mediaUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate={0.992}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        removeClippedSubviews={Platform.OS === 'android'}
        bounces={false}
        disableIntervalMomentum
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollBeginDrag={() => DeviceEventEmitter.emit('setPagerScroll', false)}
        onScrollEndDrag={() => DeviceEventEmitter.emit('setPagerScroll', true)}
        onMomentumScrollEnd={e => {
          DeviceEventEmitter.emit('setPagerScroll', true);
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIdx(idx);
          currentIdxRef.current = idx;
        }}
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          const idx = Math.round(x / width);
          setCurrentIdx(idx);
          currentIdxRef.current = idx;
        }}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <GestureDetector gesture={composedGesture}>
            <View style={{ width, height: containerHeight, overflow: 'hidden' }}>
              {type === 'video' ? (
                <VideoPost uri={item} isMuted={isMuted} isActive={isActive && currentIdx === index} aspectRatio={aspectRatio} />
              ) : (
                // Blurred cover background + sharp contain foreground
                // Shows the full image without cropping while filling the frame
                <View style={{ width: '100%', height: '100%' }}>
                  <Image
                    source={{ uri: item }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    blurRadius={22}
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
                  <CachedImage
                    uri={item}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              )}
            </View>
          </GestureDetector>
        )}
      />
      {mediaUrls.length > 1 && (
        <>
          <View style={styles.carouselIndicator}>
            <Text style={styles.indicatorText}>{currentIdx + 1}/{mediaUrls.length}</Text>
          </View>
          <View style={styles.dotContainer}>
            {mediaUrls.map((_, i) => (
              <View key={i} style={[styles.dot, currentIdx === i && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
});

// ─── Full Video Modal (Reel-style) ───────────────────────────────────────────
const FullVideoModal: React.FC<{
  visible: boolean;
  uri: string;
  onClose: () => void;
}> = ({ visible, uri, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMutedLocal, setIsMutedLocal] = useState(false);

  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.audioMixingMode = 'duckOthers';
    p.muted = false;
    p.play();
  });

  const togglePlayPause = () => {
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const next = !isMutedLocal;
    player.muted = next;
    setIsMutedLocal(next);
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <TouchableWithoutFeedback onPress={togglePlayPause}>
          <View style={{ flex: 1 }}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls={false}
            />
            {/* Play/pause overlay */}
            {!isPlaying && (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 40, padding: 16 }}>
                  <Ionicons name="play" size={40} color="#fff" />
                </View>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Top bar */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleMute}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={isMutedLocal ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Full Image Viewer ────────────────────────────────────────────────────────
const ImageViewerModal: React.FC<{
  visible: boolean;
  uris: string[];
  initialIndex: number;
  onClose: () => void;
}> = ({ visible, uris, initialIndex, onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setCurrentIdx(initialIndex);
      setIsZoomed(false);
    }
  }, [visible, initialIndex]);

  const resetZoom = () => {
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 4);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(setIsZoomed)(true);
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <FlatList
          data={uris}
          horizontal
          pagingEnabled
          scrollEnabled={!isZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(_, i) => String(i)}
          onScrollBeginDrag={() => resetZoom()}
          onMomentumScrollEnd={e => {
            setCurrentIdx(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item }) => (
            <GestureDetector gesture={composedGesture}>
              <View style={{ width, height: screenHeight, justifyContent: 'center', alignItems: 'center' }}>
                <Reanimated.View style={[{ width, height: screenHeight }, animatedStyle]}>
                  <Image
                    source={{ uri: item }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </Reanimated.View>
              </View>
            </GestureDetector>
          )}
        />

        {/* Header bar */}
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          {uris.length > 1 && (
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {currentIdx + 1} / {uris.length}
            </Text>
          )}

          <TouchableOpacity
            onPress={() => Share.share({ url: uris[currentIdx], message: 'Check out this photo on UniGram' })}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Dot indicator for multi-image */}
        {uris.length > 1 && (
          <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {uris.map((_, i) => (
              <View key={i} style={{
                width: i === currentIdx ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.45)',
              }} />
            ))}
          </View>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ─── Feed Post ────────────────────────────────────────────────────────────────
export const FeedPost: React.FC<FeedPostProps> = React.memo(({ post, currentUserId, isLiked = false, isSaved = false, isMuted, isActive: isActiveProp, setIsMuted, onOpenComments, onCommentCountChange, onDeleted, onUserPress }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { medium, success, selection } = useHaptics();

  // Self-managed active state — driven by 'feedActivePost' events so the parent
  // FlatList's renderItem callback doesn't need activePostId in its deps.
  // Self-managed active state — driven by 'feedActivePost' events 
  // or explicitly passed via prop (e.g. from Detail modals)
  const [isActiveInternal, setIsActiveInternal] = useState(false);
  const isActive = isActiveProp ?? isActiveInternal;

  useEffect(() => {
    if (isActiveProp !== undefined) return; // Prop takes priority, skip listener
    const sub = DeviceEventEmitter.addListener('feedActivePost', (id: string | null) => {
      setIsActiveInternal(id === post.id);
    });
    return () => sub.remove();
  }, [post.id, isActiveProp]);

  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  // If a post has >= 5 pending reports it's soft-hidden; user can reveal it
  const [showFlagged, setShowFlagged] = useState(false);
  // Initialize directly from parent-passed props — no per-post server round-trip
  const [liked, setLiked] = useState(isLiked);
  const [likes, setLikes] = useState(post.likes_count ?? 0);
  const [saved, setSaved] = useState(isSaved);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [fullVideoUri, setFullVideoUri] = useState<string | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imageViewerUris, setImageViewerUris] = useState<string[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [songLoading, setSongLoading] = useState(false);
  const [songPreviewUrl, setSongPreviewUrl] = useState<string | null>(null);
  // Pass null when there is no song — avoids activating the iOS audio session
  // with an empty-string source, which would interrupt background music.
  const songPlayer = useAudioPlayer(songPreviewUrl);
  const heartOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Animations
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartOverlayScale = useRef(new Animated.Value(0.5)).current;
  const heartOverlayOpacity = useRef(new Animated.Value(0)).current;

  // Sync if parent updates (e.g. feed refresh)
  useEffect(() => { setLiked(isLiked); }, [isLiked]);
  useEffect(() => { setSaved(isSaved); }, [isSaved]);

  // Cleanup overlay timer on unmount
  useEffect(() => () => { if (heartOverlayTimer.current) clearTimeout(heartOverlayTimer.current); }, []);

  useEffect(() => {
    if (songPlayer) {
      songPlayer.muted = isMuted ?? true;
      songPlayer.loop = true;
    }
  }, [songPlayer, isMuted]);

  useEffect(() => {
    if (isActive) {
      if (post.song) toggleSongPreview();
    } else {
      songPlayer.pause();
    }
  }, [isActive]);

  useEffect(() => {
    if (currentUserId && post.id) recordImpression(post.id, currentUserId).catch(() => {});
  }, [post.id, currentUserId]);

  const toggleSongPreview = async () => {
    if (songPlayer.playing) {
      songPlayer.pause();
      return;
    }
    if (songLoading) return;

    if (!songPreviewUrl) {
      setSongLoading(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(post.song!)}&media=music&entity=song&limit=1`
        );
        const json = await res.json();
        const url = json.results?.[0]?.previewUrl ?? null;
        if (url) {
          setSongPreviewUrl(url);
        }
      } catch {
      } finally {
        setSongLoading(false);
      }
    }
    songPlayer.play();
  };

  const bounceHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, tension: 200, friction: 5 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
  };

  const showHeartOverlay = () => {
    heartOverlayOpacity.setValue(1);
    heartOverlayScale.setValue(0.5);
    Animated.spring(heartOverlayScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
    if (heartOverlayTimer.current) clearTimeout(heartOverlayTimer.current);
    heartOverlayTimer.current = setTimeout(() => {
      Animated.timing(heartOverlayOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 600);
  };

  const doLike = async (forceLike?: boolean) => {
    const next = forceLike ?? !liked;
    if (liked === next) return;
    const newCount = likes + (next ? 1 : -1);
    setLiked(next);
    setLikes(newCount);
    SocialSync.emit('POST_LIKE_CHANGE', { targetId: post.id, isActive: next, newCount });
    bounceHeart();
    if (next) await medium();
    else await selection();
    try {
      if (next) await likePost(post.id, currentUserId);
      else await unlikePost(post.id, currentUserId);
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      setLiked(!next);
      setLikes(newCount + (next ? -1 : 1));
      SocialSync.emit('POST_LIKE_CHANGE', { targetId: post.id, isActive: !next, newCount: likes });
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    if (next) await success(); else await selection();
    try {
      if (next) await savePost(post.id, currentUserId);
      else await unsavePost(post.id, currentUserId);
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;
      setSaved(!next);
    }
  };

  const handleCommentChange = (delta: number) => {
    setCommentCount((n: number) => Math.max(0, n + delta));
  };

  const handleDeletePost = () => {
    showPopup({
      title: 'Delete post?',
      message: 'This cannot be undone and will remove the post from your profile and feed.',
      icon: 'trash-outline',
      iconColor: '#ef4444',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { 
          text: 'Delete Permanently', 
          style: 'destructive', 
          onPress: () => {
            onDeleted?.(post.id);
            deletePost(post.id, currentUserId).catch(() => {
              showPopup({
                title: 'Error',
                message: 'Could not delete post. Please refresh.',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            });
          }
        },
      ]
    });
  };

  const handleReport = () => {
    showPopup({
      title: 'Report Post',
      message: 'Why are you reporting this post? Your feedback helps keep UniGram safe.',
      icon: 'flag-outline',
      buttons: [
        { text: 'Inappropriate Content', onPress: () => submitReport('Inappropriate Content') },
        { text: 'Spam', onPress: () => submitReport('Spam') },
        { text: 'Harassment', onPress: () => submitReport('Harassment') },
        { text: 'Cancel', style: 'cancel', onPress: () => {} }
      ]
    });
  };

  const submitReport = async (reason: string) => {
    try {
      await createReport(post.id, 'post', reason);
      showPopup({
        title: 'Report Received',
        message: 'Thank you. We will review this post and take action if needed.',
        icon: 'checkmark-circle-outline',
        iconColor: '#10b981',
        buttons: [{ text: 'Done', onPress: () => {} }]
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message,
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  };

  const handleBlock = () => {
    showPopup({
      title: 'Block User?',
      message: `You will no longer see content from @${post.profiles?.username} and they won't be able to find your profile.`,
      icon: 'ban-outline',
      iconColor: '#ef4444',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { 
          text: 'Block User', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await blockUser(post.user_id);
              onDeleted?.(post.id);
              showPopup({
                title: 'User Blocked',
                message: 'You will no longer see content from this user.',
                icon: 'checkmark-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message,
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            }
          }
        }
      ]
    });
  };

  const handleNotInterested = async () => {
    try {
      await recordContentFeedback(currentUserId, post.id, 'post', 'not_interested', post.user_id);
      onDeleted?.(post.id);
    } catch {}
  };

  const profile = post.profiles;

  // Soft-hide: post has been reported but not yet removed
  if (post.is_flagged && !showFlagged) {
    return (
      <View style={[styles.postCard, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View style={{ padding: 20, alignItems: 'center', gap: 10 }}>
          <Ionicons name="flag" size={28} color="#f59e0b" />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>
            This content has been flagged
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
            This post received multiple reports and is under review.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setShowFlagged(true)}
          >
            <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '600' }}>Show anyway</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.postCard, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      {fullVideoUri && (
        <FullVideoModal visible uri={fullVideoUri} onClose={() => setFullVideoUri(null)} />
      )}
      {showImageViewer && (
        <ImageViewerModal
          visible={showImageViewer}
          uris={imageViewerUris}
          initialIndex={imageViewerIndex}
          onClose={() => setShowImageViewer(false)}
        />
      )}

      <View style={[styles.postHeader, { backgroundColor: colors.background }]}>
        <View style={styles.postUserRow}>
          <TouchableOpacity onPress={() => onUserPress?.(profile)}>
            <View style={styles.avatarRing}>
              {profile?.avatar_url
                ? <CachedImage uri={profile.avatar_url} style={styles.postAvatar} />
                : <View style={[styles.postAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={18} color="#555" />
                  </View>}
            </View>
          </TouchableOpacity>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity onPress={() => onUserPress?.(profile)}>
                <Text style={[styles.postUsername, { color: colors.text }]}>{profile?.username ?? 'user'}</Text>
              </TouchableOpacity>
              {profile?.is_verified && (
                <TouchableOpacity onPress={() => showPopup({
                  title: `Verified ${profile.verification_type?.charAt(0).toUpperCase()}${profile.verification_type?.slice(1)}`,
                  message: `This user is a verified ${profile.verification_type} on campus.`,
                  icon: 'shield-checkmark-outline',
                  buttons: [{ text: 'OK', onPress: () => {} }]
                })}>
                  <VerifiedBadge type={profile.verification_type as any} />
                </TouchableOpacity>
              )}
            </View>
            <PostMetaCycler 
              location={post.location ?? undefined} 
              song={post.song ?? undefined} 
              onSongPress={() => showPopup({
                title: 'Original Audio',
                message: `Browse posts using "${post.song}"\n\n(Audio Gallery coming soon)`,
                icon: 'musical-notes-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              })}
              onLocationPress={() => showPopup({
                title: 'Location Details',
                message: `Browse posts from ${post.location}\n\n(Map view coming soon)`,
                icon: 'location-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              })}
            />
            <Text style={[styles.postMeta, { color: colors.textSub }]}>{profile?.major ? `${profile.major} · ` : ''}{timeAgo(post.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => setShowOptions(true)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <PostOptionsSheet
        visible={showOptions}
        onClose={() => setShowOptions(false)}
        post={post}
        currentUserId={currentUserId}
        isSaved={saved}
        onSave={toggleSave}
        onDelete={handleDeletePost}
        onReport={handleReport}
        onBlock={handleBlock}
        onNotInterested={handleNotInterested}
        onShare={() => {
          setShowOptions(false);
          Share.share({ message: `Check out this post on UniGram by @${profile?.username ?? 'user'}:\n\n${post.caption ?? ''}` });
        }}
        onCopyLink={() => {
          setShowOptions(false);
          showPopup({
            title: 'Link Copied',
            message: 'Post link copied to clipboard.',
            icon: 'copy-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
        }}
      />

      {post.type !== 'thread' && (post.media_url || (post.media_urls && post.media_urls.length > 0)) ? (
        <View>
          <MediaCarousel 
            mediaUrls={post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url!]}
            type={post.type}
            onDoubleTap={() => {
              if (!liked) doLike(true);
              showHeartOverlay();
            }}
            onSingleTap={(index) => {
              const mediaUris = post.media_urls && post.media_urls.length > 0
                ? post.media_urls
                : [post.media_url!];
              if (post.type === 'video') {
                setFullVideoUri(mediaUris[index] ?? mediaUris[0]);
              } else {
                setImageViewerUris(mediaUris);
                setImageViewerIndex(index);
                setShowImageViewer(true);
              }
            }}
            isMuted={isMuted}
            isActive={isActive}
            aspectRatio={post.aspect_ratio}
          />
          {(post.type === 'video' || post.song) && (
            <TouchableOpacity style={styles.muteOverlayBtn} onPress={() => setIsMuted?.(!isMuted)} activeOpacity={0.8}>
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
            </TouchableOpacity>
          )}
          <Animated.View
            pointerEvents="none"
            style={[styles.heartOverlay, { opacity: heartOverlayOpacity, transform: [{ scale: heartOverlayScale }] }]}
          >
            <Ionicons name="heart" size={90} color="#fff" />
          </Animated.View>
        </View>
      ) : post.type === 'thread' ? (
        <View style={styles.threadBadge}>
          <Ionicons name="chatbubbles-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.threadLabel, { color: colors.textMuted }]}>Thread</Text>
        </View>
      ) : null}

      <View style={[styles.postActions, { backgroundColor: colors.background }]}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => doLike()} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : colors.text} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => {
            onOpenComments?.(post.id, post.user_id);
          }}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={async () => {
            setShowShare(true);
            try { await recordShare(post.id, post.user_id, currentUserId); } catch {}
          }}>
            <Ionicons name="paper-plane-outline" size={23} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.postInfo}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
          {likes > 0 && (
            <TouchableOpacity onPress={() => setShowLikers(true)} activeOpacity={0.7}>
              <Text style={[styles.likesText, { color: colors.text }]}>{fmtCount(likes)} likes</Text>
            </TouchableOpacity>
          )}
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => {
              onOpenComments?.(post.id, post.user_id);
            }}>
              <Text style={[styles.likesText, { color: colors.textSub, fontWeight: '400' }]}>{fmtCount(commentCount)} comments</Text>
            </TouchableOpacity>
          )}
        </View>
        {post.caption ? (
          <Text style={[styles.captionText, { color: colors.text }]} numberOfLines={3}>
            <Text style={[styles.postUsername, { color: colors.text }]} onPress={() => onUserPress?.(profile)}>{profile?.username ?? 'user'} </Text>
            {post.caption}
          </Text>
        ) : null}
        <Text style={[styles.timeText, { color: colors.textMuted }]}>{timeAgo(post.created_at)}</Text>
      </View>

      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        content={{ type: 'post', id: post.id, thumbnail: post.media_url!, username: profile?.username }}
      />

      <UsersListSheet
        visible={showLikers}
        title={`${fmtCount(likes)} likes`}
        fetchUsers={() => getPostLikers(post.id)}
        onClose={() => setShowLikers(false)}
        onUserPress={onUserPress}
      />
    </View>
  );
});


// ─── Reel Strip Row ───────────────────────────────────────────────────────────

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
          <ReelPreview reel={reel} isActive={true} />
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
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(cachedFeedPosts.length === 0);
  const [posts, setPosts] = useState<any[]>(cachedFeedPosts);
  const [storyGroups, setStoryGroups] = useState<any[]>(cachedStoryGroups);
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [activeLiveSessionId, setActiveLiveSessionId] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<{ id: string, username: string, sessionId: string } | null>(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;
  const [likedIds, setLikedIds] = useState<Set<string>>(cachedLikedIds ?? new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(cachedSavedIds ?? new Set());
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const currentUserIdRef = useRef('');
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  const [currentProfile, setCurrentProfile] = useState<any>(cachedCurrentProfile);
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
      
      const [postsData, storiesData, lRes, likedData, savedData, viewedData, prof, reelsData, usersData, fc] = await Promise.all([
        getPersonalizedFeed(user.id, FEED_PAGE, 0),
        getActiveStories(),
        supabase.from('live_sessions')
          .select('*, profiles(username, avatar_url)')
          .eq('status', 'live')
          .gt('created_at', twelveHoursAgo),
        getLikedPostIds(user.id),
        getSavedPostIds(user.id),
        getViewedStoryIds(user.id),
        supabase.from('profiles')
          .select('id, username, full_name, avatar_url, is_verified, verification_type, university')
          .eq('id', user.id).single().then(r => r.data),
        getPersonalizedReels(user.id, 6, 0).catch(() => []),
        getFollowSuggestions(user.id, 8).catch(() => []),
        getUserFollowCount(user.id).catch(() => 999),
      ]);

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
      setViewedIds(viewedData);
      setHasMore(postsData.length === FEED_PAGE);
      pageRef.current = 0;
      lastLoadedRef.current = Date.now();

      if (cachedFeedPosts.length > 0 && !isManualRefresh) {
        // Stale-while-revalidate: merge without reordering visible posts
        setPosts(prev => {
          const map = new Map(prev.map((p: any) => [p.id, p]));
          postsData.forEach((p: any) => {
            if (map.has(p.id)) map.set(p.id, { ...map.get(p.id), ...p });
            else map.set(p.id, p); // new post at top handled below
          });
          // Prepend genuinely new posts
          const newOnes = postsData.filter((p: any) => !prev.find((pp: any) => pp.id === p.id));
          return [...newOnes, ...Array.from(map.values()).filter((p: any) => !newOnes.find((n: any) => n.id === p.id))];
        });
      } else {
        setPosts(postsData);
      }

      cachedFeedPosts = postsData;
      cachedStoryGroups = storiesData;
      cachedLikedIds = new Set(likedData);
      cachedSavedIds = new Set(savedData);
      cachedCurrentProfile = prof;
    } catch (e) {
      console.error('Feed load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`user-lives-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUserId}` },
        (payload: any) => {
          if (payload.new.type === 'live_started') {
            const username = payload.new.content.split(' is ')[0];
            setLiveToast({ id: payload.new.id, username, sessionId: payload.new.related_id });
            
            Animated.spring(toastAnim, {
              toValue: 60,
              useNativeDriver: true,
              tension: 40,
              friction: 7
            }).start();

            setTimeout(() => {
              Animated.timing(toastAnim, { toValue: -100, duration: 300, useNativeDriver: true }).start(() => setLiveToast(null));
            }, 6000);
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
      const morePosts = await getPersonalizedFeed(user.id, FEED_PAGE, nextPage * FEED_PAGE);
      if (morePosts.length === 0) { setHasMore(false); return; }
      pageRef.current = nextPage;
      setHasMore(morePosts.length === FEED_PAGE);
      setPosts(prev => {
        const existing = new Set(prev.map((p: any) => p.id));
        return [...prev, ...morePosts.filter((p: any) => !existing.has(p.id))];
      });
    } catch (e) {
      console.error('loadMore error', e);
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
    return () => {
      postSub.remove();
      reelSub.remove();
      liveSub.remove();
      liveStartSub.remove();
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
      // Optimistic: show temp story immediately in the story bar
      const tempId = 'temp-story-' + Date.now();
      setStoryGroups(prev => {
        const existing = prev.find(g => g.profile?.id === currentUserId);
        if (existing) return prev; // already has stories, skip temp
        return [{ profile: currentProfile, stories: [{ id: tempId, media_url: uri, _pending: true }] }, ...prev];
      });
      createStory(currentUserId, uri)
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
    }
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
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={30}
        initialNumToRender={4}
        removeClippedSubviews={Platform.OS === 'android'}
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
                onPostPress={() => {}}
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
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              onCommentCountChange={handleCommentCountChange}
              onOpenComments={handleOpenComments}
              onDeleted={handlePostDeleted}
              onUserPress={onUserPress}
            />
          );
        }, [likedIds, savedIds, isMuted, setIsMuted, handleCommentCountChange, handleOpenComments, handlePostDeleted, onUserPress, currentUserId, colors, onReelPress])}
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
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  progressRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 3, position: 'absolute', left: 0, right: 0, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, gap: 2,
  },
  backBtn: { padding: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 4 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  username: { color: '#fff', fontWeight: '700', fontSize: 14 },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 8 },
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
  replyRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, zIndex: 10,
  },
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
  // Others' status bottom
  replyInputTouchable: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 28, paddingHorizontal: 18, paddingVertical: 11,
  },
  replyPlaceholder: { color: 'rgba(255,255,255,0.55)', fontSize: 15 },
  replyInput: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 28, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  replyInputActive: { borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.08)' },
  replyTextInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  replyHeart: { padding: 6 },
  reactionOverlay: {
    position: 'absolute', left: 20, right: 20, zIndex: 1000,
    backgroundColor: 'rgba(20,20,20,0.9)', borderRadius: 30,
    flexDirection: 'row', padding: 10, justifyContent: 'space-between'
  },
  reactionItem: { padding: 4 },
  sendBtnText: { color: '#6366f1', fontWeight: '800', fontSize: 14 },
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

