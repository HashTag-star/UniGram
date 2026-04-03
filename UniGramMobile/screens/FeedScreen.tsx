import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal, FlatList,
  StatusBar, RefreshControl, Animated, Alert, Share,
  TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { FeedPostSkeleton, StorySkeleton } from '../components/Skeleton';
import { CommentSheet } from '../components/CommentSheet';
import { likePost, unlikePost, savePost, unsavePost, getLikedPostIds, getSavedPostIds, deletePost, reportContent } from '../services/posts';
import { getActiveStories, markStoryViewed, getViewedStoryIds, createStory, getStoryStats, likeStory, unlikeStory, getStoryViewers } from '../services/stories';
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
}> = ({ storyGroups, currentProfile, viewedIds, onStoryPress, onYourStoryPress }) => {
  const ownGroupIdx = storyGroups.findIndex(g => g.profile.id === currentProfile?.id);
  const ownGroup = ownGroupIdx !== -1 ? storyGroups[ownGroupIdx] : null;
  const filteredGroups = storyGroups.filter((_, idx) => idx !== ownGroupIdx);
  const hasOwnStories = ownGroup && ownGroup.stories.length > 0;
  
  const thumbUri = hasOwnStories ? ownGroup.stories[0].media_url : currentProfile?.avatar_url;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={styles.storyScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
      
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
        <Text style={styles.storyUsername} numberOfLines={1}>Your Story</Text>
      </TouchableOpacity>

      {filteredGroups.map((group, i) => {
        const globalIdx = storyGroups.indexOf(group);
        const allViewed = group.stories.every((s: any) => viewedIds.includes(s.id));
        return (
          <TouchableOpacity key={group.profile.id} style={styles.storyItem} onPress={() => onStoryPress(globalIdx)}>
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
};

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
}> = ({ visible, groupIndex, storyGroups, currentUserId, onClose, onViewed }) => {
  const [gi, setGi] = useState(groupIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [stats, setStats] = useState({ views: 0, likes: 0, isLiked: false });
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) { setGi(groupIndex); setSi(0); } }, [groupIndex, visible]);

  const group = storyGroups[gi];
  const story = group?.stories[si];

  const fetchStats = async () => {
    if (!story) return;
    const s = await getStoryStats(story.id);
    setStats(s);
  };

  const toggleLike = async () => {
    if (!story || !currentUserId) return;
    try {
      if (stats.isLiked) {
        await unlikeStory(story.id, currentUserId);
        setStats(ps => ({ ...ps, isLiked: false, likes: Math.max(0, ps.likes - 1) }));
      } else {
        await likeStory(story.id, currentUserId);
        setStats(ps => ({ ...ps, isLiked: true, likes: ps.likes + 1 }));
      }
    } catch (e) {
      console.error('Like toggle error', e);
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
    if (paused || showViewers) progressAnim.current?.stop();
    else if (story) startProgress();
  }, [paused, showViewers]);

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

        <View style={[sv.replyRow, { paddingBottom: insets.bottom + 12 }]}>
          {isOwner ? (
            <TouchableOpacity style={sv.viewersBtn} onPress={() => setShowViewers(true)}>
              <View style={sv.viewerAvatars}>
                 <Ionicons name="eye-outline" size={16} color="#fff" />
              </View>
              <Text style={sv.viewersCount}>{stats.views} viewers</Text>
            </TouchableOpacity>
          ) : (
            <View style={sv.replyInput}>
              <Text style={sv.replyPlaceholder}>Reply to {group.profile.username}…</Text>
            </View>
          )}
          
          <TouchableOpacity style={sv.replyHeart} onPress={toggleLike}>
            <Ionicons name={stats.isLiked ? "heart" : "heart-outline"} size={26} color={stats.isLiked ? "#ff3b30" : "#fff"} />
          </TouchableOpacity>
          <TouchableOpacity style={sv.replyShare}>
            <Ionicons name="paper-plane-outline" size={22} color="#fff" />
          </TouchableOpacity>
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

// ─── Video Post ───────────────────────────────────────────────────────────────
const VideoPost: React.FC<{ uri: string; isMuted?: boolean; isActive?: boolean }> = ({ uri, isMuted, isActive }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = isMuted ?? false;
    if (isActive) p.play();
  });

  useEffect(() => {
    if (player) {
      player.muted = isMuted ?? false;
    }
  }, [player, isMuted]);

  useEffect(() => {
    if (!player) return;
    if (isActive) player.play();
    else player.pause();
  }, [player, isActive]);

  return (
    <View style={{ position: 'relative' }}>
      <VideoView
        player={player}
        style={[styles.postMedia, { width }]}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
};

// ─── Post Meta Cycler ─────────────────────────────────────────────────────────
const PostMetaCycler: React.FC<{ location?: string; song?: string }> = ({ location, song }) => {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const items = [location, song].filter(Boolean) as string[];

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setIndex(prev => (prev + 1) % items.length);
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons 
        name={items[index] === song ? "musical-note" : "location-outline"} 
        size={10} color="rgba(255,255,255,0.4)" 
      />
      <Text style={styles.postMeta} numberOfLines={1}>{items[index]}</Text>
    </Animated.View>
  );
};

// ─── Media Carousel ───────────────────────────────────────────────────────────
const MediaCarousel: React.FC<{
  mediaUrls: string[];
  type: string;
  onDoubleTap: () => void;
  onSingleTap: () => void;
  isMuted?: boolean;
  isActive?: boolean;
}> = ({ mediaUrls, type, onDoubleTap, onSingleTap, isMuted, isActive }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const lastTap = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap();
    } else {
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 300) onSingleTap();
      }, 300);
    }
    lastTap.current = now;
  };

  return (
    <View>
      <FlatList
        data={mediaUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={width}
        snapToAlignment="center"
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          setCurrentIdx(Math.round(x / width));
        }}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={{ width, height: 360 }}>
              {type === 'video' ? (
                <VideoPost uri={item} isMuted={isMuted} isActive={isActive && currentIdx === index} />
              ) : (
                <Image source={{ uri: item }} style={styles.postMedia} resizeMode="cover" />
              )}
            </View>
          </TouchableWithoutFeedback>
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
};

