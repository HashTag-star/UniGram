import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, Audio } from 'expo-av';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds } from '../services/posts';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory } from '../services/stories';
import { getPersonalizedFeed, recordImpression } from '../services/algorithm';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';

const { width } = Dimensions.get('window');

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
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

// ─── Story Bar ────────────────────────────────────────────────────────────────
const StoryBar: React.FC<{
  storyGroups: any[];
  currentProfile: any;
  viewedIds: string[];
  onStoryPress: (idx: number) => void;
  onYourStoryPress: () => void;
}> = ({ storyGroups, currentProfile, viewedIds, onStoryPress, onYourStoryPress }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}
    style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
    {/* Your story */}
    <TouchableOpacity style={styles.storyItem} onPress={onYourStoryPress}>
      <View style={styles.storyRingOwn}>
        <View style={styles.storyAvatarClip}>
          {currentProfile?.avatar_url
            ? <Image source={{ uri: currentProfile.avatar_url }} style={styles.storyAvatar} />
            : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={22} color="#555" />
              </View>}
        </View>
        <View style={styles.storyAddBtn}><Ionicons name="add" size={13} color="#fff" /></View>
      </View>
      <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
    </TouchableOpacity>

    {storyGroups.map((group, i) => {
      const allViewed = group.stories.every((s: any) => viewedIds.includes(s.id));
      return (
        <TouchableOpacity key={group.profile.id} style={styles.storyItem} onPress={() => onStoryPress(i)}>
          <View style={[styles.storyRing, allViewed && styles.storyRingViewed]}>
            <View style={styles.storyAvatarClip}>
              {group.profile.avatar_url
                ? <Image source={{ uri: group.profile.avatar_url }} style={styles.storyAvatar} />
                : <View style={[styles.storyAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={22} color="#555" />
                  </View>}
            </View>
          </View>
          <Text style={[styles.storyUsername, allViewed && { color: '#555' }]} numberOfLines={1}>
            {group.profile.username}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

// ─── Story Viewer (IG-style) ──────────────────────────────────────────────────
const STORY_DURATION = 5000; // ms per story

const StoryViewer: React.FC<{
  visible: boolean;
  groupIndex: number;
  storyGroups: any[];
  currentUserId: string;
  onClose: () => void;
  onViewed: (id: string) => void;
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed }) => {
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) { setGi(groupIndex); setSi(0); } }, [groupIndex, visible]);

  const group = storyGroups[gi];
  const story = group?.stories[si];

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
    startProgress();
    return () => { progressAnim.current?.stop(); };
  }, [story?.id, visible]);

  useEffect(() => {
    if (paused) progressAnim.current?.stop();
    else if (story) startProgress();
  }, [paused]);

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

  if (!visible || !group || !story) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={sv.bg}>
        <StatusBar hidden />

        {/* Background image */}
        <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {/* Blur-ish overlay at top & bottom */}
        <View style={sv.topGrad} />
        <View style={sv.bottomGrad} />

        {/* Progress bars */}
        <View style={[sv.progressRow, { marginTop: insets.top + 10 }]}>
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

        {/* Header: avatar + username + time + close */}
        <View style={sv.header}>
          <View style={sv.headerLeft}>
            {group.profile.avatar_url
              ? <Image source={{ uri: group.profile.avatar_url }} style={sv.avatar} />
              : <View style={[sv.avatar, { backgroundColor: '#333' }]} />}
            <View style={{ marginLeft: 8 }}>
              <Text style={sv.username}>{group.profile.username}</Text>
              <Text style={sv.time}>{timeAgo(story.created_at)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity onPress={() => setPaused(p => !p)} style={sv.iconBtn}>
              <Ionicons name={paused ? 'play' : 'pause'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={sv.iconBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Caption */}
        {story.caption ? (
          <View style={sv.captionBox}>
            <Text style={sv.captionText}>{story.caption}</Text>
          </View>
        ) : null}

        {/* Tap zones: left = prev, right = next */}
        <View style={sv.tapRow} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={retreat} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={advance} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={{ flex: 2 }} />
          </TouchableWithoutFeedback>
        </View>

        {/* Reply bar */}
        <View style={[sv.replyRow, { paddingBottom: insets.bottom + 12 }]}>
          <View style={sv.replyInput}>
            <Text style={sv.replyPlaceholder}>Reply to {group.profile.username}…</Text>
          </View>
          <TouchableOpacity style={sv.replyHeart}>
            <Ionicons name="heart-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={sv.replyShare}>
            <Ionicons name="paper-plane-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Video Post ───────────────────────────────────────────────────────────────
const VideoPost: React.FC<{ uri: string }> = ({ uri }) => {
  const videoRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (playing) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setPlaying(!playing);
  };

  return (
    <TouchableWithoutFeedback onPress={togglePlay}>
      <View style={{ position: 'relative' }}>
        <Video
          ref={videoRef}
          source={{ uri }}
          style={[styles.postMedia, { width }]}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={false}
          onPlaybackStatusUpdate={s => {
            if ('isPlaying' in s) setPlaying(s.isPlaying ?? false);
          }}
        />
        {!playing && (
          <View style={styles.videoPlayOverlay} pointerEvents="none">
            <Ionicons name="play-circle" size={60} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─── Feed Post ────────────────────────────────────────────────────────────────
export const FeedPost: React.FC<{
  post: any;
  currentUserId: string;
  isLiked: boolean;
  isSaved: boolean;
  onCommentCountChange?: (postId: string, delta: number) => void;
}> = ({ post, currentUserId, isLiked: initLiked, isSaved: initSaved, onCommentCountChange }) => {
  const [liked, setLiked] = useState(initLiked);
  const [likes, setLikes] = useState(post.likes_count ?? 0);
  const [saved, setSaved] = useState(initSaved);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [songPlaying, setSongPlaying] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const songSoundRef = useRef<Audio.Sound | null>(null);

  // Stop song preview when component unmounts
  useEffect(() => {
    return () => {
      if (songSoundRef.current) {
        songSoundRef.current.stopAsync().catch(() => {});
        songSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const toggleSongPreview = async () => {
    if (songPlaying) {
      setSongPlaying(false);
      songSoundRef.current?.pauseAsync().catch(() => {});
      return;
    }
    if (songLoading) return;
    setSongLoading(true);
    try {
      // Fetch preview URL from iTunes using the saved song name
      let previewUrl: string | null = post.song_preview_url ?? null;
      if (!previewUrl && post.song) {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(post.song)}&media=music&entity=song&limit=1`
        );
        const json = await res.json();
        previewUrl = json.results?.[0]?.previewUrl ?? null;
      }
      if (!previewUrl) return;

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (songSoundRef.current) {
        await songSoundRef.current.unloadAsync();
        songSoundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: previewUrl }, { shouldPlay: true });
      songSoundRef.current = sound;
      setSongPlaying(true);
      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (s.isLoaded && s.didJustFinish) {
          setSongPlaying(false);
          songSoundRef.current = null;
        }
      });
    } catch {
      setSongPlaying(false);
    } finally {
      setSongLoading(false);
    }
  };

  // Double-tap heart overlay
  const heartOverlayOpacity = useRef(new Animated.Value(0)).current;
  const heartOverlayScale = useRef(new Animated.Value(0.5)).current;
  // Action bar heart bounce
  const heartScale = useRef(new Animated.Value(1)).current;

  const lastTap = useRef(0);
  const { medium, success, selection } = useHaptics();

  useEffect(() => {
    if (currentUserId && post.id) recordImpression(post.id, currentUserId).catch(() => {});
  }, [post.id, currentUserId]);

  const bounceHeart = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, tension: 200, friction: 5 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 5 }),
    ]).start();
  };

  const showHeartOverlay = () => {
    heartOverlayOpacity.setValue(1);
    heartOverlayScale.setValue(0.5);
    Animated.parallel([
      Animated.spring(heartOverlayScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
    ]).start();
    setTimeout(() => {
      Animated.timing(heartOverlayOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 600);
  };

  // Optimistic like — update UI first, sync backend after
  const doLike = async (forceLike?: boolean) => {
    const next = forceLike ?? !liked;
    if (liked === next) return; // already in that state
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    bounceHeart();
    if (next) await medium();
    else await selection();
    try {
      if (next) await likePost(post.id, currentUserId);
      else await unlikePost(post.id, currentUserId);
    } catch {
      // Roll back
      setLiked(!next);
      setLikes((n: number) => next ? n - 1 : n + 1);
    }
  };

  // Double-tap = like
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap
      if (!liked) doLike(true);
      showHeartOverlay();
    }
    lastTap.current = now;
  };

  // Optimistic save
  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    if (next) await success(); else await selection();
    try {
      if (next) await savePost(post.id, currentUserId);
      else await unsavePost(post.id, currentUserId);
    } catch { setSaved(!next); }
  };

  const handleCommentChange = (delta: number) => {
    setCommentCount((n: number) => Math.max(0, n + delta));
    onCommentCountChange?.(post.id, delta);
  };

  const profile = post.profiles;

  return (
    <View style={styles.postCard}>
      {/* Header */}
      <View style={styles.postHeader}>
        <View style={styles.postUserRow}>
          <View style={styles.avatarRing}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.postAvatar} />
              : <View style={[styles.postAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={18} color="#555" />
                </View>}
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.postUsername}>{profile?.username ?? 'user'}</Text>
              {profile?.is_verified && <VerifiedBadge type={profile.verification_type} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {post.location && (
                <Text style={styles.postMeta}>
                  <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.35)" />{' '}{post.location} ·{' '}
                </Text>
              )}
              <Text style={styles.postMeta}>{profile?.major ? `${profile.major} · ` : ''}{timeAgo(post.created_at)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Media */}
      {post.type !== 'thread' && post.media_url ? (
        <View>
          {post.type === 'video'
            ? <VideoPost uri={post.media_url} />
            : (
              <TouchableWithoutFeedback onPress={handleMediaTap}>
                <View>
                  <Image source={{ uri: post.media_url }} style={[styles.postMedia, { width }]} resizeMode="cover" />
                  {/* Double-tap heart overlay */}
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.heartOverlay, { opacity: heartOverlayOpacity, transform: [{ scale: heartOverlayScale }] }]}
                  >
                    <Ionicons name="heart" size={90} color="#fff" />
                  </Animated.View>
                </View>
              </TouchableWithoutFeedback>
            )
          }
        </View>
      ) : (
        post.type === 'thread' && post.caption ? null : (
          <View style={styles.threadBadge}>
            <Ionicons name="chatbubbles-outline" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.threadLabel}>Thread</Text>
          </View>
        )
      )}

      {/* Song pill — tap to preview */}
      {post.song && (
        <TouchableOpacity style={styles.songBanner} onPress={toggleSongPreview} activeOpacity={0.75}>
          {songLoading
            ? <ActivityIndicator size="small" color="#f43f5e" />
            : <Ionicons
                name={songPlaying ? 'pause-circle' : 'musical-notes'}
                size={songPlaying ? 16 : 13}
                color="#f43f5e"
              />
          }
          <Text style={styles.songBannerText} numberOfLines={1}>{post.song}</Text>
          <Text style={styles.songBannerHint}>{songPlaying ? 'Playing preview' : 'Tap to preview'}</Text>
        </TouchableOpacity>
      )}

      {/* Action bar */}
      <View style={styles.postActions}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          {/* Like */}
          <TouchableOpacity onPress={() => doLike()} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#fff'} />
            </Animated.View>
          </TouchableOpacity>
          {/* Comment */}
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
          {/* Share */}
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Save */}
        <TouchableOpacity onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.postInfo}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
          <Text style={styles.likesText}>{fmtCount(likes)} likes</Text>
          {commentCount > 0 && (
            <TouchableOpacity onPress={() => setShowComments(true)}>
              <Text style={[styles.likesText, { color: 'rgba(255,255,255,0.45)', fontWeight: '400' }]}>
                {fmtCount(commentCount)} comments
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {post.caption ? (
          <Text style={styles.captionText} numberOfLines={3}>
            <Text style={styles.postUsername}>{profile?.username ?? 'user'} </Text>
            {post.caption}
          </Text>
        ) : null}
        {post.tagged_users?.length > 0 && (
          <Text style={styles.taggedText}>with {post.tagged_users.map((u: string) => `@${u}`).join(', ')}</Text>
        )}
        <Text style={styles.timeText}>{timeAgo(post.created_at)}</Text>
      </View>

      <CommentSheet
        visible={showComments}
        targetId={post.id}
        targetType="post"
        currentUserId={currentUserId}
        onClose={() => setShowComments(false)}
        onCountChange={handleCommentChange}
      />
    </View>
  );
};

// ─── Feed Screen ──────────────────────────────────────────────────────────────
interface FeedScreenProps {
  refreshKey?: number;
  onCreateStory?: () => void;
}

export const FeedScreen: React.FC<FeedScreenProps> = ({ refreshKey = 0, onCreateStory }) => {
  const insets = useSafeAreaInsets();
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(cachedFeedPosts.length === 0);
  const [posts, setPosts] = useState<any[]>(cachedFeedPosts);
  const [storyGroups, setStoryGroups] = useState<any[]>(cachedStoryGroups);
  const [likedIds, setLikedIds] = useState<Set<string>>(cachedLikedIds ?? new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(cachedSavedIds ?? new Set());
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentProfile, setCurrentProfile] = useState<any>(cachedCurrentProfile);

  const lastScrollY = useRef(0);
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

  const load = useCallback(async (silent = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const [postsData, storiesData, likedData, savedData, viewedData, prof] = await Promise.all([
        getPersonalizedFeed(user.id),
        getActiveStories(),
        getLikedPostIds(user.id),
        getSavedPostIds(user.id),
        getViewedStoryIds(user.id),
        supabase.from('profiles').select('*').eq('id', user.id).single().then(r => r.data),
      ]);
      setCurrentProfile(prof);
      setPosts(postsData);
      setStoryGroups(storiesData);
      setLikedIds(new Set(likedData));
      setSavedIds(new Set(savedData));
      setViewedIds(viewedData);
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

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshKey > 0) load(); }, [refreshKey]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleYourStory = async () => {
    if (onCreateStory) { onCreateStory(); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to add a story.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any, allowsEditing: true, aspect: [9, 16], quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0] && currentUserId) {
      try {
        await createStory(currentUserId, result.assets[0].uri);
        load();
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Could not post story.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Animated header */}
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 6, transform: [{ translateY: headerTranslateY }] }]}>
        <Text style={styles.topBarLogo}>UniGram</Text>
        <TouchableOpacity><Ionicons name="notifications-outline" size={24} color="#fff" /></TouchableOpacity>
      </Animated.View>

      <FlatList
        data={loading ? [] : posts}
        keyExtractor={p => p.id}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            <View style={{ height: HEADER_HEIGHT }} />
            {loading ? <StorySkeleton /> : (
              <StoryBar
                storyGroups={storyGroups}
                currentProfile={currentProfile}
                viewedIds={viewedIds}
                onStoryPress={i => setStoryIdx(i)}
                onYourStoryPress={handleYourStory}
              />
            )}
            {loading && <><FeedPostSkeleton /><FeedPostSkeleton /></>}
          </>
        }
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="image-outline" size={48} color="#333" />
            <Text style={{ color: '#555', marginTop: 12, fontSize: 15 }}>Follow people to see their posts!</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <FeedPost
            post={item}
            currentUserId={currentUserId}
            isLiked={likedIds.has(item.id)}
            isSaved={savedIds.has(item.id)}
            onCommentCountChange={(postId, delta) => {
              setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
                : p
              ));
            }}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" progressViewOffset={HEADER_HEIGHT} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {storyIdx !== null && (
        <StoryViewer
          visible
          groupIndex={storyIdx}
          storyGroups={storyGroups}
          currentUserId={currentUserId}
          onClose={() => setStoryIdx(null)}
          onViewed={id => setViewedIds(prev => [...prev, id])}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#000',
  },
  topBarLogo: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },

  storyScroll: { paddingVertical: 10 },
  storyItem: { alignItems: 'center', gap: 4, width: 70 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2, borderWidth: 2.5, borderColor: '#ff6b35' },
  storyRingViewed: { borderColor: 'rgba(255,255,255,0.15)' },
  storyRingOwn: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  storyAvatarClip: { width: 62, height: 62, borderRadius: 31, overflow: 'hidden' },
  storyAvatar: { width: 62, height: 62, borderRadius: 31 },
  storyAddBtn: {
    position: 'absolute', bottom: -3, right: -3,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000', zIndex: 10,
  },
  storyUsername: { fontSize: 10, color: 'rgba(255,255,255,0.7)', maxWidth: 64, textAlign: 'center' },

  postCard: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 4 },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
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
  likesText: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  captionText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 4, marginTop: 2 },
  taggedText: { fontSize: 11, color: '#818cf8', marginBottom: 3 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
});

// Story viewer styles
const sv = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  progressRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 3, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 22,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  username: { color: '#fff', fontWeight: '700', fontSize: 14 },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 6 },
  captionBox: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 12,
  },
  captionText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  tapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  replyRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 12, zIndex: 10,
  },
  replyInput: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10,
  },
  replyPlaceholder: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  replyHeart: { padding: 4 },
  replyShare: { padding: 4 },
});
