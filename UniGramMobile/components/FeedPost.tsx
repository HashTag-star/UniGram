import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert, Share,
  TouchableWithoutFeedback, ActivityIndicator, DeviceEventEmitter,
  TextInput, InteractionManager, AppState,
  Platform, KeyboardAvoidingView,
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
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow, useSocialLike } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { useTheme } from '../context/ThemeContext';
import { PopupButton } from '../components/PremiumPopup';

const { width, height: screenHeight } = Dimensions.get('window');

export function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PostProfile {
  id: string;
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  verification_type?: string | null;
  major?: string | null;
}

export interface Post {
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
  reposts_count?: number;
  repost_of?: string | null;
  quote_of?: string | null;
  repost_post?: any | null;
  quote_post?: any | null;
  created_at: string;
  profiles?: PostProfile | null;
  tagged_users?: string[];
  is_flagged?: boolean | null;
}

export interface FeedPostProps {
  post: Post;
  currentUserId: string;
  isLiked?: boolean;
  isSaved?: boolean;
  isReposted?: boolean;
  isMuted?: boolean;
  isActive?: boolean;
  setIsMuted?: (m: boolean) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
  onOpenComments?: (id: string, authorId: string) => void;
  onDeleted?: (id: string) => void;
  onUserPress?: (profile: any) => void;
  onVideoPress?: (post: Post, isLiked: boolean) => void;
  onPostPress?: (post: Post) => void;
}