// ─── Full Video Modal (Reel-style) ───────────────────────────────────────────
const FullVideoModal: React.FC<{
  visible: boolean;
  uri: string;
  onClose: () => void;
}> = ({ visible, uri, onClose }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.play();
  });

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <VideoView 
          player={player} 
          style={StyleSheet.absoluteFill} 
          contentFit="cover"
          nativeControls
        />
        <TouchableOpacity style={{ position: 'absolute', top: 50, left: 20 }} onPress={onClose}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// ─── Feed Post ────────────────────────────────────────────────────────────────
export const FeedPost: React.FC<{
  post: any;
  currentUserId: string;
  isLiked?: boolean;
  isSaved?: boolean;
  isActive?: boolean;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  onCommentCountChange?: (postId: string, delta: number) => void;
}> = React.memo(({ post, currentUserId, isLiked: initLiked, isSaved: initSaved, isActive, isMuted, setIsMuted, onCommentCountChange }) => {
  const [liked, setLiked] = useState(initLiked);
  const [likes, setLikes] = useState(post.likes_count ?? 0);
  const [saved, setSaved] = useState(initSaved);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [fullVideoUri, setFullVideoUri] = useState<string | null>(null);
  const [songPreviewUrl, setSongPreviewUrl] = useState<string | null>(null);
  const songPlayer = useAudioPlayer(songPreviewUrl ?? '');

  useEffect(() => {
    if (songPlayer) {
      songPlayer.muted = isMuted;
    }
  }, [songPlayer, isMuted]);

  useEffect(() => {
    if (isActive) {
      if (post.song) toggleSongPreview();
    } else {
      songPlayer.pause();
    }
  }, [isActive]);

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
          `https://itunes.apple.com/search?term=${encodeURIComponent(post.song)}&media=music&entity=song&limit=1`
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

  const heartOverlayOpacity = useRef(new Animated.Value(0)).current;
  const heartOverlayScale = useRef(new Animated.Value(0.5)).current;
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

  const doLike = async (forceLike?: boolean) => {
    const next = forceLike ?? !liked;
    if (liked === next) return;
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    bounceHeart();
    if (next) await medium();
    else await selection();
    try {
      if (next) await likePost(post.id, currentUserId);
      else await unlikePost(post.id, currentUserId);
    } catch {
      setLiked(!next);
      setLikes((n: number) => next ? n - 1 : n + 1);
    }
  };

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
      {fullVideoUri && (
        <FullVideoModal visible uri={fullVideoUri} onClose={() => setFullVideoUri(null)} />
      )}

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
            <PostMetaCycler location={post.location} song={post.song} />
            <Text style={styles.postMeta}>{profile?.major ? `${profile.major} · ` : ''}{timeAgo(post.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => {
            const isOwn = post.user_id === currentUserId;
            if (isOwn) {
              Alert.alert('Post options', undefined, [
                {
                  text: 'Delete post',
                  style: 'destructive',
                  onPress: () => Alert.alert('Delete post?', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                      try { await deletePost(post.id, currentUserId); }
                      catch { Alert.alert('Error', 'Could not delete post.'); }
                    }},
                  ]),
                },
                { text: 'Share', onPress: () => Share.share({ message: `Check out this post on UniGram by @${post.profiles?.username ?? 'user'}:\n\n${post.caption ?? ''}` }) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            } else {
              Alert.alert('Post options', undefined, [
                { text: 'Report post', style: 'destructive', onPress: () =>
                  Alert.alert('Report', 'Why are you reporting this?', [
                    { text: 'Spam', onPress: async () => { await reportContent(currentUserId, 'post', post.id, 'spam').catch(() => {}); Alert.alert('Reported', 'Thanks for your report.'); } },
                    { text: 'Inappropriate content', onPress: async () => { await reportContent(currentUserId, 'post', post.id, 'inappropriate').catch(() => {}); Alert.alert('Reported', 'Thanks for your report.'); } },
                    { text: 'Harassment', onPress: async () => { await reportContent(currentUserId, 'post', post.id, 'harassment').catch(() => {}); Alert.alert('Reported', 'Thanks for your report.'); } },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                },
                { text: 'Share', onPress: () => Share.share({ message: `Check out this post on UniGram by @${post.profiles?.username ?? 'user'}:\n\n${post.caption ?? ''}` }) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {post.type !== 'thread' && (post.media_url || (post.media_urls && post.media_urls.length > 0)) ? (
        <View>
          <MediaCarousel 
            mediaUrls={post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url!]}
            type={post.type}
            onDoubleTap={() => {
              if (!liked) doLike(true);
              showHeartOverlay();
            }}
            onSingleTap={() => {
              if (post.type === 'video') {
                setFullVideoUri(post.media_url);
              } else {
                setIsMuted(prev => !prev);
              }
            }}
            isMuted={isMuted}
            isActive={isActive}
          />
          
          {(post.type === 'video' || post.song) && (
            <TouchableOpacity 
              style={styles.muteOverlayBtn} 
              onPress={() => setIsMuted(prev => !prev)}
              activeOpacity={0.8}
            >
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
          <Ionicons name="chatbubbles-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={styles.threadLabel}>Thread</Text>
        </View>
      ) : null}

      <View style={styles.postActions}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => doLike()} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#fff'} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(true)}>
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleSave} style={styles.actionBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
      </View>

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
});

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
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true); // Default to muted like IG

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActivePostId(viewableItems[0].key);
    }
  }).current;

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

  const handleCommentCountChange = useCallback((postId: string, delta: number) => {
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
      : p
    ));
  }, []);

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
            isActive={activePostId === item.id}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            onCommentCountChange={handleCommentCountChange}
          />
        )}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
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

const sv = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  progressRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 3, position: 'absolute', left: 0, right: 0, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  header: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  username: { color: '#fff', fontWeight: '700', fontSize: 13 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  iconBtn: { padding: 6 },
  captionBox: {
    position: 'absolute', bottom: 120, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 10,
  },
  captionText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  tapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 5 },
  replyRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, zIndex: 10,
  },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8,
  },
  replyPlaceholder: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  replyHeart: { padding: 4 },
  replyShare: { padding: 4 },
  viewersBtn: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  viewerAvatars: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  viewersCount: { color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 8 },
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
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