export function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Thread Text Card ─────────────────────────────────────────────────────────
const ThreadTextCard: React.FC<{ caption?: string | null }> = ({ caption }) => {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const MAX = 220;
  const isLong = (caption?.length ?? 0) > MAX;
  if (!caption) return null;
  const displayText = expanded || !isLong ? caption : caption.substring(0, MAX).trimEnd();
  return (
    <TouchableOpacity
      onPress={() => isLong && setExpanded(e => !e)}
      activeOpacity={isLong ? 0.88 : 1}
    >
      <LinearGradient
        colors={isDark ? ['#0e0e1c', '#13132a'] : ['#f0f0fa', '#e8e8f8']}
        style={styles.threadCard}
      >
        <Text style={styles.threadQuoteMark}>"</Text>
        <Text style={[styles.threadCardText, { color: colors.text }]}>{displayText}</Text>
        {isLong && (
          <Text style={styles.threadCardMore}>{expanded ? ' less' : '...more'}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

// Mounts only when its parent is active — creates exactly one player per visible preview
const ReelVideoLayer: React.FC<{ videoUrl: string }> = ({ videoUrl }) => {
  const player = useVideoPlayer(videoUrl, p => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
    />
  );
};

export const ReelPreview: React.FC<{ reel: any; isActive?: boolean }> = React.memo(({ reel, isActive }) => (
  <View style={StyleSheet.absoluteFill}>
    {reel.thumbnail_url ? (
      <CachedImage uri={reel.thumbnail_url} style={StyleSheet.absoluteFill} />
    ) : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.15)" />
      </View>
    )}
    {isActive && reel.video_url && <ReelVideoLayer videoUrl={reel.video_url} />}
  </View>
));

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
  post: Post;
  currentUserId: string;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  onClose: () => void;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}> = ({ visible, uris, initialIndex, post, currentUserId, isLiked, likeCount, commentCount, onClose, onLike, onComment, onShare }) => {
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsZoomed(false);
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }
  }, [visible]);

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

  const profile = post.profiles;
  const caption = post.caption ?? '';

  const [currentIdx, setCurrentIdx] = useState(initialIndex);

  useEffect(() => {
    if (visible) setCurrentIdx(initialIndex);
  }, [visible, initialIndex]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar hidden />

          {/* ── Image area — flex:1 so it owns all space above the bottom bar ── */}
          {uris.length === 1 ? (
            <GestureDetector gesture={composedGesture}>
              <Reanimated.View style={[{ flex: 1 }, animatedStyle]}>
                <Image
                  source={{ uri: uris[0] }}
                  style={{ flex: 1 }}
                  resizeMode="contain"
                />
              </Reanimated.View>
            </GestureDetector>
          ) : (
            <FlatList
              data={uris}
              horizontal
              pagingEnabled
              scrollEnabled={!isZoomed}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              keyExtractor={(_, i) => String(i)}
              style={{ flex: 1 }}
              onScrollBeginDrag={resetZoom}
              onMomentumScrollEnd={(e) => {
                resetZoom();
                setCurrentIdx(Math.round(e.nativeEvent.contentOffset.x / width));
              }}
              renderItem={({ item }) => (
                <GestureDetector gesture={composedGesture}>
                  <Reanimated.View style={[{ width, flex: 1 }, animatedStyle]}>
                    <Image
                      source={{ uri: item }}
                      style={{ flex: 1 }}
                      resizeMode="contain"
                    />
                  </Reanimated.View>
                </GestureDetector>
              )}
            />
          )}

          {/* ── Compact bottom bar ─────────────────────────────────────────── */}
          <View style={ivStyles.bottomBar}>
            {/* Multi-image page dots */}
            {uris.length > 1 && (
              <View style={ivStyles.dotsRow}>
                {uris.map((_, i) => (
                  <View
                    key={i}
                    style={[ivStyles.dot, i === currentIdx && ivStyles.dotActive]}
                  />
                ))}
              </View>
            )}

            {/* Author row */}
            <View style={ivStyles.authorRow}>
              {profile?.avatar_url ? (
                <CachedImage uri={profile.avatar_url} style={ivStyles.avatar} />
              ) : (
                <View style={[ivStyles.avatar, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={18} color="#555" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={ivStyles.authorName}>{profile?.username ?? 'user'}</Text>
                  {profile?.is_verified && (
                    <VerifiedBadge type={profile.verification_type as any} size="sm" />
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={ivStyles.timeText}>{timeAgo(post.created_at)}</Text>
                  <Ionicons name="globe-outline" size={11} color="rgba(255,255,255,0.3)" />
                </View>
              </View>
            </View>

            {/* Caption — capped at 2 lines; "see more" expands it */}
            {caption.length > 0 && (
              <TouchableOpacity
                style={ivStyles.captionWrap}
                activeOpacity={captionExpanded ? 1 : 0.7}
                onPress={() => !captionExpanded && setCaptionExpanded(true)}
              >
                <Text style={ivStyles.captionText} numberOfLines={captionExpanded ? undefined : 2}>
                  {caption}
                </Text>
                {!captionExpanded && caption.length > 80 && (
                  <Text style={ivStyles.seeMore}>See more</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Engagement bar */}
            <View style={ivStyles.engagementBar}>
              <TouchableOpacity style={ivStyles.engBtn} onPress={onLike} activeOpacity={0.7}>
                <Ionicons
                  name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={19}
                  color={isLiked ? '#6366f1' : 'rgba(255,255,255,0.65)'}
                />
                <Text style={[ivStyles.engCount, isLiked && { color: '#6366f1' }]}>
                  {likeCount > 0 ? fmtCount(likeCount) : 'Like'}
                </Text>
              </TouchableOpacity>

              <View style={ivStyles.engDivider} />

              <TouchableOpacity style={ivStyles.engBtn} onPress={onComment} activeOpacity={0.7}>
                <Ionicons name="chatbubble-outline" size={17} color="rgba(255,255,255,0.65)" />
                <Text style={ivStyles.engCount}>
                  {commentCount > 0 ? fmtCount(commentCount) : 'Comment'}
                </Text>
              </TouchableOpacity>

              <View style={ivStyles.engDivider} />

              <TouchableOpacity style={ivStyles.engBtn} onPress={onShare} activeOpacity={0.7}>
                <Ionicons name="arrow-redo-outline" size={19} color="rgba(255,255,255,0.65)" />
                <Text style={ivStyles.engCount}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Floating top bar (renders last → highest z-order) ─────────── */}
          <View style={ivStyles.topBar}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Share.share({ message: `Check this out on UniGram${caption ? ': ' + caption : ''}` })}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const ivStyles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 18,
    paddingBottom: 12,
    zIndex: 100,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
  },
  authorName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  timeText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  captionWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  captionText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 22,
  },
  seeMore: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 2,
  },
  engagementBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  engBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
  },
  engCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  engDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 18,
    backgroundColor: '#fff',
  },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 20,
  },
});

// Session-scoped cache so we never re-fetch AI context for a post we've already seen
const _aiContextCache = new Map<string, AIContextResult>();

// ─── Feed Post ────────────────────────────────────────────────────────────────
export const FeedPost: React.FC<FeedPostProps> = React.memo(({ post, currentUserId, isLiked = false, isSaved = false, isReposted = false, isMuted, isActive: isActiveProp, setIsMuted, onOpenComments, onCommentCountChange, onDeleted, onUserPress, onVideoPress, onPostPress }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const { medium, success, selection } = useHaptics();

  // Self-managed active state — driven by 'feedActivePost' events so the parent
  // FlatList's renderItem callback doesn't need activePostId in its deps.
  // Self-managed active state — driven by 'feedActivePost' events 
  // or explicitly passed via prop (e.g. from Detail modals)
  const [isActiveInternal, setIsActiveInternal] = useState(false);
  const [isAppActive, setIsAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextAppState => {
      setIsAppActive(nextAppState === 'active');
    });
    return () => sub.remove();
  }, []);

  const isActive = (isActiveProp ?? isActiveInternal) && isAppActive;

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
  const [showRepostSheet, setShowRepostSheet] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  // If a post has >= 5 pending reports it's soft-hidden; user can reveal it
  const [showFlagged, setShowFlagged] = useState(false);
  // Initialize directly from parent-passed props — no per-post server round-trip
  const [liked, setLiked] = useState(isLiked);
  const [likes, setLikes] = useState(post.likes_count ?? 0);
  const [saved, setSaved] = useState(isSaved);
  const [reposted, setReposted] = useState(isReposted);
  const [repostCount, setRepostCount] = useState(post.reposts_count ?? 0);
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
  const [aiContext, setAiContext] = useState<AIContextResult | null>(
    _aiContextCache.get(post.id) ?? null
  );


  // Animations
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartOverlayScale = useRef(new Animated.Value(0.5)).current;
  const heartOverlayOpacity = useRef(new Animated.Value(0)).current;

  // Sync if parent updates (e.g. feed refresh)
  const lastIsLiked = useRef(isLiked);
  useEffect(() => {
    if (lastIsLiked.current !== isLiked) {
      setLiked(isLiked);
      lastIsLiked.current = isLiked;
    }
  }, [isLiked]);
  const lastIsSaved = useRef(isSaved);
  useEffect(() => {
    if (lastIsSaved.current !== isSaved) {
      setSaved(isSaved);
      lastIsSaved.current = isSaved;
    }
  }, [isSaved]);
  const lastIsReposted = useRef(isReposted);
  useEffect(() => {
    if (lastIsReposted.current !== isReposted) {
      setReposted(isReposted);
      lastIsReposted.current = isReposted;
    }
  }, [isReposted]);

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

  // Fetch AI context — reads caption text and, for image posts, the actual image via vision model
  useEffect(() => {
    if (post.type === 'repost') return; // reposts have no original content to analyze
    const hasCaption = !!post.caption?.trim();
    const isImage = post.type === 'image';
    const mediaUrl = post.media_url ?? post.media_urls?.[0] ?? null;
    if (!hasCaption && !(isImage && mediaUrl)) return;
    if (_aiContextCache.has(post.id)) return;
    const timer = setTimeout(async () => {
      const result = await getPostAIContext({
        postId: post.id,
        caption: post.caption,
        postType: post.type,
        mediaUrl,
        isImage,
      });
      _aiContextCache.set(post.id, result);
      if (result.type !== 'none') setAiContext(result);
    }, 900);
    return () => clearTimeout(timer);
  }, [post.id]);

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
    Animated.spring(heartOverlayScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }).start();
    if (heartOverlayTimer.current) clearTimeout(heartOverlayTimer.current);
    heartOverlayTimer.current = setTimeout(() => {
      Animated.timing(heartOverlayOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }, 400);
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

  const doRepost = async () => {
    const next = !reposted;
    setReposted(next);
    setRepostCount((c: number) => Math.max(0, c + (next ? 1 : -1)));
    if (next) await selection();
    try {
      if (next) await repostPost(post.id, currentUserId);
      else await unrepostPost(post.id, currentUserId);
    } catch {
      setReposted(!next);
      setRepostCount((c: number) => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  const doQuote = async (caption: string) => {
    try {
      await quotePost(post.id, currentUserId, caption);
      await success();
      showToast('Quote post published!', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Could not publish quote', 'error');
    }
  };

  const doRepostToStory = async () => {
    try {
      await createStoryFromPost(currentUserId, post);
      await success();
      showToast('Added to your story!', 'success');
    } catch (e: any) {
      const msg = (e as any)?.message;
      showToast(msg === 'no_media' ? 'Only image and video posts can be added to story.' : (msg || 'Could not add to story'), 'error');
    }
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
          post={post}
          currentUserId={currentUserId}
          isLiked={liked}
          likeCount={likes}
          commentCount={commentCount}
          onClose={() => setShowImageViewer(false)}
          onLike={() => doLike()}
          onComment={() => { setShowImageViewer(false); setShowComments(true); }}
          onShare={() => Share.share({ message: `Check this out on UniGram${post.caption ? ': ' + post.caption : ''}` })}
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
        isReposted={reposted}
        onSave={toggleSave}
        onRepost={() => { setShowOptions(false); setShowRepostSheet(true); }}
        onQuote={() => { setShowOptions(false); setShowRepostSheet(true); }}
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

      {/* Repost banner — shown when this post itself is a repost of another */}
      {post.type === 'repost' && post.repost_post && (
        <>
          <View style={[styles.repostBanner, { borderColor: colors.border }]}>
            <Ionicons name="repeat" size={13} color="#22c55e" />
            <Text style={[styles.repostBannerText, { color: colors.textMuted }]}>
              Repost of @{post.repost_post.profiles?.username ?? 'user'}
            </Text>
          </View>
          <QuotePostCard post={post.repost_post} onPress={() => onPostPress?.(post.repost_post)} />
        </>
      )}

      {/* Quote card — shown below caption when this post quotes another */}
      {post.type === 'quote' && post.quote_post && (
        <QuotePostCard post={post.quote_post} onPress={() => onPostPress?.(post.quote_post)} />
      )}

      {post.type !== 'thread' && post.type !== 'repost' && (post.media_url || (post.media_urls && post.media_urls.length > 0)) ? (
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
                if (onVideoPress) {
                  onVideoPress(post, liked);
                } else {
                  setFullVideoUri(mediaUris[index] ?? mediaUris[0]);
                }
              } else if (onPostPress) {
                onPostPress(post);
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
        <ThreadTextCard caption={post.caption} />
      ) : post.type === 'quote' ? (
        <View style={styles.threadBadge}>
          <Ionicons name="chatbubbles-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.threadLabel, { color: colors.textMuted }]}>Quote</Text>
        </View>
      ) : null}

      <View style={[styles.postActions, { backgroundColor: colors.background }]}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => doLike()} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : colors.text} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments?.(post.id, post.user_id)}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowRepostSheet(true)}>
            <Ionicons name="repeat" size={25} color={reposted ? '#22c55e' : colors.text} />
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

      {aiContext && (
        <AIContextCard
          result={aiContext}
          isDark={colors.background === '#000000' || colors.background === '#0f0f0f'}
        />
      )}

      <View style={styles.postInfo}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
          {likes > 0 && (
            <TouchableOpacity onPress={() => setShowLikers(true)} activeOpacity={0.7}>
              <Text style={[styles.likesText, { color: colors.text }]}>{fmtCount(likes)} likes</Text>
            </TouchableOpacity>
          )}
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => onOpenComments?.(post.id, post.user_id)}>
              <Text style={[styles.likesText, { color: colors.textSub, fontWeight: '400' }]}>{fmtCount(commentCount)} comments</Text>
            </TouchableOpacity>
          )}
          {repostCount > 0 && (
            <Text style={[styles.likesText, { color: colors.textSub, fontWeight: '400' }]}>
              {fmtCount(repostCount)} reposts
            </Text>
          )}
        </View>
        {post.caption && post.type !== 'thread' ? (
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

      <RepostSheet
        visible={showRepostSheet}
        onClose={() => setShowRepostSheet(false)}
        post={post}
        isReposted={reposted}
        hasMedia={!!(post.media_url || (post.media_urls && post.media_urls.length > 0))}
        onRepost={doRepost}
        onQuote={doQuote}
        onRepostToStory={doRepostToStory}
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


const styles = StyleSheet.create({
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
});

// Reel Strip Row removed from here as it stayed in FeedScreen.tsx
// (Comment preserved for reference)
